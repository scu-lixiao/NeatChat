/**
 * {{CHENGQI:
 * Action: Created
 * Timestamp: 2025-06-10 18:44:40 +08:00
 * Reason: P3-AR-018任务执行 - 创建性能监控可视化组件
 * Principle_Applied: KISS(简洁UI设计)、SOLID-S(单一职责监控显示)、用户体验优化
 * Optimization: 实时更新、响应式设计、可折叠界面、开发调试友好
 * Architectural_Note (AR): 基于usePerformanceAdapter Hook，遵循React组件最佳实践
 * Documentation_Note (DW): 完整Props类型定义，清晰的组件职责划分，便于维护
 * }}
 */

import React, { useState } from "react";
import {
  usePerformanceAdapter,
  usePerformanceMetrics,
} from "../../hooks/usePerformanceAdapter";
import { PerformanceLevel } from "../../utils/performance-adapter";

// ==================== 组件类型定义 ====================

export interface PerformanceMonitorProps {
  // 显示配置
  showMetrics?: boolean;
  showSettings?: boolean;
  showDeviceInfo?: boolean;

  // 布局配置
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  collapsible?: boolean;
  initialCollapsed?: boolean;

  // 样式配置
  compact?: boolean;
  className?: string;

  // 开发调试配置
  enableDebugMode?: boolean;
}

// ==================== 子组件 - 性能指标显示 ====================

