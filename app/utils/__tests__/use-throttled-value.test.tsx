import { jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";
import { useThrottledValue } from "@/app/hooks/useThrottledValue";

const INTERVAL_MS = 200;

function setup(value: string, enabled = true) {
  return renderHook(
    (props: { value: string; enabled: boolean }) =>
      useThrottledValue(props.value, INTERVAL_MS, props.enabled),
    { initialProps: { value, enabled } },
  );
}

describe("useThrottledValue", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("returns the initial value right away", () => {
    const { result } = setup("a");
    expect(result.current).toBe("a");
  });

  test("coalesces changes within the interval into one trailing update", () => {
    const { result, rerender } = setup("a");

    rerender({ value: "ab", enabled: true });
    rerender({ value: "abc", enabled: true });
    expect(result.current).toBe("a");

    act(() => {
      jest.advanceTimersByTime(INTERVAL_MS - 1);
    });
    expect(result.current).toBe("a");

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe("abc");
  });

  test("passes the first change after a quiet period through right away", () => {
    const { result, rerender } = setup("a");

    act(() => {
      jest.advanceTimersByTime(INTERVAL_MS);
    });
    rerender({ value: "ab", enabled: true });

    expect(result.current).toBe("ab");
  });

  test("updates at most once per interval under a steady stream", () => {
    const { result, rerender } = setup("");
    const FRAME_MS = 16;
    const FRAMES = 60; // ~1s of updates

    let text = "";
    let updates = 0;
    let shown = result.current;
    for (let i = 0; i < FRAMES; i += 1) {
      text += "x";
      rerender({ value: text, enabled: true });
      act(() => {
        jest.advanceTimersByTime(FRAME_MS);
      });
      if (result.current !== shown) {
        updates += 1;
        shown = result.current;
      }
    }

    const elapsedMs = FRAMES * FRAME_MS;
    expect(updates).toBeLessThanOrEqual(Math.ceil(elapsedMs / INTERVAL_MS));
    // Still updating while streaming, not only at the end
    expect(updates).toBeGreaterThanOrEqual(
      Math.floor(elapsedMs / INTERVAL_MS) - 1,
    );

    // The trailing update delivers the final value
    act(() => {
      jest.advanceTimersByTime(INTERVAL_MS);
    });
    expect(result.current).toBe(text);
  });

  test("returns every value immediately when disabled", () => {
    const { result, rerender } = setup("a", false);
    const timers = jest.getTimerCount();

    rerender({ value: "ab", enabled: false });
    expect(result.current).toBe("ab");
    rerender({ value: "abc", enabled: false });
    expect(result.current).toBe("abc");
    expect(jest.getTimerCount()).toBe(timers);
  });

  test("returns the latest value as soon as it is disabled", () => {
    const { result, rerender } = setup("a");

    rerender({ value: "ab", enabled: true });
    expect(result.current).toBe("a");

    rerender({ value: "abc", enabled: false });
    expect(result.current).toBe("abc");

    // The dropped trailing update doesn't bring an older value back
    act(() => {
      jest.advanceTimersByTime(INTERVAL_MS);
    });
    expect(result.current).toBe("abc");
  });

  test("starts from the current value when re-enabled", () => {
    const { result, rerender } = setup("a", false);

    rerender({ value: "ab", enabled: false });
    rerender({ value: "ab", enabled: true });

    expect(result.current).toBe("ab");
  });

  test("clears a pending update on unmount", () => {
    const { rerender, unmount } = setup("a");
    const timers = jest.getTimerCount();

    rerender({ value: "ab", enabled: true });
    expect(jest.getTimerCount()).toBe(timers + 1);

    unmount();
    expect(jest.getTimerCount()).toBe(timers);
  });
});
