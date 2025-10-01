import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// {{CHENGQI:
// Action: Created
// Timestamp: 2025-06-10 18:40:49 +08:00
// Reason: P2-TE-012 实现核心性能监控Hook，提供FPS监控和设备性能检测
// Principle_Applied: SOLID-S(单一职责监控功能)、KISS(简洁API设计)、DRY(复用React Hooks模式)
// Optimization: React useMemo优化计算、useCallback防止重渲染
// Architectural_Note (AR): 遵循React Hook架构模式，通过Context提供全局性能状态
// Documentation_Note (DW): 完整TypeScript类型定义，清晰的接口文档和使用示例
// }}

// 设备性能等级枚举
export enum DevicePerformance {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  ULTRA = 'ultra'
}

// 动画质量级别
export enum AnimationQuality {
  MINIMAL = 'minimal',      // 仅基础过渡
  REDUCED = 'reduced',      // 简化动画
  STANDARD = 'standard',    // 标准动画效果
  PREMIUM = 'premium',      // 完整高端动画
  ULTRA = 'ultra'          // 最高质量 + 粒子效果
}

// 性能监控配置
interface PerformanceConfig {
  fpsTargetThreshold: number;      // 目标FPS阈值 (默认55)
  fpsLowThreshold: number;         // 低性能阈值 (默认30)
  monitoringInterval: number;      // 监控间隔毫秒 (默认1000)
  autoDowngrade: boolean;          // 自动降级开关 (默认true)
  maxConcurrentAnimations: number; // 最大并发动画数量 (默认5)
  enableDeviceDetection: boolean;  // 启用设备检测 (默认true)
  debugMode: boolean;             // 调试模式 (默认false)
}

// 性能统计数据
interface PerformanceStats {
  currentFPS: number;
  averageFPS: number;
  minFPS: number;
  maxFPS: number;
  devicePerformance: DevicePerformance;
  recommendedQuality: AnimationQuality;
  activeAnimations: number;
  frameDrops: number;
  memoryUsage: number;
  lastUpdated: number;
}

// 设备能力检测结果
interface DeviceCapabilities {
  gpuTier: 'low' | 'medium' | 'high';
  cpuCores: number;
  memory: number;
  isMobile: boolean;
  isLowEndDevice: boolean;
  supportsWebGL: boolean;
  supportsBackdropFilter: boolean;
  userAgent: string;
}

// 默认配置
const DEFAULT_CONFIG: PerformanceConfig = {
  fpsTargetThreshold: 55,
  fpsLowThreshold: 30,
  monitoringInterval: 1000,
  autoDowngrade: true,
  maxConcurrentAnimations: 5,
  enableDeviceDetection: true,
  debugMode: false
};

// 设备性能检测函数
const detectDeviceCapabilities = (): DeviceCapabilities => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') as WebGLRenderingContext | null || 
             canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
  
  // GPU检测
  let gpuTier: 'low' | 'medium' | 'high' = 'medium';
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      if (renderer.includes('Intel') || renderer.includes('Mali')) {
        gpuTier = 'low';
      } else if (renderer.includes('NVIDIA') || renderer.includes('AMD') || renderer.includes('Radeon')) {
        gpuTier = 'high';
      }
    }
  }

  // CPU核心数检测
  const cpuCores = navigator.hardwareConcurrency || 4;
  
  // 内存检测 (如果支持)
  const memory = (navigator as any).deviceMemory || 
    (performance as any).memory?.usedJSHeapSize / (1024 * 1024 * 1024) || 4;

  // 移动设备检测
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // 低端设备判断
  const isLowEndDevice = isMobile || cpuCores < 4 || memory < 4 || gpuTier === 'low';

  // 特性支持检测
  const supportsWebGL = !!gl;
  const supportsBackdropFilter = CSS.supports('backdrop-filter', 'blur(1px)');

  return {
    gpuTier,
    cpuCores,
    memory,
    isMobile,
    isLowEndDevice,
    supportsWebGL,
    supportsBackdropFilter,
    userAgent: navigator.userAgent
  };
};

// 设备性能等级计算
const calculateDevicePerformance = (capabilities: DeviceCapabilities): DevicePerformance => {
  let score = 0;
  
  // GPU评分
  if (capabilities.gpuTier === 'high') score += 40;
  else if (capabilities.gpuTier === 'medium') score += 25;
  else score += 10;
  
  // CPU评分
  if (capabilities.cpuCores >= 8) score += 30;
  else if (capabilities.cpuCores >= 4) score += 20;
  else score += 10;
  
  // 内存评分
  if (capabilities.memory >= 8) score += 20;
  else if (capabilities.memory >= 4) score += 15;
  else score += 5;
  
  // 特性支持评分
  if (capabilities.supportsWebGL) score += 5;
  if (capabilities.supportsBackdropFilter) score += 5;
  
  // 移动设备惩罚
  if (capabilities.isMobile) score -= 20;

  // 等级映射
  if (score >= 80) return DevicePerformance.ULTRA;
  if (score >= 60) return DevicePerformance.HIGH;
  if (score >= 40) return DevicePerformance.MEDIUM;
  return DevicePerformance.LOW;
};

