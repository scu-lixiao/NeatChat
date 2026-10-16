import { useLayoutEffect, useRef } from "react";
import { useThrottledValue } from "./useThrottledValue";

// Bounds of the interval between two updates, in ms
export const ADAPTIVE_THROTTLE_MIN_MS = 66;
export const ADAPTIVE_THROTTLE_MAX_MS = 250;
// The interval is this many times the cost of the last update, so rendering
// the value takes at most about a third of the main thread
const COST_FACTOR = 3;

export function getAdaptiveInterval(lastCostMs: number) {
  return Math.min(
    ADAPTIVE_THROTTLE_MAX_MS,
    Math.max(ADAPTIVE_THROTTLE_MIN_MS, Math.round(lastCostMs * COST_FACTOR)),
  );
}

/**
 * `useThrottledValue` with an interval that follows how long the calling
 * component takes to render each new value: clamp(3 × last cost, 66, 250)
 * ms. Cheap renders (short content, fast device) update ~15 times a second;
 * expensive ones back off on their own.
 *
 * The cost runs from the render in which the throttled value changed to this
 * hook's layout effect, which fires once the caller's whole subtree has been
 * rendered and committed to the DOM. Call it before rendering the expensive
 * part, so that part is measured.
 */
export function useAdaptiveThrottledValue<T>(value: T, enabled = true): T {
  const lastCostRef = useRef(0);
  const renderStartRef = useRef(0);
  const throttled = useThrottledValue(
    value,
    getAdaptiveInterval(lastCostRef.current),
    enabled,
  );
  renderStartRef.current = performance.now();

  useLayoutEffect(() => {
    lastCostRef.current = performance.now() - renderStartRef.current;
  }, [throttled]);

  return throttled;
}
