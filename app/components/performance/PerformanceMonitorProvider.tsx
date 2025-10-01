import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { usePerformanceMonitor, DevicePerformance, AnimationQuality } from '../../hooks/usePerformanceMonitor';

// {{CHENGQI:
// Action: Created
// Timestamp: 2025-06-10 18:40:49 +08:00
// Reason: P2-TE-012 创建性能监控Context Provider，提供全局性能状态管理
// Principle_Applied: SOLID-S(单一职责Context管理)、KISS(简洁Provider设计)、DRY(复用Hook逻辑)
// Optimization: React Context优化，避免不必要的重渲染
// Architectural_Note (AR): 标准React Context模式，分离状态管理和UI逻辑
// Documentation_Note (DW): 完整的Provider接口定义，清晰的使用示例和配置选项
// }}

// Context类型定义
interface PerformanceContextType {
  // 状态
  currentFPS: number;
  averageFPS: number;
  devicePerformance: DevicePerformance;
  recommendedQuality: AnimationQuality;
  activeAnimations: number;
  isMonitoring: boolean;
  shouldDowngrade: boolean;
  
  // 方法
  startMonitoring: () => void;
  stopMonitoring: () => void;
  resetStats: () => void;
  registerAnimation: (animationId: string) => () => void;
  updateAnimationQuality: (quality: AnimationQuality) => void;
  
  // 配置
  setAutoDowngrade: (enabled: boolean) => void;
  setDebugMode: (enabled: boolean) => void;
}

// Provider属性
interface PerformanceMonitorProviderProps {
  children: ReactNode;
  autoStart?: boolean;              // 自动开始监控 (默认true)
  debugMode?: boolean;             // 调试模式 (默认false)
  autoDowngrade?: boolean;         // 自动降级 (默认true)
  fpsTargetThreshold?: number;     // 目标FPS阈值 (默认55)
  enableDeviceDetection?: boolean; // 启用设备检测 (默认true)
}

// 创建Context
const PerformanceContext = createContext<PerformanceContextType | null>(null);

// 性能监控Provider组件
export const PerformanceMonitorProvider: React.FC<PerformanceMonitorProviderProps> = ({
  children,
  autoStart = true,
  debugMode = false,
  autoDowngrade = true,
  fpsTargetThreshold = 55,
  enableDeviceDetection = true
}) => {
  // 动态配置状态
  const [config, setConfig] = useState({
    debugMode,
    autoDowngrade,
    fpsTargetThreshold,
    enableDeviceDetection,
    fpsLowThreshold: 30,
    monitoringInterval: 1000,
    maxConcurrentAnimations: 5
  });

  // 使用性能监控Hook
  const {
    stats,
    capabilities,
    isMonitoring,
    shouldDowngrade,
    startMonitoring,
    stopMonitoring,
    resetStats,
    registerAnimation,
    updateAnimationQualityVariables
  } = usePerformanceMonitor(config);

  // 自动启动监控
  useEffect(() => {
    if (autoStart && !isMonitoring) {
      startMonitoring();
    }
  }, [autoStart, isMonitoring, startMonitoring]);

  // 配置更新方法
  const setAutoDowngrade = (enabled: boolean) => {
    setConfig(prev => ({ ...prev, autoDowngrade: enabled }));
  };

  const setDebugMode = (enabled: boolean) => {
    setConfig(prev => ({ ...prev, debugMode: enabled }));
  };

  const updateAnimationQuality = (quality: AnimationQuality) => {
    updateAnimationQualityVariables(quality);
  };

  // Context值
  const contextValue: PerformanceContextType = {
    // 状态
    currentFPS: stats.currentFPS,
    averageFPS: stats.averageFPS,
    devicePerformance: stats.devicePerformance,
    recommendedQuality: stats.recommendedQuality,
    activeAnimations: stats.activeAnimations,
    isMonitoring,
    shouldDowngrade,
    
    // 方法
    startMonitoring,
    stopMonitoring,
    resetStats,
    registerAnimation,
    updateAnimationQuality,
    
    // 配置
    setAutoDowngrade,
    setDebugMode
  };

  // 调试模式输出
  useEffect(() => {
    if (config.debugMode) {
      console.log('[PerformanceMonitorProvider] Context Value:', {
        currentFPS: stats.currentFPS,
        averageFPS: stats.averageFPS,
        devicePerformance: stats.devicePerformance,
        recommendedQuality: stats.recommendedQuality,
        activeAnimations: stats.activeAnimations,
        shouldDowngrade
      });
    }
  }, [config.debugMode, stats, shouldDowngrade]);

  return (
    <PerformanceContext.Provider value={contextValue}>
      {children}
    </PerformanceContext.Provider>
  );
};

// Hook访问Context
export const usePerformanceContext = (): PerformanceContextType => {
  const context = useContext(PerformanceContext);
  if (!context) {
    throw new Error('usePerformanceContext must be used within a PerformanceMonitorProvider');
  }
  return context;
};

// 性能数据Hook (简化版本)
export const usePerformanceStats = () => {
  const context = usePerformanceContext();
  return {
    currentFPS: context.currentFPS,
    averageFPS: context.averageFPS,
    devicePerformance: context.devicePerformance,
    recommendedQuality: context.recommendedQuality,
    shouldDowngrade: context.shouldDowngrade
  };
};

// 动画注册Hook
export const useAnimationRegistration = (animationId: string, enabled: boolean = true) => {
  const context = usePerformanceContext();
  
  useEffect(() => {
    if (enabled) {
      const cleanup = context.registerAnimation(animationId);
      return cleanup;
    }
  }, [context, animationId, enabled]);
};

// 自动动画质量调整Hook
export const useAutoAnimationQuality = () => {
  const context = usePerformanceContext();
  
  useEffect(() => {
    // 自动应用推荐的动画质量
    context.updateAnimationQuality(context.recommendedQuality);
  }, [context.recommendedQuality, context.updateAnimationQuality]);
  
  return {
    currentQuality: context.recommendedQuality,
    updateQuality: context.updateAnimationQuality
  };
}; 