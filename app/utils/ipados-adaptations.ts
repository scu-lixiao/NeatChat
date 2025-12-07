/**
 * iPadOS-Specific Adaptations
 *
 * Purpose: Optimize for iPadOS 26 unique features
 * Features:
 * - Split View / Stage Manager detection
 * - Apple Pencil input support
 * - Multi-tasking optimizations
 * - Safe area handling
 */

export interface IPadOSEnvironment {
  isSplitView: boolean;
  isStageManager: boolean;
  supportsPencil: boolean;
  viewportWidth: number;
  viewportHeight: number;
  safeAreaInsets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  multitaskingMode:
    | "fullscreen"
    | "split-half"
    | "split-third"
    | "slideover"
    | "unknown";
}

/**
 * Detect Split View mode
 * Split View: 2 apps side-by-side with adjustable divider
 */
export function detectSplitView(): boolean {
  if (!window.matchMedia) return false;

  // iPad in Split View has constrained width
  const width = window.innerWidth;
  const screenWidth = window.screen.width;

  // Split View detection:
  // - Not full screen width
  // - iPad aspect ratio
  // - Landscape orientation typically

  return (
    width < screenWidth &&
    width >= 320 && // Minimum Split View width
    width <= screenWidth * 0.75 // Not fullscreen
  );
}

/**
 * Detect Stage Manager mode (iPadOS 16+)
 * Stage Manager: Multiple resizable windows
 */
export function detectStageManager(): boolean {
  // Stage Manager indicators:
  // 1. Viewport size not matching screen size
  // 2. Window can be arbitrary sizes
  // 3. visualViewport API shows different sizes

  if (!window.visualViewport) return false;

  const vv = window.visualViewport;
  const hasCustomSize =
    vv.width !== window.screen.width && vv.height !== window.screen.height;

  // Stage Manager allows arbitrary window sizes
  const isArbitrarySize =
    vv.width >= 375 &&
    vv.width <= window.screen.width &&
    vv.height >= 375 &&
    vv.height <= window.screen.height;

  return hasCustomSize && isArbitrarySize;
}

/**
 * Detect Apple Pencil support
 */
export function detectApplePencilSupport(): boolean {
  // Check for PointerEvent with 'pen' type support
  if (!("PointerEvent" in window)) return false;

  // iPad with Pencil support has specific touch properties
  return (
    "ontouchstart" in window &&
    navigator.maxTouchPoints > 0 &&
    // iPad Pro models typically report 5 touch points
    navigator.maxTouchPoints >= 5
  );
}

/**
 * Get safe area insets (for notch/home indicator)
 */
export function getSafeAreaInsets(): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  // Read CSS environment variables
  const getInset = (name: string): number => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(
      `env(safe-area-inset-${name})`,
    );
    return parseInt(value) || 0;
  };

  return {
    top: getInset("top"),
    right: getInset("right"),
    bottom: getInset("bottom"),
    left: getInset("left"),
  };
}

/**
 * Detect multitasking mode
 */
export function detectMultitaskingMode(): IPadOSEnvironment["multitaskingMode"] {
  const width = window.innerWidth;
  const screenWidth = window.screen.width;
  const ratio = width / screenWidth;

  if (ratio >= 0.95) {
    return "fullscreen";
  } else if (ratio >= 0.45 && ratio <= 0.55) {
    return "split-half";
  } else if (ratio >= 0.28 && ratio <= 0.35) {
    return "split-third";
  } else if (width <= 375) {
    return "slideover";
  }

  return "unknown";
}

/**
 * Get complete iPadOS environment info
 */
