import { jest } from "@jest/globals";
import {
  applyAnthropicCacheControl,
  buildAnthropicMessages,
  ClaudeApi,
  resolveAnthropicPromptCacheMode,
  splitAnthropicSystem,
} from "../../client/platforms/anthropic";
import type { AnthropicChatRequest } from "../../client/platforms/anthropic";
import type { RequestMessage } from "../../client/api";
import { useChatStore } from "../../store/chat";
import { DEFAULT_CONFIG, useAppConfig } from "../../store/config";
import type { ModelConfig } from "../../store/config";
import {
  createAnthropicStreamUsageExtractor,
  fromAnthropicUsage,
} from "../token-usage";

const EPHEMERAL_5M = { type: "ephemeral" };
const EPHEMERAL_1H = { type: "ephemeral", ttl: "1h" };

// Every object in the value that carries a cache_control marker.
function cacheMarked(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(cacheMarked);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const own = "cache_control" in record ? [record] : [];
  return [...own, ...Object.values(record).flatMap(cacheMarked)];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function buildRequest(
  messages: RequestMessage[],
  extra: Partial<AnthropicChatRequest> = {},
): AnthropicChatRequest {
  const { system, messages: chatMessages } = splitAnthropicSystem(messages);
  return {
    model: "claude-sonnet-5",
    max_tokens: 1024,
    ...(system.length > 0 ? { system } : {}),
    messages: buildAnthropicMessages(chatMessages, false),
    ...extra,
  };
}

const tools = [
  { name: "search", description: "Search", input_schema: { type: "object" } },
  { name: "fetch", description: "Fetch", input_schema: { type: "object" } },
];

const conversation: RequestMessage[] = [
  { role: "system", content: "You are NeatChat." },
  { role: "system", content: "Summary of earlier chat." },
  { role: "user", content: "Hi" },
  { role: "assistant", content: "Hello!" },
  { role: "user", content: "What changed?" },
];

describe("Anthropic system prompt handling", () => {
  test("moves system messages, in order, to the top-level system field", () => {
    const { system, messages } = splitAnthropicSystem([
      { role: "system", content: "first" },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "system", content: [{ type: "text", text: "second" }] },
      { role: "user", content: "Next" },
    ]);

    expect(system).toEqual([
      { type: "text", text: "first" },
      { type: "text", text: "second" },
    ]);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  test("never sends system prompts as messages", () => {
    const request = buildRequest(conversation);

    expect(request.system).toEqual([
      { type: "text", text: "You are NeatChat." },
      { type: "text", text: "Summary of earlier chat." },
    ]);
    expect(request.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "What changed?" },
    ]);
  });

  test("does not insert ';' placeholders because of system messages", () => {
    const request = buildRequest([
      { role: "system", content: "s1" },
      { role: "system", content: "s2" },
      { role: "user", content: "Hi" },
    ]);

    expect(request.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  test("still separates consecutive user messages", () => {
    const request = buildRequest([
      { role: "system", content: "s" },
      { role: "user", content: "one" },
      { role: "user", content: "two" },
    ]);

    expect(request.messages).toEqual([
      { role: "user", content: "one" },
      { role: "assistant", content: ";" },
      { role: "user", content: "two" },
    ]);
  });

  test("prepends a user placeholder when history starts with the assistant", () => {
    const request = buildRequest([
      { role: "system", content: "s" },
      { role: "assistant", content: "How can I help?" },
      { role: "user", content: "Hi" },
    ]);

    expect(request.messages).toEqual([
      { role: "user", content: ";" },
      { role: "assistant", content: "How can I help?" },
      { role: "user", content: "Hi" },
    ]);
  });

  test("does not end on an assistant prefill when the request ends with a system instruction", () => {
    // summarizeSession appends its instruction as a trailing system message.
    const request = buildRequest([
      { role: "system", content: "Memory" },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "system", content: "Summarize the discussion." },
    ]);

    expect(request.system).toEqual([
      { type: "text", text: "Memory" },
      { type: "text", text: "Summarize the discussion." },
    ]);
    expect(request.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: ";" },
    ]);
  });

  test("drops empty system prompts and omits system when none are left", () => {
    const request = buildRequest([
      { role: "system", content: "  " },
      { role: "user", content: "Hi" },
    ]);

    expect(request).not.toHaveProperty("system");
  });
});

