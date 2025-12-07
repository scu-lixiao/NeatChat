/**
 * 流式数据优化工具集 - 统一入口
 *
 * 这个文件整合了所有流式数据处理相关的监控和测试工具
 *
 * 使用方式:
 * 1. 开发环境: 自动加载
 * 2. 生产环境: 通过 __streamTools 访问
 * 3. 测试环境: import { runAllStressTests } from '@/app/utils/stream-tools'
 *
 * @author Claude-4-Sonnet
 * @date 2025-01-23
 */

// 导入所有工具
import { streamCleanupManager } from "./stream-cleanup-manager";
import { streamPerformanceMonitor } from "./stream-performance-monitor";
import { ChatControllerPool } from "@/app/client/controller";
import {
  getMobileOptimizedConfig,
  getDeviceInfo,
  deferTask,
} from "./mobile-config";

// 测试套件引用（仅在浏览器环境可用）
let runAllStressTests: (() => Promise<any>) | undefined;
if (typeof window !== "undefined") {
  // 在浏览器中，测试函数会通过全局变量暴露
  (window as any).__runStreamStressTests &&
    (() => {
      runAllStressTests = (window as any).__runStreamStressTests;
    })();
}

/**
 * 获取完整的流式数据统计信息
 */
export function getStreamStats() {
  const cleanupStats = streamCleanupManager.getStats();
  const controllerStats = ChatControllerPool.getStats();
  const performanceMetrics = streamPerformanceMonitor.getLatestMetrics();
  const performanceSummary = streamPerformanceMonitor.getSummary();
  const deviceInfo = getDeviceInfo();
  const mobileConfig = getMobileOptimizedConfig();

  return {
    cleanup: cleanupStats,
    controllers: controllerStats,
    performance: performanceMetrics,
    summary: performanceSummary,
    device: deviceInfo,
    config: mobileConfig,
    timestamp: Date.now(),
  };
}

/**
 * 打印格式化的统计信息
 */
export function printStreamStats() {
  const stats = getStreamStats();

  console.group("📊 流式数据统计");

  console.group("🧹 清理管理器");
  console.table({
    "Active Streams": stats.cleanup.active,
    "Total Created": stats.cleanup.total,
    "Avg Lifetime (ms)": Math.round(stats.cleanup.avgLifetime),
  });
  console.groupEnd();

  console.group("🎮 控制器池");
  console.table({
    "Active Controllers": stats.controllers.active,
    "Avg Lifetime (ms)": Math.round(stats.controllers.avgLifetime),
  });
  console.groupEnd();

  if (stats.performance) {
    console.group("⚡ 性能指标");
    console.table({
      "Active Streams": stats.performance.activeStreams,
      "Memory (MB)": stats.performance.estimatedMemoryUsage,
      "Active Controllers": stats.performance.activeControllers,
    });
    console.groupEnd();
  }

  console.group("📈 趋势");
  console.table({
    Trend: stats.summary.trend,
    "Info Alerts": stats.summary.alerts.info,
    "Warning Alerts": stats.summary.alerts.warning,
    "Critical Alerts": stats.summary.alerts.critical,
  });
  console.groupEnd();

  console.group("📱 设备信息");
  console.table({
    Type: stats.device.isMobile ? "Mobile" : "Desktop",
    iPad: stats.device.isIPad,
    iOS: stats.device.isIOS,
    Safari: stats.device.isSafari,
    "Memory (GB)": stats.device.deviceMemory || "Unknown",
  });
  console.groupEnd();

  console.group("⚙️ 移动端配置");
  console.table({
    "Batch Size": stats.config.batchSize,
    "Throttle (ms)": stats.config.throttleMs,
    "Memory Threshold (MB)": stats.config.memoryThreshold,
    "Holo Effects": stats.config.enableHoloEffects,
    "Max Messages": stats.config.maxMessages,
  });
  console.groupEnd();

  console.groupEnd();
}

/**
 * 健康检查
 */
export function healthCheck(): {
  healthy: boolean;
  issues: string[];
  warnings: string[];
} {
  const stats = getStreamStats();
  const issues: string[] = [];
  const warnings: string[] = [];

  // 检查活跃流数量
  if (stats.cleanup.active > 10) {
    issues.push(`Too many active streams: ${stats.cleanup.active}`);
  } else if (stats.cleanup.active > 5) {
    warnings.push(`High number of active streams: ${stats.cleanup.active}`);
  }

  // 检查内存使用
  if (stats.performance) {
    if (stats.performance.estimatedMemoryUsage > 300) {
      issues.push(
        `Critical memory usage: ${stats.performance.estimatedMemoryUsage}MB`,
      );
    } else if (stats.performance.estimatedMemoryUsage > 200) {
      warnings.push(
        `High memory usage: ${stats.performance.estimatedMemoryUsage}MB`,
      );
    }
  }

  // 检查警报
  if (stats.summary.alerts.critical > 0) {
    issues.push(`${stats.summary.alerts.critical} critical alerts`);
  }
  if (stats.summary.alerts.warning > 0) {
    warnings.push(`${stats.summary.alerts.warning} warning alerts`);
  }

  // 检查趋势
  if (stats.summary.trend === "degrading") {
    warnings.push("Performance is degrading");
  }

  return {
    healthy: issues.length === 0,
    issues,
    warnings,
  };
}

