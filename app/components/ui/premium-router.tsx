"use client";

import React, { 
  useState, 
  useEffect, 
  useRef, 
  useCallback, 
  ReactNode, 
  useMemo 
} from "react";
import { useRouter, usePathname } from "next/navigation";
import PageTransition, { 
  TransitionType, 
  usePageTransition,
  PageTransitionRef 
} from "./page-transition";

/**
 * 高级路由管理器 - Premium UI Enhancement v2
 * 
 * 功能特性:
 * - 智能转场类型选择
 * - 路由历史管理
 * - 预加载和缓存机制
 * - 动画性能监控
 * - 可访问性优化
 */

// 路由转场规则配置
interface TransitionRule {
  from?: string | RegExp;
  to?: string | RegExp;
  type: TransitionType;
  duration?: number;
  condition?: () => boolean;
}

// 路由元数据
interface RouteMetadata {
  title?: string;
  description?: string;
  transitionType?: TransitionType;
  preload?: boolean;
  cache?: boolean;
}

// 组件属性
export interface PremiumRouterProps {
  children: ReactNode;
  transitionRules?: TransitionRule[];
  defaultTransition?: TransitionType;
  enablePreload?: boolean;
  enableCache?: boolean;
  performanceMonitoring?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

// 性能指标
interface PerformanceMetrics {
  transitionDuration: number;
  frameDrops: number;
  memoryUsage: number;
  timestamp: number;
}

// 默认转场规则
const DEFAULT_TRANSITION_RULES: TransitionRule[] = [
  // 主页到聊天页面 - 3D滑动
  {
    from: /^\/$/,
    to: /^\/chat/,
    type: 'slide-3d',
    duration: 400,
  },
  // 聊天页面间切换 - 深度层叠
  {
    from: /^\/chat/,
    to: /^\/chat/,
    type: 'depth-stack',
    duration: 300,
  },
  // 设置页面 - 维度切换
  {
    from: /.*/,
    to: /^\/settings/,
    type: 'dimension-shift',
    duration: 450,
  },
  // 模态框类页面 - 能量场展开
  {
    from: /.*/,
    to: /\/(modal|dialog|popup)/,
    type: 'energy-field',
    duration: 250,
  },
  // 加载页面 - 量子态加载
  {
    from: /.*/,
    to: /\/(loading|auth)/,
    type: 'quantum-loading',
    duration: 200,
  },
];

/**
 * 高级路由管理器组件
 */
export default function PremiumRouter({
  children,
  transitionRules = DEFAULT_TRANSITION_RULES,
  defaultTransition = 'slide-3d',
  enablePreload = true,
  enableCache = false,
  performanceMonitoring = true,
  className = '',
  style = {},
}: PremiumRouterProps) {
  // 路由状态
  const router = useRouter();
  const pathname = usePathname();
  const prevPathnameRef = useRef(pathname);
  
  // 转场控制
  const {
    ref: transitionRef,
    isTransitioning,
    currentType,
    setCurrentType,
    triggerTransition,
  } = usePageTransition(defaultTransition);
  
  // 性能监控
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics[]>([]);
  const performanceStartRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  
  // 路由历史和缓存
  const [routeHistory, setRouteHistory] = useState<string[]>([pathname]);
  const routeCacheRef = useRef<Map<string, ReactNode>>(new Map());
  
  // 智能转场类型选择
  const selectTransitionType = useCallback((fromPath: string, toPath: string): TransitionType => {
    // 查找匹配的转场规则
    for (const rule of transitionRules) {
      const fromMatch = rule.from ? 
        (typeof rule.from === 'string' ? 
          fromPath === rule.from : 
          rule.from.test(fromPath)) : 
        true;
        
      const toMatch = rule.to ? 
        (typeof rule.to === 'string' ? 
          toPath === rule.to : 
          rule.to.test(toPath)) : 
        true;
        
      const conditionMatch = rule.condition ? rule.condition() : true;
      
      if (fromMatch && toMatch && conditionMatch) {
        return rule.type;
      }
    }
    
    return defaultTransition;
  }, [transitionRules, defaultTransition]);
  
  // 性能监控功能
  const startPerformanceMonitoring = useCallback(() => {
    if (!performanceMonitoring) return;
    
    performanceStartRef.current = performance.now();
    frameCountRef.current = 0;
    
    const monitorFrame = () => {
      frameCountRef.current++;
      animationFrameRef.current = requestAnimationFrame(monitorFrame);
    };
    
    animationFrameRef.current = requestAnimationFrame(monitorFrame);
  }, [performanceMonitoring]);
  
  const stopPerformanceMonitoring = useCallback(() => {
    if (!performanceMonitoring) return;
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    const endTime = performance.now();
    const duration = endTime - performanceStartRef.current;
    const expectedFrames = Math.ceil(duration / 16.67); // 60fps
    const frameDrops = Math.max(0, expectedFrames - frameCountRef.current);
    
    const metrics: PerformanceMetrics = {
      transitionDuration: duration,
      frameDrops,
      memoryUsage: (performance as any).memory?.usedJSHeapSize || 0,
      timestamp: endTime,
    };
    
    setPerformanceMetrics(prev => [...prev.slice(-9), metrics]); // 保留最近10次记录
  }, [performanceMonitoring]);
  
  // 路由变化处理
  useEffect(() => {
    const fromPath = prevPathnameRef.current;
    const toPath = pathname;
    
    if (fromPath !== toPath) {
      // 更新路由历史
      setRouteHistory(prev => [...prev, toPath].slice(-10)); // 保留最近10个路由
      
      // 选择转场类型
      const transitionType = selectTransitionType(fromPath, toPath);
      setCurrentType(transitionType);
      
      // 开始性能监控
      startPerformanceMonitoring();
      
      // 触发转场动画
      triggerTransition(transitionType).then(() => {
        stopPerformanceMonitoring();
      });
      
      prevPathnameRef.current = toPath;
    }
  }, [pathname, selectTransitionType, setCurrentType, triggerTransition, startPerformanceMonitoring, stopPerformanceMonitoring]);
  
  // 预加载功能 (概念性实现)
  const preloadRoute = useCallback((path: string) => {
    if (!enablePreload) return;
    
    // 这里可以实现路由预加载逻辑
    // 例如预取数据、预加载组件等
    console.log(`Preloading route: ${path}`);
  }, [enablePreload]);
  
  // 缓存管理
  const getCachedRoute = useCallback((path: string): ReactNode | null => {
    return enableCache ? routeCacheRef.current.get(path) || null : null;
  }, [enableCache]);
  
  const setCachedRoute = useCallback((path: string, content: ReactNode) => {
    if (enableCache) {
      routeCacheRef.current.set(path, content);
    }
  }, [enableCache]);
  
  // 清理缓存
  const clearRouteCache = useCallback(() => {
    routeCacheRef.current.clear();
  }, []);
  
  // 性能指标摘要
  const performanceSummary = useMemo(() => {
    if (!performanceMonitoring || performanceMetrics.length === 0) return null;
    
    const recent = performanceMetrics.slice(-5);
    const avgDuration = recent.reduce((sum, m) => sum + m.transitionDuration, 0) / recent.length;
    const totalFrameDrops = recent.reduce((sum, m) => sum + m.frameDrops, 0);
    
    return {
      averageDuration: Math.round(avgDuration),
      totalFrameDrops,
      isPerformant: avgDuration < 400 && totalFrameDrops < 5,
    };
  }, [performanceMetrics, performanceMonitoring]);
  
  // 转场事件处理
  const handleTransitionStart = useCallback(() => {
    startPerformanceMonitoring();
    
    // 可以在这里添加全局转场开始逻辑
    // 例如显示加载指示器、禁用某些交互等
  }, [startPerformanceMonitoring]);
  
  const handleTransitionEnd = useCallback(() => {
    stopPerformanceMonitoring();
    
    // 转场结束后的清理工作
    // 例如隐藏加载指示器、恢复交互等
  }, [stopPerformanceMonitoring]);
  
  // 清理工作
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);
  
