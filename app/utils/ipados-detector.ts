/**
 * iPadOS Device Detection and Capability Analysis
 *
 * Purpose: Detect iPadOS version, device model, and Metal support
 * Usage: Used to determine optimal performance settings for different iPad devices
 */

export interface IPadOSDeviceInfo {
  isIPad: boolean;
  isIPadOS: boolean;
  version: {
    major: number;
    minor: number;
    patch: number;
  };
  model: "ipad" | "ipad-pro" | "ipad-mini" | "ipad-air" | "unknown";
  chipset: "a-series" | "m1" | "m2" | "m3" | "m4" | "unknown";
  metalVersion: number; // 1-4
  supportsWebGPU: boolean;
  screenSize: {
    width: number;
    height: number;
    diagonal: number; // inches
  };
  performanceClass: "high" | "mid" | "low";
}

/**
 * Detect if running on iPadOS
 */
export function isIPadOS(): boolean {
  // iPadOS 13+ reports as "Macintosh" in user agent
  // Need to check touch points and screen size
  const ua = navigator.userAgent;

  // Method 1: Traditional iPad detection
  if (/iPad/.test(ua)) {
    return true;
  }

  // Method 2: iPadOS 13+ detection (reports as Mac)
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 0) {
    return true;
  }

  return false;
}

/**
 * Get iPadOS version
 */
export function getIPadOSVersion(): {
  major: number;
  minor: number;
  patch: number;
} {
  const ua = navigator.userAgent;

  // Try to extract version from user agent
  // Format: "Version/XX.Y.Z" or "OS XX_Y_Z"
  let match = ua.match(/Version\/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) {
    match = ua.match(/OS (\d+)[._](\d+)(?:[._](\d+))?/);
  }

  if (match) {
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3] || "0", 10),
    };
  }

  // Fallback: assume latest if detection fails
  return { major: 18, minor: 0, patch: 0 };
}

/**
 * Detect iPad model based on screen size and capabilities
 */
export function detectIPadModel(): IPadOSDeviceInfo["model"] {
  const width = screen.width;
  const height = screen.height;
  const diagonal = Math.sqrt(width * width + height * height) / 160; // rough estimate

  // iPad Pro 12.9"
  if (diagonal > 11.5) {
    return "ipad-pro";
  }

  // iPad Pro 11" or iPad Air
  if (diagonal > 10 && diagonal <= 11.5) {
    return navigator.hardwareConcurrency >= 8 ? "ipad-pro" : "ipad-air";
  }

  // iPad Mini
  if (diagonal < 9) {
    return "ipad-mini";
  }

  // Standard iPad
  return "ipad";
}

// {{CHENGQI:
// Action: Added - GPU检测缓存
// Timestamp: 2025-11-24 Claude 4.5 sonnet
// Reason: 每次调用detectChipsetViaGPU()都创建WebGL context导致iPad thinking mode卡住
// Bug_Fixed: 缓存GPU检测结果,避免重复创建WebGL context
// Principle_Applied: Memoization - 缓存昂贵的计算结果
// Optimization: WebGL context创建是昂贵操作,只执行一次
// Architectural_Note (AR): WebGL context创建可能与requestAnimationFrame冲突
// Documentation_Note (DW): GPU检测缓存优化
// }}
let cachedGPUChipset: IPadOSDeviceInfo["chipset"] | null | undefined =
  undefined;

/**
 * Detect chipset via WebGL GPU renderer string
 */
function detectChipsetViaGPU(): IPadOSDeviceInfo["chipset"] | null {
  // Return cached result if available
  if (cachedGPUChipset !== undefined) {
    return cachedGPUChipset;
  }

  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

    if (!gl) {
      cachedGPUChipset = null;
      return null;
    }

    const debugInfo = (gl as WebGLRenderingContext).getExtension(
      "WEBGL_debug_renderer_info",
    );
    if (!debugInfo) {
      cachedGPUChipset = null;
      return null;
    }

    const renderer = (gl as WebGLRenderingContext).getParameter(
      debugInfo.UNMASKED_RENDERER_WEBGL,
    );
    const rendererStr = String(renderer).toLowerCase();

    // Check for specific GPU identifiers
    if (rendererStr.includes("m4") || rendererStr.includes("apple m4")) {
      cachedGPUChipset = "m4";
      return "m4";
    }
    if (rendererStr.includes("m3") || rendererStr.includes("apple m3")) {
      cachedGPUChipset = "m3";
      return "m3";
    }
    if (rendererStr.includes("m2") || rendererStr.includes("apple m2")) {
      cachedGPUChipset = "m2";
      return "m2";
    }
    if (rendererStr.includes("m1") || rendererStr.includes("apple m1")) {
      cachedGPUChipset = "m1";
      return "m1";
    }

    cachedGPUChipset = null;
    return null;
  } catch (e) {
    console.warn("[iPadOS] GPU detection failed:", e);
    cachedGPUChipset = null;
    return null;
  }
}

