/**
 * WebGPU Integration for Effect Grading System
 *
 * Purpose: Enhance existing effect-grading system with WebGPU capabilities
 * - Detects WebGPU support and integrates with M4 chipset detection
 * - Provides WebGPU-specific effect level recommendations
 * - Manages fallback to CSS backdrop-filter when WebGPU unavailable
 */

import { getWebGPURenderer, type WebGPUCapabilities } from "./webgpu-renderer";
import type { EffectLevel } from "./effect-grading";
import type { IPadOSDeviceInfo } from "./ipados-detector";

/**
 * Enhanced effect level with WebGPU tier
 */
export type EnhancedEffectLevel = EffectLevel | "ultra";

/**
 * WebGPU-specific capabilities
 */
export interface WebGPUEffectCapabilities {
  webgpuAvailable: boolean;
  webgpuCapabilities: WebGPUCapabilities | null;
  recommendedBlurMethod: "webgpu" | "css" | "none";
  recommendedParticleMethod: "webgpu-canvas" | "css" | "none";
  maxParticleCount: number;
  maxBlurRadius: number;
}

/**
 * Detect WebGPU capabilities and enhance device capabilities
 */
export async function detectWebGPUCapabilities(
  baseCapabilities: IPadOSDeviceInfo,
  userPreference: "auto" | "force-webgpu" | "force-css" | "off" = "auto",
): Promise<WebGPUEffectCapabilities> {
  const renderer = await getWebGPURenderer();
  const webgpuCapabilities = renderer.getCapabilities();
  const isAvailable = renderer.isAvailable();

  // Determine blur method
  let recommendedBlurMethod: "webgpu" | "css" | "none" = "none";
  let maxBlurRadius = 0;

  // Check if CSS backdrop-filter is supported
  const supportsBackdropFilter =
    CSS.supports("backdrop-filter", "blur(1px)") ||
    CSS.supports("-webkit-backdrop-filter", "blur(1px)");

  // Handle user preference
  if (userPreference === "off") {
    // User explicitly disabled effects
    recommendedBlurMethod = "none";
    maxBlurRadius = 0;
  } else if (userPreference === "force-css") {
    // User wants CSS only
    if (supportsBackdropFilter) {
      recommendedBlurMethod = "css";
      maxBlurRadius = baseCapabilities.chipset === "m4" ? 30 : 20;
    }
  } else if (userPreference === "force-webgpu") {
    // User forces WebGPU even on non-M4 devices
    if (isAvailable) {
      recommendedBlurMethod = "webgpu";
      maxBlurRadius = 40;
    } else if (supportsBackdropFilter) {
      // WebGPU not available, fallback to CSS
      recommendedBlurMethod = "css";
      maxBlurRadius = 20;
    }
  } else {
    // Auto mode: intelligent selection
    if (
      isAvailable &&
      (baseCapabilities.chipset === "m4" || baseCapabilities.chipset === "m3")
    ) {
      // M4/M3 chip with WebGPU: Use GPU-accelerated blur
      recommendedBlurMethod = "webgpu";
      maxBlurRadius = 40; // Maximum blur radius for M4/M3
    } else if (supportsBackdropFilter) {
      // Fallback to CSS backdrop-filter
      recommendedBlurMethod = "css";
      maxBlurRadius =
        baseCapabilities.chipset === "m4" || baseCapabilities.chipset === "m3"
          ? 30
          : 20;
    }
  }

  // Determine particle method
  let recommendedParticleMethod: "webgpu-canvas" | "css" | "none" = "none";
  let maxParticleCount = 0;

  if (userPreference === "off") {
    // User disabled effects
    recommendedParticleMethod = "none";
    maxParticleCount = 0;
  } else if (userPreference === "force-css") {
    // User wants CSS only
    recommendedParticleMethod = "css";
    maxParticleCount = 200;
  } else if (userPreference === "force-webgpu") {
    // User forces GPU acceleration
    if (isAvailable) {
      recommendedParticleMethod = "webgpu-canvas";
      maxParticleCount = 2000;
    } else {
      recommendedParticleMethod = "css";
      maxParticleCount = 200;
    }
  } else {
    // Auto mode
    if (
      isAvailable &&
      (baseCapabilities.chipset === "m4" || baseCapabilities.chipset === "m3")
    ) {
      // M4/M3 with WebGPU: Use GPU-accelerated canvas particles
      recommendedParticleMethod = "webgpu-canvas";
      maxParticleCount = 2000; // High particle count for M4/M3
    } else if (
      baseCapabilities.chipset === "m4" ||
      baseCapabilities.chipset === "m3"
    ) {
      // M4/M3 without WebGPU: Still use canvas but with lower count
      recommendedParticleMethod = "webgpu-canvas";
      maxParticleCount = 1000;
    } else {
      // Other devices: CSS-based particles
      recommendedParticleMethod = "css";
      maxParticleCount = 200;
    }
  }

  return {
    webgpuAvailable: isAvailable,
    webgpuCapabilities: isAvailable ? webgpuCapabilities : null,
    recommendedBlurMethod,
    recommendedParticleMethod,
    maxParticleCount,
    maxBlurRadius,
  };
}

