import { jest } from "@jest/globals";
import {
  addUsage,
  addUsageToStat,
  cacheHitRate,
  createAnthropicStreamUsageExtractor,
  createStreamUsageTracker,
  extractChatCompletionsStreamUsage,
  extractGeminiStreamUsage,
  extractResponsesStreamUsage,
  formatCacheHitRate,
  formatTokenCount,
  formatUsageDetails,
  formatUsageSummary,
  fromAnthropicUsage,
  fromChatCompletionsUsage,
  fromGeminiUsageMetadata,
  fromResponsesUsage,
  mergeAnthropicUsage,
  shouldRequestStreamUsage,
  usageFromStat,
  type TokenUsage,
} from "../token-usage";
import { DeepSeekApi } from "../../client/platforms/deepseek";
import { useAccessStore } from "../../store/access";

const LABELS = {
  Input: "in",
  Cached: "cached",
  CacheWrite: "cache write",
  Output: "out",
  Reasoning: "reasoning",
};

// --- Provider fixtures (shapes as documented by each provider) ---

const anthropicMessageStart = {
  type: "message_start",
  message: {
    id: "msg_01",
    type: "message",
    role: "assistant",
    content: [],
    model: "claude-opus-4-5",
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: 25,
      cache_creation_input_tokens: 1200,
      cache_read_input_tokens: 11800,
      output_tokens: 1,
    },
  },
};

const anthropicMessageDelta = {
  type: "message_delta",
  delta: { stop_reason: "end_turn", stop_sequence: null },
  usage: { output_tokens: 540 },
};

const openaiResponseCompleted = {
  type: "response.completed",
  sequence_number: 42,
  response: {
    id: "resp_123",
    object: "response",
    status: "completed",
    model: "gpt-5.5",
    output: [],
    usage: {
      input_tokens: 12345,
      input_tokens_details: { cached_tokens: 11776 },
      output_tokens: 540,
      output_tokens_details: { reasoning_tokens: 128 },
      total_tokens: 12885,
    },
  },
};

const xaiResponseCompleted = {
  type: "response.completed",
  response: {
    id: "resp_xai",
    object: "response",
    status: "completed",
    model: "grok-4.3",
    output: [],
    usage: {
      input_tokens: 2000,
      input_tokens_details: { cached_tokens: 1536 },
      output_tokens: 100,
      output_tokens_details: { reasoning_tokens: 64 },
      total_tokens: 2100,
      num_sources_used: 0,
      num_server_side_tools_used: 0,
    },
  },
};

const openaiChatCompletionsUsageChunk = {
  id: "chatcmpl-1",
  object: "chat.completion.chunk",
  created: 1,
  model: "gpt-4o",
  choices: [],
  usage: {
    prompt_tokens: 2006,
    completion_tokens: 300,
    total_tokens: 2306,
    prompt_tokens_details: { cached_tokens: 1920, audio_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: 0, audio_tokens: 0 },
  },
};

const geminiFinalChunk = {
  candidates: [
    {
      content: { role: "model", parts: [{ text: "done" }] },
      finishReason: "STOP",
    },
  ],
  usageMetadata: {
    promptTokenCount: 12000,
    cachedContentTokenCount: 9000,
    candidatesTokenCount: 400,
    thoughtsTokenCount: 250,
    totalTokenCount: 12650,
  },
  modelVersion: "gemini-2.5-pro",
};

const deepseekUsageChunk = {
  id: "ds-1",
  object: "chat.completion.chunk",
  model: "deepseek-chat",
  choices: [],
  usage: {
    prompt_tokens: 1500,
    completion_tokens: 200,
    total_tokens: 1700,
    prompt_cache_hit_tokens: 1280,
    prompt_cache_miss_tokens: 220,
    completion_tokens_details: { reasoning_tokens: 120 },
  },
};

