import { jest } from "@jest/globals";

const fetchEventSourceMock = jest.fn();

type ChatModule = typeof import("@/app/utils/chat");

let stream: any;
let streamWithThink: any;
let getTypingBatchSize: ChatModule["getTypingBatchSize"];
let getMinTypingChars: ChatModule["getMinTypingChars"];
let getMaxTypingChars: ChatModule["getMaxTypingChars"];
let END_DRAIN_MS: number;
let TYPING_DRAIN_MS: number;

const FRAME_60HZ = 1000 / 60;
const FRAME_120HZ = 1000 / 120;

// The rule this one replaced: 1/60 of the buffer per frame, whatever the
// frame rate
const oldBatchSize = (remaining: number) =>
  Math.max(1, Math.round(remaining / 60));

// Same rounding as the implementation, so float noise doesn't fail a bound
const ceilChars = (chars: number) => Math.ceil(chars - 1e-9);

// Animation frames run only when the test steps them, on a simulated clock
let frameQueue: Array<{ id: number; callback: FrameRequestCallback }> = [];
let nextFrameId = 1;
let frameClock = 0;

function runFrame(frameMs = FRAME_60HZ) {
  frameClock += frameMs;
  const frames = frameQueue;
  frameQueue = [];
  for (const frame of frames) frame.callback(frameClock);
}

