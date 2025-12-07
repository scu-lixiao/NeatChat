/**
 * iPadOS Optimized Chat Container
 *
 * Purpose: Example integration of all iPadOS optimizations
 * Demonstrates usage of:
 * - Device detection & effect grading
 * - Virtual scrolling
 * - Touch gestures
 * - Memory management
 * - iPad-specific adaptations
 */

import React, { useRef, useEffect } from "react";
import { VirtualChatList } from "./virtual-chat-list";
import { useIPadOSEffects } from "../hooks/useIPadOSEffects";
import { useMemoryMonitor } from "../hooks/useMemoryManager";
import {
  useTouchGestures,
  useScrollOptimization,
} from "../hooks/useTouchGestures";
import { useResponsiveLayout } from "../hooks/useIPadOSAdaptations";
import type { ChatMessage } from "../store/chat";

export interface IPadOSChatContainerProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  onDeleteMessage: (id: string) => void;
  className?: string;
}

/**
 * Example: Fully optimized chat container for iPadOS
 */
export function IPadOSChatContainer({
  messages,
  onSendMessage,
  onDeleteMessage,
  className,
}: IPadOSChatContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<any>(null);

  // 1. Device detection & effect grading
  const {
    deviceInfo,
    effectLevel,
    effectSettings,
    isLoading: deviceLoading,
    avgFPS,
  } = useIPadOSEffects();

  // 2. Memory monitoring
  const { memoryInfo, pressure } = useMemoryMonitor(5000);

  // 3. iPadOS environment tracking
  const { env, layout, isCompactView } = useResponsiveLayout();

  // 4. Touch gestures
  useTouchGestures(containerRef, {
    onSwipeLeft: () => {
      // Navigate to next chat
      console.log("[Gesture] Swipe left");
    },
    onSwipeRight: () => {
      // Navigate to previous chat
      console.log("[Gesture] Swipe right");
    },
    onSwipeDown: () => {
      // Refresh messages
      console.log("[Gesture] Swipe down");
    },
    onLongPress: (x, y) => {
      // Show context menu
      console.log("[Gesture] Long press at", x, y);
    },
  });

  // 5. Scroll optimization
  useScrollOptimization(containerRef);

  // 6. Log device info (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && deviceInfo) {
      console.log("[iPadOS] Device Info:", {
        model: deviceInfo.model,
        chipset: deviceInfo.chipset,
        metalVersion: deviceInfo.metalVersion,
        webGPUSupported: deviceInfo.supportsWebGPU,
        effectLevel,
        avgFPS,
      });

      console.log("[iPadOS] Environment:", {
        multitaskingMode: env.multitaskingMode,
        splitView: env.isSplitView,
        stageManager: env.isStageManager,
        viewportSize: `${env.viewportWidth}x${env.viewportHeight}`,
      });

      if (memoryInfo) {
        console.log("[Memory]:", {
          usage: `${memoryInfo.usagePercentage.toFixed(1)}%`,
          pressure: pressure?.level,
          recommendedLimit: pressure?.recommendedMessageLimit,
        });
      }
    }
  }, [deviceInfo, effectLevel, avgFPS, env, memoryInfo, pressure]);

  // 7. Auto-prune messages if memory pressure
  const displayMessages = React.useMemo(() => {
    if (pressure?.shouldPrune) {
      return messages.slice(-pressure.recommendedMessageLimit);
    }
    return messages;
  }, [messages, pressure]);

  // 8. Render message component
  const renderMessage = React.useCallback(
    (message: ChatMessage, index: number) => {
      return (
        <div
          className="chat-message"
          data-role={message.role}
          style={{
            padding: layout.spacing === "minimal" ? "8px" : "16px",
            fontSize: layout.fontSize === "small" ? "14px" : "16px",
          }}
        >
          <div className="message-content">
            {typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content)}
          </div>
          {/* Add more message UI here */}
        </div>
      );
    },
    [layout],
  );

  // 9. Apply effect-specific class
  const containerClass = [
    className,
    `effect-${effectLevel}`,
    isCompactView ? "compact-view" : "",
    env.isSplitView ? "split-view" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (deviceLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">加载中...</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={containerClass}>
      {/* Performance stats overlay (dev only) */}
      {process.env.NODE_ENV === "development" && (
        <div
          style={{
            position: "fixed",
            top: 10,
            right: 10,
            background: "rgba(0,0,0,0.8)",
            color: "white",
            padding: "8px",
            fontSize: "12px",
            borderRadius: "4px",
            zIndex: 9999,
          }}
        >
          <div>FPS: {avgFPS}</div>
          <div>Effect: {effectLevel}</div>
          <div>Messages: {displayMessages.length}</div>
          {memoryInfo && (
            <div>Memory: {memoryInfo.usagePercentage.toFixed(1)}%</div>
          )}
          <div>Mode: {env.multitaskingMode}</div>
        </div>
      )}

      {/* Virtual scrolling message list */}
      <VirtualChatList
        ref={listRef}
        messages={displayMessages}
        renderMessage={renderMessage}
        className="message-list"
        autoScroll={true}
        overscan={isCompactView ? 3 : 8}
        onScroll={(scrollTop, scrollHeight, clientHeight) => {
          // Track scroll position
        }}
      />

      {/* Warning for high memory pressure */}
      {pressure?.level === "critical" && (
        <div className="memory-warning">
          ⚠️ 内存压力较高，已自动优化消息显示
        </div>
      )}
    </div>
  );
}

/**
 * CSS Module styles example
 */
export const styles = `
/* Effect level variations */
.effect-full {
  backdrop-filter: blur(20px);
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.effect-reduced {
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
}

.effect-minimal {
  backdrop-filter: none;
  background: rgba(255, 255, 255, 0.02);
  box-shadow: none;
}

/* Compact view adaptations */
.compact-view .chat-message {
  padding: 8px !important;
  font-size: 14px !important;
}

.compact-view .message-avatar {
  width: 32px;
  height: 32px;
}

/* Split View adaptations */
.split-view .sidebar {
  display: none;
}

.split-view .main-content {
  width: 100%;
}

/* iPad-optimized scrolling */
.message-list {
  -webkit-overflow-scrolling: touch;
  contain: layout style paint;
  will-change: scroll-position;
}

/* Memory warning */
.memory-warning {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 165, 0, 0.9);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 1000;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translate(-50%, 20px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}
`;