describe("fromAnthropicUsage", () => {
  test("counts cache reads and writes into total input", () => {
    expect(
      fromAnthropicUsage({
        input_tokens: 25,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 11800,
        output_tokens: 540,
      }),
    ).toEqual({ input: 11825, cachedRead: 11800, cacheWrite: 0, output: 540 });
  });

  test("merges message_start and message_delta usage", () => {
    expect(
      mergeAnthropicUsage(
        anthropicMessageStart.message.usage,
        anthropicMessageDelta.usage,
      ),
    ).toEqual({
      input: 13025,
      cachedRead: 11800,
      cacheWrite: 1200,
      output: 540,
    });
  });

  test("message_delta values win, null fields fall back to message_start", () => {
    expect(
      mergeAnthropicUsage(anthropicMessageStart.message.usage, {
        input_tokens: 30,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: 11800,
        output_tokens: 600,
      }),
    ).toEqual({
      input: 13030,
      cachedRead: 11800,
      cacheWrite: 1200,
      output: 600,
    });
  });

  test("works with only one side present", () => {
    expect(
      mergeAnthropicUsage(anthropicMessageStart.message.usage, undefined),
    ).toEqual({ input: 13025, cachedRead: 11800, cacheWrite: 1200, output: 1 });
    expect(mergeAnthropicUsage(undefined, undefined)).toBeUndefined();
  });

  test("stream extractor merges start + delta and resets per message", () => {
    const extract = createAnthropicStreamUsageExtractor();
    expect(extract(JSON.stringify(anthropicMessageStart))).toEqual({
      input: 13025,
      cachedRead: 11800,
      cacheWrite: 1200,
      output: 1,
    });
    expect(
      extract(
        JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: 'the "usage" word' },
        }),
      ),
    ).toBeUndefined();
    expect(extract(JSON.stringify(anthropicMessageDelta))).toEqual({
      input: 13025,
      cachedRead: 11800,
      cacheWrite: 1200,
      output: 540,
    });

    // a new request (e.g. after a tool call) starts from its own message_start
    expect(
      extract(
        JSON.stringify({
          type: "message_start",
          message: { usage: { input_tokens: 10, output_tokens: 1 } },
        }),
      ),
    ).toEqual({ input: 10, cachedRead: 0, cacheWrite: 0, output: 1 });
  });
});

describe("fromResponsesUsage", () => {
  test("parses OpenAI response.completed usage", () => {
    const usage = extractResponsesStreamUsage(
      JSON.stringify(openaiResponseCompleted),
    );
    expect(usage).toEqual({
      input: 12345,
      cachedRead: 11776,
      cacheWrite: 0,
      output: 540,
      reasoning: 128,
    });
    expect(fromResponsesUsage(openaiResponseCompleted.response.usage)).toEqual(
      usage,
    );
  });

  test("parses xAI response.completed usage", () => {
    expect(
      extractResponsesStreamUsage(JSON.stringify(xaiResponseCompleted)),
    ).toEqual({
      input: 2000,
      cachedRead: 1536,
      cacheWrite: 0,
      output: 100,
      reasoning: 64,
    });
  });

  test("reads optional cache_write_tokens", () => {
    expect(
      fromResponsesUsage({
        input_tokens: 5000,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 4096 },
        output_tokens: 10,
      }),
    ).toEqual({ input: 5000, cachedRead: 0, cacheWrite: 4096, output: 10 });
  });

  test("ignores other Responses stream events", () => {
    expect(
      extractResponsesStreamUsage(
        JSON.stringify({ type: "response.output_text.delta", delta: "usage" }),
      ),
    ).toBeUndefined();
    expect(
      extractResponsesStreamUsage(
        JSON.stringify({
          type: "response.created",
          response: { id: "r", usage: null },
        }),
      ),
    ).toBeUndefined();
  });
});

describe("fromChatCompletionsUsage", () => {
  test("parses OpenAI Chat Completions usage chunk", () => {
    expect(
      extractChatCompletionsStreamUsage(
        JSON.stringify(openaiChatCompletionsUsageChunk),
      ),
    ).toEqual({
      input: 2006,
      cachedRead: 1920,
      cacheWrite: 0,
      output: 300,
      reasoning: 0,
    });
  });

  test("ignores content chunks with usage: null", () => {
    expect(
      extractChatCompletionsStreamUsage(
        JSON.stringify({
          choices: [{ index: 0, delta: { content: "hi" } }],
          usage: null,
        }),
      ),
    ).toBeUndefined();
  });

  test("parses DeepSeek prompt cache hit/miss", () => {
    expect(
      extractChatCompletionsStreamUsage(JSON.stringify(deepseekUsageChunk)),
    ).toEqual({
      input: 1500,
      cachedRead: 1280,
      cacheWrite: 0,
      output: 200,
      reasoning: 120,
    });
  });

  test("derives DeepSeek input from hit + miss when prompt_tokens is absent", () => {
    expect(
      fromChatCompletionsUsage({
        prompt_cache_hit_tokens: 64,
        prompt_cache_miss_tokens: 36,
        completion_tokens: 5,
      }),
    ).toEqual({ input: 100, cachedRead: 64, cacheWrite: 0, output: 5 });
  });

  test("reads usage reported on the final choice", () => {
    expect(
      extractChatCompletionsStreamUsage(
        JSON.stringify({
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
              usage: {
                prompt_tokens: 800,
                completion_tokens: 50,
                total_tokens: 850,
                cached_tokens: 512,
              },
            },
          ],
        }),
      ),
    ).toEqual({ input: 800, cachedRead: 512, cacheWrite: 0, output: 50 });
  });

  test("reads DashScope-style input_tokens/output_tokens", () => {
    expect(
      fromChatCompletionsUsage({
        input_tokens: 300,
        output_tokens: 20,
        total_tokens: 320,
        prompt_tokens_details: { cached_tokens: 256 },
      }),
    ).toEqual({ input: 300, cachedRead: 256, cacheWrite: 0, output: 20 });
  });
});

