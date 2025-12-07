/**
 * Chat Controller Pool - 管理聊天消息流的 AbortController
 *
 * 增强功能：
 * 1. 完善的资源清理机制
 * 2. 超时自动清理
 * 3. 与 StreamCleanupManager 集成
 *
 * @enhanced 2025-11-23 by Claude-4-Sonnet
 */

import { streamCleanupManager } from "@/app/utils/stream-cleanup-manager";

interface ControllerContext {
  controller: AbortController;
  createdAt: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

// To store message streaming controller
export const ChatControllerPool = {
  controllers: {} as Record<string, ControllerContext>,

  // 默认超时时间：5分钟
  DEFAULT_TIMEOUT_MS: 5 * 60 * 1000,

  addController(
    sessionId: string,
    messageId: string,
    controller: AbortController,
  ) {
    const key = this.key(sessionId, messageId);
    this.controllers[key] = {
      controller,
      createdAt: Date.now(),
    };
    return key;
  },

  /**
   * 增强版：添加 controller 并设置超时自动清理
   */
  addWithTimeout(
    sessionId: string,
    messageId: string,
    controller: AbortController,
    timeoutMs?: number,
  ): string {
    const timeout = timeoutMs || ChatControllerPool.DEFAULT_TIMEOUT_MS;
    const key = this.key(sessionId, messageId);

    // 设置超时清理
    const timeoutId = setTimeout(() => {
      if (this.controllers[key]) {
        console.warn("[ChatController] Auto-cleanup timeout:", key);
        this.stopWithCleanup(sessionId, messageId);
      }
    }, timeout);

    this.controllers[key] = {
      controller,
      createdAt: Date.now(),
      timeoutId,
    };

    return key;
  },

  stop(sessionId: string, messageId: string) {
    const key = this.key(sessionId, messageId);
    const context = this.controllers[key];
    context?.controller.abort();
  },

  /**
   * 增强版：停止并完整清理资源
   */
  async stopWithCleanup(sessionId: string, messageId: string): Promise<void> {
    const key = this.key(sessionId, messageId);
    const context = this.controllers[key];

    if (!context) {
      return;
    }

    try {
      // 1. 清除超时定时器
      if (context.timeoutId) {
        clearTimeout(context.timeoutId);
      }

      // 2. 中止请求
      context.controller.abort();

      // 3. 等待短暂延迟确保清理完成（给事件监听器时间响应）
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 4. 通知 StreamCleanupManager 清理相关资源
      if (streamCleanupManager.has(key)) {
        await streamCleanupManager.cleanup(key);
      }

      // 5. 移除引用
      delete this.controllers[key];

      if (process.env.NODE_ENV === "development") {
        const lifetime = Date.now() - context.createdAt;
        console.log("[ChatController] Cleaned up controller:", key, {
          lifetime: `${(lifetime / 1000).toFixed(2)}s`,
        });
      }
    } catch (error) {
      console.error("[ChatController] Error during cleanup:", key, error);
      // 即使出错也要移除引用
      delete this.controllers[key];
    }
  },

  stopAll() {
    Object.keys(this.controllers).forEach((key) => {
      const [sessionId, messageId] = key.split(",");
      this.stopWithCleanup(sessionId, messageId);
    });
  },

  hasPending() {
    return Object.keys(this.controllers).length > 0;
  },

  remove(sessionId: string, messageId: string) {
    const key = this.key(sessionId, messageId);
    const context = this.controllers[key];

    // 清除超时定时器
    if (context?.timeoutId) {
      clearTimeout(context.timeoutId);
    }

    delete this.controllers[key];
  },

  key(sessionId: string, messageIndex: string) {
    return `${sessionId},${messageIndex}`;
  },

  /**
   * 获取统计信息
   */
  getStats() {
    const now = Date.now();
    const controllers = Object.values(this.controllers);

    return {
      active: controllers.length,
      avgLifetime:
        controllers.length > 0
          ? controllers.reduce((sum, c) => sum + (now - c.createdAt), 0) /
            controllers.length
          : 0,
    };
  },
};
