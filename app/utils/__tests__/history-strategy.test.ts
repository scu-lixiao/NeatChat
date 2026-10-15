import {
  APPEND_TRIM_TARGET_RATIO,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_HISTORY_STRATEGY,
  getAppendHistoryBudget,
  getModelContextWindow,
  resolveHistoryStrategy,
  selectMessagesToSummarize,
  selectShortTermHistory,
  shouldSendLongTermMemory,
  type HistoryMessage,
  type HistoryModelConfig,
} from "../history-strategy";
import { useAppConfig } from "../../store/config";

type Msg = HistoryMessage & { id: string; content: string };

function msg(
  role: string,
  content: string,
  opts: { isError?: boolean; id?: string } = {},
): Msg {
  return {
    id: opts.id ?? `${role}-${content}`,
    role,
    content,
    isError: opts.isError,
  };
}

function tokens(m: Msg) {
  return m.content.length;
}

function baseConfig(
  overrides: Partial<HistoryModelConfig> = {},
): HistoryModelConfig {
  return {
    model: "gpt-4o",
    max_tokens: 4000,
    historyMessageCount: 4,
    sendMemory: true,
    historyStrategy: "window",
    ...overrides,
  };
}

function select(
  messages: Msg[],
  overrides: Partial<HistoryModelConfig> & {
    clearContextIndex?: number;
    lastSummarizeIndex?: number;
    sendLongTermMemory?: boolean;
    appendStartIndex?: number;
    overheadTokens?: number;
  } = {},
) {
  const {
    clearContextIndex = 0,
    lastSummarizeIndex = 0,
    sendLongTermMemory = false,
    appendStartIndex,
    overheadTokens,
    ...config
  } = overrides;
  return selectShortTermHistory({
    messages,
    clearContextIndex,
    lastSummarizeIndex,
    sendLongTermMemory,
    modelConfig: baseConfig(config),
    estimateTokens: tokens,
    appendStartIndex,
    overheadTokens,
  });
}

describe("resolveHistoryStrategy", () => {
  test("defaults to window for missing/unknown values", () => {
    expect(DEFAULT_HISTORY_STRATEGY).toBe("window");
    expect(resolveHistoryStrategy(undefined)).toBe("window");
    expect(resolveHistoryStrategy("")).toBe("window");
    expect(resolveHistoryStrategy("something")).toBe("window");
    expect(resolveHistoryStrategy("append")).toBe("append");
  });
});

describe("getModelContextWindow", () => {
  test("matches known prefixes and falls back", () => {
    expect(getModelContextWindow("claude-opus-5-5")).toBe(200_000);
    expect(getModelContextWindow("gemini-4-argon")).toBe(1_048_576);
    expect(getModelContextWindow("gemini-2.5-pro")).toBe(1_048_576);
    expect(getModelContextWindow("grok-4.7")).toBe(256_000);
    expect(getModelContextWindow("deepseek-chat")).toBe(128_000);
    expect(getModelContextWindow("gpt-4o")).toBe(128_000);
    expect(getModelContextWindow("gpt-5.4")).toBe(128_000);
    expect(getModelContextWindow("o3-mini")).toBe(128_000);
    expect(getModelContextWindow("vendor/claude-sonnet-5")).toBe(200_000);
    expect(getModelContextWindow("unknown-model")).toBe(DEFAULT_CONTEXT_WINDOW);
  });
});

describe("getAppendHistoryBudget", () => {
  test("subtracts max_tokens and a 10% margin", () => {
    expect(getAppendHistoryBudget("gpt-4o", 4000)).toBe(
      128_000 - 4000 - Math.floor(128_000 * 0.1),
    );
  });

  test("never shrinks below 25% of the context window", () => {
    expect(getAppendHistoryBudget("gpt-4o", 200_000)).toBe(
      Math.floor(128_000 * 0.25),
    );
  });
});