describe("fromGeminiUsageMetadata", () => {
  test("parses usageMetadata; output includes thinking tokens", () => {
    expect(fromGeminiUsageMetadata(geminiFinalChunk.usageMetadata)).toEqual({
      input: 12000,
      cachedRead: 9000,
      cacheWrite: 0,
      output: 650,
      reasoning: 250,
    });
  });

  test("stream: the last usageMetadata wins", () => {
    const tracker = createStreamUsageTracker(extractGeminiStreamUsage);
    tracker.observe(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "par" }] } }],
        usageMetadata: { promptTokenCount: 12000, totalTokenCount: 12000 },
      }),
    );
    tracker.observe(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: "t" }] } }] }),
    );
    tracker.observe(JSON.stringify(geminiFinalChunk));
    expect(tracker.total()).toEqual({
      input: 12000,
      cachedRead: 9000,
      cacheWrite: 0,
      output: 650,
      reasoning: 250,
    });
  });
});

describe("defensive parsing", () => {
  const normalizers = [
    fromAnthropicUsage,
    fromResponsesUsage,
    fromChatCompletionsUsage,
    fromGeminiUsageMetadata,
  ];

  test.each([
    undefined,
    null,
    "garbage",
    42,
    {},
    { usage: [] },
    { input_tokens: "12", prompt_tokens: "12", promptTokenCount: "12" },
    { input_tokens: -5, output_tokens: Number.NaN, prompt_tokens: -1 },
    { input_tokens: 0, output_tokens: 0, prompt_tokens: 0 },
  ])("returns undefined for %p", (raw) => {
    for (const normalize of normalizers) {
      expect(normalize(raw)).toBeUndefined();
    }
  });

  test("treats missing or invalid fields as 0", () => {
    expect(
      fromResponsesUsage({
        input_tokens: 100,
        input_tokens_details: "nope",
        output_tokens: "7",
      }),
    ).toEqual({ input: 100, cachedRead: 0, cacheWrite: 0, output: 0 });
    expect(fromAnthropicUsage({ output_tokens: 10 })).toEqual({
      input: 0,
      cachedRead: 0,
      cacheWrite: 0,
      output: 10,
    });
  });

  test("keeps input >= cached when a provider reports inconsistent numbers", () => {
    const usage = fromResponsesUsage({
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 50 },
    });
    expect(usage?.input).toBe(50);
    expect(cacheHitRate(usage)).toBe(1);
  });

  test.each([
    extractChatCompletionsStreamUsage,
    extractResponsesStreamUsage,
    extractGeminiStreamUsage,
    createAnthropicStreamUsageExtractor(),
  ])("stream extractors ignore non-JSON payloads", (extract) => {
    expect(extract("")).toBeUndefined();
    expect(extract("[DONE]")).toBeUndefined();
    expect(extract('{"usage": broken')).toBeUndefined();
    expect(extract('{"usageMetadata": broken')).toBeUndefined();
  });
});

describe("cacheHitRate", () => {
  test("is cachedRead / input", () => {
    expect(
      cacheHitRate({ input: 200, cachedRead: 150, cacheWrite: 0, output: 1 }),
    ).toBe(0.75);
  });

  test("is 0 without usage or input", () => {
    expect(cacheHitRate(undefined)).toBe(0);
    expect(
      cacheHitRate({ input: 0, cachedRead: 0, cacheWrite: 0, output: 5 }),
    ).toBe(0);
  });
});

describe("addUsage", () => {
  const a: TokenUsage = {
    input: 100,
    cachedRead: 80,
    cacheWrite: 10,
    output: 5,
  };
  const b: TokenUsage = {
    input: 50,
    cachedRead: 0,
    cacheWrite: 0,
    output: 7,
    reasoning: 3,
  };

  test("sums all counters", () => {
    expect(addUsage(a, b)).toEqual({
      input: 150,
      cachedRead: 80,
      cacheWrite: 10,
      output: 12,
      reasoning: 3,
    });
  });

  test("omits reasoning when neither side has it", () => {
    expect(addUsage(a, a)).toEqual({
      input: 200,
      cachedRead: 160,
      cacheWrite: 20,
      output: 10,
    });
  });

  test("handles missing sides", () => {
    expect(addUsage(undefined, undefined)).toBeUndefined();
    expect(addUsage(a, undefined)).toEqual(a);
    expect(addUsage(undefined, b)).toEqual(b);
  });
});

