/**
 * React Hooks for WebGPU-Enhanced Effects
 *
 * Purpose: Provide easy-to-use React hooks for components to leverage WebGPU
 * - useWebGPUEffects: Initialize and manage WebGPU effects
 * - useWebGPUBackdrop: GPU-accelerated backdrop blur for modals/cards
 * - useWebGPUParticles: GPU-accelerated particle system
 */

"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import {
  getWebGPURenderer,
  type WebGPURenderer,
} from "../utils/webgpu-renderer";
import {
  initializeWebGPUEffects,
  type EnhancedEffectLevel,
  type WebGPUEffectCapabilities,
  type BlurEffectConfig,
  type ParticleEffectConfig,
  getBlurEffectConfig,
  getParticleEffectConfig,
} from "../utils/webgpu-effects";
import { useIPadOSEffects } from "./useIPadOSEffects";
import { useAppConfig } from "../store/config";

/**
 * Main hook for WebGPU effects system
 */
export function useWebGPUEffects() {
  const [initialized, setInitialized] = useState(false);
  const [enhancedLevel, setEnhancedLevel] =
    useState<EnhancedEffectLevel>("full");
  const [webgpuCapabilities, setWebGPUCapabilities] =
    useState<WebGPUEffectCapabilities | null>(null);
  const [cssVariables, setCSSVariables] = useState<Record<string, string>>({});

  const { deviceInfo, effectLevel: baseEffectLevel } = useIPadOSEffects();
  const config = useAppConfig();

  useEffect(() => {
    if (!deviceInfo) return;

    const init = async () => {
      try {
        const result = await initializeWebGPUEffects(
          deviceInfo,
          baseEffectLevel,
          config.webgpuAcceleration,
        );

        setEnhancedLevel(result.enhancedLevel);
        setWebGPUCapabilities(result.webgpuCapabilities);
        setCSSVariables(result.cssVariables);
        setInitialized(true);
      } catch (error) {
        console.error("[useWebGPUEffects] Initialization failed:", error);
        setInitialized(false);
      }
    };

    init();
  }, [deviceInfo, baseEffectLevel, config.webgpuAcceleration]);

  return {
    initialized,
    enhancedLevel,
    webgpuCapabilities,
    cssVariables,
    isIPadOS: deviceInfo?.isIPadOS ?? false,
    isWebGPUAvailable: webgpuCapabilities?.webgpuAvailable ?? false,
  };
}

/**
 * Hook for GPU-accelerated backdrop blur
 *
 * {{CHENGQI:
 * WebGPU Canvas Layer Strategy:
 * - Canvas is ALWAYS positioned as background layer (zIndex: 0)
 * - Canvas NEVER intercepts pointer events (pointerEvents: 'none')
 * - All DOM content must have zIndex >= 1 to appear above canvas
 * - This ensures WebGPU effects never block user interactions
 * Timestamp: 2025-11-25 Claude 4.5 sonnet
 * }}
 */
export function useWebGPUBackdrop(
  intensity: "subtle" | "normal" | "intense" | "extreme" = "normal",
  enabled: boolean = true,
) {
  const { enhancedLevel, webgpuCapabilities } = useWebGPUEffects();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [blurConfig, setBlurConfig] = useState<BlurEffectConfig | null>(null);
  const rendererRef = useRef<WebGPURenderer | null>(null);

  useEffect(() => {
    if (!webgpuCapabilities || !enabled) return;

    const config = getBlurEffectConfig(
      intensity,
      enhancedLevel,
      webgpuCapabilities,
    );
    setBlurConfig(config);
  }, [intensity, enhancedLevel, webgpuCapabilities, enabled]);

  useEffect(() => {
    if (!blurConfig || blurConfig.method !== "webgpu" || !canvasRef.current) {
      return;
    }

    const initRenderer = async () => {
      try {
        const renderer = await getWebGPURenderer();

        if (renderer.isAvailable() && canvasRef.current) {
          const success = renderer.configureCanvas(canvasRef.current);

          if (success) {
            rendererRef.current = renderer;

            if (process.env.NODE_ENV === "development") {
              console.log("[useWebGPUBackdrop] Canvas configured for WebGPU");
            }
          }
        }
      } catch (error) {
        console.error(
          "[useWebGPUBackdrop] Renderer initialization failed:",
          error,
        );
      }
    };

    initRenderer();
  }, [blurConfig]);

  // Memoize styles to avoid re-renders
  const backdropStyle = useMemo(() => {
    if (!blurConfig || !enabled) {
      return {};
    }

    // If WebGPU is used, the canvas will handle blur
    // Otherwise, fallback to CSS
    if (blurConfig.method === "css") {
      return {
        backdropFilter: `blur(${blurConfig.radius}px)`,
        WebkitBackdropFilter: `blur(${blurConfig.radius}px)`,
      };
    }

    return {};
  }, [blurConfig, enabled]);

  return {
    canvasRef,
    backdropStyle,
    blurConfig,
    useWebGPU: blurConfig?.method === "webgpu",
  };
}

