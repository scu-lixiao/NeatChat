/**
 * 流式数据处理性能监控
 *
 * 集成到 performance-optimizer.ts
 * 提供流式数据的专项监控指标
 *
 * @author Claude-4-Sonnet
 * @date 2025-11-23
 */

import { streamCleanupManager } from "./stream-cleanup-manager";
import { ChatControllerPool } from "@/app/client/controller";

export interface StreamPerformanceMetrics {
  // 流统计
  activeStreams: number;
  totalStreamsCreated: number;
  avgStreamLifetime: number;
  streamsByProvider: Record<string, number>;

  // 控制器统计
  activeControllers: number;
  avgControllerLifetime: number;

  // 内存统计
  estimatedMemoryUsage: number;

  // 性能统计
  timestamp: number;
}

export interface StreamAlert {
  level: "info" | "warning" | "critical";
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: number;
}

class StreamPerformanceMonitor {
  private static instance: StreamPerformanceMonitor;
  private metrics: StreamPerformanceMetrics[] = [];
  private alerts: StreamAlert[] = [];
  private monitoringInterval?: ReturnType<typeof setInterval>;

  // 阈值配置
  private readonly MAX_ACTIVE_STREAMS = 10;
  private readonly MAX_STREAM_LIFETIME_MS = 5 * 60 * 1000; // 5分钟
  private readonly MEMORY_WARNING_THRESHOLD_MB = 200;
  private readonly MEMORY_CRITICAL_THRESHOLD_MB = 300;

  private constructor() {}

  static getInstance(): StreamPerformanceMonitor {
    if (!StreamPerformanceMonitor.instance) {
      StreamPerformanceMonitor.instance = new StreamPerformanceMonitor();
    }
    return StreamPerformanceMonitor.instance;
  }

  /**
   * 开始监控
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      console.warn("[StreamMonitor] Already monitoring");
      return;
    }

    console.log("[StreamMonitor] Starting monitoring, interval:", intervalMs);

    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.checkAlerts();
    }, intervalMs);

    // 立即收集一次
    this.collectMetrics();
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      console.log("[StreamMonitor] Stopped monitoring");
    }
  }

  /**
   * 收集指标
   */
  private collectMetrics(): void {
    const streamStats = streamCleanupManager.getStats();
    const controllerStats = ChatControllerPool.getStats();

    // 估算内存使用（粗略）
    const estimatedMemoryUsage = this.estimateMemoryUsage(
      streamStats.active,
      controllerStats.active,
    );

    const metrics: StreamPerformanceMetrics = {
      activeStreams: streamStats.active,
      totalStreamsCreated: streamStats.total,
      avgStreamLifetime: streamStats.avgLifetime,
      streamsByProvider: streamStats.byProvider,
      activeControllers: controllerStats.active,
      avgControllerLifetime: controllerStats.avgLifetime,
      estimatedMemoryUsage,
      timestamp: Date.now(),
    };

    this.metrics.push(metrics);

    // 只保留最近 100 条记录
    if (this.metrics.length > 100) {
      this.metrics.shift();
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[StreamMonitor] Metrics:", metrics);
    }
  }

