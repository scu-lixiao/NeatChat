/**
 * React Hooks for iPadOS Adaptations
 *
 * Purpose: Integrate iPadOS-specific features with React components
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  type IPadOSEnvironment,
  getIPadOSEnvironment,
  monitorViewportChanges,
  ApplePencilHandler,
  detectApplePencilSupport,
} from "../utils/ipados-adaptations";

/**
 * Hook to track iPadOS environment changes
 */
export function useIPadOSEnvironment() {
  const [env, setEnv] = useState<IPadOSEnvironment>(() =>
    getIPadOSEnvironment(),
  );

  useEffect(() => {
    const cleanup = monitorViewportChanges((newEnv) => {
      setEnv(newEnv);
    });

    return cleanup;
  }, []);

  return env;
}

/**
 * Hook to handle Apple Pencil input
 */
export function useApplePencil(
  elementRef: React.RefObject<HTMLElement>,
  callbacks: {
    onPencilDraw?: (x: number, y: number, pressure: number) => void;
    onPencilTap?: (x: number, y: number) => void;
  },
) {
  const [isPencilSupported, setIsPencilSupported] = useState(false);
  const [isPencilActive, setIsPencilActive] = useState(false);
  const handlerRef = useRef<ApplePencilHandler | null>(null);

  useEffect(() => {
    setIsPencilSupported(detectApplePencilSupport());
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !isPencilSupported) return;

    handlerRef.current = new ApplePencilHandler(element, {
      onPencilDraw: (x, y, pressure) => {
        setIsPencilActive(true);
        callbacks.onPencilDraw?.(x, y, pressure);
      },
      onPencilTap: (x, y) => {
        callbacks.onPencilTap?.(x, y);
        setIsPencilActive(false);
      },
    });

    return () => {
      handlerRef.current?.destroy();
    };
  }, [elementRef, isPencilSupported, callbacks]);

  return { isPencilSupported, isPencilActive };
}

/**
 * Hook to adapt UI for Split View / Stage Manager
 */
export function useResponsiveLayout() {
  const env = useIPadOSEnvironment();

  const getLayoutConfig = useCallback(() => {
    const { multitaskingMode, viewportWidth } = env;

    switch (multitaskingMode) {
      case "fullscreen":
        return {
          columns: viewportWidth > 1024 ? 2 : 1,
          fontSize: "base",
          sidebar: "expanded",
          spacing: "comfortable",
        };

      case "split-half":
        return {
          columns: 1,
          fontSize: "base",
          sidebar: "collapsed",
          spacing: "compact",
        };

      case "split-third":
        return {
          columns: 1,
          fontSize: "small",
          sidebar: "hidden",
          spacing: "compact",
        };

      case "slideover":
        return {
          columns: 1,
          fontSize: "small",
          sidebar: "hidden",
          spacing: "minimal",
        };

      default:
        return {
          columns: 1,
          fontSize: "base",
          sidebar: "auto",
          spacing: "comfortable",
        };
    }
  }, [env]);

  return {
    env,
    layout: getLayoutConfig(),
    isSplitView: env.isSplitView,
    isStageManager: env.isStageManager,
    isCompactView:
      env.multitaskingMode === "split-third" ||
      env.multitaskingMode === "slideover",
  };
}

/**
 * Hook to handle safe area insets
 */
export function useSafeAreaInsets() {
  const env = useIPadOSEnvironment();

  return {
    insets: env.safeAreaInsets,
    style: {
      paddingTop: env.safeAreaInsets.top,
      paddingRight: env.safeAreaInsets.right,
      paddingBottom: env.safeAreaInsets.bottom,
      paddingLeft: env.safeAreaInsets.left,
    },
  };
}

/**
 * Hook for 120Hz ProMotion animations
 */
export function useProMotion(enabled = true) {
  const [frameRate, setFrameRate] = useState(60);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    if (!enabled) return;

    let rafId: number;

    const measureFrameRate = (time: number) => {
      frameCountRef.current++;

      const elapsed = time - lastTimeRef.current;
      if (elapsed >= 1000) {
        const fps = (frameCountRef.current / elapsed) * 1000;
        setFrameRate(Math.round(fps));
        frameCountRef.current = 0;
        lastTimeRef.current = time;
      }

      rafId = requestAnimationFrame(measureFrameRate);
    };

    rafId = requestAnimationFrame(measureFrameRate);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [enabled]);

  const animate120Hz = useCallback((callback: (time: number) => void) => {
    let lastTime = 0;
    const targetFPS = 120;
    const interval = 1000 / targetFPS;

    const animate = (time: number) => {
      if (time - lastTime >= interval) {
        lastTime = time;
        callback(time);
      }
      return requestAnimationFrame(animate);
    };

    return requestAnimationFrame(animate);
  }, []);

  return {
    frameRate,
    isProMotion: frameRate > 90,
    animate120Hz,
  };
}

/**
 * Hook for orientation changes
 */
export function useOrientation() {
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    () => {
      return window.innerWidth > window.innerHeight ? "landscape" : "portrait";
    },
  );

  useEffect(() => {
    const handleOrientationChange = () => {
      setOrientation(
        window.innerWidth > window.innerHeight ? "landscape" : "portrait",
      );
    };

    window.addEventListener("resize", handleOrientationChange);
    window.addEventListener("orientationchange", handleOrientationChange);

    return () => {
      window.removeEventListener("resize", handleOrientationChange);
      window.removeEventListener("orientationchange", handleOrientationChange);
    };
  }, []);

  return orientation;
}