describe("applyAnthropicCacheControl", () => {
  test("marks the last tool, the last system block and the message before the new turn", () => {
    const result = applyAnthropicCacheControl(
      buildRequest(conversation, { tools }),
      "5m",
    );

    expect(result.tools?.[0]).not.toHaveProperty("cache_control");
    expect(result.tools?.[1].cache_control).toEqual(EPHEMERAL_5M);
    expect(result.system?.[0]).not.toHaveProperty("cache_control");
    expect(result.system?.[1].cache_control).toEqual(EPHEMERAL_5M);
    expect(result.messages).toEqual([
      { role: "user", content: "Hi" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Hello!", cache_control: EPHEMERAL_5M },
        ],
      },
      { role: "user", content: "What changed?" },
    ]);
    expect(cacheMarked(result)).toHaveLength(3);
  });

  test("adds ttl only in 1h mode", () => {
    const request = buildRequest(conversation, { tools });

    const oneHour = cacheMarked(applyAnthropicCacheControl(request, "1h"));
    expect(oneHour).toHaveLength(3);
    oneHour.forEach((item) => expect(item.cache_control).toEqual(EPHEMERAL_1H));

    const fiveMinutes = cacheMarked(applyAnthropicCacheControl(request, "5m"));
    expect(fiveMinutes).toHaveLength(3);
    fiveMinutes.forEach((item) =>
      expect(item.cache_control).toEqual(EPHEMERAL_5M),
    );
  });

  test("sends no cache_control anywhere when off", () => {
    const request = buildRequest(conversation, { tools });
    const marked = applyAnthropicCacheControl(request, "1h");

    expect(cacheMarked(applyAnthropicCacheControl(request, "off"))).toEqual([]);
    expect(cacheMarked(applyAnthropicCacheControl(marked, "off"))).toEqual([]);
  });

  test("treats a missing or unknown mode as 5m", () => {
    const request = buildRequest(conversation, { tools });

    expect(applyAnthropicCacheControl(request)).toEqual(
      applyAnthropicCacheControl(request, "5m"),
    );
    expect(resolveAnthropicPromptCacheMode(undefined)).toBe("5m");
    expect(resolveAnthropicPromptCacheMode("bogus")).toBe("5m");
    expect(resolveAnthropicPromptCacheMode("off")).toBe("off");
    expect(resolveAnthropicPromptCacheMode("1h")).toBe("1h");
  });

  test("never marks thinking blocks and falls back to an earlier cacheable block", () => {
    const request = {
      model: "claude-sonnet-5",
      max_tokens: 1024,
      messages: [
        { role: "user", content: "Look it up" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Checking." },
            { type: "thinking", thinking: "hmm", signature: "sig" },
            { type: "redacted_thinking", data: "opaque" },
            { type: "text", text: "  " },
          ],
        },
        { role: "user", content: "Continue" },
      ],
    } as unknown as AnthropicChatRequest;

    const result = applyAnthropicCacheControl(request);
    const content = result.messages[1].content as any[];

    expect(content[0].cache_control).toEqual(EPHEMERAL_5M);
    content
      .slice(1)
      .forEach((block) => expect(block).not.toHaveProperty("cache_control"));
  });

  test("marks the tool_use block after thinking in a tool round", () => {
    const request = {
      model: "claude-sonnet-5",
      max_tokens: 1024,
      messages: [
        { role: "user", content: "Weather?" },
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "need a tool", signature: "sig" },
            { type: "tool_use", id: "toolu_1", name: "weather", input: {} },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "toolu_1", content: "sunny" },
          ],
        },
      ],
    } as unknown as AnthropicChatRequest;

    const result = applyAnthropicCacheControl(request);
    const content = result.messages[1].content as any[];

    expect(content[0]).not.toHaveProperty("cache_control");
    expect(content[1].cache_control).toEqual(EPHEMERAL_5M);
  });

  test("skips the history breakpoint when that message has nothing cacheable", () => {
    const request = {
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: [{ type: "text", text: "s" }],
      messages: [
        { role: "user", content: "Hi" },
        {
          role: "assistant",
          content: [{ type: "thinking", thinking: "x", signature: "sig" }],
        },
        { role: "user", content: "Next" },
      ],
    } as unknown as AnthropicChatRequest;

    const result = applyAnthropicCacheControl(request);

    expect(cacheMarked(result)).toEqual([result.system?.[0]]);
  });

  test("leaves a single new turn unmarked", () => {
    const result = applyAnthropicCacheControl(
      buildRequest([{ role: "user", content: "Hi" }]),
    );

    expect(result.messages).toEqual([{ role: "user", content: "Hi" }]);
    expect(cacheMarked(result)).toEqual([]);
  });

  test("never exceeds 4 markers, even when the input is already marked", () => {
    const marker = { type: "ephemeral" as const };
    const request = {
      model: "claude-sonnet-5",
      max_tokens: 1024,
      tools: tools.map((tool) => ({ ...tool, cache_control: marker })),
      system: [
        { type: "text", text: "a", cache_control: marker },
        { type: "text", text: "b", cache_control: marker },
      ],
      messages: ["u1", "a1", "u2", "a2", "u3"].map((text, i) => ({
        role: i % 2 ? "assistant" : "user",
        content: [{ type: "text", text, cache_control: marker }],
      })),
    } as unknown as AnthropicChatRequest;

    let result = applyAnthropicCacheControl(request, "1h");
    expect(cacheMarked(result).length).toBeLessThanOrEqual(4);
    for (let i = 0; i < 3; i++) {
      result = applyAnthropicCacheControl(result, "5m");
    }
    expect(cacheMarked(result)).toHaveLength(3);
  });

  test("re-applying after a tool round moves the history breakpoint forward", () => {
    const first = applyAnthropicCacheControl(
      buildRequest(conversation, { tools }),
    );
    const toolRound = [
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "search", input: {} }],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }],
      },
    ] as unknown as AnthropicChatRequest["messages"];
    first.messages.push(...toolRound);

    const second = applyAnthropicCacheControl(first);

    expect(cacheMarked(second.messages)).toEqual([
      (second.messages[3].content as any[])[0],
    ]);
    expect(cacheMarked(second)).toHaveLength(3);
  });

  test("does not mutate the input", () => {
    const request = buildRequest(conversation, { tools });
    request.messages.push(
      { role: "assistant", content: [{ type: "text", text: "Earlier." }] },
      { role: "user", content: "Again" },
    );
    const snapshot = JSON.parse(JSON.stringify(request));
    deepFreeze(request);

    const result = applyAnthropicCacheControl(request, "1h");

    expect(request).toEqual(snapshot);
    expect(result.messages).not.toBe(request.messages);
    expect(result.tools).not.toBe(request.tools);
    expect(result.system).not.toBe(request.system);
    expect(cacheMarked(result)).toHaveLength(3);
  });
});