  return (
    <div 
      className={`premium-router ${className}`.trim()}
      style={style}
      data-performance-monitoring={performanceMonitoring}
      data-preload-enabled={enablePreload}
      data-cache-enabled={enableCache}
      data-current-transition={currentType}
      data-is-transitioning={isTransitioning}
    >
      <PageTransition
        ref={transitionRef}
        type={currentType}
        onTransitionStart={handleTransitionStart}
        onTransitionEnd={handleTransitionEnd}
        className="premium-router-content"
      >
        {children}
      </PageTransition>
      
      {/* 性能监控面板 (开发模式) */}
      {process.env.NODE_ENV === 'development' && performanceMonitoring && performanceSummary && (
        <div className="performance-monitor">
          <div className="monitor-header">转场性能监控</div>
          <div className="monitor-metrics">
            <div>平均时长: {performanceSummary.averageDuration}ms</div>
            <div>掉帧数: {performanceSummary.totalFrameDrops}</div>
            <div className={`status ${performanceSummary.isPerformant ? 'good' : 'warning'}`}>
              {performanceSummary.isPerformant ? '性能良好' : '性能警告'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 路由转场Hook - 简化使用
 */
export function usePremiumRouter() {
  const router = useRouter();
  const pathname = usePathname();
  
  const navigateWithTransition = useCallback((
    path: string, 
    transitionType?: TransitionType,
    options?: { replace?: boolean; scroll?: boolean }
  ) => {
    // 这里可以在导航前设置特定的转场类型
    // 实际导航会触发PremiumRouter的转场逻辑
    
    if (options?.replace) {
      router.replace(path, { scroll: options?.scroll });
    } else {
      router.push(path, { scroll: options?.scroll });
    }
  }, [router]);
  
  return {
    pathname,
    navigateWithTransition,
    router,
  };
}

/**
 * 转场规则生成器工具
 */
export class TransitionRuleBuilder {
  private rules: TransitionRule[] = [];
  
  from(pattern: string | RegExp) {
    const rule: Partial<TransitionRule> = { from: pattern };
    return {
      to: (toPattern: string | RegExp) => ({
        ...rule,
        to: toPattern,
        with: (type: TransitionType, duration?: number) => ({
          ...rule,
          to: toPattern,
          type,
          duration,
          when: (condition: () => boolean) => {
            this.rules.push({ ...rule, to: toPattern, type, duration, condition } as TransitionRule);
            return this;
          },
          build: () => {
            this.rules.push({ ...rule, to: toPattern, type, duration } as TransitionRule);
            return this;
          }
        })
      })
    };
  }
  
  getRules(): TransitionRule[] {
    return [...this.rules];
  }
  
  reset() {
    this.rules = [];
    return this;
  }
}

// 导出工具函数
export const createTransitionRules = () => new TransitionRuleBuilder(); 