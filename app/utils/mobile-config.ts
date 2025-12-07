/**
 * Mobile-Optimized Configuration
 *
 * 根据设备类型和性能动态调整流式数据处理配置
 * 针对移动端（特别是 iPad/Safari）进行优化
 *
 * @author Claude-4-Sonnet
 * @date 2025-11-23
 */

export interface MobileOptimizedConfig {
  // 批处理大小（字符数）
  batchSize: number;
  // 节流间隔（毫秒）
  throttleMs: number;
  // 内存清理阈值（MB）
  memoryThreshold: number;
  // 是否启用 Holographic 效果
  enableHoloEffects: boolean;
  // 是否延迟非关键处理
  deferNonCritical: boolean;
  // 最大消息数（超过后自动归档）
  maxMessages: number;
  // 动画帧率目标
  targetFPS: number;
  // 是否使用虚拟滚动
  useVirtualScroll: boolean;
  // 是否降低图像质量
  reducedImageQuality: boolean;
}

interface DeviceInfo {
  isMobile: boolean;
  isIOS: boolean;
  isIPad: boolean;
  isSafari: boolean;
  isLowMemory: boolean;
  deviceMemory?: number;
  cpuCores?: number;
}

/**
 * 检测设备信息
 */
export function getDeviceInfo(): DeviceInfo {
  if (typeof window === "undefined") {
    return {
      isMobile: false,
      isIOS: false,
      isIPad: false,
      isSafari: false,
      isLowMemory: false,
    };
  }

  const ua = navigator.userAgent;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isIPad =
    /iPad/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS/i.test(ua);

  // @ts-ignore - navigator.deviceMemory is not standard but supported by Chrome
  const deviceMemory: number | undefined = navigator.deviceMemory;
  // @ts-ignore - navigator.hardwareConcurrency
  const cpuCores: number | undefined = navigator.hardwareConcurrency;

  const isLowMemory = deviceMemory ? deviceMemory < 4 : false;

  return {
    isMobile,
    isIOS,
    isIPad,
    isSafari,
    isLowMemory,
    deviceMemory,
    cpuCores,
  };
}

/**
 * 获取移动端优化配置
 */
export function getMobileOptimizedConfig(): MobileOptimizedConfig {
  const device = getDeviceInfo();

  // 桌面端 - 高性能配置
  if (!device.isMobile) {
    return {
      batchSize: 50,
      throttleMs: 50,
      memoryThreshold: 300,
      enableHoloEffects: true,
      deferNonCritical: false,
      maxMessages: 500,
      targetFPS: 60,
      useVirtualScroll: false,
      reducedImageQuality: false,
    };
  }

  // iPad/iOS - 中等性能配置
  if (device.isIPad || device.isIOS) {
    return {
      batchSize: device.isLowMemory ? 150 : 100,
      throttleMs: device.isLowMemory ? 120 : 100,
      memoryThreshold: device.isLowMemory ? 100 : 150,
      enableHoloEffects: !device.isLowMemory,
      deferNonCritical: true,
      maxMessages: device.isLowMemory ? 100 : 200,
      targetFPS: 30,
      useVirtualScroll: true,
      reducedImageQuality: device.isLowMemory,
    };
  }

  // 其他移动端 - 保守配置
  return {
    batchSize: device.isLowMemory ? 200 : 120,
    throttleMs: device.isLowMemory ? 150 : 100,
    memoryThreshold: device.isLowMemory ? 80 : 120,
    enableHoloEffects: false,
    deferNonCritical: true,
    maxMessages: device.isLowMemory ? 80 : 150,
    targetFPS: 24,
    useVirtualScroll: true,
    reducedImageQuality: true,
  };
}

/**
 * 延迟执行非关键任务
 */
export function deferTask(
  task: () => void,
  priority: "high" | "low" = "low",
): void {
  const config = getMobileOptimizedConfig();

  if (priority === "low" && config.deferNonCritical) {
    // 使用 requestIdleCallback (Safari 不支持，降级到 setTimeout)
    if ("requestIdleCallback" in window) {
      requestIdleCallback(task, { timeout: 1000 });
    } else {
      setTimeout(task, 100);
    }
  } else {
    // 高优先级任务立即执行
    task();
  }
}

/**
 * 检查是否应该降低质量
 */
export function shouldReduceQuality(): boolean {
  const device = getDeviceInfo();
  return device.isMobile && device.isLowMemory;
}

/**
 * 获取推荐的最大流式块大小
 */
export function getMaxChunkSize(): number {
  const device = getDeviceInfo();

  if (!device.isMobile) {
    return 10 * 1024; // 10KB
  }

  if (device.isLowMemory) {
    return 2 * 1024; // 2KB
  }

  return 5 * 1024; // 5KB
}

/**
 * 检查是否为 Safari 浏览器
 */
export function isSafari(): boolean {
  return getDeviceInfo().isSafari;
}

/**
 * 检查是否为 iPad
 */
export function isIPad(): boolean {
  return getDeviceInfo().isIPad;
}

/**
 * 获取设备信息（导出供调试使用）
 */
export function getDeviceInfoForDebug() {
  return getDeviceInfo();
}

// 导出全局配置
let cachedConfig: MobileOptimizedConfig | null = null;

export function getGlobalMobileConfig(): MobileOptimizedConfig {
  if (!cachedConfig) {
    cachedConfig = getMobileOptimizedConfig();

    if (process.env.NODE_ENV === "development") {
      console.log("[MobileConfig] Initialized:", {
        device: getDeviceInfo(),
        config: cachedConfig,
      });
    }
  }

  return cachedConfig;
}

// 重置缓存（用于测试）
export function resetMobileConfigCache(): void {
  cachedConfig = null;
}
