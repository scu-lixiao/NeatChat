/**
 * Frame-aligned throttle for high-frequency UI work such as streaming
 * re-renders. Calls are coalesced so `fn` runs at most once per animation
 * frame and no more often than `minIntervalMs`, always with the latest
 * arguments. A pending call is never dropped: it runs on a later frame, or
 * synchronously via `flush()`.
 *
 * Falls back to setTimeout when requestAnimationFrame is unavailable.
 */

export interface FrameThrottleOptions {
  /** Minimum time between two runs, in ms. 0 (default) = every frame. */
  minIntervalMs?: number;
}

export interface FrameThrottled<Args extends unknown[]> {
  (...args: Args): void;
  /** Run the pending call now, synchronously. No-op if nothing is pending. */
  flush(): void;
  /** Drop the pending call. */
  cancel(): void;
}

// Frame length used by the setTimeout fallback (~60fps)
const FALLBACK_FRAME_MS = 16;

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

// Request a frame and return a function that cancels it
function requestFrame(callback: (time: number) => void): () => void {
  if (typeof requestAnimationFrame === "function") {
    const id = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(() => callback(now()), FALLBACK_FRAME_MS);
  return () => clearTimeout(id);
}

export function createFrameThrottle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  { minIntervalMs = 0 }: FrameThrottleOptions = {},
): FrameThrottled<Args> {
  let pendingArgs: Args | null = null;
  let cancelFrame: (() => void) | null = null;
  let lastRunAt = -Infinity;

  const run = (time: number) => {
    const args = pendingArgs!;
    pendingArgs = null;
    lastRunAt = time;
    fn(...args);
  };

  const onFrame = (time: number) => {
    cancelFrame = null;
    if (!pendingArgs) return;
    // Too soon after the last run: try again on a later frame
    if (time - lastRunAt < minIntervalMs) {
      cancelFrame = requestFrame(onFrame);
      return;
    }
    run(time);
  };

  const throttled = ((...args: Args) => {
    pendingArgs = args;
    if (!cancelFrame) {
      cancelFrame = requestFrame(onFrame);
    }
  }) as FrameThrottled<Args>;

  throttled.flush = () => {
    cancelFrame?.();
    cancelFrame = null;
    if (pendingArgs) {
      run(now());
    }
  };

  throttled.cancel = () => {
    cancelFrame?.();
    cancelFrame = null;
    pendingArgs = null;
  };

  return throttled;
}
