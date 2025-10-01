import { useState, useRef, useEffect } from "react";
import { Citation } from "../store/chat";
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

export interface CitationsProps {
  citations: Citation[];
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
}

export function Citations({ citations, expanded = false, onToggle }: CitationsProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      const height = contentRef.current.scrollHeight;
      setContentHeight(height);
    }
  }, [citations, isExpanded]);

  if (!citations || citations.length === 0) {
    return null;
  }

  const toggleExpanded = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onToggle?.(newExpanded);
  };

  const handleCitationClick = (url: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className={styles["chat-message-citations"]}>
      <div className={styles["citations-header"]} onClick={toggleExpanded}>
        <span className={styles["citations-title"]}>
          {Locale.Chat.Citations.Title} ({citations.length})
        </span>
        <span className={styles["citations-toggle"]}>
          {isExpanded ? Locale.Chat.Citations.Collapse : Locale.Chat.Citations.Expand}
        </span>
      </div>
      
      <div 
        className={`${styles["citations-content"]} ${isExpanded ? styles["expanded"] : ""}`}
        style={{
          maxHeight: isExpanded ? `${Math.min(contentHeight + 20, 600)}px` : '0px'
        }}
      >
        <div ref={contentRef} className={styles["citations-list"]}>
          {citations.map((citation, index) => (
            <div
              key={index}
              className={styles["citation-item"]}
            >
              <div className={styles["citation-index"]}>
                {index + 1}
              </div>
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