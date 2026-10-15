// Short-term history selection for chat requests.
//
// "window" (default): the classic NextChat behaviour. The last
//   `historyMessageCount` messages, trimmed from the front while the running
//   token estimate stays under `max_tokens`, plus a rolling memory summary that
//   is regenerated whenever the uncompressed history grows past
//   `compressMessageLengthThreshold`. Every turn shifts the window, so the
//   request prefix changes and provider prompt caches rarely hit.
//
// "append" (opt-in): every message since the clear-context point is sent and
//   the history only grows at the tail, so each request's prefix is
//   byte-identical to the previous one and stays cacheable. When the request
//   would no longer fit in the model's context window, a large chunk is dropped
//   from the front in one go (see trimAppendHistory) and the memory summary is
//   regenerated once to cover it; otherwise the summary is left untouched.

export type HistoryStrategy = "window" | "append";

export const DEFAULT_HISTORY_STRATEGY: HistoryStrategy = "window";

export interface HistoryMessage {
  role: string;
  isError?: boolean;
}

export interface HistoryModelConfig {
  model: string;
  max_tokens: number;
  historyMessageCount: number;
  sendMemory: boolean;
  // Missing on configs and sessions persisted before the setting existed.
  historyStrategy?: HistoryStrategy;
}

export function resolveHistoryStrategy(strategy?: string): HistoryStrategy {
  return strategy === "append" ? "append" : DEFAULT_HISTORY_STRATEGY;
}

export const DEFAULT_CONTEXT_WINDOW = 128_000;

// Input context windows by model-name prefix, matched after any "vendor/"
// routing prefix. Values are conservative where a family's models differ.
const MODEL_CONTEXT_WINDOWS: [RegExp, number][] = [
  [/^claude-/, 200_000],
  [/^gemini-(?:2\.5|3|4)/, 1_048_576],
  [/^grok-/, 256_000],
  [/^deepseek-/, 128_000],
  [/^(?:gpt-4o|gpt-4\.1|gpt-5|gpt-6|chatgpt-)/, 128_000],
  [/^o[134](?:-|$)/, 128_000],
];

