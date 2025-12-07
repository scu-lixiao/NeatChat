/**
 * Touch Gesture Optimization Hook
 *
 * Purpose: Optimize touch interactions for iPadOS
 * Features:
 * - Passive event listeners for 60fps scrolling
 * - Touch momentum tracking
 * - Gesture conflict prevention
 * - iPad-specific touch optimizations
 */

import { useEffect, useRef, useCallback } from "react";

export interface TouchGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onLongPress?: (x: number, y: number) => void;
  onDoubleTap?: (x: number, y: number) => void;
  swipeThreshold?: number; // Minimum distance for swipe (px)
  longPressDelay?: number; // Long press duration (ms)
  doubleTapDelay?: number; // Max time between taps (ms)
  preventScroll?: boolean; // Prevent default scroll behavior
}

interface TouchPoint {
  x: number;
  y: number;
  time: number;
}

export function useTouchGestures(
  elementRef: React.RefObject<HTMLElement>,
  options: TouchGestureOptions = {},
) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onLongPress,
    onDoubleTap,
    swipeThreshold = 50,
    longPressDelay = 500,
    doubleTapDelay = 300,
    preventScroll = false,
  } = options;

  const touchStartRef = useRef<TouchPoint | null>(null);
  const touchEndRef = useRef<TouchPoint | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<TouchPoint | null>(null);
  const isTouchingRef = useRef(false);

  // Clear long press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Handle touch start
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      const touch = e.touches[0];
      const point: TouchPoint = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };

      touchStartRef.current = point;
      isTouchingRef.current = true;

      // Start long press timer
      if (onLongPress) {
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          if (isTouchingRef.current) {
            onLongPress(point.x, point.y);
          }
        }, longPressDelay);
      }

      // Check for double tap
      if (onDoubleTap && lastTapRef.current) {
        const timeDiff = point.time - lastTapRef.current.time;
        const distanceX = Math.abs(point.x - lastTapRef.current.x);
        const distanceY = Math.abs(point.y - lastTapRef.current.y);

        if (timeDiff < doubleTapDelay && distanceX < 20 && distanceY < 20) {
          onDoubleTap(point.x, point.y);
          lastTapRef.current = null;
          clearLongPressTimer();
          return;
        }
      }
    },
    [
      onLongPress,
      onDoubleTap,
      longPressDelay,
      doubleTapDelay,
      clearLongPressTimer,
    ],
  );

  // Handle touch move
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      // Cancel long press if user moves finger
      clearLongPressTimer();

      if (preventScroll && touchStartRef.current) {
        const touch = e.touches[0];
        const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

        // Prevent vertical scroll if horizontal swipe detected
        if (deltaY < 10) {
          e.preventDefault();
        }
      }
    },
    [preventScroll, clearLongPressTimer],
  );

  // Handle touch end
  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      isTouchingRef.current = false;
      clearLongPressTimer();

      const touch = e.changedTouches[0];
      touchEndRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };

      if (!touchStartRef.current || !touchEndRef.current) return;

      const deltaX = touchEndRef.current.x - touchStartRef.current.x;
      const deltaY = touchEndRef.current.y - touchStartRef.current.y;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Detect swipe direction
      if (absDeltaX > swipeThreshold || absDeltaY > swipeThreshold) {
        if (absDeltaX > absDeltaY) {
          // Horizontal swipe
          if (deltaX > 0) {
            onSwipeRight?.();
          } else {
            onSwipeLeft?.();
          }
        } else {
          // Vertical swipe
          if (deltaY > 0) {
            onSwipeDown?.();
          } else {
            onSwipeUp?.();
          }
        }
      } else {
        // Tap gesture
        lastTapRef.current = touchEndRef.current;
      }

      touchStartRef.current = null;
      touchEndRef.current = null;
    },
    [
      onSwipeLeft,
      onSwipeRight,
      onSwipeUp,
      onSwipeDown,
      swipeThreshold,
      clearLongPressTimer,
    ],
  );

  // Handle touch cancel
  const handleTouchCancel = useCallback(() => {
    isTouchingRef.current = false;
    clearLongPressTimer();
    touchStartRef.current = null;
    touchEndRef.current = null;
  }, [clearLongPressTimer]);

  // Attach event listeners
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Use passive listeners for better scroll performance
    element.addEventListener("touchstart", handleTouchStart, {
      passive: !preventScroll,
    });
    element.addEventListener("touchmove", handleTouchMove, {
      passive: !preventScroll,
    });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    element.addEventListener("touchcancel", handleTouchCancel, {
      passive: true,
    });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchCancel);
      clearLongPressTimer();
    };
  }, [
    elementRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    preventScroll,
    clearLongPressTimer,
  ]);
}

/**
 * Hook to optimize scrolling performance on iPadOS
 */
export function useScrollOptimization(
  elementRef: React.RefObject<HTMLElement>,
) {
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Apply iPad-specific CSS optimizations
    (element.style as any).webkitOverflowScrolling = "touch";
    element.style.contain = "layout style paint";
    element.style.willChange = "scroll-position";

    // Use RAF to detect scroll performance
    let scrolling = false;
    let lastScrollTop = element.scrollTop;
    let frameId: number;

    const checkScroll = () => {
      if (element.scrollTop !== lastScrollTop) {
        lastScrollTop = element.scrollTop;
        scrolling = true;
      } else if (scrolling) {
        scrolling = false;
        // Reset will-change after scrolling stops to save resources
        element.style.willChange = "auto";
        setTimeout(() => {
          if (!scrolling) {
            element.style.willChange = "scroll-position";
          }
        }, 100);
      }

      frameId = requestAnimationFrame(checkScroll);
    };

    frameId = requestAnimationFrame(checkScroll);

    return () => {
      cancelAnimationFrame(frameId);
      (element.style as any).webkitOverflowScrolling = "";
      element.style.contain = "";
      element.style.willChange = "";
    };
  }, [elementRef]);
}

/**
 * Hook to handle iPad-specific touch momentum
 */
export function useTouchMomentum(
  elementRef: React.RefObject<HTMLElement>,
  onMomentumStart?: () => void,
  onMomentumEnd?: () => void,
) {
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let isScrolling = false;
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      if (!isScrolling) {
        isScrolling = true;
        onMomentumStart?.();
      }

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
        onMomentumEnd?.();
      }, 150);
    };

    element.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      element.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [elementRef, onMomentumStart, onMomentumEnd]);
}
