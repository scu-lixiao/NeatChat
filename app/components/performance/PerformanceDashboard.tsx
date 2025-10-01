import React, { useState } from 'react';
import { usePerformanceContext, usePerformanceStats } from './PerformanceMonitorProvider';
import { DevicePerformance, AnimationQuality } from '../../hooks/usePerformanceMonitor';

// {{CHENGQI:
// Action: Modified
// Timestamp: 2025-06-10 18:40:49 +08:00
// Reason: 修复 activeAnimations 属性错误，直接使用 performanceContext.activeAnimations
// Principle_Applied: TypeScript类型安全，避免属性访问错误
// Optimization: 统一使用 performanceContext 获取完整状态
// Architectural_Note (AR): 遵循React组件设计模式，分离展示逻辑和业务逻辑
// Documentation_Note (DW): 完整的仪表板功能说明，清晰的交互说明和可访问性支持
// }}

// 性能等级颜色映射
const getPerformanceColor = (performance: DevicePerformance): string => {
  switch (performance) {
    case DevicePerformance.ULTRA:
      return '#00ffff'; // 青色
    case DevicePerformance.HIGH:
      return '#00ff88'; // 绿色
    case DevicePerformance.MEDIUM:
      return '#ffff00'; // 黄色
    case DevicePerformance.LOW:
      return '#ff4444'; // 红色
    default:
      return '#888888'; // 灰色
  }
};

// FPS颜色映射
const getFPSColor = (fps: number): string => {
  if (fps >= 55) return '#00ff88'; // 绿色
  if (fps >= 45) return '#ffff00'; // 黄色
  if (fps >= 30) return '#ff8800'; // 橙色
  return '#ff4444'; // 红色
};

// 动画质量显示名称
const getQualityDisplayName = (quality: AnimationQuality): string => {
  switch (quality) {
    case AnimationQuality.MINIMAL:
      return '最小化';
    case AnimationQuality.REDUCED:
      return '简化';
    case AnimationQuality.STANDARD:
      return '标准';
    case AnimationQuality.PREMIUM:
      return '高端';
    case AnimationQuality.ULTRA:
      return '极致';
    default:
      return '未知';
  }
};

// 性能仪表板属性
interface PerformanceDashboardProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  minimized?: boolean;
  showControls?: boolean;
  className?: string;
}

