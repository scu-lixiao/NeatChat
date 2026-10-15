import { useState } from "react";
import clsx from "clsx";
import type { Citation } from "../store/chat";
import styles from "./citations.module.scss";
import Locale from "../locales";

// {{CHENGQI:
// Action: Modified - 简化Citations组件显示，只显示title作为链接
// Timestamp: 2025-01-02 17:25:00 +08:00
// Reason: 根据用户要求，修改为只显示title，url作为title的链接属性，点击在新窗口打开
// Principle_Applied: KISS - 简化UI显示，提供更清洁的界面
// Optimization: 移除URL显示，title直接作为可点击链接，减少视觉干扰
// Architectural_Note (AR): 简化的Citations组件提供更清洁的用户体验
// Documentation_Note (DW): 更新Citations组件为简化的链接显示模式
// }}

// Expanded state of each message's citations, kept outside the component so
// that a remount (the message leaving the rendered window and coming back, a
// session switch) doesn't reset it. In memory only: it isn't part of the chat
// store, so a toggle neither re-renders the chat nor gets persisted.
const expandedByMessage = new Map<string, boolean>();

export interface CitationsProps {
  citations: Citation[];
  /** Keeps the expanded state across remounts, per message */
  messageId?: string;
  /** Initial state when nothing is remembered for `messageId` */
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
}

export function Citations({
  citations,
  messageId,
  expanded = false,
  onToggle,
}: CitationsProps) {
  const [isExpanded, setIsExpanded] = useState(
    () =>
      (messageId === undefined
        ? undefined
        : expandedByMessage.get(messageId)) ?? expanded,
  );

  if (!citations || citations.length === 0) {
    return null;
  }

  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    if (messageId !== undefined) {
      expandedByMessage.set(messageId, newExpanded);
    }
    onToggle?.(newExpanded);
  };

  const handleCitationClick = (url: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className={styles["chat-message-citations"]}>
      <button
        type="button"
        className={styles["citations-header"]}
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
      >
        <span className={styles["citations-title"]}>
          {Locale.Chat.Citations.Title} ({citations.length})
        </span>
        <span className={styles["citations-toggle"]}>
          {isExpanded
            ? Locale.Chat.Citations.Collapse
            : Locale.Chat.Citations.Expand}
        </span>
      </button>

      <div
        className={clsx(styles["citations-content"], {
          [styles.expanded]: isExpanded,
        })}
        data-expanded={isExpanded ? "true" : "false"}
      >
        <div className={styles["citations-list"]}>
          {citations.map((citation, index) => (
            <div key={index} className={styles["citation-item"]}>
              <div className={styles["citation-index"]}>{index + 1}</div>
              <div className={styles["citation-content"]}>
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles["citation-title-link"]}
                  onClick={(e) => handleCitationClick(citation.url, e)}
                >
                  {citation.title}
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