export function getModelContextWindow(model: string): number {
  const name = (model ?? "").toLowerCase().split("/").pop() ?? "";
  for (const [pattern, contextWindow] of MODEL_CONTEXT_WINDOWS) {
    if (pattern.test(name)) return contextWindow;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

// Share of the context window kept free for token-estimate error.
const CONTEXT_MARGIN_RATIO = 0.1;
// Lower bound on the budget, so a max_tokens close to the context window
// can't shrink it to nothing (which would trim and re-summarize every turn).
const MIN_BUDGET_RATIO = 0.25;
// A trim brings the estimated request size down to this share of the budget.
export const APPEND_TRIM_TARGET_RATIO = 0.7;
// The summary request for a trimmed chunk keeps at most this share of the
// summarize model's context window (newest messages of the chunk win).
const SUMMARY_INPUT_RATIO = 0.5;

// Input token budget for an append-mode request: the context window minus the
// output reservation (max_tokens) and a 10% safety margin.
export function getAppendHistoryBudget(model: string, maxTokens: number) {
  const contextWindow = getModelContextWindow(model);
  const output = Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 0;
  return Math.max(
    Math.floor(contextWindow * MIN_BUDGET_RATIO),
    contextWindow - output - Math.floor(contextWindow * CONTEXT_MARGIN_RATIO),
  );
}

export function shouldSendLongTermMemory(options: {
  sendMemory: boolean;
  memoryPrompt: string;
  lastSummarizeIndex: number;
  clearContextIndex: number;
}) {
  return (
    !!options.sendMemory &&
    !!options.memoryPrompt &&
    options.lastSummarizeIndex > options.clearContextIndex
  );
}

export interface HistorySelectionInput<T extends HistoryMessage> {
  messages: T[];
  clearContextIndex: number;
  lastSummarizeIndex: number;
  // Result of shouldSendLongTermMemory for this request.
  sendLongTermMemory: boolean;
  modelConfig: HistoryModelConfig;
  estimateTokens: (message: T) => number;
  // append: history start persisted from the previous trim
  // (session.appendStartIndex).
  appendStartIndex?: number;
  // append: estimated tokens of everything sent besides the history (system
  // prompts, long-term memory, mask context, the new user input).
  overheadTokens?: number;
}

export interface HistorySelection<T extends HistoryMessage> {
  strategy: HistoryStrategy;
  // Short-term history to send, oldest first, error messages excluded.
  messages: T[];
  memoryStartIndex: number;
  contextStartIndex: number;
  // append: value to persist as session.appendStartIndex. Moves forward only
  // when this request trimmed, or resets to 0 when the stored index is stale.
  appendStartIndex: number;
  // append: whether this request dropped a chunk from the front.
  trimmed: boolean;
}

export function selectShortTermHistory<T extends HistoryMessage>(
  input: HistorySelectionInput<T>,
): HistorySelection<T> {
  const strategy = resolveHistoryStrategy(input.modelConfig.historyStrategy);
  return strategy === "append"
    ? selectAppendHistory(input)
    : selectWindowHistory(input);
}

function getContextStartIndex(
  input: Pick<
    HistorySelectionInput<HistoryMessage>,
    "sendLongTermMemory" | "lastSummarizeIndex" | "clearContextIndex"
  >,
  shortTermMemoryStartIndex: number,
) {
  // Messages after lastSummarizeIndex are not in the summary yet, so the
  // history reaches back to it when the summary is sent.
  const memoryStartIndex = input.sendLongTermMemory
    ? Math.min(input.lastSummarizeIndex, shortTermMemoryStartIndex)
    : shortTermMemoryStartIndex;
  // and if user has cleared history messages, we should exclude the memory too.
  const contextStartIndex = Math.max(input.clearContextIndex, memoryStartIndex);
  return { memoryStartIndex, contextStartIndex };
}

function selectWindowHistory<T extends HistoryMessage>(
  input: HistorySelectionInput<T>,
): HistorySelection<T> {
  const { messages, modelConfig, estimateTokens } = input;
  const totalMessageCount = messages.length;

  // short term memory: latest n messages
  const shortTermMemoryStartIndex = Math.max(
    0,
    totalMessageCount - modelConfig.historyMessageCount,
  );
  const { memoryStartIndex, contextStartIndex } = getContextStartIndex(
    input,
    shortTermMemoryStartIndex,
  );
  // max_tokens is the output cap, but window mode has always used it as the
  // history budget; kept so existing sessions send the same history.
  const maxTokenThreshold = modelConfig.max_tokens;

  // get recent messages as much as possible
  const reversedRecentMessages: T[] = [];
  for (
    let i = totalMessageCount - 1, tokenCount = 0;
    i >= contextStartIndex && tokenCount < maxTokenThreshold;
    i -= 1
  ) {
    const msg = messages[i];
    if (!msg || msg.isError) continue;
    tokenCount += estimateTokens(msg);
    reversedRecentMessages.push(msg);
  }

  return {
    strategy: "window",
    messages: reversedRecentMessages.reverse(),
    memoryStartIndex,
    contextStartIndex,
    appendStartIndex: input.appendStartIndex ?? 0,
    trimmed: false,
  };
}

// Start of the newest turn in [from, messages.length): the last user message
// that will be sent, or else the last message that will be sent.
function findNewestTurnStart(messages: HistoryMessage[], from: number) {
  let lastSendable = -1;
  for (let i = messages.length - 1; i >= from; i -= 1) {
    const msg = messages[i];
    if (!msg || msg.isError) continue;
    if (msg.role === "user") return i;
    if (lastSendable < 0) lastSendable = i;
  }
  return lastSendable < 0 ? messages.length : lastSendable;
}

function selectAppendHistory<T extends HistoryMessage>(
  input: HistorySelectionInput<T>,
): HistorySelection<T> {
  const { messages, modelConfig, estimateTokens } = input;

  // No sliding window: everything since the clear-context point is eligible.
  const { memoryStartIndex, contextStartIndex } = getContextStartIndex(
    input,
    0,
  );
  const newestTurnStart = findNewestTurnStart(messages, contextStartIndex);

  // An index pointing past the newest turn is stale (messages were deleted);
  // drop it rather than lose the newest turn.
  const storedStartIndex = input.appendStartIndex ?? 0;
  const appendStartIndex =
    storedStartIndex >= 0 && storedStartIndex <= newestTurnStart
      ? storedStartIndex
      : 0;
  const startIndex = Math.max(contextStartIndex, appendStartIndex);

  const trimIndex = trimAppendHistory(
    messages,
    startIndex,
    newestTurnStart,
    input.overheadTokens ?? 0,
    getAppendHistoryBudget(modelConfig.model, modelConfig.max_tokens),
    estimateTokens,
  );
  const trimmed = trimIndex > startIndex;

  return {
    strategy: "append",
    messages: messages
      .slice(trimmed ? trimIndex : startIndex)
      .filter((msg) => msg && !msg.isError),
    memoryStartIndex,
    contextStartIndex,
    appendStartIndex: trimmed ? trimIndex : appendStartIndex,
    trimmed,
  };
}

// Returns the new history start index, or startIndex when nothing is dropped.
//
// Drop rule: only when the estimated request exceeds the budget, drop the
// oldest messages until it is at or below APPEND_TRIM_TARGET_RATIO (70%) of
// the budget, then keep dropping up to the next user message so the history
// starts on a whole turn. The 30% headroom lets many turns append (with a
// stable, cacheable prefix) before the next trim. The newest turn is never
// dropped, even if it alone exceeds the budget.
function trimAppendHistory<T extends HistoryMessage>(
  messages: T[],
  startIndex: number,
  newestTurnStart: number,
  overheadTokens: number,
  budget: number,
  estimateTokens: (message: T) => number,
) {
  const tokensOf = (msg: T | undefined) =>
    msg && !msg.isError ? estimateTokens(msg) : 0;

  let total = overheadTokens;
  for (let i = startIndex; i < messages.length; i += 1) {
    total += tokensOf(messages[i]);
  }
  if (total <= budget) return startIndex;

  const target = budget * APPEND_TRIM_TARGET_RATIO;
  let cut = startIndex;
  while (cut < newestTurnStart && total > target) {
    total -= tokensOf(messages[cut]);
    cut += 1;
  }
  while (
    cut < newestTurnStart &&
    (messages[cut]?.isError || messages[cut]?.role !== "user")
  ) {
    cut += 1;
  }
  return cut;
}

export interface SummarySelectionInput<T extends HistoryMessage> {
  messages: T[];
  clearContextIndex: number;
  lastSummarizeIndex: number;
  modelConfig: HistoryModelConfig & { compressMessageLengthThreshold: number };
  estimateTokens: (message: T) => number;
  // append: session.appendStartIndex; messages before it were trimmed.
  appendStartIndex?: number;
  // append: model that writes the summary, used to cap the request size.
  summarizeModel?: string;
}

export interface SummarySelection<T extends HistoryMessage> {
  shouldSummarize: boolean;
  // Messages to summarize (without the existing memory prompt).
  messages: T[];
  historyMsgLength: number;
  // lastSummarizeIndex to store once the summary succeeds.
  nextSummarizeIndex: number;
}

export function selectMessagesToSummarize<T extends HistoryMessage>(
  input: SummarySelectionInput<T>,
): SummarySelection<T> {
  const { messages, modelConfig, estimateTokens } = input;
  const countTokens = (msgs: T[]) =>
    msgs.reduce((sum, msg) => sum + estimateTokens(msg), 0);
  const summarizeIndex = Math.max(
    input.lastSummarizeIndex,
    input.clearContextIndex,
  );

  if (resolveHistoryStrategy(modelConfig.historyStrategy) === "append") {
    // The summary is frozen (it is part of the cached prefix) and only
    // regenerated to absorb messages a trim dropped from the history.
    const trimIndex = Math.min(input.appendStartIndex ?? 0, messages.length);
    if (!modelConfig.sendMemory || trimIndex <= summarizeIndex) {
      return {
        shouldSummarize: false,
        messages: [],
        historyMsgLength: 0,
        nextSummarizeIndex: input.lastSummarizeIndex,
      };
    }

    const dropped = messages
      .slice(summarizeIndex, trimIndex)
      .filter((msg) => !msg.isError);
    const historyMsgLength = countTokens(dropped);
    const maxInput =
      getModelContextWindow(input.summarizeModel ?? modelConfig.model) *
      SUMMARY_INPUT_RATIO;
    let first = 0;
    for (
      let tokens = historyMsgLength;
      first < dropped.length - 1 && tokens > maxInput;
      first += 1
    ) {
      tokens -= estimateTokens(dropped[first]);
    }

    return {
      shouldSummarize: true,
      messages: dropped.slice(first),
      historyMsgLength,
      nextSummarizeIndex: trimIndex,
    };
  }

  // window: unchanged from the original summarizeSession. Note the index is
  // into the unfiltered list but applied after error messages are removed.
  let toBeSummarizedMsgs = messages
    .filter((msg) => !msg.isError)
    .slice(summarizeIndex);

  const historyMsgLength = countTokens(toBeSummarizedMsgs);

  if (historyMsgLength > (modelConfig?.max_tokens || 4000)) {
    const n = toBeSummarizedMsgs.length;
    toBeSummarizedMsgs = toBeSummarizedMsgs.slice(
      Math.max(0, n - modelConfig.historyMessageCount),
    );
  }

  return {
    shouldSummarize:
      historyMsgLength > modelConfig.compressMessageLengthThreshold &&
      !!modelConfig.sendMemory,
    messages: toBeSummarizedMsgs,
    historyMsgLength,
    nextSummarizeIndex: messages.length,
  };
}