/**
 * Determine enhanced effect level with WebGPU consideration
 */
export function determineEnhancedEffectLevel(
  baseLevel: EffectLevel,
  webgpuCapabilities: WebGPUEffectCapabilities,
): EnhancedEffectLevel {
  // If WebGPU is available on M4/M3, enable ultra level
  if (
    baseLevel === "full" &&
    webgpuCapabilities.webgpuAvailable &&
    webgpuCapabilities.recommendedBlurMethod === "webgpu"
  ) {
    return "ultra";
  }

  return baseLevel;
}

/**
 * Get blur effect configuration based on capabilities
 */
export interface BlurEffectConfig {
  method: "webgpu" | "css" | "none";
  radius: number;
  quality: "low" | "medium" | "high";
  cssVariable: string;
  fallbackCSS?: string;
}

export function getBlurEffectConfig(
  intensity: "subtle" | "normal" | "intense" | "extreme",
  effectLevel: EnhancedEffectLevel,
  webgpuCapabilities: WebGPUEffectCapabilities,
): BlurEffectConfig {
  // Map intensity to radius
  const radiusMap = {
    subtle: 8,
    normal: 20,
    intense: 30,
    extreme: 40,
  };

  let radius = radiusMap[intensity];

  // Adjust based on effect level
  if (effectLevel === "minimal") {
    radius = 0;
  } else if (effectLevel === "reduced") {
    radius = Math.floor(radius * 0.5);
  }

  // Clamp to maximum supported radius
  radius = Math.min(radius, webgpuCapabilities.maxBlurRadius);

  // Determine quality based on effect level
  const qualityMap: Record<EnhancedEffectLevel, "low" | "medium" | "high"> = {
    minimal: "low",
    reduced: "low",
    full: "medium",
    ultra: "high",
  };

  const quality = qualityMap[effectLevel];

  // CSS variable name
  const cssVariable = `--glass-blur-${intensity}`;

  // Fallback CSS for non-WebGPU
  const fallbackCSS = radius > 0 ? `backdrop-filter: blur(${radius}px);` : "";

  return {
    method: radius > 0 ? webgpuCapabilities.recommendedBlurMethod : "none",
    radius,
    quality,
    cssVariable,
    fallbackCSS,
  };
}

/**
 * Get particle effect configuration
 */
export interface ParticleEffectConfig {
  method: "webgpu-canvas" | "css" | "none";
  maxCount: number;
  particleSize: number;
  emissionRate: number;
  lifetime: number;
  quality: "low" | "medium" | "high";
}

