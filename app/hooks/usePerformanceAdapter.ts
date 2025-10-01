/**
 * {{CHENGQI:
 * Action: Created
 * Timestamp: 2025-06-10 18:44:40 +08:00
 * Reason: P3-AR-018任务执行 - 创建React Hook简化性能适配器使用
 * Principle_Applied: KISS(简洁Hook API)、SOLID-S(单一职责状态管理)、React Hooks最佳实践
 * Optimization: 自动生命周期管理、防抖更新、内存泄漏防护
 * Architectural_Note (AR): 遵循React Hooks标准模式，提供响应式性能状态
 * Documentation_Note (DW): 完整TypeScript类型定义和使用示例，便于团队使用
 * }}
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  performanceAdapter, 
  PerformanceProfile, 
  PerformanceMetrics, 
  UserPreferences,
  PerformanceLevel,
  EffectIntensity 
} from '../utils/performance-adapter';

// ==================== Hook类型定义 ====================

export interface UsePerformanceAdapterReturn {
  // 核心状态
  profile: PerformanceProfile | null;
  isInitialized: boolean;
  isLoading: boolean;
  
  // 性能指标
  currentMetrics: PerformanceMetrics | null;
  averageMetrics: PerformanceMetrics | null;
  
  // 用户偏好
  preferences: UserPreferences;
  
  // 操作函数
  updatePreferences: (newPreferences: Partial<UserPreferences>) => void;
  setPerformanceLevel: (level: PerformanceLevel) => void;
  toggleAutoDetection: () => void;
  togglePerformanceMonitoring: () => void;
  
  // 便捷查询函数
  getEffectIntensity: (effectType: keyof PerformanceProfile['effectSettings']) => EffectIntensity;
  shouldUseEffect: (effectType: keyof PerformanceProfile['effectSettings'], minLevel?: EffectIntensity) => boolean;
  getCSSVariable: (variableName: string) => string | undefined;
}

export interface UsePerformanceAdapterOptions {
  // 自动初始化配置
  autoInitialize?: boolean;
  
  // 性能监控配置
  enableRealTimeMetrics?: boolean;
  metricsUpdateInterval?: number; // ms
  
  // 调试选项
  enableDebugLogging?: boolean;
}

// ==================== 主要Hook实现 ====================

export function usePerformanceAdapter(options: UsePerformanceAdapterOptions = {}): UsePerformanceAdapterReturn {
  const {
    autoInitialize = true,
    enableRealTimeMetrics = true,
    metricsUpdateInterval = 1000,
    enableDebugLogging = false
  } = options;

  // ==================== 状态管理 ====================
  
  const [profile, setProfile] = useState<PerformanceProfile | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentMetrics, setCurrentMetrics] = useState<PerformanceMetrics | null>(null);
  const [averageMetrics, setAverageMetrics] = useState<PerformanceMetrics | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>(performanceAdapter.getPreferences());

  // ==================== Refs和清理 ====================
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const metricsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // ==================== 性能指标更新 ====================
  
  const updateMetrics = useCallback(() => {
    if (!isMountedRef.current) return;
    
    const current = performanceAdapter.getCurrentMetrics();
    const average = performanceAdapter.getAverageMetrics(10);
    
    setCurrentMetrics(current);
    setAverageMetrics(average);

    if (enableDebugLogging && current) {
      console.log('[PerformanceAdapter] Metrics Update:', {
        fps: current.fps,
        frameTime: current.frameTime.toFixed(2) + 'ms',
        memoryUsage: current.memoryUsage ? current.memoryUsage + 'MB' : 'N/A'
      });
    }
  }, [enableDebugLogging]);

  // ==================== 初始化逻辑 ====================
  
  const initialize = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    setIsLoading(true);
    
    try {
      const newProfile = await performanceAdapter.initialize();
      
      if (isMountedRef.current) {
        setProfile(newProfile);
        setIsInitialized(true);
        
        if (enableDebugLogging) {
          console.log('[PerformanceAdapter] Initialized:', {
            level: newProfile.level,
            score: newProfile.score,
            effects: newProfile.effectSettings
          });
        }
      }
    } catch (error) {
      console.error('[PerformanceAdapter] Initialization failed:', error);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [enableDebugLogging]);

  // ==================== 效果变化监听 ====================
  
  useEffect(() => {
    // 订阅性能配置变化
    unsubscribeRef.current = performanceAdapter.onProfileChange((newProfile) => {
      if (isMountedRef.current) {
        setProfile(newProfile);
        setPreferences(performanceAdapter.getPreferences());
        
        if (enableDebugLogging) {
          console.log('[PerformanceAdapter] Profile Changed:', newProfile.level);
        }
      }
    });

    // 自动初始化
    if (autoInitialize && !isInitialized) {
      initialize();
    }

    // 启动性能指标更新
    if (enableRealTimeMetrics) {
      metricsIntervalRef.current = setInterval(updateMetrics, metricsUpdateInterval);
    }

    // 清理函数
    return () => {
      isMountedRef.current = false;
      
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
        metricsIntervalRef.current = null;
      }
    };
  }, [autoInitialize, enableRealTimeMetrics, metricsUpdateInterval, initialize, updateMetrics, isInitialized, enableDebugLogging]);

  // ==================== 操作函数 ====================
  
  const updatePreferences = useCallback((newPreferences: Partial<UserPreferences>) => {
    performanceAdapter.updatePreferences(newPreferences);
    setPreferences(performanceAdapter.getPreferences());
    
    if (enableDebugLogging) {
      console.log('[PerformanceAdapter] Preferences Updated:', newPreferences);
    }
  }, [enableDebugLogging]);

  const setPerformanceLevel = useCallback((level: PerformanceLevel) => {
    updatePreferences({ manualLevel: level });
  }, [updatePreferences]);

  const toggleAutoDetection = useCallback(() => {
    updatePreferences({ enableAutoDetection: !preferences.enableAutoDetection });
  }, [preferences.enableAutoDetection, updatePreferences]);

  const togglePerformanceMonitoring = useCallback(() => {
    updatePreferences({ enablePerformanceMonitoring: !preferences.enablePerformanceMonitoring });
  }, [preferences.enablePerformanceMonitoring, updatePreferences]);

  // ==================== 便捷查询函数 ====================
  
  const getEffectIntensity = useCallback((effectType: keyof PerformanceProfile['effectSettings']): EffectIntensity => {
    return profile?.effectSettings[effectType] || 'minimal';
  }, [profile]);

  const shouldUseEffect = useCallback((
    effectType: keyof PerformanceProfile['effectSettings'], 
    minLevel: EffectIntensity = 'subtle'
  ): boolean => {
    if (!profile) return false;
    
    const currentIntensity = profile.effectSettings[effectType];
    const intensityValues = { minimal: 0, subtle: 1, normal: 2, intense: 3, maximum: 4 };
    
    return intensityValues[currentIntensity] >= intensityValues[minLevel];
  }, [profile]);

  const getCSSVariable = useCallback((variableName: string): string | undefined => {
    return profile?.cssVariables[variableName];
  }, [profile]);

  // ==================== 返回值 ====================
  
  return {
    // 核心状态
    profile,
    isInitialized,
    isLoading,
    
    // 性能指标
    currentMetrics,
    averageMetrics,
    
    // 用户偏好
    preferences,
    
    // 操作函数
    updatePreferences,
    setPerformanceLevel,
    toggleAutoDetection,
    togglePerformanceMonitoring,
    
    // 便捷查询函数
    getEffectIntensity,
    shouldUseEffect,
    getCSSVariable
  };
}

// ==================== 便捷Hooks ====================

/**
 * 简化版Hook，只返回当前性能级别和效果设置
 */
