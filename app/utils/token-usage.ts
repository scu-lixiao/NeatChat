import { ApiPath, ServiceProvider } from "../constant";

// Provider-neutral token usage for one assistant reply.
export type TokenUsage = {
  // Total input tokens, including cache reads and cache writes.
  input: number;
  cachedRead: number;
  cacheWrite: number;
  // Output tokens, including reasoning/thinking tokens.
  output: number;
  reasoning?: number;
};

// Per-session usage accumulators on ChatSession.stat. Optional because
// sessions created before usage tracking don't have them.
export type UsageStat = {
  inputTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
};

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord {
  return typeof value === "object" && value !== null
    ? (value as RawRecord)
    : {};
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function makeUsage(
  input: number,
  cachedRead: number,
  cacheWrite: number,
  output: number,
  reasoning?: number,
): TokenUsage | undefined {
  if (input + cachedRead + cacheWrite + output <= 0) return undefined;

  const usage: TokenUsage = {
    // Keep the invariant that input covers cache reads and writes, even if a
    // provider reports inconsistent numbers.
    input: Math.max(input, cachedRead + cacheWrite),
    cachedRead,
    cacheWrite,
    output,
  };
  if (reasoning !== undefined) usage.reasoning = reasoning;
  return usage;
}

// Anthropic Messages `usage`: input_tokens excludes cached tokens.
export function fromAnthropicUsage(raw: unknown): TokenUsage | undefined {
  const usage = asRecord(raw);
  const uncached = count(usage.input_tokens) ?? 0;
  const cachedRead = count(usage.cache_read_input_tokens) ?? 0;
  const cacheWrite = count(usage.cache_creation_input_tokens) ?? 0;
  const output = count(usage.output_tokens) ?? 0;
  return makeUsage(
    uncached + cachedRead + cacheWrite,
    cachedRead,
    cacheWrite,
    output,
  );
}

const ANTHROPIC_USAGE_FIELDS = [
  "input_tokens",
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
] as const;

// Streaming Anthropic splits usage across message_start (message.usage) and
// message_delta (usage, cumulative). Later non-null values win per field.
export function mergeAnthropicUsage(
  start: unknown,
  delta: unknown,
): TokenUsage | undefined {
  const startUsage = asRecord(start);
  const deltaUsage = asRecord(delta);
  const merged: RawRecord = {};
  for (const field of ANTHROPIC_USAGE_FIELDS) {
    merged[field] = count(deltaUsage[field]) ?? count(startUsage[field]);
  }
  return fromAnthropicUsage(merged);
}

// OpenAI / xAI Responses API `usage`: input_tokens includes cached tokens.
export function fromResponsesUsage(raw: unknown): TokenUsage | undefined {
  const usage = asRecord(raw);
  const inputDetails = asRecord(usage.input_tokens_details);
  const outputDetails = asRecord(usage.output_tokens_details);
  return makeUsage(
    count(usage.input_tokens) ?? 0,
    count(inputDetails.cached_tokens) ?? 0,
    count(inputDetails.cache_write_tokens) ?? 0,
    count(usage.output_tokens) ?? 0,
    count(outputDetails.reasoning_tokens),
  );
}

// OpenAI-compatible Chat Completions `usage`. Also understands DeepSeek's
// prompt_cache_hit/miss_tokens, DashScope's input/output_tokens, and a
// top-level cached_tokens as used by some compatible providers.
export function fromChatCompletionsUsage(raw: unknown): TokenUsage | undefined {
  const usage = asRecord(raw);
  const promptDetails = asRecord(usage.prompt_tokens_details);
  const completionDetails = asRecord(usage.completion_tokens_details);
  const cacheHit = count(usage.prompt_cache_hit_tokens);
  const cacheMiss = count(usage.prompt_cache_miss_tokens);

  const input =
    count(usage.prompt_tokens) ??
    count(usage.input_tokens) ??
    (cacheHit ?? 0) + (cacheMiss ?? 0);
  const cachedRead =
    cacheHit ??
    count(promptDetails.cached_tokens) ??
    count(usage.cached_tokens) ??
    0;
  const output =
    count(usage.completion_tokens) ?? count(usage.output_tokens) ?? 0;

  return makeUsage(
    input,
    cachedRead,
    0,
    output,
    count(completionDetails.reasoning_tokens),
  );
}

// Gemini `usageMetadata`: promptTokenCount includes cached content, and
// candidatesTokenCount excludes thinking tokens.
export function fromGeminiUsageMetadata(raw: unknown): TokenUsage | undefined {
  const usage = asRecord(raw);
  const thoughts = count(usage.thoughtsTokenCount);
  return makeUsage(
    count(usage.promptTokenCount) ?? 0,
    count(usage.cachedContentTokenCount) ?? 0,
    0,
    (count(usage.candidatesTokenCount) ?? 0) + (thoughts ?? 0),
    thoughts,
  );
}

export function addUsage(
  a?: TokenUsage,
  b?: TokenUsage,
): TokenUsage | undefined {
  if (!a) return b;
  if (!b) return a;

  const sum: TokenUsage = {
    input: a.input + b.input,
    cachedRead: a.cachedRead + b.cachedRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    output: a.output + b.output,
  };
  if (a.reasoning !== undefined || b.reasoning !== undefined) {
    sum.reasoning = (a.reasoning ?? 0) + (b.reasoning ?? 0);
  }
  return sum;
}

// Share of input tokens served from the provider's prompt cache, in [0, 1].
export function cacheHitRate(usage?: TokenUsage): number {
  if (!usage || !(usage.input > 0)) return 0;
  return Math.min(1, Math.max(0, usage.cachedRead / usage.input));
}

export function addUsageToStat<T extends UsageStat>(
  stat: T,
  usage: TokenUsage,
): T {
  return {
    ...stat,
    inputTokens: (stat.inputTokens ?? 0) + usage.input,
    cachedTokens: (stat.cachedTokens ?? 0) + usage.cachedRead,
    cacheWriteTokens: (stat.cacheWriteTokens ?? 0) + usage.cacheWrite,
    outputTokens: (stat.outputTokens ?? 0) + usage.output,
  };
}

export function usageFromStat(stat?: UsageStat): TokenUsage {
  return {
    input: count(stat?.inputTokens) ?? 0,
    cachedRead: count(stat?.cachedTokens) ?? 0,
    cacheWrite: count(stat?.cacheWriteTokens) ?? 0,
    output: count(stat?.outputTokens) ?? 0,
  };
}

// 540 -> "540", 12345 -> "12.3k", 2500000 -> "2.5M"
export function formatTokenCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value < 1000) return `${Math.round(value)}`;
  if (value < 999_950) return `${Number((value / 1e3).toFixed(1))}k`;
  return `${Number((value / 1e6).toFixed(1))}M`;
}