export function getParticleEffectConfig(
  effectLevel: EnhancedEffectLevel,
  webgpuCapabilities: WebGPUEffectCapabilities,
): ParticleEffectConfig {
  if (effectLevel === "minimal") {
    return {
      method: "none",
      maxCount: 0,
      particleSize: 0,
      emissionRate: 0,
      lifetime: 0,
      quality: "low",
    };
  }

  // Base configuration
  const configs: Record<EnhancedEffectLevel, Partial<ParticleEffectConfig>> = {
    minimal: {
      maxCount: 0,
      particleSize: 0,
      emissionRate: 0,
      quality: "low",
    },
    reduced: {
      maxCount: 100,
      particleSize: 2,
      emissionRate: 10,
      quality: "low",
    },
    full: {
      maxCount: 500,
      particleSize: 3,
      emissionRate: 30,
      quality: "medium",
    },
    ultra: {
      maxCount: 2000,
      particleSize: 4,
      emissionRate: 60,
      quality: "high",
    },
  };

  const baseConfig = configs[effectLevel];

  // Adjust maxCount based on device capabilities
  const maxCount = Math.min(
    baseConfig.maxCount || 0,
    webgpuCapabilities.maxParticleCount,
  );

  return {
    method:
      maxCount > 0 ? webgpuCapabilities.recommendedParticleMethod : "none",
    maxCount,
    particleSize: baseConfig.particleSize || 2,
    emissionRate: baseConfig.emissionRate || 10,
    lifetime: 2000, // 2 seconds
    quality: baseConfig.quality || "medium",
  };
}

/**
 * Generate CSS variables for WebGPU-enhanced effects
 */
export function generateWebGPUEffectVariables(
  effectLevel: EnhancedEffectLevel,
  webgpuCapabilities: WebGPUEffectCapabilities,
): Record<string, string> {
  const variables: Record<string, string> = {};

  // Blur intensities
  const blurIntensities: Array<"subtle" | "normal" | "intense" | "extreme"> = [
    "subtle",
    "normal",
    "intense",
    "extreme",
  ];

  blurIntensities.forEach((intensity) => {
    const config = getBlurEffectConfig(
      intensity,
      effectLevel,
      webgpuCapabilities,
    );
    variables[config.cssVariable] = `${config.radius}px`;
  });

  // Particle configuration
  const particleConfig = getParticleEffectConfig(
    effectLevel,
    webgpuCapabilities,
  );
  variables["--quantum-particle-count"] = String(particleConfig.maxCount);
  variables["--quantum-particle-size"] = `${particleConfig.particleSize}px`;
  variables["--quantum-particle-density"] = String(
    particleConfig.emissionRate / 100,
  );

  // WebGPU availability flag
  variables["--webgpu-available"] = webgpuCapabilities.webgpuAvailable
    ? "1"
    : "0";

  // Effect level indicator
  variables["--effect-level"] = effectLevel;

  return variables;
}

/**
 * Apply WebGPU-enhanced effect variables to DOM
 */
export function applyWebGPUEffectVariables(
  variables: Record<string, string>,
  element: HTMLElement = document.documentElement,
): void {
  Object.entries(variables).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
}

/**
 * Initialize WebGPU effects system
 */
export async function initializeWebGPUEffects(
  baseCapabilities: IPadOSDeviceInfo,
  baseEffectLevel: EffectLevel,
  userPreference: "auto" | "force-webgpu" | "force-css" | "off" = "auto",
): Promise<{
  webgpuCapabilities: WebGPUEffectCapabilities;
  enhancedLevel: EnhancedEffectLevel;
  cssVariables: Record<string, string>;
}> {
  // Detect WebGPU capabilities with user preference
  const webgpuCapabilities = await detectWebGPUCapabilities(
    baseCapabilities,
    userPreference,
  );

  // Determine enhanced effect level
  const enhancedLevel = determineEnhancedEffectLevel(
    baseEffectLevel,
    webgpuCapabilities,
  );

  // Generate CSS variables
  const cssVariables = generateWebGPUEffectVariables(
    enhancedLevel,
    webgpuCapabilities,
  );

  // Apply to DOM
  applyWebGPUEffectVariables(cssVariables);

  if (process.env.NODE_ENV === "development") {
    console.log("[WebGPU Effects] Initialized", {
      webgpuAvailable: webgpuCapabilities.webgpuAvailable,
      enhancedLevel,
      blurMethod: webgpuCapabilities.recommendedBlurMethod,
      particleMethod: webgpuCapabilities.recommendedParticleMethod,
      cssVariables,
    });
  }

  return {
    webgpuCapabilities,
    enhancedLevel,
    cssVariables,
  };
}