describe("window mode", () => {
  const conversation = [
    msg("user", "u0"),
    msg("assistant", "a0"),
    msg("user", "u1"),
    msg("assistant", "a1"),
    msg("user", "u2"),
    msg("assistant", "a2"),
    msg("user", "u3"),
    msg("assistant", "a3"),
  ];

  test("keeps only the last historyMessageCount messages", () => {
    const result = select(conversation, {
      historyStrategy: "window",
      historyMessageCount: 4,
      max_tokens: 100_000,
    });
    expect(result.strategy).toBe("window");
    expect(result.messages.map((m) => m.content)).toEqual([
      "u2",
      "a2",
      "u3",
      "a3",
    ]);
    expect(result.trimmed).toBe(false);
  });

  test("trims by max_tokens (legacy quirk)", () => {
    // Each message is 2 tokens by content length. max_tokens=5 => at most 3 msgs.
    const result = select(conversation, {
      historyStrategy: "window",
      historyMessageCount: 64,
      max_tokens: 5,
    });
    expect(result.messages.map((m) => m.content)).toEqual(["a2", "u3", "a3"]);
  });

  test("skips isError messages", () => {
    const withError = [
      msg("user", "u0"),
      msg("assistant", "err", { isError: true }),
      msg("user", "u1"),
      msg("assistant", "a1"),
    ];
    const result = select(withError, {
      historyStrategy: "window",
      historyMessageCount: 4,
      max_tokens: 100_000,
    });
    expect(result.messages.map((m) => m.content)).toEqual(["u0", "u1", "a1"]);
  });

  test("respects clearContextIndex", () => {
    const result = select(conversation, {
      historyStrategy: "window",
      historyMessageCount: 64,
      max_tokens: 100_000,
      clearContextIndex: 6,
    });
    expect(result.messages.map((m) => m.content)).toEqual(["u3", "a3"]);
  });
});

describe("append mode", () => {
  test("returns every message since clearContextIndex when under budget", () => {
    const messages = [
      msg("user", "old"),
      msg("assistant", "old-a"),
      msg("user", "u0"),
      msg("assistant", "a0"),
      msg("user", "u1"),
      msg("assistant", "a1"),
    ];
    const result = select(messages, {
      historyStrategy: "append",
      clearContextIndex: 2,
      overheadTokens: 0,
      max_tokens: 1000,
    });
    expect(result.messages.map((m) => m.content)).toEqual([
      "u0",
      "a0",
      "u1",
      "a1",
    ]);
    expect(result.trimmed).toBe(false);
    expect(result.appendStartIndex).toBe(0);
  });

  test("prefix stays byte-identical when a turn is appended under budget", () => {
    const turn1 = [msg("user", "hello"), msg("assistant", "hi there")];
    const first = select(turn1, {
      historyStrategy: "append",
      overheadTokens: 10,
      max_tokens: 1000,
    });

    const turn2 = [...turn1, msg("user", "next"), msg("assistant", "reply")];
    const second = select(turn2, {
      historyStrategy: "append",
      overheadTokens: 10,
      max_tokens: 1000,
      appendStartIndex: first.appendStartIndex,
    });

    expect(second.messages.slice(0, first.messages.length)).toEqual(
      first.messages,
    );
    expect(second.trimmed).toBe(false);
  });

  test("drops a large front chunk once when over budget, then keeps a stable prefix", () => {
    // Budget for gpt-4o with max_tokens=4000 is 128000 - 4000 - 12800 = 111200.
    // Force a tiny budget by using a huge overhead instead: set overhead so that
    // the whole conversation exceeds the budget.
    const budget = getAppendHistoryBudget("gpt-4o", 4000);
    const messages: Msg[] = [];
    for (let i = 0; i < 20; i += 1) {
      // 8000 tokens each => 20*8000 = 160000 > budget
      messages.push(msg("user", "u".repeat(8000), { id: `u${i}` }));
      messages.push(msg("assistant", "a".repeat(8000), { id: `a${i}` }));
    }

    const first = select(messages, {
      historyStrategy: "append",
      model: "gpt-4o",
      max_tokens: 4000,
      overheadTokens: 0,
    });
    expect(first.trimmed).toBe(true);
    expect(first.appendStartIndex).toBeGreaterThan(0);
    // Newest turn must survive.
    expect(first.messages.at(-1)?.id).toBe("a19");
    expect(first.messages.at(-2)?.id).toBe("u19");
    // After a trim the estimated size is at or below 70% of the budget.
    const keptTokens = first.messages.reduce((s, m) => s + tokens(m), 0);
    expect(keptTokens).toBeLessThanOrEqual(
      budget * APPEND_TRIM_TARGET_RATIO + 8000,
    ); // allow one message of slack from turn-boundary rounding

    // A later turn under the remaining headroom must keep the exact same prefix.
    const next = [
      ...messages,
      msg("user", "fresh", { id: "u20" }),
      msg("assistant", "ok", { id: "a20" }),
    ];
    const second = select(next, {
      historyStrategy: "append",
      model: "gpt-4o",
      max_tokens: 4000,
      overheadTokens: 0,
      appendStartIndex: first.appendStartIndex,
    });
    expect(second.trimmed).toBe(false);
    expect(second.appendStartIndex).toBe(first.appendStartIndex);
    expect(second.messages.slice(0, first.messages.length)).toEqual(
      first.messages,
    );
  });

  test("never drops the newest turn even if it alone exceeds the budget", () => {
    const huge = "x".repeat(200_000);
    const messages = [
      msg("user", "old"),
      msg("assistant", "old-a"),
      msg("user", huge, { id: "huge-user" }),
      msg("assistant", "tiny", { id: "huge-asst" }),
    ];
    const result = select(messages, {
      historyStrategy: "append",
      model: "gpt-4o",
      max_tokens: 4000,
      overheadTokens: 0,
    });
    expect(result.trimmed).toBe(true);
    expect(result.messages.map((m) => m.id)).toEqual([
      "huge-user",
      "huge-asst",
    ]);
  });

  test("skips isError messages and respects clearContextIndex", () => {
    const messages = [
      msg("user", "before"),
      msg("assistant", "before-a"),
      msg("user", "u0"),
      msg("assistant", "err", { isError: true }),
      msg("user", "u1"),
      msg("assistant", "a1"),
    ];
    const result = select(messages, {
      historyStrategy: "append",
      clearContextIndex: 2,
      max_tokens: 1000,
    });
    expect(result.messages.map((m) => m.content)).toEqual(["u0", "u1", "a1"]);
  });
});

