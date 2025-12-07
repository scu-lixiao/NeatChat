/**
 * Stream Cleanup Manager - 统一的流资源清理管理器
 *
 * 功能：
 * 1. 追踪所有活跃的流和相关资源
 * 2. 自动清理超时或挂起的流
 * 3. 提供统一的清理接口
 * 4. 防止内存泄漏
 *
 * 使用 WeakMap 确保在流对象被 GC 时自动释放追踪信息
 *
 * @author Claude-4-Sonnet
 * @date 2025-11-23
 */

export interface CleanupContext {
  cleanup: () => void;
  timestamp: number;
  streamId: string;
  provider?: string;
  abortController?: AbortController;
  animationFrameId?: number;
}

export interface StreamStats {
  active: number;
  total: number;
  avgLifetime: number;
  byProvider: Record<string, number>;
}

class StreamCleanupManager {
  private static instance: StreamCleanupManager;

  // 使用 Map 而不是 WeakMap，因为需要主动追踪和定期清理
  private activeStreams = new Map<string, CleanupContext>();
  private totalStreamsCreated = 0;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  // 配置参数
  private readonly MAX_STREAM_AGE = 5 * 60 * 1000; // 5分钟
  private readonly CLEANUP_INTERVAL = 30 * 1000; // 30秒检查一次

  private constructor() {
    // 启动定期清理
    this.startPeriodicCleanup();

    // 监听页面卸载，清理所有资源
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.cleanupAll());

      // {{CHENGQI:
      // Action: Disabled - iPad thinking mode 修复
      // Timestamp: 2025-11-24 Claude 4.5 sonnet
      // Reason: visibilitychange 在 iPad 上会误触发,导致 thinking mode 流被清理
      // Bug_Fixed: iPad打开开发者工具或切换标签页时会触发document.hidden
      // Principle_Applied: 不干预正常的用户交互流程
      // Optimization: 移除过度的资源管理,让流自然结束
      // Architectural_Note (AR): visibilitychange 在移动端行为不稳定
      // Documentation_Note (DW): 禁用页面可见性监听以修复 iPad thinking mode
      // }}
      // 监听页面可见性变化（移动端重要）
      // 暂时禁用 - 在iPad上会导致thinking mode流被意外清理
      // document.addEventListener('visibilitychange', () => {
      //   if (document.hidden) {
      //     this.pauseLongRunningStreams();
      //   }
      // });
    }
  }

  static getInstance(): StreamCleanupManager {
    if (!StreamCleanupManager.instance) {
      StreamCleanupManager.instance = new StreamCleanupManager();
    }
    return StreamCleanupManager.instance;
  }

  /**
   * 注册一个流和其清理函数
   */
  register(
    streamId: string,
    context: Omit<CleanupContext, "timestamp" | "streamId">,
  ): void {
    if (this.activeStreams.has(streamId)) {
      console.warn("[StreamCleanup] Stream already registered:", streamId);
      return;
    }

    this.activeStreams.set(streamId, {
      ...context,
      streamId,
      timestamp: Date.now(),
    });

    this.totalStreamsCreated++;

    if (process.env.NODE_ENV === "development") {
      console.log("[StreamCleanup] Registered stream:", streamId, {
        active: this.activeStreams.size,
        provider: context.provider,
      });
    }
  }

  /**
   * 清理指定的流
   */
  async cleanup(streamId: string): Promise<boolean> {
    const context = this.activeStreams.get(streamId);
    if (!context) {
      return false;
    }

    try {
      // 1. 取消动画帧
      if (context.animationFrameId) {
        cancelAnimationFrame(context.animationFrameId);
      }

      // 2. 中止请求
      if (context.abortController) {
        context.abortController.abort();
      }

      // 3. 执行自定义清理函数
      if (context.cleanup) {
        context.cleanup();
      }

      // 4. 移除追踪
      this.activeStreams.delete(streamId);

      if (process.env.NODE_ENV === "development") {
        const lifetime = Date.now() - context.timestamp;
        console.log("[StreamCleanup] Cleaned up stream:", streamId, {
          lifetime: `${(lifetime / 1000).toFixed(2)}s`,
          remaining: this.activeStreams.size,
        });
      }

      return true;
    } catch (error) {
      console.error(
        "[StreamCleanup] Error cleaning up stream:",
        streamId,
        error,
      );
      // 即使出错也要移除追踪，防止泄漏
      this.activeStreams.delete(streamId);
      return false;
    }
  }

  /**
   * 强制清理超时的流
   */
  private cleanupTimeoutStreams(): number {
    const now = Date.now();
    const toCleanup: string[] = [];

    for (const [streamId, context] of this.activeStreams.entries()) {
      const age = now - context.timestamp;
      if (age > this.MAX_STREAM_AGE) {
        toCleanup.push(streamId);
      }
    }

    if (toCleanup.length > 0) {
      console.warn(
        "[StreamCleanup] Cleaning up timeout streams:",
        toCleanup.length,
      );
      toCleanup.forEach((id) => this.cleanup(id));
    }

    return toCleanup.length;
  }

  /**
   * 启动定期清理
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      const cleaned = this.cleanupTimeoutStreams();

      if (process.env.NODE_ENV === "development" && cleaned > 0) {
        console.log("[StreamCleanup] Periodic cleanup:", {
          cleaned,
          active: this.activeStreams.size,
          total: this.totalStreamsCreated,
        });
      }
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * 停止定期清理
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * 暂停长时间运行的流（页面隐藏时）
   */
  private pauseLongRunningStreams(): void {
    const now = Date.now();
    const PAUSE_THRESHOLD = 2 * 60 * 1000; // 2分钟

    for (const [streamId, context] of this.activeStreams.entries()) {
      const age = now - context.timestamp;
      if (age > PAUSE_THRESHOLD) {
        console.log("[StreamCleanup] Pausing long-running stream:", streamId);
        // 可以选择暂停或直接清理
        this.cleanup(streamId);
      }
    }
  }

  /**
   * 清理所有流
   */
  cleanupAll(): void {
    console.log(
      "[StreamCleanup] Cleaning up all streams:",
      this.activeStreams.size,
    );

    const streamIds = Array.from(this.activeStreams.keys());
    streamIds.forEach((id) => this.cleanup(id));

    this.stopPeriodicCleanup();
  }

  /**
   * 获取统计信息
   */
  getStats(): StreamStats {
    const now = Date.now();
    let totalLifetime = 0;
    const byProvider: Record<string, number> = {};

    for (const context of this.activeStreams.values()) {
      totalLifetime += now - context.timestamp;

      if (context.provider) {
        byProvider[context.provider] = (byProvider[context.provider] || 0) + 1;
      }
    }

    return {
      active: this.activeStreams.size,
      total: this.totalStreamsCreated,
      avgLifetime:
        this.activeStreams.size > 0
          ? totalLifetime / this.activeStreams.size
          : 0,
      byProvider,
    };
  }

  /**
   * 检查是否存在指定的流
   */
  has(streamId: string): boolean {
    return this.activeStreams.has(streamId);
  }

  /**
   * 获取活跃流的数量
   */
  getActiveCount(): number {
    return this.activeStreams.size;
  }
}

// 导出单例
export const streamCleanupManager = StreamCleanupManager.getInstance();

// 开发环境下暴露到全局，方便调试
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as any).__streamCleanupManager = streamCleanupManager;
}