  /**
   * 检查警报
   */
  private checkAlerts(): void {
    const latest = this.metrics[this.metrics.length - 1];
    if (!latest) return;

    // 检查活跃流数量
    if (latest.activeStreams > this.MAX_ACTIVE_STREAMS) {
      this.addAlert({
        level: "warning",
        message: `Too many active streams: ${latest.activeStreams}`,
        metric: "activeStreams",
        value: latest.activeStreams,
        threshold: this.MAX_ACTIVE_STREAMS,
        timestamp: Date.now(),
      });
    }

    // 检查平均流生命周期
    if (latest.avgStreamLifetime > this.MAX_STREAM_LIFETIME_MS) {
      this.addAlert({
        level: "warning",
        message: `Long-running streams detected: ${(
          latest.avgStreamLifetime / 1000
        ).toFixed(1)}s`,
        metric: "avgStreamLifetime",
        value: latest.avgStreamLifetime,
        threshold: this.MAX_STREAM_LIFETIME_MS,
        timestamp: Date.now(),
      });
    }

    // 检查内存使用
    if (latest.estimatedMemoryUsage > this.MEMORY_CRITICAL_THRESHOLD_MB) {
      this.addAlert({
        level: "critical",
        message: `Critical memory usage: ${latest.estimatedMemoryUsage}MB`,
        metric: "estimatedMemoryUsage",
        value: latest.estimatedMemoryUsage,
        threshold: this.MEMORY_CRITICAL_THRESHOLD_MB,
        timestamp: Date.now(),
      });

      // 触发紧急清理
      this.triggerEmergencyCleanup();
    } else if (latest.estimatedMemoryUsage > this.MEMORY_WARNING_THRESHOLD_MB) {
      this.addAlert({
        level: "warning",
        message: `High memory usage: ${latest.estimatedMemoryUsage}MB`,
        metric: "estimatedMemoryUsage",
        value: latest.estimatedMemoryUsage,
        threshold: this.MEMORY_WARNING_THRESHOLD_MB,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 添加警报
   */
  private addAlert(alert: StreamAlert): void {
    this.alerts.push(alert);

    // 只保留最近 50 条警报
    if (this.alerts.length > 50) {
      this.alerts.shift();
    }

    // 打印警报
    const logFn = alert.level === "critical" ? console.error : console.warn;
    logFn(`[StreamMonitor] ${alert.level.toUpperCase()}: ${alert.message}`);

    // 发送自定义事件（可被其他组件监听）
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("stream:alert", { detail: alert }));
    }
  }

  /**
   * 估算内存使用
   */
  private estimateMemoryUsage(
    activeStreams: number,
    activeControllers: number,
  ): number {
    // 粗略估算：每个流约 1MB，每个控制器约 0.1MB
    const streamMemory = activeStreams * 1;
    const controllerMemory = activeControllers * 0.1;

    // 如果有 performance.memory API（Chrome）
    if (typeof window !== "undefined" && "memory" in performance) {
      const memory = (performance as any).memory;
      return Math.round(memory.usedJSHeapSize / (1024 * 1024));
    }

    return Math.round(streamMemory + controllerMemory);
  }

  /**
   * 触发紧急清理
   */
  private triggerEmergencyCleanup(): void {
    console.warn("[StreamMonitor] Triggering emergency cleanup!");

    // 通知其他组件进行清理
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("stream:emergency-cleanup", {
          detail: {
            reason: "High memory usage",
            timestamp: Date.now(),
          },
        }),
      );
    }
  }

  /**
   * 获取最新指标
   */
  getLatestMetrics(): StreamPerformanceMetrics | null {
    return this.metrics[this.metrics.length - 1] || null;
  }

  /**
   * 获取所有指标
   */
  getAllMetrics(): StreamPerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * 获取警报
   */
  getAlerts(level?: StreamAlert["level"]): StreamAlert[] {
    if (level) {
      return this.alerts.filter((a) => a.level === level);
    }
    return [...this.alerts];
  }

  /**
   * 清除警报
   */
  clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * 获取统计摘要
   */
  getSummary(): {
    current: StreamPerformanceMetrics | null;
    alerts: { info: number; warning: number; critical: number };
    trend: "improving" | "stable" | "degrading" | "unknown";
  } {
    const current = this.getLatestMetrics();
    const alertCounts = {
      info: this.alerts.filter((a) => a.level === "info").length,
      warning: this.alerts.filter((a) => a.level === "warning").length,
      critical: this.alerts.filter((a) => a.level === "critical").length,
    };

    // 简单的趋势分析
    let trend: "improving" | "stable" | "degrading" | "unknown" = "unknown";
    if (this.metrics.length >= 2) {
      const prev = this.metrics[this.metrics.length - 2];
      const curr = this.metrics[this.metrics.length - 1];

      if (
        curr.activeStreams < prev.activeStreams &&
        curr.estimatedMemoryUsage < prev.estimatedMemoryUsage
      ) {
        trend = "improving";
      } else if (
        curr.activeStreams > prev.activeStreams ||
        curr.estimatedMemoryUsage > prev.estimatedMemoryUsage
      ) {
        trend = "degrading";
      } else {
        trend = "stable";
      }
    }

    return { current, alerts: alertCounts, trend };
  }
}

// 导出单例
export const streamPerformanceMonitor = StreamPerformanceMonitor.getInstance();

// 开发环境下暴露到全局（已禁用 - 2025-11-28）
// if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
//   (window as any).__streamPerformanceMonitor = streamPerformanceMonitor;
// }

// 自动启动监控（生产环境每分钟，开发环境每30秒）
if (typeof window !== "undefined") {
  const interval = process.env.NODE_ENV === "development" ? 30000 : 60000;
  streamPerformanceMonitor.startMonitoring(interval);
}
