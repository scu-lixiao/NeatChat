import { jest } from "@jest/globals";

const fetchEventSourceMock = jest.fn();

let streamWithThink: any;
let detectOpenAICompatibleStreamTermination: any;
let detectResponsesStreamTermination: any;

describe("stream termination handling", () => {
  const originalRequestAnimationFrame = global.requestAnimationFrame;
  const originalCancelAnimationFrame = global.cancelAnimationFrame;

  beforeAll(async () => {
    jest.unstable_mockModule("@fortaine/fetch-event-source", () => ({
      EventStreamContentType: "text/event-stream",
      fetchEventSource: fetchEventSourceMock,
    }));
    jest.unstable_mockModule("@/app/locales", () => ({
      default: {
        Error: {
          Unauthorized: "Unauthorized",
        },
      },
    }));

    const chatModule = await import("@/app/utils/chat");
    streamWithThink = chatModule.streamWithThink;
    detectOpenAICompatibleStreamTermination =
      chatModule.detectOpenAICompatibleStreamTermination;
    detectResponsesStreamTermination =
      chatModule.detectResponsesStreamTermination;

    global.requestAnimationFrame = ((callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0) as unknown as number) as typeof requestAnimationFrame;
    global.cancelAnimationFrame = ((id: number) =>
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>)) as typeof cancelAnimationFrame;
  });

  afterAll(() => {
    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  afterEach(() => {
    fetchEventSourceMock.mockReset();
  });

  function createEventStreamResponse() {
    const responseLike = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      clone() {
        return responseLike;
      },
      text: async () => "",
      json: async () => ({}),
    };

    return responseLike as any;
  }

  function waitForStreamCallbacks() {
    return new Promise((resolve) => setTimeout(resolve, 10));
  }

  test("reports an error when the stream closes before protocol completion", async () => {
    const onUpdate = jest.fn();
    const onFinish = jest.fn();
    const onError = jest.fn();

    fetchEventSourceMock.mockImplementation(async (_input: any, init: any) => {
      await init.onopen?.(createEventStreamResponse());
      init.onmessage?.({
        data: JSON.stringify({
          choices: [{ delta: { content: "hel" } }],
        }),
      });
      init.onclose?.();
    });

    streamWithThink(
      "/api/test-stream",
      {},
      {},
      [],
      {},
      new AbortController(),
      (text: string) => {
        const json = JSON.parse(text);
        return {
          isThinking: false,
          content: json.choices?.[0]?.delta?.content || "",
        };
      },
      () => {},
      {
        onUpdate,
        onThinkingUpdate: jest.fn(),
        onFinish,
        onError,
      },
      detectOpenAICompatibleStreamTermination,
    );

    await waitForStreamCallbacks();

    expect(onUpdate).toHaveBeenCalledWith("hel", "hel");
    expect(onFinish).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "stream closed before completion" }),
    );
  });

  test("treats response.completed as a successful protocol terminator", async () => {
    const onUpdate = jest.fn();
    const onFinish = jest.fn();
    const onError = jest.fn();

    fetchEventSourceMock.mockImplementation(async (_input: any, init: any) => {
      await init.onopen?.(createEventStreamResponse());
      init.onmessage?.({
        data: JSON.stringify({
          type: "response.output_text.delta",
          delta: "done",
        }),
      });
      init.onmessage?.({
        data: JSON.stringify({
          type: "response.completed",
          response: {
            id: "resp_123",
            output: [],
          },
        }),
      });
      init.onclose?.();
    });

    streamWithThink(
      "/api/test-responses-stream",
      {},
      {},
      [],
      {},
      new AbortController(),
      (text: string) => {
        const event = JSON.parse(text);
        if (event.type === "response.output_text.delta") {
          return {
            isThinking: false,
            content: event.delta || "",
          };
        }

        return {
          isThinking: false,
          content: "",
        };
      },
      () => {},
      {
        onUpdate,
        onThinkingUpdate: jest.fn(),
        onFinish,
        onError,
      },
      detectResponsesStreamTermination,
    );

    await waitForStreamCallbacks();

    expect(onError).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledWith(
      "done",
      expect.objectContaining({ status: 200 }),
    );
  });
});