import { jest } from "@jest/globals";
import { useLayoutEffect, type ReactElement } from "react";
import { act, render } from "@testing-library/react";
import {
  ADAPTIVE_THROTTLE_MAX_MS,
  ADAPTIVE_THROTTLE_MIN_MS,
  getAdaptiveInterval,
  useAdaptiveThrottledValue,
} from "@/app/hooks/useAdaptiveThrottledValue";

const FRAME_MS = 16;

describe("getAdaptiveInterval", () => {
  test("is three times the last cost, within bounds", () => {
    expect(getAdaptiveInterval(0)).toBe(ADAPTIVE_THROTTLE_MIN_MS);
    expect(getAdaptiveInterval(10)).toBe(ADAPTIVE_THROTTLE_MIN_MS);
    expect(getAdaptiveInterval(30)).toBe(90);
    expect(getAdaptiveInterval(50)).toBe(150);
    expect(getAdaptiveInterval(100)).toBe(ADAPTIVE_THROTTLE_MAX_MS);
  });
});

describe("useAdaptiveThrottledValue", () => {
  // Render cost is simulated: performance.now() reads this clock, which the
  // expensive child advances by renderCostMs each time it renders
  let clock = 0;
  let renderCostMs = 0;
  // Date.now() of each change of the shown value
  let shownAt: number[] = [];

  function Expensive({ text }: { text: string }) {
    clock += renderCostMs;
    return <span>{text}</span>;
  }

  function Harness({ value, enabled }: { value: string; enabled: boolean }) {
    const shown = useAdaptiveThrottledValue(value, enabled);
    useLayoutEffect(() => {
      shownAt.push(Date.now());
    }, [shown]);
    return <Expensive text={shown} />;
  }

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["performance"] });
    jest.spyOn(performance, "now").mockImplementation(() => clock);
    clock = 0;
    renderCostMs = 0;
    shownAt = [];
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // Streams one more character per frame; returns the latest text
  function streamFrames(
    rerender: (ui: ReactElement) => void,
    text: string,
    frames: number,
  ) {
    for (let i = 0; i < frames; i += 1) {
      text += "x";
      rerender(<Harness value={text} enabled />);
      act(() => {
        jest.advanceTimersByTime(FRAME_MS);
      });
    }
    return text;
  }

  // Time between consecutive updates, after the first one
  function gaps() {
    return shownAt.slice(2).map((time, i) => time - shownAt[i + 1]);
  }

  test("cheap renders update every ADAPTIVE_THROTTLE_MIN_MS", () => {
    renderCostMs = 5;
    const { rerender } = render(<Harness value="" enabled />);
    streamFrames(rerender, "", 60);

    const observed = gaps();
    expect(observed.length).toBeGreaterThan(5);
    // Fake timers advance in FRAME_MS steps, so the observed gap is the
    // multiple of FRAME_MS nearest the interval (floor or ceil).
    for (const gap of observed) {
      expect(Math.abs(gap - ADAPTIVE_THROTTLE_MIN_MS)).toBeLessThanOrEqual(
        FRAME_MS,
      );
    }
  });

  test("expensive renders back off to three times their cost", () => {
    renderCostMs = 40;
    const { rerender } = render(<Harness value="" enabled />);
    streamFrames(rerender, "", 60);

    const observed = gaps();
    expect(observed.length).toBeGreaterThan(3);
    for (const gap of observed) {
      expect(Math.abs(gap - 120)).toBeLessThanOrEqual(FRAME_MS);
    }
  });

  test("never waits longer than ADAPTIVE_THROTTLE_MAX_MS", () => {
    renderCostMs = 400;
    const { rerender } = render(<Harness value="" enabled />);
    streamFrames(rerender, "", 60);

    const observed = gaps();
    expect(observed.length).toBeGreaterThan(1);
    for (const gap of observed) {
      // Never meaningfully above the max; frame quantisation may overshoot by one frame
      expect(gap).toBeLessThanOrEqual(ADAPTIVE_THROTTLE_MAX_MS + FRAME_MS);
      expect(gap).toBeGreaterThanOrEqual(ADAPTIVE_THROTTLE_MAX_MS - FRAME_MS);
    }
  });

  test("follows the cost as it changes", () => {
    renderCostMs = 5;
    const { rerender } = render(<Harness value="" enabled />);
    let text = streamFrames(rerender, "", 30);
    expect(
      Math.abs((gaps().at(-1) ?? 0) - ADAPTIVE_THROTTLE_MIN_MS),
    ).toBeLessThanOrEqual(FRAME_MS);

    renderCostMs = 50;
    text = streamFrames(rerender, text, 60);
    expect(Math.abs((gaps().at(-1) ?? 0) - 150)).toBeLessThanOrEqual(FRAME_MS);

    renderCostMs = 5;
    streamFrames(rerender, text, 60);
    expect(
      Math.abs((gaps().at(-1) ?? 0) - ADAPTIVE_THROTTLE_MIN_MS),
    ).toBeLessThanOrEqual(FRAME_MS);
  });

  test("shows the latest value as soon as it is disabled", () => {
    renderCostMs = 40;
    const { container, rerender } = render(<Harness value="" enabled />);
    const text = streamFrames(rerender, "", 10);
    expect(container.textContent).not.toBe(text);

    rerender(<Harness value={text} enabled={false} />);
    expect(container.textContent).toBe(text);
  });
});
