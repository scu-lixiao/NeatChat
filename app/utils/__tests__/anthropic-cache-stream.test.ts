import { jest } from "@jest/globals";

const fetchEventSourceMock = jest.fn<(url: string, init: any) => any>();

let ClaudeApi: any;
let usePluginStore: any;

// Streams a fake Anthropic SSE response for one request.
function replyWith(events: object[]) {
  return async (_url: string, init: any) => {
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      clone: () => response,
      text: async () => "",
      json: async () => ({}),
    };
    await init.onopen?.(response);
    events.forEach(
      (event) => init.onmessage?.({ data: JSON.stringify(event) }),
    );
    init.onclose?.();
  };
}

const toolRound = [
  {
    type: "message_start",
    message: {
      usage: {
        input_tokens: 20,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 1500,
        output_tokens: 1,
      },
    },
  },
  {
    type: "content_block_start",
    index: 0,
    content_block: { type: "thinking", thinking: "", signature: "" },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "thinking_delta", thinking: "Need the weather." },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "signature_delta", signature: "sig" },
  },
  { type: "content_block_stop", index: 0 },
  {
    type: "content_block_start",
    index: 1,
    content_block: {
      type: "tool_use",
      id: "toolu_1",
      name: "weather",
      input: {},
    },
  },
  {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: '{"city":"Paris"}' },
  },
  { type: "content_block_stop", index: 1 },
  {
    type: "message_delta",
    delta: { stop_reason: "tool_use" },
    usage: { output_tokens: 30 },
  },
  { type: "message_stop" },
];

const answerRound = [
  {
    type: "message_start",
    message: {
      usage: {
        input_tokens: 15,
        cache_read_input_tokens: 1500,
        cache_creation_input_tokens: 60,
        output_tokens: 1,
      },
    },
  },
  {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Sunny in Paris." },
  },
  { type: "content_block_stop", index: 0 },
  {
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: 8 },
  },
  { type: "message_stop" },
];

function cacheMarked(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(cacheMarked);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const own = "cache_control" in record ? [record] : [];
  return [...own, ...Object.values(record).flatMap(cacheMarked)];
}

async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("Anthropic streaming tool loop", () => {
  const originalRequestAnimationFrame = global.requestAnimationFrame;
  const originalCancelAnimationFrame = global.cancelAnimationFrame;

  beforeAll(async () => {
    jest.unstable_mockModule("@fortaine/fetch-event-source", () => ({
      EventStreamContentType: "text/event-stream",
      fetchEventSource: fetchEventSourceMock,
    }));

    ({ ClaudeApi } = await import("@/app/client/platforms/anthropic"));
    ({ usePluginStore } = await import("@/app/store/plugin"));

    global.requestAnimationFrame = ((callback: FrameRequestCallback) =>
      setTimeout(
        () => callback(performance.now()),
        0,
      ) as unknown as number) as typeof requestAnimationFrame;
    global.cancelAnimationFrame = ((id: number) =>
      clearTimeout(
        id as unknown as ReturnType<typeof setTimeout>,
      )) as typeof cancelAnimationFrame;
  });

  afterAll(() => {
    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  test("re-places cache breakpoints on every request of a tool loop", async () => {
    fetchEventSourceMock
      .mockImplementationOnce(replyWith(toolRound))
      .mockImplementationOnce(replyWith(answerRound));

    const weather = jest.fn(async (_args: unknown) => ({
      data: "sunny",
      status: 200,
    }));
    const weatherTool = {
      type: "function",
      function: {
        name: "weather",
        description: "Current weather",
        parameters: { type: "object", properties: {} },
      },
    };
    const pluginState = usePluginStore.getState();
    const getPluginState = jest
      .spyOn(usePluginStore, "getState")
      .mockReturnValue({
        ...pluginState,
        getAsTools: () => [[weatherTool], { weather }],
      });

    const onFinish = jest.fn();
    const onError = jest.fn();
    try {
      await new ClaudeApi().chat({
        messages: [
          { role: "system", content: "You are NeatChat." },
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello!" },
          { role: "user", content: "Weather in Paris?" },
        ],
        config: {
          model: "claude-sonnet-5",
          providerName: "Anthropic",
          stream: true,
        },
        onUpdate: jest.fn(),
        onThinkingUpdate: jest.fn(),
        onFinish,
        onError,
      });
      await waitFor(() => onFinish.mock.calls.length > 0);
    } finally {
      getPluginState.mockRestore();
    }

    expect(onError).not.toHaveBeenCalled();
    expect(weather).toHaveBeenCalledWith({ city: "Paris" });
    expect(fetchEventSourceMock).toHaveBeenCalledTimes(2);

    const [first, second] = fetchEventSourceMock.mock.calls.map(([, init]) =>
      JSON.parse(init.body),
    );
    const ephemeral = { type: "ephemeral" };

    // First request: tools, system and the assistant turn before the question.
    expect(first.tools[0].cache_control).toEqual(ephemeral);
    expect(first.system).toEqual([
      { type: "text", text: "You are NeatChat.", cache_control: ephemeral },
    ]);
    expect(first.messages).toHaveLength(3);
    expect(first.messages[1].content).toEqual([
      { type: "text", text: "Hello!", cache_control: ephemeral },
    ]);
    expect(cacheMarked(first)).toHaveLength(3);

    // Follow-up: the history breakpoint moves to the tool_use turn and skips
    // its thinking block.
    expect(second.messages).toHaveLength(5);
    expect(second.messages[3].role).toBe("assistant");
    expect(second.messages[3].content[0]).toEqual({
      type: "thinking",
      thinking: "Need the weather.",
      signature: "sig",
    });
    expect(second.messages[3].content[1]).toMatchObject({
      type: "tool_use",
      id: "toolu_1",
      cache_control: ephemeral,
    });
    expect(second.messages[4].content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "toolu_1",
      content: "sunny",
    });
    expect(second.tools[0].cache_control).toEqual(ephemeral);
    expect(second.system[0].cache_control).toEqual(ephemeral);
    expect(cacheMarked(second.messages)).toHaveLength(1);
    expect(cacheMarked(second)).toHaveLength(3);

    // Usage from both requests, including cache reads and writes.
    expect(onFinish).toHaveBeenCalledWith(
      "Sunny in Paris.",
      expect.objectContaining({ status: 200 }),
      { input: 3095, cachedRead: 1500, cacheWrite: 1560, output: 38 },
    );
  });
});
