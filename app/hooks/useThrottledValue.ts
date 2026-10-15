import { useEffect, useRef, useState } from "react";

/**
 * Returns `value`, updated at most once per `intervalMs` while `enabled`.
 *
 * The first change after a quiet period comes through right away; later
 * changes within the interval are coalesced into one trailing update with
 * the latest value, so the final value is never dropped. While disabled the
 * hook returns `value` as is, so disabling it (e.g. when a stream ends)
 * shows the latest value immediately.
 */
export function useThrottledValue<T>(
  value: T,
  intervalMs: number,
  enabled = true,
): T {
  const [throttled, setThrottled] = useState(value);
  const latestRef = useRef(value);
  latestRef.current = value;
  const lastEmitRef = useRef(-Infinity);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (!enabled) {
      clearTimer();
      // Keep the state in sync so re-enabling starts from the current value
      setThrottled(value);
      return;
    }
    // A trailing update is already scheduled; it picks up the latest value
    if (timerRef.current !== null) return;

    const wait = lastEmitRef.current + intervalMs - Date.now();
    if (wait <= 0) {
      lastEmitRef.current = Date.now();
      setThrottled(value);
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      lastEmitRef.current = Date.now();
      setThrottled(latestRef.current);
    }, wait);
  }, [value, enabled, intervalMs]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return enabled ? throttled : value;
}