// 主仪表板组件
export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  position = 'bottom-right',
  minimized: initialMinimized = false,
  showControls = true,
  className = ''
}) => {
  const [minimized, setMinimized] = useState(initialMinimized);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const performanceContext = usePerformanceContext();

  // 样式配置
  const positionStyles = {
    'top-left': { top: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'bottom-right': { bottom: '20px', right: '20px' }
  };

  const dashboardStyle: React.CSSProperties = {
    position: 'fixed',
    ...positionStyles[position],
    zIndex: 9999,
    backgroundColor: 'var(--premium-bg-void)',
    border: '1px solid var(--premium-border-starlight)',
    borderRadius: '8px',
    padding: minimized ? '8px' : '16px',
    minWidth: minimized ? '120px' : '280px',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: 'var(--premium-text-primary)',
    backdropFilter: 'blur(20px) saturate(1.2)',
    boxShadow: 'var(--premium-shadow-lg)',
    transition: 'all var(--quantum-duration-md) var(--quantum-ease-spring)',
    userSelect: 'none'
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: minimized ? '0' : '12px',
    borderBottom: minimized ? 'none' : '1px solid var(--premium-border-starlight)',
    paddingBottom: minimized ? '0' : '8px'
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#00ffff',
    textShadow: '0 0 10px rgba(0, 255, 255, 0.5)'
  };

  const buttonStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--premium-border-starlight)',
    borderRadius: '4px',
    padding: '4px 8px',
    color: 'var(--premium-text-primary)',
    cursor: 'pointer',
    fontSize: '10px',
    transition: 'all var(--quantum-duration-sm) var(--quantum-ease-out)'
  };

  const metricRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
    padding: '4px 0'
  };

  const metricLabelStyle: React.CSSProperties = {
    color: 'var(--premium-text-secondary)',
    minWidth: '80px'
  };

  const metricValueStyle = (color: string): React.CSSProperties => ({
    color,
    fontWeight: 'bold',
    textShadow: `0 0 8px ${color}66`
  });

  // 最小化视图
  if (minimized) {
    return (
      <div style={dashboardStyle} className={className}>
        <div style={headerStyle}>
          <span style={titleStyle}>📊</span>
          <button
            style={buttonStyle}
            onClick={() => setMinimized(false)}
            title="展开性能监控"
          >
            ⬆
          </button>
        </div>
        <div style={{ fontSize: '10px', textAlign: 'center' }}>
          <div style={metricValueStyle(getFPSColor(performanceContext.currentFPS))}>
            {performanceContext.currentFPS} FPS
          </div>
          <div style={{ color: getPerformanceColor(performanceContext.devicePerformance), fontSize: '8px' }}>
            {getQualityDisplayName(performanceContext.recommendedQuality)}
          </div>
        </div>
      </div>
    );
  }

  // 完整视图
  return (
    <div style={dashboardStyle} className={className}>
      {/* 标题栏 */}
      <div style={headerStyle}>
        <span style={titleStyle}>📊 性能监控</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {showControls && (
            <>
              <button
                style={buttonStyle}
                onClick={() => setShowAdvanced(!showAdvanced)}
                title="切换高级视图"
              >
                {showAdvanced ? '简化' : '详细'}
              </button>
              <button
                style={buttonStyle}
                onClick={performanceContext.resetStats}
                title="重置统计"
              >
                🔄
              </button>
              <button
                style={buttonStyle}
                onClick={() => 
                  performanceContext.isMonitoring ? 
                  performanceContext.stopMonitoring() : 
                  performanceContext.startMonitoring()
                }
                title={performanceContext.isMonitoring ? "停止监控" : "开始监控"}
              >
                {performanceContext.isMonitoring ? '⏸' : '▶'}
              </button>
            </>
          )}
          <button
            style={buttonStyle}
            onClick={() => setMinimized(true)}
            title="最小化"
          >
            ⬇
          </button>
        </div>
      </div>

      {/* 核心指标 */}
      <div style={{ marginBottom: '12px' }}>
        <div style={metricRowStyle}>
          <span style={metricLabelStyle}>当前 FPS:</span>
          <span style={metricValueStyle(getFPSColor(performanceContext.currentFPS))}>
            {performanceContext.currentFPS}
          </span>
        </div>
        
        <div style={metricRowStyle}>
          <span style={metricLabelStyle}>平均 FPS:</span>
          <span style={metricValueStyle(getFPSColor(performanceContext.averageFPS))}>
            {performanceContext.averageFPS}
          </span>
        </div>

        <div style={metricRowStyle}>
          <span style={metricLabelStyle}>设备性能:</span>
          <span style={metricValueStyle(getPerformanceColor(performanceContext.devicePerformance))}>
            {performanceContext.devicePerformance.toUpperCase()}
          </span>
        </div>

        <div style={metricRowStyle}>
          <span style={metricLabelStyle}>动画质量:</span>
          <span style={metricValueStyle('#00ffff')}>
            {getQualityDisplayName(performanceContext.recommendedQuality)}
          </span>
        </div>

        <div style={metricRowStyle}>
          <span style={metricLabelStyle}>活跃动画:</span>
          <span style={metricValueStyle('#ffff00')}>
            {performanceContext.activeAnimations}
          </span>
        </div>
      </div>

      {/* 高级视图 */}
      {showAdvanced && (
        <div style={{ 
          borderTop: '1px solid var(--premium-border-starlight)', 
          paddingTop: '12px',
          marginTop: '12px'
        }}>
          <div style={{ ...titleStyle, fontSize: '12px', marginBottom: '8px' }}>
            高级指标
          </div>
          
          <div style={metricRowStyle}>
            <span style={metricLabelStyle}>状态:</span>
            <span style={metricValueStyle(performanceContext.isMonitoring ? '#00ff88' : '#ff4444')}>
              {performanceContext.isMonitoring ? '监控中' : '已停止'}
            </span>
          </div>

          <div style={metricRowStyle}>
            <span style={metricLabelStyle}>自动降级:</span>
            <span style={metricValueStyle(performanceContext.shouldDowngrade ? '#ff4444' : '#00ff88')}>
              {performanceContext.shouldDowngrade ? '已启用' : '正常'}
            </span>
          </div>

          {/* 动画质量控制 */}
          <div style={{ marginTop: '12px' }}>
            <div style={{ ...metricLabelStyle, marginBottom: '6px' }}>
              手动质量控制:
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '4px' 
            }}>
              {Object.values(AnimationQuality).map(quality => (
                <button
                  key={quality}
                  style={{
                    ...buttonStyle,
                    backgroundColor: performanceContext.recommendedQuality === quality ? 
                      'var(--premium-border-starlight)' : 'transparent',
                    fontSize: '9px',
                    padding: '2px 4px'
                  }}
                  onClick={() => performanceContext.updateAnimationQuality(quality)}
                >
                  {getQualityDisplayName(quality)}
                </button>
              ))}
            </div>
          </div>

          {/* 设置控制 */}
          {showControls && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ ...metricLabelStyle, marginBottom: '6px' }}>
                设置:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px' }}>
                  <input
                    type="checkbox"
                    checked={performanceContext.isMonitoring}
                    onChange={() => 
                      performanceContext.isMonitoring ? 
                      performanceContext.stopMonitoring() : 
                      performanceContext.startMonitoring()
                    }
                    style={{ margin: 0 }}
                  />
                  启用监控
                </label>
                <button
                  style={{
                    ...buttonStyle,
                    fontSize: '9px',
                    padding: '4px',
                    marginTop: '4px'
                  }}
                  onClick={() => {
                    // 导出性能数据
                    const data = {
                      timestamp: new Date().toISOString(),
                      currentFPS: performanceContext.currentFPS,
                      averageFPS: performanceContext.averageFPS,
                      devicePerformance: performanceContext.devicePerformance,
                      recommendedQuality: performanceContext.recommendedQuality,
                      activeAnimations: performanceContext.activeAnimations,
                      shouldDowngrade: performanceContext.shouldDowngrade
                    };
                    console.log('[Performance Export]', data);
                    // 复制到剪贴板
                    navigator.clipboard?.writeText(JSON.stringify(data, null, 2));
                  }}
                >
                  📋 导出数据
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// 简化的性能指示器组件
export const PerformanceIndicator: React.FC<{
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  showFPS?: boolean;
  showQuality?: boolean;
}> = ({
  position = 'top-right',
  showFPS = true,
  showQuality = false
}) => {
  const context = usePerformanceContext();

  const indicatorStyle: React.CSSProperties = {
    position: 'fixed',
    ...{
      'top-left': { top: '10px', left: '10px' },
      'top-right': { top: '10px', right: '10px' },
      'bottom-left': { bottom: '10px', left: '10px' },
      'bottom-right': { bottom: '10px', right: '10px' }
    }[position],
    zIndex: 9998,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    border: '1px solid var(--premium-border-starlight)',
    borderRadius: '4px',
    padding: '4px 8px',
    fontFamily: 'monospace',
    fontSize: '10px',
    color: 'var(--premium-text-primary)',
    backdropFilter: 'blur(10px)',
    pointerEvents: 'none'
  };

  return (
    <div style={indicatorStyle}>
      {showFPS && (
        <span style={{ color: getFPSColor(context.currentFPS) }}>
          {context.currentFPS} FPS
        </span>
      )}
      {showFPS && showQuality && <span style={{ color: '#666' }}> | </span>}
      {showQuality && (
        <span style={{ color: getPerformanceColor(context.devicePerformance) }}>
          {getQualityDisplayName(context.recommendedQuality)}
        </span>
      )}
    </div>
  );
}; 