describe("selectMessagesToSummarize", () => {
  const cfg = {
    ...baseConfig({ historyStrategy: "window" }),
    compressMessageLengthThreshold: 10,
  };

  test("window mode still triggers on compressMessageLengthThreshold", () => {
    const messages = [
      msg("user", "abcdefghij"),
      msg("assistant", "klmnopqrst"),
    ];
    const result = selectMessagesToSummarize({
      messages,
      clearContextIndex: 0,
      lastSummarizeIndex: 0,
      modelConfig: cfg,
      estimateTokens: tokens,
    });
    expect(result.shouldSummarize).toBe(true);
    expect(result.messages).toHaveLength(2);
  });

  test("append mode only summarizes after a trim past lastSummarizeIndex", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", `m${i}`),
    );
    const idle = selectMessagesToSummarize({
      messages,
      clearContextIndex: 0,
      lastSummarizeIndex: 0,
      modelConfig: { ...cfg, historyStrategy: "append" },
      estimateTokens: tokens,
      appendStartIndex: 0,
    });
    expect(idle.shouldSummarize).toBe(false);

    const afterTrim = selectMessagesToSummarize({
      messages,
      clearContextIndex: 0,
      lastSummarizeIndex: 2,
      modelConfig: { ...cfg, historyStrategy: "append" },
      estimateTokens: tokens,
      appendStartIndex: 6,
      summarizeModel: "gpt-4o",
    });
    expect(afterTrim.shouldSummarize).toBe(true);
    expect(afterTrim.messages.map((m) => m.content)).toEqual([
      "m2",
      "m3",
      "m4",
      "m5",
    ]);
    expect(afterTrim.nextSummarizeIndex).toBe(6);
  });
});

describe("shouldSendLongTermMemory", () => {
  test("requires sendMemory, a non-empty prompt, and summary after clear", () => {
    expect(
      shouldSendLongTermMemory({
        sendMemory: true,
        memoryPrompt: "summary",
        lastSummarizeIndex: 5,
        clearContextIndex: 2,
      }),
    ).toBe(true);
    expect(
      shouldSendLongTermMemory({
        sendMemory: true,
        memoryPrompt: "summary",
        lastSummarizeIndex: 2,
        clearContextIndex: 2,
      }),
    ).toBe(false);
  });
});

describe("config migration 4.5 -> 4.6", () => {
  test("backfills historyStrategy as window", () => {
    const migrate = useAppConfig.persist.getOptions().migrate!;
    const state = migrate(
      {
        modelConfig: {
          model: "gpt-4o",
          providerName: "OpenAI",
          max_tokens: 4000,
          historyMessageCount: 4,
          compressMessageLengthThreshold: 1000,
          sendMemory: true,
        },
      },
      4.5,
    ) as { modelConfig: { historyStrategy?: string } };
    expect(state.modelConfig.historyStrategy).toBe("window");
  });
});
