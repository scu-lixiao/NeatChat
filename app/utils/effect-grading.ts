/**
 * Holographic Effect Grading System for iPadOS
 *
 * Purpose: Dynamically adjust visual effects based on device capabilities
 * Ensures smooth performance across all iPad models
 */

import type { IPadOSDeviceInfo } from "./ipados-detector";

export type EffectLevel = "full" | "reduced" | "minimal";

export interface EffectSettings {
  level: EffectLevel;
  blur: {
    enabled: boolean;
    radius: number; // px
  };
  transparency: {
    enabled: boolean;
    opacity: number; // 0-1
  };
  animations: {
    enabled: boolean;
    duration: number; // ms
    complexity: "high" | "medium" | "low";
  };
  shadows: {
    enabled: boolean;
    intensity: "high" | "medium" | "low";
  };
  gradients: {
    enabled: boolean;
    complexity: "high" | "medium" | "low";
  };
  particleEffects: {
    enabled: boolean;
    count: number;
  };
}

/**
 * Determine optimal effect level based on device capabilities
 */
export function determineEffectLevel(
  deviceInfo: IPadOSDeviceInfo,
): EffectLevel {
  // High-end devices: M-series with Metal 4
  if (deviceInfo.performanceClass === "high" && deviceInfo.metalVersion >= 4) {
    return "full";
  }

  // Mid-range devices: M1 or newer A-series
  if (deviceInfo.performanceClass === "mid") {
    return "reduced";
  }

  // Low-end devices: older A-series
  return "minimal";
}

/**
 * Get effect settings for a given level
 */
export function getEffectSettings(level: EffectLevel): EffectSettings {
  const settings: Record<EffectLevel, EffectSettings> = {
    full: {
      level: "full",
      blur: {
        enabled: true,
        radius: 20,
      },
      transparency: {
        enabled: true,
        opacity: 0.9,
      },
      animations: {
        enabled: true,
        duration: 300,
        complexity: "high",
      },
      shadows: {
        enabled: true,
        intensity: "high",
      },
      gradients: {
        enabled: true,
        complexity: "high",
      },
      particleEffects: {
        enabled: true,
        count: 50,
      },
    },

    reduced: {
      level: "reduced",
      blur: {
        enabled: true,
        radius: 10, // Reduced blur radius
      },
      transparency: {
        enabled: true,
        opacity: 0.95, // Less transparent
      },
      animations: {
        enabled: true,
        duration: 200, // Faster animations
        complexity: "medium",
      },
      shadows: {
        enabled: true,
        intensity: "medium",
      },
      gradients: {
        enabled: true,
        complexity: "medium",
      },
      particleEffects: {
        enabled: false, // Disable particle effects
        count: 0,
      },
    },

    minimal: {
      level: "minimal",
      blur: {
        enabled: false, // Disable blur completely
        radius: 0,
      },
      transparency: {
        enabled: false, // Fully opaque
        opacity: 1,
      },
      animations: {
        enabled: true,
        duration: 150, // Minimal animations
        complexity: "low",
      },
      shadows: {
        enabled: false, // Disable shadows
        intensity: "low",
      },
      gradients: {
        enabled: false, // Disable gradients
        complexity: "low",
      },
      particleEffects: {
        enabled: false,
        count: 0,
      },
    },
  };

  return settings[level];
}

/**
 * Generate CSS variables for the effect level
 */
export function generateCSSVariables(
  settings: EffectSettings,
): Record<string, string> {
  return {
    "--holo-effect-level": settings.level,

    // Blur
    "--holo-blur-enabled": settings.blur.enabled ? "1" : "0",
    "--holo-blur-radius": `${settings.blur.radius}px`,

    // Transparency
    "--holo-opacity": settings.transparency.opacity.toString(),

    // Animations
    "--holo-animation-enabled": settings.animations.enabled ? "1" : "0",
    "--holo-animation-duration": `${settings.animations.duration}ms`,
    "--holo-animation-complexity": settings.animations.complexity,

    // Shadows
    "--holo-shadow-enabled": settings.shadows.enabled ? "1" : "0",
    "--holo-shadow-intensity": settings.shadows.intensity,

    // Gradients
    "--holo-gradient-enabled": settings.gradients.enabled ? "1" : "0",
    "--holo-gradient-complexity": settings.gradients.complexity,

    // Particles
    "--holo-particles-enabled": settings.particleEffects.enabled ? "1" : "0",
    "--holo-particles-count": settings.particleEffects.count.toString(),
  };
}