/**
 * Hook for GPU-accelerated particle system
 */
export function useWebGPUParticles(enabled: boolean = true) {
  const { enhancedLevel, webgpuCapabilities, isWebGPUAvailable } =
    useWebGPUEffects();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particleSystemRef = useRef<any>(null);
  const [particleConfig, setParticleConfig] =
    useState<ParticleEffectConfig | null>(null);

  useEffect(() => {
    if (!webgpuCapabilities || !enabled) return;

    const config = getParticleEffectConfig(enhancedLevel, webgpuCapabilities);
    setParticleConfig(config);
  }, [enhancedLevel, webgpuCapabilities, enabled]);

  useEffect(() => {
    if (
      !particleConfig ||
      particleConfig.method === "none" ||
      !canvasRef.current
    ) {
      return;
    }

    // Only initialize WebGPU-based particles if available
    if (particleConfig.method === "webgpu-canvas" && isWebGPUAvailable) {
      const initParticles = async () => {
        try {
          const renderer = await getWebGPURenderer();

          if (renderer.isAvailable() && canvasRef.current) {
            particleSystemRef.current = renderer.createParticleSystem(
              canvasRef.current,
              {
                maxParticles: particleConfig.maxCount,
                particleSize: particleConfig.particleSize,
                lifetime: particleConfig.lifetime,
                emissionRate: particleConfig.emissionRate,
                gravity: { x: 0, y: 0.1 },
              },
            );

            particleSystemRef.current.start();

            if (process.env.NODE_ENV === "development") {
              console.log("[useWebGPUParticles] Particle system initialized", {
                maxCount: particleConfig.maxCount,
                quality: particleConfig.quality,
              });
            }
          }
        } catch (error) {
          console.error("[useWebGPUParticles] Initialization failed:", error);
        }
      };

      initParticles();

      return () => {
        if (particleSystemRef.current) {
          particleSystemRef.current.stop();
          particleSystemRef.current.destroy();
          particleSystemRef.current = null;
        }
      };
    }
  }, [particleConfig, isWebGPUAvailable]);

  // Function to emit particles at a position
  const emitParticle = (
    x: number,
    y: number,
    vx: number = 0,
    vy: number = 0,
  ) => {
    if (particleSystemRef.current) {
      particleSystemRef.current.emit(x, y, vx, vy);
    }
  };

  // Fallback to CSS particles
  const useCSSParticles = particleConfig?.method === "css";

  return {
    canvasRef,
    particleConfig,
    emitParticle,
    useWebGPU: particleConfig?.method === "webgpu-canvas",
    useCSSParticles,
  };
}

/**
 * Hook for performance monitoring
 */
export function useWebGPUPerformance() {
  const [fps, setFPS] = useState(60);
  const [frameTime, setFrameTime] = useState(16.67);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const measurePerformance = (currentTime: number) => {
      frameCountRef.current++;

      const elapsed = currentTime - lastTimeRef.current;

      // Update every second
      if (elapsed >= 1000) {
        const currentFPS = Math.round((frameCountRef.current * 1000) / elapsed);
        const avgFrameTime = elapsed / frameCountRef.current;

        setFPS(currentFPS);
        setFrameTime(avgFrameTime);

        frameCountRef.current = 0;
        lastTimeRef.current = currentTime;
      }

      rafRef.current = requestAnimationFrame(measurePerformance);
    };

    rafRef.current = requestAnimationFrame(measurePerformance);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const performanceGrade = useMemo(() => {
    if (fps >= 55) return "excellent";
    if (fps >= 45) return "good";
    if (fps >= 30) return "fair";
    return "poor";
  }, [fps]);

  return {
    fps,
    frameTime,
    performanceGrade,
  };
}