/**
 * Detect chipset based on performance characteristics
 */
export function detectChipset(): IPadOSDeviceInfo["chipset"] {
  // Try GPU-based detection first (most accurate for M-series chips)
  const gpuChipset = detectChipsetViaGPU();
  if (gpuChipset) {
    return gpuChipset;
  }

  // Fallback to CPU/memory-based detection
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as any).deviceMemory || 4;

  // M4 iPad Pro: 10 cores, 16GB+ RAM
  if (cores >= 10 && memory >= 16) {
    return "m4";
  }

  // M3 iPad Air: 8 cores, 8GB RAM (2024 release)
  // M2 iPad Pro/Air: 8-10 cores, 8GB+ RAM
  // Cannot reliably distinguish M3 from M2 via cores/memory alone
  // Assume newer devices (2024+) with 8 cores are M3
  if (cores >= 8 && memory >= 8) {
    // Check if device is likely M3 based on user agent or other signals
    const ua = navigator.userAgent;
    // iPad Air (2024) typically comes with M3
    if (ua.includes("iPad")) {
      // If we can't determine from GPU, conservatively assume M2
      // Users can manually override via settings if needed
      return "m2";
    }
    return "m2";
  }

  // M1 iPad Pro/Air: 8 cores, 8GB RAM
  if (cores === 8 && memory >= 6) {
    return "m1";
  }

  // A-series chips: typically 6 cores or less
  return "a-series";
}

/**
 * Detect Metal version support
 */
export function detectMetalVersion(
  version: IPadOSDeviceInfo["version"],
  chipset: IPadOSDeviceInfo["chipset"],
): number {
  // Metal 4: iPadOS 26+ with M-series or A17 Pro
  if (version.major >= 26) {
    if (
      chipset === "m4" ||
      chipset === "m3" ||
      chipset === "m2" ||
      chipset === "m1"
    ) {
      return 4;
    }
    // A17 Pro also supports Metal 4 (though we can't easily detect it)
    // Assume newer A-series on iPadOS 26 supports Metal 4
    return 4;
  }

  // Metal 3: iPadOS 17+
  if (version.major >= 17) {
    return 3;
  }

  // Metal 2: iPadOS 13+
  if (version.major >= 13) {
    return 2;
  }

  return 1;
}

/**
 * Check WebGPU support
 */
export async function checkWebGPUSupport(): Promise<boolean> {
  if (!("gpu" in navigator) || !navigator.gpu) {
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "low-power", // mobile-friendly
    });

    return adapter !== null;
  } catch (e) {
    console.warn("WebGPU check failed:", e);
    return false;
  }
}

/**
 * Calculate performance class
 */
export function calculatePerformanceClass(
  chipset: IPadOSDeviceInfo["chipset"],
  metalVersion: number,
): IPadOSDeviceInfo["performanceClass"] {
  // High: M-series chips with Metal 4
  if (
    (chipset === "m4" ||
      chipset === "m3" ||
      chipset === "m2" ||
      chipset === "m1") &&
    metalVersion >= 4
  ) {
    return "high";
  }

  // Mid: M1 or newer A-series with Metal 3+
  if (chipset === "m1" || (chipset === "a-series" && metalVersion >= 3)) {
    return "mid";
  }

  // Low: older devices
  return "low";
}

/**
 * Get comprehensive device information
 */
export async function getIPadOSDeviceInfo(): Promise<IPadOSDeviceInfo> {
  const isIPadDevice = isIPadOS();
  const version = getIPadOSVersion();
  const model = detectIPadModel();
  const chipset = detectChipset();
  const metalVersion = detectMetalVersion(version, chipset);
  const supportsWebGPU = await checkWebGPUSupport();
  const performanceClass = calculatePerformanceClass(chipset, metalVersion);

  return {
    isIPad: isIPadDevice,
    isIPadOS: isIPadDevice && version.major >= 13,
    version,
    model,
    chipset,
    metalVersion,
    supportsWebGPU,
    screenSize: {
      width: screen.width,
      height: screen.height,
      diagonal:
        Math.sqrt(screen.width * screen.width + screen.height * screen.height) /
        160,
    },
    performanceClass,
  };
}

/**
 * Log device info for debugging
 */
export async function logDeviceInfo(): Promise<void> {
  const info = await getIPadOSDeviceInfo();

  console.group("📱 iPadOS Device Info");
  console.log("Device:", info.model);
  console.log(
    "iPadOS:",
    `${info.version.major}.${info.version.minor}.${info.version.patch}`,
  );
  console.log("Chipset:", info.chipset);
  console.log("Metal:", `v${info.metalVersion}`);
  console.log("WebGPU:", info.supportsWebGPU ? "✅" : "❌");
  console.log("Performance:", info.performanceClass);
  console.log(
    "Screen:",
    `${info.screenSize.width}x${
      info.screenSize.height
    } (${info.screenSize.diagonal.toFixed(1)}")`,
  );
  console.groupEnd();
}