/**
 * Apply effect settings to the document
 */
export function applyEffectSettings(settings: EffectSettings): void {
  const root = document.documentElement;
  const cssVars = generateCSSVariables(settings);

  // Apply CSS variables
  Object.entries(cssVars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  // Set data attribute for CSS selectors
  root.setAttribute("data-effect-level", settings.level);

  console.log(`✨ Applied ${settings.level} effect level`);
}

/**
 * Initialize effect system based on device
 */
export async function initializeEffectSystem(
  deviceInfo: IPadOSDeviceInfo,
): Promise<EffectSettings> {
  const level = determineEffectLevel(deviceInfo);
  const settings = getEffectSettings(level);

  applyEffectSettings(settings);

  return settings;
}

/**
 * Allow users to manually override effect level
 */
export function setEffectLevel(level: EffectLevel): void {
  const settings = getEffectSettings(level);
  applyEffectSettings(settings);

  // Save preference
  localStorage.setItem("neatchat-effect-level", level);
}

/**
 * Get saved effect level preference
 */
export function getSavedEffectLevel(): EffectLevel | null {
  const saved = localStorage.getItem("neatchat-effect-level");
  if (saved === "full" || saved === "reduced" || saved === "minimal") {
    return saved;
  }
  return null;
}

/**
 * Monitor performance and auto-adjust if needed
 */
export class EffectPerformanceMonitor {
  private currentLevel: EffectLevel;
  private settings: EffectSettings;
  private frameCount = 0;
  private lastTime = performance.now();
  private avgFPS = 60;
  private readonly FPS_THRESHOLD = 40; // Downgrade if FPS drops below this
  private readonly CHECK_INTERVAL = 5000; // Check every 5 seconds

  constructor(initialLevel: EffectLevel) {
    this.currentLevel = initialLevel;
    this.settings = getEffectSettings(initialLevel);
  }

  start(): void {
    this.measure();
    setInterval(() => this.checkPerformance(), this.CHECK_INTERVAL);
  }

  private measure = (): void => {
    const now = performance.now();
    const elapsed = now - this.lastTime;

    this.frameCount++;

    if (elapsed >= 1000) {
      this.avgFPS = (this.frameCount / elapsed) * 1000;
      this.frameCount = 0;
      this.lastTime = now;
    }

    requestAnimationFrame(this.measure);
  };

  private checkPerformance(): void {
    console.log(`📊 Performance: ${this.avgFPS.toFixed(1)} FPS`);

    // Auto-downgrade if performance is poor
    if (this.avgFPS < this.FPS_THRESHOLD) {
      if (this.currentLevel === "full") {
        console.warn("⚠️ Performance degraded, switching to reduced effects");
        this.downgrade();
      } else if (this.currentLevel === "reduced") {
        console.warn(
          "⚠️ Performance critically low, switching to minimal effects",
        );
        this.downgrade();
      }
    }
  }

  private downgrade(): void {
    const levels: EffectLevel[] = ["full", "reduced", "minimal"];
    const currentIndex = levels.indexOf(this.currentLevel);

    if (currentIndex < levels.length - 1) {
      this.currentLevel = levels[currentIndex + 1];
      this.settings = getEffectSettings(this.currentLevel);
      applyEffectSettings(this.settings);
    }
  }

  getCurrentLevel(): EffectLevel {
    return this.currentLevel;
  }

  getAvgFPS(): number {
    return this.avgFPS;
  }
}