export function formatCacheHitRate(usage?: TokenUsage): string {
  return `${Math.round(cacheHitRate(usage) * 100)}%`;
}

export type TokenUsageLabels = {
  Input: string;
  Cached: string;
  CacheWrite: string;
  Output: string;
  Reasoning: string;
};

// "in 12.3k · cached 11.8k (96%) · out 540"; cache parts only when non-zero.
export function formatUsageSummary(
  usage: TokenUsage,
  labels: TokenUsageLabels,
): string {
  const parts = [`${labels.Input} ${formatTokenCount(usage.input)}`];
  if (usage.cachedRead > 0) {
    const cached = formatTokenCount(usage.cachedRead);
    parts.push(`${labels.Cached} ${cached} (${formatCacheHitRate(usage)})`);
  }
  if (usage.cacheWrite > 0) {
    parts.push(`${labels.CacheWrite} ${formatTokenCount(usage.cacheWrite)}`);
  }
  parts.push(`${labels.Output} ${formatTokenCount(usage.output)}`);
  return parts.join(" · ");
}

// Exact counts for tooltips.
export function formatUsageDetails(
  usage: TokenUsage,
  labels: TokenUsageLabels,
): string {
  const parts = [
    `${labels.Input} ${usage.input}`,
    `${labels.Cached} ${usage.cachedRead}`,
    `${labels.CacheWrite} ${usage.cacheWrite}`,
    `${labels.Output} ${usage.output}`,
  ];
  if (usage.reasoning !== undefined) {
    parts.push(`${labels.Reasoning} ${usage.reasoning}`);
  }
  return parts.join(" · ");
}

