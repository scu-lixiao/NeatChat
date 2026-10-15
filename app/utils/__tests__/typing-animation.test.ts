import { jest } from "@jest/globals";

const fetchEventSourceMock = jest.fn();

let stream: any;
let streamWithThink: any;
let getTypingBatchSize: (remaining: number) => number;
let getDrainBatchSize: (remaining: number, framesLeft: number) => number;
let DRAIN_MAX_FRAMES: number;

// Animation frames run only when the test steps them
let frameQueue: Array<{ id: number; callback: FrameRequestCallback }> = [];
let nextFrameId = 1;

function runFrame() {
  const frames = frameQueue;
  frameQueue = [];
  for (const frame of frames) frame.callback(performance.now());
}

describe("per-frame typing of streamed text", () => {
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
    stream = chatModule.stream;
    streamWithThink = chatModule.streamWithThink;
    getTypingBatchSize = chatModule.getTypingBatchSize;
    getDrainBatchSize = chatModule.getDrainBatchSize;
    DRAIN_MAX_FRAMES = chatModule.DRAIN_MAX_FRAMES;

    global.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      frameQueue.push({ id, callback });
      return id;
    }) as typeof requestAnimationFrame;
    global.cancelAnimationFrame = ((id: number) => {
      frameQueue = frameQueue.filter((frame) => frame.id !== id);
    }) as typeof cancelAnimationFrame;
  });

  afterAll(() => {
    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  afterEach(() => {
    fetchEventSourceMock.mockReset();
    frameQueue = [];
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

  // Opens a mocked SSE stream and hands back its callbacks, so the test
  // decides when each message arrives relative to the animation frames
  async function openStream(start: () => void) {
    let sse: any;
    fetchEventSourceMock.mockImplementation(async (_input: any, init: any) => {
      await init.onopen?.(createEventStreamResponse());
      sse = init;
    });
    start();
    // Let the mocked fetchEventSource open the stream
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sse).toBeDefined();
    return {
      send: (message: { t: string; k?: boolean }) =>
        sse.onmessage({ data: JSON.stringify(message) }),
      done: () => {
        sse.onmessage({ data: "[DONE]" });
        sse.onclose();
      },
    };
  }

  function createCallbacks() {
    return {
      onUpdate: jest.fn(),
      onThinkingUpdate: jest.fn(),
      onFinish: jest.fn(),
      onError: jest.fn(),
    };
  }

  function startPlainStream(callbacks: ReturnType<typeof createCallbacks>) {
    return openStream(() =>
      stream(
        "/api/test-typing",
        {},
        {},
        [],
        {},
        new AbortController(),
        (text: string) => JSON.parse(text).t,
        () => {},
        callbacks,
      ),
    );
  }

  function startThinkStream(callbacks: ReturnType<typeof createCallbacks>) {
    return openStream(() =>
      streamWithThink(
        "/api/test-typing-think",
        {},
        {},
        [],
        {},
        new AbortController(),
        (text: string) => {
          const message = JSON.parse(text);
          return { isThinking: !!message.k, content: message.t };
        },
        () => {},
        callbacks,
      ),
    );
  }

  // Length of what each update delivered
  function deltas(mock: jest.Mock) {
    return mock.mock.calls.map((call) => String(call[1]).length);
  }

  describe("batch sizes", () => {
    test("normal typing shows max(1, round(remaining / 60)) per frame", () => {
      expect(getTypingBatchSize(1)).toBe(1);
      expect(getTypingBatchSize(89)).toBe(1);
      expect(getTypingBatchSize(90)).toBe(2);
      expect(getTypingBatchSize(600)).toBe(10);
      // No upper limit
      expect(getTypingBatchSize(12000)).toBe(200);
    });

    test("the drain is never slower than typing and ends on the last frame", () => {
      expect(getDrainBatchSize(3000, DRAIN_MAX_FRAMES)).toBe(
        Math.ceil(3000 / DRAIN_MAX_FRAMES),
      );
      expect(getDrainBatchSize(10, DRAIN_MAX_FRAMES)).toBe(1);
      expect(getDrainBatchSize(500, 1)).toBe(500);
    });
  });

  test("stream reveals max(1, round(remaining / 60)) characters per frame", async () => {
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks);

    const text = "a".repeat(600);
    sse.send({ t: text });

    let shown = 0;
    for (let frame = 0; frame < 40; frame += 1) {
      const remaining = text.length - shown;
      runFrame();
      const delta = deltas(callbacks.onUpdate).at(-1)!;
      expect(delta).toBe(Math.max(1, Math.round(remaining / 60)));
      expect(delta).toBeLessThanOrEqual(Math.ceil(remaining / 60));
      shown += delta;
    }
    expect(callbacks.onUpdate.mock.calls.at(-1)?.[0]).toBe("a".repeat(shown));
  });

  test("a small backlog types out one character per frame", async () => {
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks);

    sse.send({ t: "Hello, world" });
    for (let frame = 0; frame < 12; frame += 1) runFrame();

    expect(deltas(callbacks.onUpdate)).toEqual(new Array(12).fill(1));
    expect(callbacks.onUpdate.mock.calls.at(-1)?.[0]).toBe("Hello, world");
  });

  test("a large burst is not capped per frame", async () => {
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks);

    sse.send({ t: "b".repeat(12000) });
    runFrame();

    expect(deltas(callbacks.onUpdate)).toEqual([200]);
  });

  test("updates on every frame, with no time-based throttle", async () => {
    const nowSpy = jest.spyOn(performance, "now").mockReturnValue(1000);
    try {
      const callbacks = createCallbacks();
      const sse = await startPlainStream(callbacks);

      sse.send({ t: "c".repeat(300) });
      // All frames share one timestamp: a minimum gap would skip them
      for (let frame = 0; frame < 10; frame += 1) runFrame();

      expect(callbacks.onUpdate).toHaveBeenCalledTimes(10);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test("streamWithThink types answer and thinking at the same rate", async () => {
    const callbacks = createCallbacks();
    const sse = await startThinkStream(callbacks);

    sse.send({ t: "t".repeat(1200), k: true });
    sse.send({ t: "a".repeat(300) });
    runFrame();

    expect(deltas(callbacks.onThinkingUpdate)).toEqual([20]);
    expect(deltas(callbacks.onUpdate)).toEqual([5]);
  });

  test("the end drain finishes within DRAIN_MAX_FRAMES and calls onFinish once", async () => {
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks);

    const text = "d".repeat(5000);
    sse.send({ t: text });
    runFrame();
    sse.done();
    expect(callbacks.onFinish).not.toHaveBeenCalled();

    let frames = 0;
    while (callbacks.onFinish.mock.calls.length === 0 && frames < 100) {
      runFrame();
      frames += 1;
    }

    expect(frames).toBeLessThanOrEqual(DRAIN_MAX_FRAMES);
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onFinish).toHaveBeenCalledWith(
      text,
      expect.objectContaining({ status: 200 }),
    );
    expect(callbacks.onUpdate.mock.calls.at(-1)?.[0]).toBe(text);
    // Spread over the frames, not dumped at the end
    expect(Math.max(...deltas(callbacks.onUpdate))).toBeLessThanOrEqual(
      Math.ceil(text.length / DRAIN_MAX_FRAMES),
    );

    // Nothing more happens afterwards
    for (let i = 0; i < 5; i += 1) runFrame();
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  test("streamWithThink drains both tails within DRAIN_MAX_FRAMES", async () => {
    const callbacks = createCallbacks();
    const sse = await startThinkStream(callbacks);

    const thinking = "t".repeat(4000);
    const answer = "a".repeat(700);
    sse.send({ t: thinking, k: true });
    sse.send({ t: answer });
    sse.done();

    let frames = 0;
    while (callbacks.onFinish.mock.calls.length === 0 && frames < 100) {
      runFrame();
      frames += 1;
    }

    expect(frames).toBeLessThanOrEqual(DRAIN_MAX_FRAMES);
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onFinish).toHaveBeenCalledWith(answer, expect.anything());
    expect(callbacks.onThinkingUpdate.mock.calls.at(-1)?.[0]).toBe(thinking);
    expect(callbacks.onUpdate.mock.calls.at(-1)?.[0]).toBe(answer);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  test("a short tail is typed out too, not dumped", async () => {
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks);

    sse.send({ t: "short" });
    sse.done();
    expect(callbacks.onFinish).not.toHaveBeenCalled();

    for (let frame = 0; frame < 5; frame += 1) runFrame();

    expect(deltas(callbacks.onUpdate)).toEqual([1, 1, 1, 1, 1]);
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onFinish).toHaveBeenCalledWith("short", expect.anything());
  });

  test("a stream whose text is all shown finishes right away", async () => {
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks);

    sse.send({ t: "hi" });
    runFrame();
    runFrame();
    sse.done();

    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onFinish).toHaveBeenCalledWith("hi", expect.anything());
  });

  test("a hidden page finishes at once, without animation frames", async () => {
    const hidden = jest.spyOn(document, "hidden", "get").mockReturnValue(true);
    try {
      const callbacks = createCallbacks();
      const sse = await startPlainStream(callbacks);

      const text = "h".repeat(3000);
      sse.send({ t: text });
      sse.done();

      expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
      expect(callbacks.onFinish).toHaveBeenCalledWith(text, expect.anything());
      expect(callbacks.onUpdate.mock.calls.at(-1)?.[0]).toBe(text);
    } finally {
      hidden.mockRestore();
    }
  });
});