describe("session stats", () => {
  test("accumulates onto an old stat without usage fields", () => {
    const old: {
      tokenCount: number;
      wordCount: number;
      charCount: number;
    } & Parameters<typeof addUsageToStat>[0] = {
      tokenCount: 0,
      wordCount: 0,
      charCount: 42,
    };
    const usage: TokenUsage = {
      input: 1000,
      cachedRead: 900,
      cacheWrite: 50,
      output: 20,
    };
    const once = addUsageToStat(old, usage);
    expect(once).toEqual({
      tokenCount: 0,
      wordCount: 0,
      charCount: 42,
      inputTokens: 1000,
      cachedTokens: 900,
      cacheWriteTokens: 50,
      outputTokens: 20,
    });
    expect(old).toEqual({ tokenCount: 0, wordCount: 0, charCount: 42 });

    const twice = addUsageToStat(once, usage);
    expect(twice.inputTokens).toBe(2000);
    expect(cacheHitRate(usageFromStat(twice))).toBe(0.9);
  });

  test("usageFromStat treats missing fields as 0", () => {
    expect(usageFromStat({})).toEqual({
      input: 0,
      cachedRead: 0,
      cacheWrite: 0,
      output: 0,
    });
    expect(usageFromStat(undefined).input).toBe(0);
  });
});

describe("createStreamUsageTracker", () => {
  test("sums usage across tool-call requests", () => {
    const tracker = createStreamUsageTracker(extractResponsesStreamUsage);
    tracker.observe(JSON.stringify(openaiResponseCompleted));
    tracker.nextRequest();
    tracker.observe(JSON.stringify(xaiResponseCompleted));
    expect(tracker.total()).toEqual({
      input: 14345,
      cachedRead: 13312,
      cacheWrite: 0,
      output: 640,
      reasoning: 192,
    });
  });

  test("returns undefined without an extractor or usage", () => {
    const noExtractor = createStreamUsageTracker();
    noExtractor.observe(JSON.stringify(openaiResponseCompleted));
    expect(noExtractor.total()).toBeUndefined();

    const noUsage = createStreamUsageTracker(extractChatCompletionsStreamUsage);
    noUsage.observe(JSON.stringify({ choices: [{ delta: { content: "x" } }] }));
    noUsage.nextRequest();
    expect(noUsage.total()).toBeUndefined();
  });

  test("never throws when the extractor fails", () => {
    const tracker = createStreamUsageTracker(() => {
      throw new Error("boom");
    });
    expect(() => tracker.observe("{}")).not.toThrow();
    expect(tracker.total()).toBeUndefined();
  });
});

describe("formatting", () => {
  test.each([
    [0, "0"],
    [-1, "0"],
    [Number.NaN, "0"],
    [540, "540"],
    [999, "999"],
    [1000, "1k"],
    [11800, "11.8k"],
    [12345, "12.3k"],
    [999949, "999.9k"],
    [999950, "1M"],
    [2500000, "2.5M"],
  ])("formatTokenCount(%p) = %p", (value, expected) => {
    expect(formatTokenCount(value)).toBe(expected);
  });

  test("summary shows cache parts only when non-zero", () => {
    expect(
      formatUsageSummary(
        { input: 12300, cachedRead: 11800, cacheWrite: 0, output: 540 },
        LABELS,
      ),
    ).toBe("in 12.3k · cached 11.8k (96%) · out 540");
    expect(
      formatUsageSummary(
        { input: 13025, cachedRead: 11800, cacheWrite: 1200, output: 540 },
        LABELS,
      ),
    ).toBe("in 13k · cached 11.8k (91%) · cache write 1.2k · out 540");
    expect(
      formatUsageSummary(
        { input: 2006, cachedRead: 0, cacheWrite: 0, output: 300 },
        LABELS,
      ),
    ).toBe("in 2k · out 300");
  });

  test("details list exact counts", () => {
    expect(
      formatUsageDetails(
        {
          input: 12345,
          cachedRead: 11776,
          cacheWrite: 0,
          output: 540,
          reasoning: 128,
        },
        LABELS,
      ),
    ).toBe("in 12345 · cached 11776 · cache write 0 · out 540 · reasoning 128");
    expect(formatCacheHitRate(undefined)).toBe("0%");
  });
});