export function getIPadOSEnvironment(): IPadOSEnvironment {
  return {
    isSplitView: detectSplitView(),
    isStageManager: detectStageManager(),
    supportsPencil: detectApplePencilSupport(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    safeAreaInsets: getSafeAreaInsets(),
    multitaskingMode: detectMultitaskingMode(),
  };
}

/**
 * Apply responsive layout adjustments based on environment
 */
export function applyResponsiveAdjustments(env: IPadOSEnvironment): void {
  const root = document.documentElement;

  // Set CSS custom properties
  root.style.setProperty("--viewport-width", `${env.viewportWidth}px`);
  root.style.setProperty("--viewport-height", `${env.viewportHeight}px`);
  root.style.setProperty("--safe-area-top", `${env.safeAreaInsets.top}px`);
  root.style.setProperty("--safe-area-right", `${env.safeAreaInsets.right}px`);
  root.style.setProperty(
    "--safe-area-bottom",
    `${env.safeAreaInsets.bottom}px`,
  );
  root.style.setProperty("--safe-area-left", `${env.safeAreaInsets.left}px`);

  // Set data attributes for CSS targeting
  root.dataset.splitView = env.isSplitView.toString();
  root.dataset.stageManager = env.isStageManager.toString();
  root.dataset.multitaskingMode = env.multitaskingMode;

  // Adjust font sizes for Split View
  if (env.isSplitView || env.multitaskingMode === "split-third") {
    root.style.setProperty("--base-font-size", "14px");
  } else if (env.multitaskingMode === "slideover") {
    root.style.setProperty("--base-font-size", "13px");
  } else {
    root.style.setProperty("--base-font-size", "16px");
  }
}

/**
 * Handle Apple Pencil input
 */
export class ApplePencilHandler {
  private element: HTMLElement;
  private onPencilDraw?: (x: number, y: number, pressure: number) => void;
  private onPencilTap?: (x: number, y: number) => void;

  constructor(
    element: HTMLElement,
    callbacks: {
      onPencilDraw?: (x: number, y: number, pressure: number) => void;
      onPencilTap?: (x: number, y: number) => void;
    },
  ) {
    this.element = element;
    this.onPencilDraw = callbacks.onPencilDraw;
    this.onPencilTap = callbacks.onPencilTap;

    this.attachListeners();
  }

  private attachListeners() {
    this.element.addEventListener("pointerdown", this.handlePointerDown);
    this.element.addEventListener("pointermove", this.handlePointerMove);
    this.element.addEventListener("pointerup", this.handlePointerUp);
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (e.pointerType === "pen") {
      const rect = this.element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.onPencilTap?.(x, y);
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (e.pointerType === "pen" && e.pressure > 0) {
      const rect = this.element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.onPencilDraw?.(x, y, e.pressure);
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (e.pointerType === "pen") {
      // Cleanup if needed
    }
  };

  destroy() {
    this.element.removeEventListener("pointerdown", this.handlePointerDown);
    this.element.removeEventListener("pointermove", this.handlePointerMove);
    this.element.removeEventListener("pointerup", this.handlePointerUp);
  }
}

/**
 * Monitor viewport changes (for Split View/Stage Manager)
 */
export function monitorViewportChanges(
  callback: (env: IPadOSEnvironment) => void,
): () => void {
  let resizeTimeout: NodeJS.Timeout;

  const handleResize = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const env = getIPadOSEnvironment();
      callback(env);
      applyResponsiveAdjustments(env);
    }, 100);
  };

  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);

  // Initial setup
  const initialEnv = getIPadOSEnvironment();
  applyResponsiveAdjustments(initialEnv);

  return () => {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("orientationchange", handleResize);
    clearTimeout(resizeTimeout);
  };
}

/**
 * Service Worker registration for offline support
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    console.warn("[iPadOS] Service Worker not supported");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(
      "/serviceWorker.js",
      {
        scope: "/",
      },
    );

    console.log("[iPadOS] Service Worker registered:", registration.scope);

    // Check for updates
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            console.log("[iPadOS] New Service Worker available");
          }
        });
      }
    });

    return registration;
  } catch (error) {
    console.error("[iPadOS] Service Worker registration failed:", error);
    return null;
  }
}

/**
 * Optimize for iPad Pro with 120Hz ProMotion display
 */
export function enableProMotionOptimization(): void {
  // Force maximum frame rate
  const style = document.createElement("style");
  style.textContent = `
    * {
      /* Force ProMotion 120Hz */
      scroll-behavior: auto !important;
    }
    
    @media (prefers-reduced-motion: no-preference) {
      * {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
      }
    }
  `;

  // Use RAF for 120Hz animations
  const animateAt120Hz = (callback: FrameRequestCallback) => {
    let lastTime = 0;
    const targetFPS = 120;
    const interval = 1000 / targetFPS;

    const animate = (time: number) => {
      if (time - lastTime >= interval) {
        lastTime = time;
        callback(time);
      }
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  };

  // Expose for components
  (window as any).__120HzAnimate = animateAt120Hz;
}