/**
 * 打印健康状态
 */
export function printHealthCheck() {
  const health = healthCheck();

  console.group(`${health.healthy ? "✅" : "❌"} 健康检查`);

  if (health.issues.length > 0) {
    console.group("🚨 严重问题");
    health.issues.forEach((issue) => console.error(`- ${issue}`));
    console.groupEnd();
  }

  if (health.warnings.length > 0) {
    console.group("⚠️ 警告");
    health.warnings.forEach((warning) => console.warn(`- ${warning}`));
    console.groupEnd();
  }

  if (health.healthy && health.warnings.length === 0) {
    console.log("✨ 所有指标正常");
  }

  console.groupEnd();
}

/**
 * 紧急清理
 */
export async function emergencyCleanup() {
  console.warn("🚨 执行紧急清理...");

  // 触发清理事件
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("stream:emergency-cleanup", {
        detail: {
          reason: "Manual emergency cleanup",
          timestamp: Date.now(),
        },
      }),
    );
  }

  // 清理所有活跃流
  const cleanupStats = streamCleanupManager.getStats();
  console.log(`Cleaning up ${cleanupStats.active} active streams...`);

  // 停止所有控制器
  const controllerStats = ChatControllerPool.getStats();
  console.log(`Stopping ${controllerStats.active} active controllers...`);

  // 等待清理完成
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 验证清理结果
  const afterStats = getStreamStats();
  console.log("清理后状态:");
  console.table({
    "Active Streams": afterStats.cleanup.active,
    "Active Controllers": afterStats.controllers.active,
  });

  if (afterStats.cleanup.active === 0 && afterStats.controllers.active === 0) {
    console.log("✅ 清理成功");
  } else {
    console.error("❌ 清理未完成，仍有活跃资源");
  }
}

/**
 * 开始监控
 */
export function startMonitoring(intervalMs: number = 30000) {
  streamPerformanceMonitor.startMonitoring(intervalMs);
  console.log(`✅ 已启动流式数据监控 (间隔: ${intervalMs}ms)`);
}

/**
 * 停止监控
 */
export function stopMonitoring() {
  streamPerformanceMonitor.stopMonitoring();
  console.log("⏸️ 已停止流式数据监控");
}

/**
 * 运行压力测试
 */
export async function runStressTests() {
  if (!runAllStressTests) {
    console.error("❌ 压力测试套件未加载");
    return null;
  }

  console.log("🧪 启动压力测试...");
  const results = await runAllStressTests();

  console.group("📊 测试结果");
  console.table({
    "Total Tests": results.total,
    Passed: results.passed,
    Failed: results.failed,
    "Success Rate": `${((results.passed / results.total) * 100).toFixed(1)}%`,
  });
  console.groupEnd();

  return results;
}

// 统一工具对象
export const streamTools = {
  // 统计
  getStats: getStreamStats,
  printStats: printStreamStats,

  // 健康检查
  healthCheck,
  printHealthCheck,

  // 清理
  emergencyCleanup,

  // 监控
  startMonitoring,
  stopMonitoring,

  // 测试
  runStressTests,

  // 直接访问底层工具
  cleanupManager: streamCleanupManager,
  performanceMonitor: streamPerformanceMonitor,
  controllerPool: ChatControllerPool,

  // 配置
  getMobileConfig: getMobileOptimizedConfig,
  getDeviceInfo,
  deferTask,
};

// 开发环境自动启动监控（已禁用 - 2025-11-28）
// if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
//   console.log('🔧 开发环境已加载流式数据优化工具');
//   console.log('💡 使用 __streamTools 访问工具集');
//   console.log('📖 可用命令:');
//   console.log('  - __streamTools.printStats()      查看统计');
//   console.log('  - __streamTools.printHealthCheck() 健康检查');
//   console.log('  - __streamTools.runStressTests()   运行测试');
//   console.log('  - __streamTools.emergencyCleanup() 紧急清理');
//
//   (window as any).__streamTools = streamTools;
//
//   // 自动启动监控
//   streamPerformanceMonitor.startMonitoring(30000);
// }

// 生产环境暴露简化接口
if (process.env.NODE_ENV === "production" && typeof window !== "undefined") {
  (window as any).__streamTools = {
    getStats: getStreamStats,
    healthCheck,
    emergencyCleanup,
  };
}

export default streamTools;