const MetricsDisplay: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { currentMetrics, averageMetrics, isMonitoring } =
    usePerformanceMetrics();

  if (!isMonitoring) {
    return (
      <div className="performance-metrics-disabled">
        <span>性能监控已禁用</span>
      </div>
    );
  }

  if (!currentMetrics) {
    return (
      <div className="performance-metrics-loading">
        <span>正在收集性能数据...</span>
      </div>
    );
  }

  return (
    <div className={`performance-metrics ${compact ? "compact" : ""}`}>
      <div className="metrics-grid">
        <div className="metric-item">
          <label>FPS</label>
          <span
            className={`metric-value ${
              currentMetrics.fps < 30
                ? "warning"
                : currentMetrics.fps < 50
                ? "caution"
                : "good"
            }`}
          >
            {currentMetrics.fps}
          </span>
        </div>

        <div className="metric-item">
          <label>帧时间</label>
          <span className="metric-value">
            {currentMetrics.frameTime.toFixed(1)}ms
          </span>
        </div>

        {currentMetrics.memoryUsage && (
          <div className="metric-item">
            <label>内存</label>
            <span className="metric-value">{currentMetrics.memoryUsage}MB</span>
          </div>
        )}

        {!compact && averageMetrics && (
          <>
            <div className="metric-item">
              <label>平均FPS</label>
              <span className="metric-value">{averageMetrics.fps}</span>
            </div>

            <div className="metric-item">
              <label>平均帧时间</label>
              <span className="metric-value">
                {averageMetrics.frameTime.toFixed(1)}ms
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ==================== 子组件 - 性能设置控制 ====================

const PerformanceSettings: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const {
    profile,
    preferences,
    setPerformanceLevel,
    toggleAutoDetection,
    togglePerformanceMonitoring,
  } = usePerformanceAdapter();

  const { currentMetrics, averageMetrics } = usePerformanceMetrics();

  const performanceLevels: {
    value: PerformanceLevel;
    label: string;
    description: string;
  }[] = [
    { value: "eco", label: "节能模式", description: "最小化效果，优化性能" },
    { value: "balanced", label: "平衡模式", description: "平衡效果与性能" },
    { value: "high", label: "高性能", description: "丰富效果，需要良好硬件" },
    {
      value: "extreme",
      label: "极致模式",
      description: "最大效果，需要高端硬件",
    },
  ];

  // {{CHENGQI:
  // Action: Added - 添加性能报告导出功能
  // Timestamp: 2025-11-23 07:00:00 +08:00
  // Reason: 阶段 3.3 - 提供完整的性能监控和调试工具
  // Principle_Applied: 用户体验优先，提供完整的性能报告
  // Optimization: 导出 JSON 格式，便于分析和分享
  // Architectural_Note (AR): 使用 Blob 和 URL.createObjectURL 实现下载
  // Documentation_Note (DW): 性能报告导出功能，提供完整的性能数据
  // }}
  const exportPerformanceReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      device: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        cpuCores: profile?.capabilities?.cpuCores,
        deviceMemory: profile?.capabilities?.deviceMemory,
        screenSize: profile?.capabilities?.screenSize,
        pixelRatio: profile?.capabilities?.pixelRatio,
        webglSupport: profile?.capabilities?.webglSupport,
        webgl2Support: profile?.capabilities?.webgl2Support,
        hardwareAcceleration: profile?.capabilities?.hardwareAcceleration,
        effectiveConnectionType: profile?.capabilities?.effectiveConnectionType,
      },
      performance: {
        level: profile?.level,
        score: profile?.score,
        currentMetrics: currentMetrics,
        averageMetrics: averageMetrics,
      },
      preferences: preferences,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `performance-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("[PerformanceMonitor] Performance report exported:", report);
  };

  return (
    <div className={`performance-settings ${compact ? "compact" : ""}`}>
      <div className="settings-section">
        <label className="settings-label">性能级别</label>
        <select
          value={preferences.manualLevel || profile?.level || "balanced"}
          onChange={(e) =>
            setPerformanceLevel(e.target.value as PerformanceLevel)
          }
          className="performance-level-select"
        >
          {performanceLevels.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
        {!compact && (
          <small className="setting-description">
            {
              performanceLevels.find(
                (l) => l.value === (preferences.manualLevel || profile?.level),
              )?.description
            }
          </small>
        )}
      </div>

      <div className="settings-section">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={preferences.enableAutoDetection}
            onChange={toggleAutoDetection}
          />
          <span>自动检测设备性能</span>
        </label>
        {!compact && (
          <small className="setting-description">
            根据设备能力自动调整性能级别
          </small>
        )}
      </div>

      <div className="settings-section">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={preferences.enablePerformanceMonitoring}
            onChange={togglePerformanceMonitoring}
          />
          <span>实时性能监控</span>
        </label>
        {!compact && (
          <small className="setting-description">监控FPS和内存使用情况</small>
        )}
      </div>

      {/* {{CHENGQI:
        Action: Added - 添加导出按钮
        Timestamp: 2025-11-23 07:05:00 +08:00
        Reason: 阶段 3.3 - 提供性能报告导出功能
        Principle_Applied: 用户体验优先，清晰的视觉反馈
        Optimization: 使用 premium 主题样式
        Architectural_Note (AR): 遵循现有样式架构
        Documentation_Note (DW): 性能报告导出按钮
      }} */}
      <div className="settings-section">
        <button
          className="export-report-button"
          onClick={exportPerformanceReport}
        >
          📊 导出性能报告
        </button>
        {!compact && (
          <small className="setting-description">
            导出完整的性能数据和设备信息
          </small>
        )}
      </div>
    </div>
  );
};

// ==================== 子组件 - 设备信息显示 ====================

const DeviceInfo: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { profile } = usePerformanceAdapter();

  if (!profile?.capabilities) {
    return null;
  }

  const { capabilities } = profile;

  return (
    <div className={`device-info ${compact ? "compact" : ""}`}>
      <div className="info-grid">
        <div className="info-item">
          <label>性能评分</label>
          <span className="info-value">{profile.score}/100</span>
        </div>

        <div className="info-item">
          <label>CPU核心</label>
          <span className="info-value">{capabilities.cpuCores}</span>
        </div>

        <div className="info-item">
          <label>屏幕分辨率</label>
          <span className="info-value">
            {capabilities.screenSize.width}×{capabilities.screenSize.height}
          </span>
        </div>

        <div className="info-item">
          <label>像素比</label>
          <span className="info-value">
            {capabilities.pixelRatio.toFixed(1)}
          </span>
        </div>

        {!compact && (
          <>
            {capabilities.deviceMemory && (
              <div className="info-item">
                <label>设备内存</label>
                <span className="info-value">
                  {capabilities.deviceMemory}GB
                </span>
              </div>
            )}

            <div className="info-item">
              <label>WebGL支持</label>
              <span className="info-value">
                {capabilities.webgl2Support
                  ? "WebGL 2.0"
                  : capabilities.webglSupport
                  ? "WebGL 1.0"
                  : "不支持"}
              </span>
            </div>

            <div className="info-item">
              <label>硬件加速</label>
              <span className="info-value">
                {capabilities.hardwareAcceleration ? "✓" : "✗"}
              </span>
            </div>

            {capabilities.effectiveConnectionType && (
              <div className="info-item">
                <label>网络类型</label>
                <span className="info-value">
                  {capabilities.effectiveConnectionType.toUpperCase()}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ==================== 主组件 ====================

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  showMetrics = true,
  showSettings = true,
  showDeviceInfo = false,
  position = "top-right",
  collapsible = true,
  initialCollapsed = false,
  compact = false,
  className = "",
  enableDebugMode = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [activeTab, setActiveTab] = useState<"metrics" | "settings" | "device">(
    "metrics",
  );

  const { profile, isInitialized, isLoading } = usePerformanceAdapter({
    enableDebugLogging: enableDebugMode,
  });

  // 计算显示的标签页
  const availableTabs = [
    showMetrics && { id: "metrics" as const, label: "性能指标", icon: "📊" },
    showSettings && { id: "settings" as const, label: "设置", icon: "⚙️" },
    showDeviceInfo && { id: "device" as const, label: "设备信息", icon: "💻" },
  ].filter(Boolean) as Array<{
    id: "metrics" | "settings" | "device";
    label: string;
    icon: string;
  }>;

  if (!isInitialized && !isLoading) {
    return null;
  }

  return (
    <div
      className={`performance-monitor performance-monitor--${position} ${
        compact ? "compact" : ""
      } ${className}`}
      data-collapsed={isCollapsed}
    >
      {/* 标题栏 */}
      <div className="performance-monitor-header">
        <div className="monitor-title">
          <span className="title-icon">⚡</span>
          <span className="title-text">性能监控</span>
          {profile && (
            <span
              className={`performance-badge performance-badge--${profile.level}`}
            >
              {profile.level.toUpperCase()}
            </span>
          )}
        </div>

        {collapsible && (
          <button
            className="collapse-button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? "展开" : "折叠"}
          >
            {isCollapsed ? "▲" : "▼"}
          </button>
        )}
      </div>

      {/* 内容区域 */}
      {!isCollapsed && (
        <div className="performance-monitor-content">
          {/* 标签页导航 */}
          {availableTabs.length > 1 && (
            <div className="monitor-tabs">
              {availableTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`tab-button ${
                    activeTab === tab.id ? "active" : ""
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="tab-icon">{tab.icon}</span>
                  {!compact && <span className="tab-label">{tab.label}</span>}
                </button>
              ))}
            </div>
          )}

          {/* 内容显示 */}
          <div className="monitor-content">
            {isLoading && (
              <div className="loading-state">
                <span>正在初始化性能监控...</span>
              </div>
            )}

            {!isLoading && (
              <>
                {activeTab === "metrics" && showMetrics && (
                  <MetricsDisplay compact={compact} />
                )}

                {activeTab === "settings" && showSettings && (
                  <PerformanceSettings compact={compact} />
                )}

                {activeTab === "device" && showDeviceInfo && (
                  <DeviceInfo compact={compact} />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== 便捷组件导出 ====================

/**
 * 简化的性能指标显示组件
 */
export const SimplePerformanceMetrics: React.FC<{ className?: string }> = ({
  className,
}) => (
  <PerformanceMonitor
    showMetrics={true}
    showSettings={false}
    showDeviceInfo={false}
    collapsible={false}
    compact={true}
    className={className}
  />
);

/**
 * 开发者调试用的完整性能面板
 */
export const DeveloperPerformancePanel: React.FC<{ className?: string }> = ({
  className,
}) => (
  <PerformanceMonitor
    showMetrics={true}
    showSettings={true}
    showDeviceInfo={true}
    position="bottom-left"
    collapsible={true}
    initialCollapsed={false}
    compact={false}
    enableDebugMode={true}
    className={className}
  />
);

export default PerformanceMonitor;
