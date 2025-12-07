/**
 * React Hook for iPadOS Effect Management
 *
 * Purpose: Seamlessly integrate effect grading system into React components
 * Handles device detection, effect application, and user preferences
 */

import { useEffect, useState, useCallback } from "react";
import type { IPadOSDeviceInfo } from "../utils/ipados-detector";
import { getIPadOSDeviceInfo, logDeviceInfo } from "../utils/ipados-detector";
import {
  type EffectLevel,
  type EffectSettings,
  initializeEffectSystem,
  setEffectLevel as applyEffectLevel,
  getSavedEffectLevel,
  EffectPerformanceMonitor,
} from "../utils/effect-grading";

export interface UseIPadOSEffectsReturn {
  deviceInfo: IPadOSDeviceInfo | null;
  effectLevel: EffectLevel;
  effectSettings: EffectSettings | null;
  isLoading: boolean;
  avgFPS: number;
  setEffectLevel: (level: EffectLevel) => void;
  refreshDeviceInfo: () => Promise<void>;
}

/**
 * Hook to manage iPadOS-specific effects
 */
export function useIPadOSEffects(): UseIPadOSEffectsReturn {
  const [deviceInfo, setDeviceInfo] = useState<IPadOSDeviceInfo | null>(null);
  const [effectLevel, setEffectLevelState] = useState<EffectLevel>("full");
  const [effectSettings, setEffectSettings] = useState<EffectSettings | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [avgFPS, setAvgFPS] = useState(60);
  const [monitor, setMonitor] = useState<EffectPerformanceMonitor | null>(null);

  // Initialize device detection and effects
  const initialize = useCallback(async () => {
    setIsLoading(true);

    try {
      // Detect device
      const info = await getIPadOSDeviceInfo();
      setDeviceInfo(info);

      // Log device info in development
      if (process.env.NODE_ENV === "development") {
        await logDeviceInfo();
      }

      // Check for saved preference
      const savedLevel = getSavedEffectLevel();

      // Initialize effects
      const settings = savedLevel
        ? await initializeEffectSystem({
            ...info,
            performanceClass:
              savedLevel === "full"
                ? "high"
                : savedLevel === "reduced"
                ? "mid"
                : "low",
          })
        : await initializeEffectSystem(info);

      setEffectSettings(settings);
      setEffectLevelState(settings.level);

      // Start performance monitoring
      const perfMonitor = new EffectPerformanceMonitor(settings.level);
      perfMonitor.start();
      setMonitor(perfMonitor);

      // Update FPS periodically
      const fpsInterval = setInterval(() => {
        if (perfMonitor) {
          setAvgFPS(perfMonitor.getAvgFPS());
        }
      }, 1000);

      return () => clearInterval(fpsInterval);
    } catch (error) {
      console.error("Failed to initialize iPadOS effects:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Manual effect level change
  const setEffectLevel = useCallback(
    (level: EffectLevel) => {
      applyEffectLevel(level);
      setEffectLevelState(level);

      // Update monitor
      if (monitor) {
        monitor["currentLevel"] = level;
      }
    },
    [monitor],
  );

  // Refresh device info
  const refreshDeviceInfo = useCallback(async () => {
    await initialize();
  }, [initialize]);

  return {
    deviceInfo,
    effectLevel,
    effectSettings,
    isLoading,
    avgFPS,
    setEffectLevel,
    refreshDeviceInfo,
  };
}

/**
 * Hook to check if running on iPadOS
 */
export function useIsIPadOS(): boolean {
  const [isIPadOS, setIsIPadOS] = useState(false);

  useEffect(() => {
    getIPadOSDeviceInfo().then((info) => {
      setIsIPadOS(info.isIPadOS);
    });
  }, []);

  return isIPadOS;
}

/**
 * Hook to get current FPS
 */
export function useFPS(updateInterval = 1000): number {
  const [fps, setFPS] = useState(60);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();

    const measure = () => {
      frameCount++;
      const now = performance.now();
      const elapsed = now - lastTime;

      if (elapsed >= updateInterval) {
        const currentFPS = (frameCount / elapsed) * 1000;
        setFPS(Math.round(currentFPS));
        frameCount = 0;
        lastTime = now;
      }

      requestAnimationFrame(measure);
    };

    const rafId = requestAnimationFrame(measure);

    return () => cancelAnimationFrame(rafId);
  }, [updateInterval]);

  return fps;
}
