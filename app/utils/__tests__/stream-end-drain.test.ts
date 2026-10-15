import { jest } from "@jest/globals";

const fetchEventSourceMock = jest.fn();

let stream: any;
let streamWithThink: any;
let DRAIN_MAX_FRAMES: number;

describe("smooth drain of the buffered tail when a stream ends", () => {
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
    DRAIN_MAX_FRAMES = chatModule.DRAIN_MAX_FRAMES;

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

  async function waitUntil(predicate: () => boolean, timeoutMs = 5000) {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error("timed out waiting for stream callbacks");
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Each SSE message is {"t": text, "k": true when it is thinking content}
  function mockStream(
    messages: Array<{ t: string; k?: boolean }>,
    afterDone?: () => void,
  ) {
    fetchEventSourceMock.mockImplementation(async (_input: any, init: any) => {
      await init.onopen?.(createEventStreamResponse());
      for (const message of messages) {
        init.onmessage?.({ data: JSON.stringify(message) });
      }
      init.onmessage?.({ data: "[DONE]" });
      afterDone?.();
      init.onclose?.();
    });
  }

  const parseThinkSSE = (text: string) => {
    const message = JSON.parse(text);
    return { isThinking: !!message.k, content: message.t };
  };

  function createCallbacks() {
    const onUpdate = jest.fn();
    const onThinkingUpdate = jest.fn();
    const onError = jest.fn();
    // What had been rendered when onFinish was called
    const atFinish: { text?: unknown; thinking?: unknown } = {};
    const onFinish = jest.fn(() => {
      atFinish.text = onUpdate.mock.calls.at(-1)?.[0];
      atFinish.thinking = onThinkingUpdate.mock.calls.at(-1)?.[0];
    });
    return { onUpdate, onThinkingUpdate, onFinish, onError, atFinish };
  }

  // Length of the largest chunk a single update delivered
  function maxDelta(mock: jest.Mock) {
    return Math.max(...mock.mock.calls.map((call) => String(call[1]).length));
  }

  test("streamWithThink drains a large tail over several updates, then finishes once", async () => {
    const fullText = "x".repeat(3000);
    mockStream([{ t: fullText }]);
    const callbacks = createCallbacks();

    streamWithThink(
      "/api/test-drain",
      {},
      {},
      [],
      {},
      new AbortController(),
      parseThinkSSE,
      () => {},
      callbacks,
    );

    await waitUntil(() => callbacks.onFinish.mock.calls.length > 0);
    await sleep(30);

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onFinish).toHaveBeenCalledWith(
      fullText,
      expect.objectContaining({ status: 200 }),
    );
    // Everything was rendered before onFinish
    expect(callbacks.atFinish.text).toBe(fullText);
    // ...evenly over at most DRAIN_MAX_FRAMES frames, not in one dump
    expect(callbacks.onUpdate.mock.calls.length).toBeGreaterThan(5);
    expect(callbacks.onUpdate.mock.calls.length).toBeLessThanOrEqual(
      DRAIN_MAX_FRAMES,
    );
    expect(maxDelta(callbacks.onUpdate)).toBe(
      Math.ceil(fullText.length / DRAIN_MAX_FRAMES),
    );
  });

  test("streamWithThink drains thinking and response tails together", async () => {
    const thinking = "t".repeat(2000);
    const answer = "a".repeat(1500);
    mockStream([{ t: thinking, k: true }, { t: answer }]);
    const callbacks = createCallbacks();

    streamWithThink(
      "/api/test-drain-thinking",
      {},
      {},
      [],
      {},
      new AbortController(),
      parseThinkSSE,
      () => {},
      callbacks,
    );

    await waitUntil(() => callbacks.onFinish.mock.calls.length > 0);
    await sleep(30);

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onFinish).toHaveBeenCalledWith(answer, expect.anything());
    expect(callbacks.atFinish.text).toBe(answer);
    expect(callbacks.atFinish.thinking).toBe(thinking);
    expect(callbacks.onThinkingUpdate.mock.calls.length).toBeGreaterThan(5);
    // Both tails finish together, within DRAIN_MAX_FRAMES frames
    expect(callbacks.onThinkingUpdate.mock.calls.length).toBeLessThanOrEqual(
      DRAIN_MAX_FRAMES,
    );
    expect(callbacks.onUpdate.mock.calls.length).toBeLessThanOrEqual(
      DRAIN_MAX_FRAMES,
    );
    expect(maxDelta(callbacks.onThinkingUpdate)).toBe(
      Math.ceil(thinking.length / DRAIN_MAX_FRAMES),
    );
    expect(maxDelta(callbacks.onUpdate)).toBe(
      Math.ceil(answer.length / DRAIN_MAX_FRAMES),
    );
  });

  test("stream drains a large tail over several updates, then finishes once", async () => {
    const fullText = "y".repeat(2500);
    mockStream([{ t: fullText }]);
    const callbacks = createCallbacks();

    stream(
      "/api/test-drain-plain",
      {},
      {},
      [],
      {},
      new AbortController(),
      (text: string) => JSON.parse(text).t,
      () => {},
      callbacks,
    );

    await waitUntil(() => callbacks.onFinish.mock.calls.length > 0);
    await sleep(30);

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onFinish).toHaveBeenCalledWith(
      fullText,
      expect.objectContaining({ status: 200 }),
    );
    expect(callbacks.atFinish.text).toBe(fullText);
    expect(callbacks.onUpdate.mock.calls.length).toBeGreaterThan(5);
    expect(callbacks.onUpdate.mock.calls.length).toBeLessThanOrEqual(
      DRAIN_MAX_FRAMES,
    );
    expect(maxDelta(callbacks.onUpdate)).toBe(
      Math.ceil(fullText.length / DRAIN_MAX_FRAMES),
    );
  });

  test("a stream whose text is all shown finishes immediately", async () => {
    const fullText = "z".repeat(20);
    let finishedSynchronously = false;
    const callbacks = createCallbacks();
    fetchEventSourceMock.mockImplementation(async (_input: any, init: any) => {
      await init.onopen?.(createEventStreamResponse());
      init.onmessage?.({ data: JSON.stringify({ t: fullText }) });
      await waitUntil(
        () => callbacks.onUpdate.mock.calls.at(-1)?.[0] === fullText,
      );
      init.onmessage?.({ data: "[DONE]" });
      finishedSynchronously = callbacks.onFinish.mock.calls.length === 1;
      init.onclose?.();
    });

    streamWithThink(
      "/api/test-small-tail",
      {},
      {},
      [],
      {},
      new AbortController(),
      parseThinkSSE,
      () => {},
      callbacks,
    );

    await waitUntil(() => callbacks.onFinish.mock.calls.length > 0);
    await sleep(30);

    expect(finishedSynchronously).toBe(true);
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.atFinish.text).toBe(fullText);
  });

  test("aborting while draining delivers the rest at once and finishes once", async () => {
    const fullText = "w".repeat(3000);
    const controller = new AbortController();
    const callbacks = createCallbacks();
    let drainingBeforeAbort = false;
    let finishedOnAbort = false;
    mockStream([{ t: fullText }], () => {
      // [DONE] has been handled; the tail is now draining
      drainingBeforeAbort = callbacks.onFinish.mock.calls.length === 0;
      controller.abort();
      finishedOnAbort = callbacks.onFinish.mock.calls.length === 1;
    });

    streamWithThink(
      "/api/test-drain-abort",
      {},
      {},
      [],
      {},
      controller,
      parseThinkSSE,
      () => {},
      callbacks,
    );

    await waitUntil(() => callbacks.onFinish.mock.calls.length > 0);
    await sleep(30);

    expect(drainingBeforeAbort).toBe(true);
    expect(finishedOnAbort).toBe(true);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onFinish).toHaveBeenCalledWith(
      fullText,
      expect.anything(),
    );
    expect(callbacks.atFinish.text).toBe(fullText);
  });
});
