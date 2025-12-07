/**
 * WebGPU-Enhanced HoloCard Component
 *
 * Purpose: Demonstration of GPU-accelerated backdrop-filter
 * This component uses WebGPU when available on M4 iPad Pro
 */

"use client";

import React from "react";
import { useWebGPUBackdrop } from "../../hooks/useWebGPUEffects";
import styles from "./HoloCard.module.scss";

export interface WebGPUHoloCardProps {
  children: React.ReactNode;
  blurIntensity?: "subtle" | "normal" | "intense" | "extreme";
  className?: string;
  style?: React.CSSProperties;
}

export function WebGPUHoloCard({
  children,
  blurIntensity = "normal",
  className = "",
  style = {},
}: WebGPUHoloCardProps) {
  const { canvasRef, backdropStyle, useWebGPU } =
    useWebGPUBackdrop(blurIntensity);

  // {{CHENGQI:
  // Action: Added - WebGPU层级策略文档
  // Timestamp: 2025-11-25 Claude 4.5 sonnet
  // Reason: 明确WebGPU canvas的层级策略，防止覆盖交互内容
  // Bug_Prevention: canvas必须为zIndex:0且pointerEvents:'none'
  // Principle_Applied: 明确的分层策略 - canvas作为背景层，内容作为前景层
  // Optimization: 确保所有交互元素都在canvas之上（zIndex >= 1）
  // Architectural_Note (AR): WebGPU只用于背景效果，不干扰DOM交互
  // Documentation_Note (DW): WebGPU canvas层级策略文档化
  // }}
  return (
    <div
      className={`${styles.holoCard} ${className}`}
      style={{ ...backdropStyle, ...style, position: "relative" }}
    >
      {useWebGPU && (
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none", // 关键：不拦截鼠标事件
            zIndex: 0, // 关键：canvas作为背景层
          }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>

      {/* WebGPU/CSS 状态标签 (已禁用 - 2025-11-28) */}
      {false && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            padding: "2px 6px",
            background: useWebGPU
              ? "rgba(0, 255, 0, 0.2)"
              : "rgba(255, 165, 0, 0.2)",
            color: useWebGPU ? "#0f0" : "#fa0",
            fontSize: "10px",
            borderRadius: "3px",
            fontFamily: "monospace",
            zIndex: 1000,
          }}
        >
          {useWebGPU ? "WebGPU" : "CSS"}
        </div>
      )}
    </div>
  );
}
