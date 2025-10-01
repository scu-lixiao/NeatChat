// {{CHENGQI:
// Action: Modified - 思考窗口React组件 - 图标系统统一和动态标题
// Timestamp: 2025-06-12T09:53:22+08:00
// Reason: 用户要求图标与原系统保持一致，标题动态变化（思考中/完成）
// Principle_Applied: SOLID - 保持组件接口一致性；DRY - 复用系统图标
// Optimization: 使用系统BrainIcon + 动态标题逻辑
// Architectural_Note (AR): 图标系统统一，遵循现有导入模式
// Documentation_Note (DW): 动态标题提升用户体验，图标保持系统一致性
// }}

import React, { useState, useEffect, useRef } from "react";
import styles from "./thinking-window.module.scss";
import clsx from "clsx";
import BrainIcon from "../icons/brain.svg";

interface ThinkingWindowProps {
  content: string;
  isStreaming?: boolean;
  onToggle?: (expanded: boolean) => void;
  onContentUpdate?: () => void;
}

export function ThinkingWindow({
  content,
  isStreaming = false,
  onToggle,
  onContentUpdate
}: ThinkingWindowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // 检查内容是否超过200px高度
  useEffect(() => {
    if (textRef.current) {
      const scrollHeight = textRef.current.scrollHeight;
      setNeedsExpansion(scrollHeight > 200);
    }
  }, [content]);

  // 自动滚动到底部（流式更新时）
  useEffect(() => {
    if (isStreaming && textRef.current) {
      // 延迟执行确保DOM更新完成
      const timer = setTimeout(() => {
        if (textRef.current) {
          textRef.current.scrollTop = textRef.current.scrollHeight;
        }

        // 通知父组件触发主页面滚动
        if (onContentUpdate) {
          // 使用requestAnimationFrame确保DOM更新完成后再触发主页面滚动
          requestAnimationFrame(() => {
            onContentUpdate();
          });
        }
      }, 10);

      return () => clearTimeout(timer);
    }
  }, [content, isStreaming, onContentUpdate]);

  const handleToggle = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onToggle?.(newExpanded);
    
    // 展开时滚动到底部显示最新内容
    if (newExpanded && textRef.current) {
      setTimeout(() => {
        if (textRef.current) {
          textRef.current.scrollTop = textRef.current.scrollHeight;
        }
      }, 100); // 等待动画完成
    }
  };

  const handleExpandHintClick = () => {
    setIsExpanded(true);
    onToggle?.(true);
    
    // 展开时滚动到底部显示最新内容
    setTimeout(() => {
      if (textRef.current) {
        textRef.current.scrollTop = textRef.current.scrollHeight;
      }
    }, 100); // 等待动画完成
  };

  // 如果没有内容，不显示组件
  if (!content || content.trim().length === 0) {
    return null;
  }

  // {{CHENGQI:
  // Action: Added - 动态标题逻辑
  // Timestamp: 2025-06-12T09:53:22+08:00
  // Reason: 根据isStreaming状态动态显示标题文本
  // Principle_Applied: KISS - 简单的条件渲染逻辑
  // Optimization: 直接在渲染中判断，避免额外状态
  // }}
  const getTitle = () => {
    return isStreaming ? "正在思考" : "深度思考";
  };

  return (
    <div className={styles["thinking-window"]}>
      {/* 头部 - 标题和展开按钮 */}
      <div className={styles["thinking-header"]} onClick={handleToggle}>
        <div className={styles["thinking-title"]}>
          {/* {{CHENGQI:
          // Action: Modified - 使用系统BrainIcon替换emoji
          // Timestamp: 2025-06-12T09:53:22+08:00
          // Reason: 保持与系统其他组件图标风格一致
          // Principle_Applied: DRY - 复用现有图标系统
          // Optimization: SVG图标更清晰，主题适配更好
          // }} */}
          <BrainIcon className={styles["thinking-icon"]} />
          <span>{getTitle()}</span>
          {/* {{CHENGQI:
          // Action: Modified - 流式状态的视觉指示器调整
          // Timestamp: 2025-06-12T09:53:22+08:00
          // Reason: 配合动态标题，简化流式状态显示
          // Principle_Applied: KISS - 减少视觉干扰，突出主要信息
          // Optimization: 仅在必要时显示额外指示器
          // }} */}
          {isStreaming && <span className={styles["thinking-streaming"]}>⋯</span>}
        </div>
        {needsExpansion && (
          <button 
            className={clsx(styles["expand-button"], {
              [styles.expanded]: isExpanded
            })}
            aria-label={isExpanded ? "收起思考内容" : "展开思考内容"}
          >
            ▼
          </button>
        )}
      </div>

      {/* 内容区域 */}
      <div 
        className={clsx(styles["thinking-content"], {
          [styles.collapsed]: !isExpanded,
          [styles.expanded]: isExpanded
        })}
        ref={contentRef}
      >
        <div 
          ref={textRef}
          className={clsx(styles["thinking-text"], {
            [styles.scrollable]: !isExpanded && needsExpansion,
            [styles.expandedScrollable]: isExpanded
          })}
        >
          {content}
        </div>

        {/* 渐变遮罩 - 在收起状态且内容超长时显示 */}
        {!isExpanded && needsExpansion && (
          <div className={clsx(styles["fade-overlay"])} />
        )}
      </div>

      {/* 展开提示 - 在收起状态且内容超长时显示 */}
      {!isExpanded && needsExpansion && (
        <div 
          className={styles["expand-hint"]}
          onClick={handleExpandHintClick}
        >
          点击查看完整思考过程 ({content.length} 字符)
        </div>
      )}
    </div>
  );
}

export default ThinkingWindow; 