// 动画质量推荐算法
const recommendAnimationQuality = (
  devicePerformance: DevicePerformance,
  currentFPS: number,
  averageFPS: number
): AnimationQuality => {
  // 用户偏好检测 (prefers-reduced-motion)
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return AnimationQuality.MINIMAL;

  // 基于FPS和设备性能的动态调整
  if (currentFPS < 30 || averageFPS < 35) {
    return AnimationQuality.MINIMAL;
  }
  
  if (currentFPS < 45 || averageFPS < 50) {
    return AnimationQuality.REDUCED;
  }

  // 基于设备性能等级
  switch (devicePerformance) {
    case DevicePerformance.ULTRA:
      return currentFPS >= 55 ? AnimationQuality.ULTRA : AnimationQuality.PREMIUM;
    case DevicePerformance.HIGH:
      return currentFPS >= 55 ? AnimationQuality.PREMIUM : AnimationQuality.STANDARD;
    case DevicePerformance.MEDIUM:
      return currentFPS >= 50 ? AnimationQuality.STANDARD : AnimationQuality.REDUCED;
    case DevicePerformance.LOW:
    default:
      return currentFPS >= 45 ? AnimationQuality.REDUCED : AnimationQuality.MINIMAL;
  }
};

// 性能监控主Hook
export const usePerformanceMonitor = (config: Partial<PerformanceConfig> = {}) => {
  const finalConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
  
  // 状态管理
  const [stats, setStats] = useState<PerformanceStats>({
    currentFPS: 60,
    averageFPS: 60,
    minFPS: 60,
    maxFPS: 60,
    devicePerformance: DevicePerformance.MEDIUM,
    recommendedQuality: AnimationQuality.STANDARD,
    activeAnimations: 0,
    frameDrops: 0,
    memoryUsage: 0,
    lastUpdated: Date.now()
  });

  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  // 内部状态和引用
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const fpsHistoryRef = useRef<number[]>([]);
  const monitoringIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // FPS计算函数
  const measureFPS = useCallback(() => {
    const currentTime = performance.now();
    frameCountRef.current++;
    
    if (currentTime - lastTimeRef.current >= finalConfig.monitoringInterval) {
      const fps = Math.round((frameCountRef.current * 1000) / (currentTime - lastTimeRef.current));
      
      // 更新FPS历史记录
      fpsHistoryRef.current.push(fps);
      if (fpsHistoryRef.current.length > 60) { // 保持最近60个数据点
        fpsHistoryRef.current.shift();
      }
      
      // 计算统计信息
      const averageFPS = Math.round(
        fpsHistoryRef.current.reduce((sum, f) => sum + f, 0) / fpsHistoryRef.current.length
      );
      const minFPS = Math.min(...fpsHistoryRef.current);
      const maxFPS = Math.max(...fpsHistoryRef.current);
      
      // 帧丢失计算
      const frameDrops = fpsHistoryRef.current.filter(f => f < finalConfig.fpsLowThreshold).length;
      
      // 内存使用情况 (如果支持)
      const memoryUsage = (performance as any).memory?.usedJSHeapSize / (1024 * 1024) || 0;
      
      // 更新统计信息
      setStats(prevStats => {
        const devicePerformance = capabilities ? 
          calculateDevicePerformance(capabilities) : 
          prevStats.devicePerformance;
        
        const recommendedQuality = recommendAnimationQuality(devicePerformance, fps, averageFPS);
        
        return {
          currentFPS: fps,
          averageFPS,
          minFPS,
          maxFPS,
          devicePerformance,
          recommendedQuality,
          activeAnimations: prevStats.activeAnimations,
          frameDrops,
          memoryUsage,
          lastUpdated: Date.now()
        };
      });
      
      // 重置计数器
      frameCountRef.current = 0;
      lastTimeRef.current = currentTime;
      
      // 调试模式输出
      if (finalConfig.debugMode) {
        console.log(`[Performance Monitor] FPS: ${fps}, Avg: ${averageFPS}, Quality: ${recommendAnimationQuality(stats.devicePerformance, fps, averageFPS)}`);
      }
    }
    
    // 继续监控
    if (isMonitoring) {
      animationFrameRef.current = requestAnimationFrame(measureFPS);
    }
  }, [finalConfig, capabilities, isMonitoring, stats.devicePerformance]);

  // 开始监控
  const startMonitoring = useCallback(() => {
    if (!isMonitoring) {
      setIsMonitoring(true);
      frameCountRef.current = 0;
      lastTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(measureFPS);
      
      if (finalConfig.debugMode) {
        console.log('[Performance Monitor] 开始监控');
      }
    }
  }, [isMonitoring, measureFPS, finalConfig.debugMode]);

  // 停止监控
  const stopMonitoring = useCallback(() => {
    if (isMonitoring) {
      setIsMonitoring(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      if (finalConfig.debugMode) {
        console.log('[Performance Monitor] 停止监控');
      }
    }
  }, [isMonitoring, finalConfig.debugMode]);

  // 重置统计
  const resetStats = useCallback(() => {
    fpsHistoryRef.current = [];
    setStats(prevStats => ({
      ...prevStats,
      minFPS: 60,
      maxFPS: 60,
      frameDrops: 0,
      lastUpdated: Date.now()
    }));
  }, []);

  // 注册动画
  const registerAnimation = useCallback((animationId: string) => {
    setStats(prevStats => ({
      ...prevStats,
      activeAnimations: prevStats.activeAnimations + 1
    }));
    
    // 返回清理函数
    return () => {
      setStats(prevStats => ({
        ...prevStats,
        activeAnimations: Math.max(0, prevStats.activeAnimations - 1)
      }));
    };
  }, []);

  // 检查是否应该降级
  const shouldDowngrade = useMemo(() => {
    if (!finalConfig.autoDowngrade) return false;
    return stats.currentFPS < finalConfig.fpsLowThreshold || 
           stats.averageFPS < finalConfig.fpsTargetThreshold;
  }, [stats.currentFPS, stats.averageFPS, finalConfig]);

  // 动画质量CSS变量更新
  const updateAnimationQualityVariables = useCallback((quality: AnimationQuality) => {
    const root = document.documentElement;
    
    switch (quality) {
      case AnimationQuality.MINIMAL:
        root.style.setProperty('--quantum-duration-multiplier', '0.3');
        root.style.setProperty('--quantum-effects-opacity', '0.2');
        root.style.setProperty('--quantum-blur-intensity', '2px');
        break;
      case AnimationQuality.REDUCED:
        root.style.setProperty('--quantum-duration-multiplier', '0.6');
        root.style.setProperty('--quantum-effects-opacity', '0.4');
        root.style.setProperty('--quantum-blur-intensity', '5px');
        break;
      case AnimationQuality.STANDARD:
        root.style.setProperty('--quantum-duration-multiplier', '1.0');
        root.style.setProperty('--quantum-effects-opacity', '0.6');
        root.style.setProperty('--quantum-blur-intensity', '10px');
        break;
      case AnimationQuality.PREMIUM:
        root.style.setProperty('--quantum-duration-multiplier', '1.0');
        root.style.setProperty('--quantum-effects-opacity', '0.8');
        root.style.setProperty('--quantum-blur-intensity', '20px');
        break;
      case AnimationQuality.ULTRA:
        root.style.setProperty('--quantum-duration-multiplier', '1.0');
        root.style.setProperty('--quantum-effects-opacity', '1.0');
        root.style.setProperty('--quantum-blur-intensity', '30px');
        break;
    }
  }, []);

  // 初始化设备检测
  useEffect(() => {
    if (finalConfig.enableDeviceDetection) {
      try {
        const deviceCapabilities = detectDeviceCapabilities();
        setCapabilities(deviceCapabilities);
        
        // 初始化统计状态
        const initialDevicePerformance = calculateDevicePerformance(deviceCapabilities);
        const initialQuality = recommendAnimationQuality(initialDevicePerformance, 60, 60);
        
        setStats(prevStats => ({
          ...prevStats,
          devicePerformance: initialDevicePerformance,
          recommendedQuality: initialQuality
        }));
        
        // 应用初始动画质量
        updateAnimationQualityVariables(initialQuality);
        
        if (finalConfig.debugMode) {
          console.log('[Performance Monitor] 设备检测完成:', deviceCapabilities);
          console.log('[Performance Monitor] 设备性能等级:', initialDevicePerformance);
          console.log('[Performance Monitor] 推荐动画质量:', initialQuality);
        }
      } catch (error) {
        console.warn('[Performance Monitor] 设备检测失败:', error);
      }
    }
  }, [finalConfig.enableDeviceDetection, finalConfig.debugMode, updateAnimationQualityVariables]);

  // 动画质量自动更新
  useEffect(() => {
    if (finalConfig.autoDowngrade) {
      updateAnimationQualityVariables(stats.recommendedQuality);
    }
  }, [stats.recommendedQuality, finalConfig.autoDowngrade, updateAnimationQualityVariables]);

  // 组件卸载清理
  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);

  return {
    // 状态
    stats,
    capabilities,
    isMonitoring,
    shouldDowngrade,
    
    // 方法
    startMonitoring,
    stopMonitoring,
    resetStats,
    registerAnimation,
    updateAnimationQualityVariables,
    
    // 工具函数
    calculateDevicePerformance,
    recommendAnimationQuality
  };
}; 