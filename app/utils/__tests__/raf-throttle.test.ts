import { jest } from "@jest/globals";
import { createFrameThrottle } from "@/app/utils/raf-throttle";

// Jest's fake requestAnimationFrame fires every 16ms
const FRAME_MS = 16;

describe("createFrameThrottle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("coalesces calls within a frame into one run with the latest args", () => {
    const fn = jest.fn();
    const throttled = createFrameThrottle(fn);

    throttled("a");
    throttled("b");
    throttled("c");
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(FRAME_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("c");

    // Nothing pending: no further runs
    jest.advanceTimersByTime(FRAME_MS * 5);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("runs at most once per frame under continuous calls", () => {
    const fn = jest.fn();
    const throttled = createFrameThrottle(fn);

    for (let t = 0; t < FRAME_MS * 4; t += 2) {
      throttled(t);
      jest.advanceTimersByTime(2);
    }

    expect(fn).toHaveBeenCalledTimes(4);
  });

  test("waits at least minIntervalMs between runs, then delivers the latest call", () => {
    const fn = jest.fn();
    const throttled = createFrameThrottle(fn, { minIntervalMs: 50 });

    throttled(1);
    jest.advanceTimersByTime(FRAME_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(1);

    throttled(2);
    throttled(3);
    // Later frames that come too soon after the first run are skipped
    jest.advanceTimersByTime(49);
    expect(fn).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(FRAME_MS);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(3);
  });

  test("flush runs the pending call synchronously with the latest args", () => {
    const fn = jest.fn();
    const throttled = createFrameThrottle(fn, { minIntervalMs: 1000 });

    throttled("first");
    throttled("latest");
    throttled.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("latest");

    // The frame it was waiting for no longer runs anything
    jest.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(1);

    // Nothing pending: flush is a no-op
    throttled.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("flush delivers a trailing call held back by minIntervalMs", () => {
    const fn = jest.fn();
    const throttled = createFrameThrottle(fn, { minIntervalMs: 1000 });

    throttled("streamed");
    jest.advanceTimersByTime(FRAME_MS);
    expect(fn).toHaveBeenCalledTimes(1);

    throttled("tail");
    jest.advanceTimersByTime(FRAME_MS * 3);
    expect(fn).toHaveBeenCalledTimes(1);

    throttled.flush();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("tail");
  });

  test("cancel drops the pending call", () => {
    const fn = jest.fn();
    const throttled = createFrameThrottle(fn);

    throttled("dropped");
    throttled.cancel();
    jest.advanceTimersByTime(FRAME_MS * 4);
    expect(fn).not.toHaveBeenCalled();

    throttled.flush();
    expect(fn).not.toHaveBeenCalled();

    // Still usable afterwards
    throttled("kept");
    jest.advanceTimersByTime(FRAME_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("kept");
  });

  test("falls back to setTimeout when requestAnimationFrame is missing", () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    (window as any).requestAnimationFrame = undefined;

    try {
      const fn = jest.fn();
      const throttled = createFrameThrottle(fn, { minIntervalMs: 40 });

      throttled("a");
      throttled("b");
      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(16);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenLastCalledWith("b");

      throttled("c");
      jest.advanceTimersByTime(16);
      expect(fn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(32);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith("c");

      throttled("d");
      throttled.cancel();
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });
});