async function captureChatRequest(
  messages: RequestMessage[],
  modelConfig: Partial<ModelConfig> = {},
  response: unknown = { content: [{ type: "text", text: "ok" }] },
) {
  const fetchMock = global.fetch as jest.Mock;
  fetchMock.mockClear();
  fetchMock.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
    } as Response),
  );

  const chatState = useChatStore.getState();
  const session = chatState.currentSession();
  const currentSession = jest.spyOn(chatState, "currentSession");
  currentSession.mockReturnValue({
    ...session,
    mask: {
      ...session.mask,
      modelConfig: { ...session.mask.modelConfig, ...modelConfig },
    },
  });

  const onFinish = jest.fn();
  try {
    await new ClaudeApi().chat({
      messages,
      config: { model: "claude-sonnet-5", providerName: "Anthropic" },
      onFinish,
      onError: (e) => {
        throw e;
      },
    });
  } finally {
    currentSession.mockRestore();
  }

  const chatCall = fetchMock.mock.calls.find(([url]) =>
    String(url).includes("messages"),
  ) as [string, RequestInit] | undefined;
  if (!chatCall) throw new Error("no Anthropic messages request");
  const [url, init] = chatCall;
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string),
    onFinish,
  };
}

describe("ClaudeApi.chat request", () => {
  test("sends system top-level with 5m breakpoints and no beta header", async () => {
    const { url, headers, body } = await captureChatRequest(conversation);

    expect(url).toContain("messages");
    expect(body.system).toEqual([
      { type: "text", text: "You are NeatChat." },
      {
        type: "text",
        text: "Summary of earlier chat.",
        cache_control: EPHEMERAL_5M,
      },
    ]);
    expect(body.messages.map((m: any) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(body.messages[1].content).toEqual([
      { type: "text", text: "Hello!", cache_control: EPHEMERAL_5M },
    ]);
    expect(JSON.stringify(body.messages)).not.toContain("You are NeatChat.");
    expect(cacheMarked(body)).toHaveLength(2);
    const headerNames = Object.keys(headers).map((key) => key.toLowerCase());
    expect(headerNames).not.toContain("anthropic-beta");
  });

  test("omits system when the conversation has none", async () => {
    const { body } = await captureChatRequest([
      { role: "user", content: "Hi" },
    ]);

    expect(body).not.toHaveProperty("system");
    expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  test("uses ttl 1h when configured", async () => {
    const { body } = await captureChatRequest(conversation, {
      anthropicPromptCache: "1h",
    });

    const marked = cacheMarked(body);
    expect(marked).toHaveLength(2);
    marked.forEach((item) => expect(item.cache_control).toEqual(EPHEMERAL_1H));
  });

  test("sends no cache_control when off", async () => {
    const { body } = await captureChatRequest(conversation, {
      anthropicPromptCache: "off",
    });

    expect(cacheMarked(body)).toEqual([]);
    expect(body.system).toHaveLength(2);
  });

  test("treats a missing setting as 5m", async () => {
    const { body } = await captureChatRequest(conversation, {
      anthropicPromptCache: undefined,
    });

    const marked = cacheMarked(body);
    expect(marked).toHaveLength(2);
    marked.forEach((item) => expect(item.cache_control).toEqual(EPHEMERAL_5M));
  });

  test("passes cache usage from the response to onFinish", async () => {
    const response = {
      content: [{ type: "text", text: "Done" }],
      usage: {
        input_tokens: 12,
        cache_read_input_tokens: 3000,
        cache_creation_input_tokens: 500,
        cache_creation: {
          ephemeral_5m_input_tokens: 500,
          ephemeral_1h_input_tokens: 0,
        },
        output_tokens: 40,
      },
    };
    const { onFinish } = await captureChatRequest(conversation, {}, response);

    expect(onFinish).toHaveBeenCalledWith("Done", expect.anything(), {
      input: 3512,
      cachedRead: 3000,
      cacheWrite: 500,
      output: 40,
    });
  });
});

describe("Anthropic cache usage parsing", () => {
  test("normalizes non-stream usage with cache reads and writes", () => {
    expect(
      fromAnthropicUsage({
        input_tokens: 8,
        cache_read_input_tokens: 2048,
        cache_creation_input_tokens: 1024,
        cache_creation: {
          ephemeral_5m_input_tokens: 0,
          ephemeral_1h_input_tokens: 1024,
        },
        output_tokens: 99,
      }),
    ).toEqual({ input: 3080, cachedRead: 2048, cacheWrite: 1024, output: 99 });
  });

  test("merges message_start and message_delta usage with cache fields", () => {
    const extract = createAnthropicStreamUsageExtractor();

    extract(
      JSON.stringify({
        type: "message_start",
        message: {
          usage: {
            input_tokens: 5,
            cache_read_input_tokens: 2048,
            cache_creation_input_tokens: 1024,
            cache_creation: {
              ephemeral_5m_input_tokens: 1024,
              ephemeral_1h_input_tokens: 0,
            },
            output_tokens: 1,
          },
        },
      }),
    );
    const usage = extract(
      JSON.stringify({
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 120 },
      }),
    );

    expect(usage).toEqual({
      input: 3077,
      cachedRead: 2048,
      cacheWrite: 1024,
      output: 120,
    });
  });
});

describe("config migration to 4.5", () => {
  const migrate = useAppConfig.persist.getOptions().migrate!;

  test("anthropicPromptCache still defaults to 5m after later migrations", () => {
    expect(useAppConfig.persist.getOptions().version).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(DEFAULT_CONFIG.modelConfig.anthropicPromptCache).toBe("5m");
  });

  test("backfills anthropicPromptCache for a v4.4 persisted state", () => {
    const { anthropicPromptCache, ...legacyModelConfig } =
      DEFAULT_CONFIG.modelConfig;
    const migrated = migrate(
      { models: [], modelConfig: { ...legacyModelConfig } },
      4.4,
    ) as typeof DEFAULT_CONFIG;

    expect(migrated.modelConfig.anthropicPromptCache).toBe("5m");
  });

  test("keeps a value the user already set", () => {
    const migrated = migrate(
      {
        models: [],
        modelConfig: {
          ...DEFAULT_CONFIG.modelConfig,
          anthropicPromptCache: "1h",
        },
      },
      4.4,
    ) as typeof DEFAULT_CONFIG;

    expect(migrated.modelConfig.anthropicPromptCache).toBe("1h");
  });

  test("tolerates a persisted state without modelConfig", () => {
    expect(() => migrate({ models: [] }, 4.4)).not.toThrow();
  });
});