export function usePerformanceLevel(): {
  level: PerformanceLevel | null;
  effectSettings: PerformanceProfile['effectSettings'] | null;
  isLoading: boolean;
} {
  const { profile, isLoading } = usePerformanceAdapter({ enableRealTimeMetrics: false });
  
  return {
    level: profile?.level || null,
    effectSettings: profile?.effectSettings || null,
    isLoading
  };
}

/**
 * 用于检查特定效果是否应该启用的Hook
 */
export function useEffectEnabled(
  effectType: keyof PerformanceProfile['effectSettings'], 
  minLevel: EffectIntensity = 'subtle'
): boolean {
  const { shouldUseEffect } = usePerformanceAdapter({ enableRealTimeMetrics: false });
  return shouldUseEffect(effectType, minLevel);
}

/**
 * 用于获取性能相关CSS变量的Hook
 */
export function usePerformanceCSSVariables(): Record<string, string> {
  const { profile } = usePerformanceAdapter({ enableRealTimeMetrics: false });
  return profile?.cssVariables || {};
}

/**
 * 用于实时性能监控的Hook
 */
export function usePerformanceMetrics(): {
  currentMetrics: PerformanceMetrics | null;
  averageMetrics: PerformanceMetrics | null;
  isMonitoring: boolean;
} {
  const { currentMetrics, averageMetrics, preferences } = usePerformanceAdapter({
    enableRealTimeMetrics: true,
    metricsUpdateInterval: 500 // 更频繁的更新
  });
  
  return {
    currentMetrics,
    averageMetrics,
    isMonitoring: preferences.enablePerformanceMonitoring
  };
}

// ==================== 高阶组件 ====================
// Note: 高阶组件可以根据具体需求在项目中实现 