// Characters shown per frame by `batch`, until the buffer is empty
function simulate(
  remaining: number,
  batch: (remaining: number, frame: number) => number,
) {
  const shown: number[] = [];
  while (remaining > 0 && shown.length < 10000) {
    const n = batch(remaining, shown.length);
    shown.push(n);
    remaining -= n;
  }
  return shown;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("time-based typing of streamed text", () => {
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
    getMinTypingChars = chatModule.getMinTypingChars;
    getMaxTypingChars = chatModule.getMaxTypingChars;
    END_DRAIN_MS = chatModule.END_DRAIN_MS;
    TYPING_DRAIN_MS = chatModule.TYPING_DRAIN_MS;

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

  function startPlainStream(
    callbacks: ReturnType<typeof createCallbacks>,
    controller = new AbortController(),
  ) {
    return openStream(() =>
      stream(
        "/api/test-typing",
        {},
        {},
        [],
        {},
        controller,
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

  // Steps frames until onFinish; returns how many it took
  function runUntilFinished(
    callbacks: ReturnType<typeof createCallbacks>,
    frameMs = FRAME_60HZ,
  ) {
    let frames = 0;
    while (callbacks.onFinish.mock.calls.length === 0 && frames < 1000) {
      runFrame(frameMs);
      frames += 1;
    }
    return frames;
  }

  describe("batch sizes", () => {
    test("streaming shows the share that empties the buffer in TYPING_DRAIN_MS", () => {
      expect(TYPING_DRAIN_MS).toBe(300);
      // 600 * 16.7 / 300 = 33.3
      expect(getTypingBatchSize(600, FRAME_60HZ)).toBe(34);
      // Half as much per frame at 120Hz: the same speed per second
      expect(getTypingBatchSize(600, FRAME_120HZ)).toBe(17);
      expect(getTypingBatchSize(12000, FRAME_60HZ)).toBe(667);
      expect(getTypingBatchSize(12, FRAME_60HZ)).toBe(1);
      expect(getTypingBatchSize(1, FRAME_60HZ)).toBe(1);
      expect(getTypingBatchSize(0, FRAME_60HZ)).toBe(0);
    });

    test("a frame shows at least 1-8 characters, growing gently with the buffer", () => {
      expect(getMinTypingChars(1)).toBe(1);
      expect(getMinTypingChars(63)).toBe(1);
      expect(getMinTypingChars(64)).toBe(2);
      expect(getMinTypingChars(144)).toBe(3);
      expect(getMinTypingChars(400)).toBe(5);
      expect(getMinTypingChars(1024)).toBe(8);
      expect(getMinTypingChars(1_000_000)).toBe(8);
      // Matters on fast displays, where the time share is small: 144 at 240Hz
      expect(getTypingBatchSize(144, 1000 / 240)).toBe(3);
    });

    test("a frame shows at most max(24, remaining / 8) while streaming", () => {
      expect(getMaxTypingChars(10)).toBe(24);
      expect(getMaxTypingChars(600)).toBe(75);
      expect(getMaxTypingChars(8000)).toBe(1000);
      // A 50ms frame would take 100 of 600
      expect(getTypingBatchSize(600, 50)).toBe(75);
      // A 2s frame (the page coming back) counts as one 50ms frame
      expect(getTypingBatchSize(600, 2000)).toBe(75);
      expect(getTypingBatchSize(100, 50)).toBe(17);
    });

    test("no frame exceeds the cap or the buffer, at any frame length", () => {
      for (const remaining of [1, 5, 23, 63, 64, 200, 600, 5000, 50000]) {
        for (const frameMs of [0, 1, FRAME_120HZ, FRAME_60HZ, 33, 50, 500]) {
          const n = getTypingBatchSize(remaining, frameMs);
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(remaining);
          expect(n).toBeLessThanOrEqual(getMaxTypingChars(remaining));
        }
      }
    });

    test("the drain spreads the rest evenly over the time left", () => {
      expect(END_DRAIN_MS).toBe(250);
      // 600 * 16.7 / 250 = 40
      expect(getTypingBatchSize(600, FRAME_60HZ, 250)).toBe(40);
      expect(getTypingBatchSize(600, FRAME_60HZ, 125)).toBe(80);
      expect(getTypingBatchSize(5, FRAME_60HZ, 250)).toBe(1);
      // Everything on the frame where the time runs out
      expect(getTypingBatchSize(500, FRAME_60HZ, FRAME_60HZ)).toBe(500);
      expect(getTypingBatchSize(500, FRAME_60HZ, -5)).toBe(500);
    });

    test("the drain is never slower than streaming", () => {
      for (const remaining of [1, 10, 63, 64, 200, 600, 5000]) {
        for (const frameMs of [FRAME_120HZ, FRAME_60HZ, 33, 50]) {
          expect(
            getTypingBatchSize(remaining, frameMs, END_DRAIN_MS),
          ).toBeGreaterThanOrEqual(getTypingBatchSize(remaining, frameMs));
        }
      }
    });
  });

  describe("speed", () => {
    test("a 600-character buffer types out at least twice as fast as before", () => {
      const before = simulate(600, oldBatchSize);
      const after = simulate(600, (r) => getTypingBatchSize(r, FRAME_60HZ));

      // In the first 300ms (18 frames at 60Hz)
      const shownBefore = sum(before.slice(0, 18));
      const shownAfter = sum(after.slice(0, 18));
      expect(shownBefore).toBe(158);
      expect(shownAfter).toBe(390);
      expect(shownAfter).toBeGreaterThanOrEqual(2 * shownBefore);

      // ...and to show all of it
      expect(after.length * 2).toBeLessThanOrEqual(before.length);
    });

    test("60Hz and 120Hz type at the same speed", () => {
      const at60 = simulate(600, (r) => getTypingBatchSize(r, FRAME_60HZ));
      const at120 = simulate(600, (r) => getTypingBatchSize(r, FRAME_120HZ));

      // Characters shown in the first 300ms
      const shown60 = sum(at60.slice(0, 18));
      const shown120 = sum(at120.slice(0, 36));
      expect(Math.abs(shown120 - shown60) / shown60).toBeLessThan(0.05);
    });

    test("speed changes gradually: no frame shows much more than the one before", () => {
      const shown = simulate(600, (r) => getTypingBatchSize(r, FRAME_60HZ));
      for (let i = 1; i < shown.length; i += 1) {
        expect(shown[i]).toBeLessThanOrEqual(shown[i - 1]);
      }
    });

    test("the drain of any tail is done within END_DRAIN_MS, at 60Hz and 120Hz", () => {
      for (const frameMs of [FRAME_60HZ, FRAME_120HZ]) {
        for (const tail of [1, 5, 20, 600, 5000, 40000]) {
          let timeLeft = END_DRAIN_MS;
          const shown = simulate(tail, (r) => {
            const n = getTypingBatchSize(r, frameMs, timeLeft);
            timeLeft -= frameMs;
            return n;
          });

          expect(sum(shown)).toBe(tail);
          expect(shown.length * frameMs).toBeLessThanOrEqual(
            END_DRAIN_MS + 1e-6,
          );
          // Evenly: no frame more than its share of the whole drain
          expect(Math.max(...shown)).toBeLessThanOrEqual(
            Math.max(
              getMinTypingChars(tail),
              ceilChars((tail * frameMs) / END_DRAIN_MS),
            ),
          );
        }
      }
    });
  });

  test("stream shows each frame's batch, twice as fast as the old rule", async () => {
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks);

    const text = "a".repeat(600);
    sse.send({ t: text });

    let shown = 0;
    let shownBefore = 0;
    for (let frame = 0; frame < 18; frame += 1) {
      const remaining = text.length - shown;
      runFrame();
      const delta = deltas(callbacks.onUpdate).at(-1)!;
      expect(delta).toBe(getTypingBatchSize(remaining, FRAME_60HZ));
      expect(delta).toBeLessThanOrEqual(getMaxTypingChars(remaining));
      shown += delta;
      shownBefore += oldBatchSize(text.length - shownBefore);
    }
    expect(callbacks.onUpdate.mock.calls.at(-1)?.[0]).toBe("a".repeat(shown));
    expect(shown).toBeGreaterThanOrEqual(2 * shownBefore);
  });

  test("frame deltas come from the frame timestamps", async () => {
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks);

    sse.send({ t: "a".repeat(1200) });
    // The first frame has nothing to measure from and counts as 60Hz
    runFrame(FRAME_120HZ);
    runFrame(FRAME_120HZ);
    runFrame(40);

    const [first, second, third] = deltas(callbacks.onUpdate);
    expect(first).toBe(getTypingBatchSize(1200, FRAME_60HZ));
    expect(second).toBe(getTypingBatchSize(1200 - first, FRAME_120HZ));
    expect(third).toBe(getTypingBatchSize(1200 - first - second, 40));
  });

  test("a small backlog types out one character per frame", async () => {
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks);

    sse.send({ t: "Hello, world" });
    for (let frame = 0; frame < 12; frame += 1) runFrame();

    expect(deltas(callbacks.onUpdate)).toEqual(new Array(12).fill(1));
    expect(callbacks.onUpdate.mock.calls.at(-1)?.[0]).toBe("Hello, world");
  });

  test("a long frame shows no more than the cap", async () => {
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks);

    sse.send({ t: "b".repeat(4000) });
    runFrame();
    const afterFirst = 4000 - deltas(callbacks.onUpdate)[0];
    // A 400ms stall, e.g. a slow render
    runFrame(400);

    expect(deltas(callbacks.onUpdate)[1]).toBe(getMaxTypingChars(afterFirst));
  });

  test("updates on every frame, with no minimum gap between frames", async () => {
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks);

    sse.send({ t: "c".repeat(300) });
    // All frames share one timestamp: a minimum gap would skip them
    for (let frame = 0; frame < 10; frame += 1) runFrame(0);

    expect(callbacks.onUpdate).toHaveBeenCalledTimes(10);
  });

  test("streamWithThink types answer and thinking by the same rule", async () => {
    const callbacks = createCallbacks();
    const sse = await startThinkStream(callbacks);

    sse.send({ t: "t".repeat(1200), k: true });
    sse.send({ t: "a".repeat(300) });
    runFrame();

    expect(deltas(callbacks.onThinkingUpdate)).toEqual([
      getTypingBatchSize(1200, FRAME_60HZ),
    ]);
    expect(deltas(callbacks.onUpdate)).toEqual([
      getTypingBatchSize(300, FRAME_60HZ),
    ]);
  });

  test("the end drain finishes within END_DRAIN_MS and calls onFinish once", async () => {
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks);

    const text = "d".repeat(5000);
    sse.send({ t: text });
    runFrame();
    const tail = text.length - deltas(callbacks.onUpdate)[0];
    sse.done();
    expect(callbacks.onFinish).not.toHaveBeenCalled();

    const updatesBefore = callbacks.onUpdate.mock.calls.length;
    const frames = runUntilFinished(callbacks);

    expect(frames * FRAME_60HZ).toBeLessThanOrEqual(END_DRAIN_MS + 1e-6);
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onFinish).toHaveBeenCalledWith(
      text,
      expect.objectContaining({ status: 200 }),
    );
    expect(callbacks.onUpdate.mock.calls.at(-1)?.[0]).toBe(text);
    // Spread over the frames, not dumped at the end
    const drained = deltas(callbacks.onUpdate).slice(updatesBefore);
    expect(drained.length).toBeGreaterThan(10);
    expect(Math.max(...drained)).toBeLessThanOrEqual(
      ceilChars((tail * FRAME_60HZ) / END_DRAIN_MS),
    );
    expect(Math.max(...drained)).toBeLessThanOrEqual(getMaxTypingChars(tail));

    // Nothing more happens afterwards
    for (let i = 0; i < 5; i += 1) runFrame();
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  test("the end drain takes the same time at 120Hz", async () => {
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks);

    sse.send({ t: "e".repeat(3000) });
    sse.done();
    const frames = runUntilFinished(callbacks, FRAME_120HZ);

    expect(frames * FRAME_120HZ).toBeLessThanOrEqual(END_DRAIN_MS + 1e-6);
    expect(frames * FRAME_120HZ).toBeGreaterThan(
      END_DRAIN_MS - 2 * FRAME_120HZ,
    );
    expect(callbacks.onFinish).toHaveBeenCalledWith(
      "e".repeat(3000),
      expect.anything(),
    );
  });

  test("streamWithThink drains both tails within END_DRAIN_MS", async () => {
    const callbacks = createCallbacks();
    const sse = await startThinkStream(callbacks);

    const thinking = "t".repeat(4000);
    const answer = "a".repeat(700);
    sse.send({ t: thinking, k: true });
    sse.send({ t: answer });
    sse.done();

    const frames = runUntilFinished(callbacks);

    expect(frames * FRAME_60HZ).toBeLessThanOrEqual(END_DRAIN_MS + 1e-6);
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onFinish).toHaveBeenCalledWith(answer, expect.anything());
    expect(callbacks.onThinkingUpdate.mock.calls.at(-1)?.[0]).toBe(thinking);
    expect(callbacks.onUpdate.mock.calls.at(-1)?.[0]).toBe(answer);
    // Both tails end on the same frame
    expect(callbacks.onThinkingUpdate).toHaveBeenCalledTimes(frames);
    expect(callbacks.onUpdate).toHaveBeenCalledTimes(frames);
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

  test("aborting while draining delivers the rest at once and finishes once", async () => {
    const controller = new AbortController();
    const callbacks = createCallbacks();
    const sse = await startPlainStream(callbacks, controller);

    const text = "f".repeat(3000);
    sse.send({ t: text });
    sse.done();
    runFrame();
    runFrame();
    expect(callbacks.onFinish).not.toHaveBeenCalled();

    controller.abort();

    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onFinish).toHaveBeenCalledWith(text, expect.anything());
    expect(callbacks.onUpdate.mock.calls.at(-1)?.[0]).toBe(text);
    for (let i = 0; i < 5; i += 1) runFrame();
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
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

  test.each([
    ["stream", startPlainStream],
    ["streamWithThink", startThinkStream],
  ])(
    "%s: a page hidden while draining finishes at once",
    async (_name, start) => {
      const callbacks = createCallbacks();
      const sse = await start(callbacks);

      const text = "v".repeat(3000);
      sse.send({ t: text });
      sse.done();
      runFrame();
      expect(callbacks.onFinish).not.toHaveBeenCalled();

      const hidden = jest
        .spyOn(document, "hidden", "get")
        .mockReturnValue(true);
      try {
        document.dispatchEvent(new Event("visibilitychange"));

        expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
        expect(callbacks.onFinish).toHaveBeenCalledWith(
          text,
          expect.anything(),
        );
        expect(callbacks.onUpdate.mock.calls.at(-1)?.[0]).toBe(text);

        // Neither another visibility change nor a late frame finishes again
        document.dispatchEvent(new Event("visibilitychange"));
        runFrame();
        expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
        expect(callbacks.onError).not.toHaveBeenCalled();
      } finally {
        hidden.mockRestore();
      }
    },
  );
});