// Stream usage extraction. Extractors receive the raw SSE `data` payload and
// return usage when that event carries it.
export type StreamUsageExtractor = (text: string) => TokenUsage | undefined;

function parseEvent(text: string, marker: string): RawRecord | undefined {
  // Cheap pre-check so ordinary content deltas skip a second JSON.parse.
  if (!text.includes(marker)) return undefined;
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}

export const extractChatCompletionsStreamUsage: StreamUsageExtractor = (
  text,
) => {
  const event = parseEvent(text, '"usage"');
  if (!event) return undefined;
  // Moonshot reports usage on the final choice instead of the chunk.
  const choices = Array.isArray(event.choices) ? event.choices : [];
  return fromChatCompletionsUsage(event.usage ?? asRecord(choices[0]).usage);
};

export const extractResponsesStreamUsage: StreamUsageExtractor = (text) => {
  const event = parseEvent(text, '"usage"');
  if (!event || event.type !== "response.completed") return undefined;
  return fromResponsesUsage(asRecord(event.response).usage);
};

export const extractGeminiStreamUsage: StreamUsageExtractor = (text) => {
  const event = parseEvent(text, '"usageMetadata"');
  return event ? fromGeminiUsageMetadata(event.usageMetadata) : undefined;
};

// Stateful: remembers message_start usage until the matching message_delta.
export function createAnthropicStreamUsageExtractor(): StreamUsageExtractor {
  let startUsage: unknown;
  let deltaUsage: unknown;
  return (text) => {
    const event = parseEvent(text, '"usage"');
    if (!event) return undefined;
    if (event.type === "message_start") {
      startUsage = asRecord(event.message).usage;
      deltaUsage = undefined;
    } else if (event.type === "message_delta") {
      deltaUsage = event.usage;
    } else {
      return undefined;
    }
    return mergeAnthropicUsage(startUsage, deltaUsage);
  };
}

// Tracks usage over one streamed reply. Tool calls re-issue the request, so
// each finished request's usage is summed into the total.
export function createStreamUsageTracker(extract?: StreamUsageExtractor) {
  let finished: TokenUsage | undefined;
  let current: TokenUsage | undefined;
  return {
    observe(text: string) {
      if (!extract) return;
      try {
        current = extract(text) ?? current;
      } catch {
        // usage is best-effort and must never break the stream
      }
    },
    nextRequest() {
      finished = addUsage(finished, current);
      current = undefined;
    },
    total() {
      return addUsage(finished, current);
    },
  };
}

const STREAM_USAGE_OFFICIAL_HOSTS: Partial<Record<string, string>> = {
  [ServiceProvider.OpenAI]: "api.openai.com",
  [ServiceProvider.DeepSeek]: "api.deepseek.com",
};

// Server proxy paths that forward to the official host by default.
const STREAM_USAGE_PROXY_PATHS: Partial<Record<string, string>> = {
  [ServiceProvider.DeepSeek]: ApiPath.DeepSeek,
};

// Whether to send `stream_options: { include_usage: true }`. Only official
// endpoints are trusted to accept it; Azure, gateways and custom base URLs
// are left untouched.
export function shouldRequestStreamUsage(
  provider: string,
  url: string,
): boolean {
  const officialHost = STREAM_USAGE_OFFICIAL_HOSTS[provider];
  const target = url?.trim();
  if (!officialHost || !target) return false;

  if (target.startsWith("/")) {
    const proxyPath = STREAM_USAGE_PROXY_PATHS[provider];
    if (!proxyPath) return false;
    return target === proxyPath || target.startsWith(`${proxyPath}/`);
  }

  try {
    const { hostname } = new URL(
      /^https?:\/\//i.test(target) ? target : `https://${target}`,
    );
    return hostname.toLowerCase() === officialHost;
  } catch {
    return false;
  }
}