describe("shouldRequestStreamUsage", () => {
  test.each([
    "https://api.deepseek.com/chat/completions",
    "https://api.deepseek.com",
    "api.deepseek.com/v1",
    "HTTPS://API.DEEPSEEK.COM/chat/completions",
    // server proxy path, forwards to the official host by default
    "/api/deepseek/chat/completions",
    "/api/deepseek",
  ])("DeepSeek official: %s", (url) => {
    expect(shouldRequestStreamUsage("DeepSeek", url)).toBe(true);
  });

  test.each([
    "https://my-gateway.example.com/chat/completions",
    "https://api.deepseek.com.evil.example/chat/completions",
    "https://openrouter.ai/api/v1/chat/completions",
    "/api/deepseekx/chat/completions",
    "/api/openai/v1/chat/completions",
    "",
  ])("DeepSeek custom: %s", (url) => {
    expect(shouldRequestStreamUsage("DeepSeek", url)).toBe(false);
  });

  test("OpenAI only for api.openai.com", () => {
    expect(
      shouldRequestStreamUsage(
        "OpenAI",
        "https://api.openai.com/v1/chat/completions",
      ),
    ).toBe(true);
    // the server proxy may forward to a custom BASE_URL
    expect(
      shouldRequestStreamUsage("OpenAI", "/api/openai/v1/chat/completions"),
    ).toBe(false);
    expect(
      shouldRequestStreamUsage(
        "OpenAI",
        "https://gateway.ai.cloudflare.com/v1/acct/gw/openai/chat/completions",
      ),
    ).toBe(false);
    expect(
      shouldRequestStreamUsage("OpenAI", "https://oai.example.com/v1"),
    ).toBe(false);
  });

  test("never for Azure or other providers", () => {
    expect(
      shouldRequestStreamUsage(
        "Azure",
        "https://res.openai.azure.com/openai/deployments/gpt/chat/completions",
      ),
    ).toBe(false);
    expect(
      shouldRequestStreamUsage(
        "Azure",
        "https://api.openai.com/v1/chat/completions",
      ),
    ).toBe(false);
    expect(
      shouldRequestStreamUsage(
        "Moonshot",
        "https://api.moonshot.cn/v1/chat/completions",
      ),
    ).toBe(false);
    expect(
      shouldRequestStreamUsage("Anthropic", "https://api.anthropic.com"),
    ).toBe(false);
  });
});

describe("DeepSeek stream_options", () => {
  // The streamed request is left pending and aborted; fake timers keep its
  // request timeouts and animation frames from outliving the test.
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask"] });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  async function captureDeepSeekPayload(
    stream: boolean,
    access: Partial<ReturnType<typeof useAccessStore.getState>> = {},
  ) {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockClear();
    if (stream) {
      // keep the stream pending; the test aborts it once the body is captured
      fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    }

    const accessState = useAccessStore.getState();
    const getState = jest
      .spyOn(useAccessStore, "getState")
      .mockReturnValue({ ...accessState, ...access });
    let controller: AbortController | undefined;

    try {
      await new DeepSeekApi().chat({
        messages: [{ role: "user", content: "hello" }],
        config: { model: "deepseek-chat", providerName: "DeepSeek", stream },
        onFinish: () => {},
        onError: () => {},
        onController: (c) => (controller = c),
      });

      const chatCall = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith("chat/completions"),
      ) as [string, RequestInit] | undefined;
      if (!chatCall) throw new Error("no DeepSeek chat request");
      const [url, init] = chatCall;
      return { url, body: JSON.parse(init.body as string) };
    } finally {
      controller?.abort();
      getState.mockRestore();
    }
  }

  test("requested when streaming through the default proxy", async () => {
    const { url, body } = await captureDeepSeekPayload(true);
    expect(url).toBe("/api/deepseek/chat/completions");
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  test("requested for the official host as a custom endpoint", async () => {
    const { body } = await captureDeepSeekPayload(true, {
      useCustomConfig: true,
      deepseekUrl: "https://api.deepseek.com",
    });
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  test("omitted for custom DeepSeek-compatible endpoints", async () => {
    const { url, body } = await captureDeepSeekPayload(true, {
      useCustomConfig: true,
      deepseekUrl: "https://my-gateway.example.com",
    });
    expect(url).toBe("https://my-gateway.example.com/chat/completions");
    expect(body).not.toHaveProperty("stream_options");
  });

  test("omitted for non-streaming requests", async () => {
    const { body } = await captureDeepSeekPayload(false);
    expect(body).not.toHaveProperty("stream_options");
  });
});
