"use client";

import React, { 
  useState, 
  useEffect, 
  useRef, 
  useCallback, 
  ReactNode,
  forwardRef,
  useImperativeHandle 
} from "react";
import { useRouter, usePathname } from "next/navigation";
import styles from "../styles/page-transitions.scss";

/**
 * 页面转场动画组件 - Premium UI Enhancement v2
 * 
 * 功能特性:
 * - 多种3D转场效果
 * - 模态框维度切换
 * - 内容加载动画
 * - 性能优化和可访问性支持
 * - 完整的TypeScript类型支持
 */

// 转场效果类型定义
export type TransitionType = 
  | 'slide-3d'           // 3D空间滑动转场
  | 'depth-stack'        // 深度层叠转场
  | 'quantum-teleport'   // 量子传送效果
  | 'dimension-shift'    // 维度切换效果
  | 'energy-field'       // 能量场展开效果
  | 'data-stream'        // 数据流入动画
  | 'molecular-assembly' // 分子重组效果
  | 'quantum-loading';   // 量子态加载

// 转场方向
export type TransitionDirection = 'enter' | 'exit';

// 转场状态
export type TransitionState = 'idle' | 'entering' | 'exiting' | 'active';

// 组件属性接口
export interface PageTransitionProps {
  children: ReactNode;
  type?: TransitionType;
  duration?: number;
  disabled?: boolean;
  preserveScroll?: boolean;
  onTransitionStart?: (direction: TransitionDirection) => void;
  onTransitionEnd?: (direction: TransitionDirection) => void;
  className?: string;
  style?: React.CSSProperties;
}

// 转场控制接口
export interface PageTransitionRef {
  triggerTransition: (type?: TransitionType) => Promise<void>;
  setTransitionState: (state: TransitionState) => void;
  getCurrentState: () => TransitionState;
}

// 转场上下文
interface TransitionContext {
  isTransitioning: boolean;
  currentType: TransitionType;
  direction: TransitionDirection;
  state: TransitionState;
}

// 默认配置
const DEFAULT_CONFIG = {
  type: 'slide-3d' as TransitionType,
  duration: 350,
  disabled: false,
  preserveScroll: true,
} as const;

/**
 * 页面转场动画组件
 */
export const PageTransition = forwardRef<PageTransitionRef, PageTransitionProps>(
  ({
    children,
    type = DEFAULT_CONFIG.type,
    duration = DEFAULT_CONFIG.duration,
    disabled = DEFAULT_CONFIG.disabled,
    preserveScroll = DEFAULT_CONFIG.preserveScroll,
    onTransitionStart,
    onTransitionEnd,
    className = '',
    style = {},
  }, ref) => {
    // 状态管理
    const [transitionState, setTransitionState] = useState<TransitionState>('idle');
    const [currentType, setCurrentType] = useState<TransitionType>(type);
    const [direction, setDirection] = useState<TransitionDirection>('enter');
    const [isTransitioning, setIsTransitioning] = useState(false);
    
    // 引用
    const containerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    
    // 路由监听
    const router = useRouter();
    const pathname = usePathname();
    const prevPathnameRef = useRef(pathname);
    
    // 检测是否支持动画
    const prefersReducedMotion = useRef(false);
    
    useEffect(() => {
      // 检测用户动画偏好
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      prefersReducedMotion.current = mediaQuery.matches;
      
      const handleChange = (e: MediaQueryListEvent) => {
        prefersReducedMotion.current = e.matches;
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);
    
    // 转场控制方法
    const triggerTransition = useCallback(async (transitionType?: TransitionType): Promise<void> => {
      if (disabled || prefersReducedMotion.current) return;
      
      const effectiveType = transitionType || currentType;
      setCurrentType(effectiveType);
      setIsTransitioning(true);
      setDirection('enter');
      setTransitionState('entering');
      
      onTransitionStart?.('enter');
      
      return new Promise((resolve) => {
        // 设置active状态触发动画
        animationFrameRef.current = requestAnimationFrame(() => {
          setTransitionState('active');
          
          // 动画完成后清理
          timeoutRef.current = setTimeout(() => {
            setTransitionState('idle');
            setIsTransitioning(false);
            onTransitionEnd?.('enter');
            resolve();
          }, duration);
        });
      });
    }, [currentType, duration, disabled, onTransitionStart, onTransitionEnd]);
    
    // 退出转场
    const triggerExit = useCallback(async (): Promise<void> => {
      if (disabled || prefersReducedMotion.current) return;
      
      setIsTransitioning(true);
      setDirection('exit');
      setTransitionState('exiting');
      
      onTransitionStart?.('exit');
      
      return new Promise((resolve) => {
        animationFrameRef.current = requestAnimationFrame(() => {
          setTransitionState('active');
          
          timeoutRef.current = setTimeout(() => {
            setTransitionState('idle');
            setIsTransitioning(false);
            onTransitionEnd?.('exit');
            resolve();
          }, duration);
        });
      });
    }, [duration, disabled, onTransitionStart, onTransitionEnd]);
    
    // 暴露给父组件的方法
    useImperativeHandle(ref, () => ({
      triggerTransition,
      setTransitionState,
      getCurrentState: () => transitionState,
    }), [triggerTransition, transitionState]);
    
    // 路由变化监听
    useEffect(() => {
      if (prevPathnameRef.current !== pathname) {
        triggerTransition();
        prevPathnameRef.current = pathname;
      }
    }, [pathname, triggerTransition]);
    
    // 清理定时器
    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }, []);
    
    // 生成CSS类名
    const getTransitionClasses = useCallback(() => {
      const classes = ['page-transition-container'];
      
      if (disabled || prefersReducedMotion.current) {
        classes.push('transition-none');
        return classes;
      }
      
      // 基础转场类
      switch (currentType) {
        case 'slide-3d':
          classes.push('page-slide-3d');
          break;
        case 'depth-stack':
          classes.push('page-depth-stack');
          break;
        case 'quantum-teleport':
          classes.push('page-quantum-teleport');
          break;
        case 'dimension-shift':
          classes.push('modal-dimension-shift');
          break;
        case 'energy-field':
          classes.push('modal-energy-field');
          break;
        case 'data-stream':
          classes.push('content-data-stream');
          break;
        case 'molecular-assembly':
          classes.push('content-molecular-assembly');
          break;
        case 'quantum-loading':
          classes.push('content-quantum-loading');
          break;
      }
      
      // 状态类
      if (transitionState !== 'idle') {
        classes.push(direction);
        if (transitionState === 'active') {
          classes.push('active');
        }
      }
      
      // 加载状态类
      if (currentType.includes('loading') || currentType.includes('data-stream')) {
        if (isTransitioning) {
          classes.push('loading');
        } else {
          classes.push('loaded');
        }
      }
      
      // 性能优化类
      classes.push('transition-optimized');
      
      return classes;
    }, [currentType, direction, transitionState, disabled, isTransitioning]);
    
    // 合并样式
    const containerStyle: React.CSSProperties = {
      ...style,
      '--transition-duration': `${duration}ms`,
      '--preserve-scroll': preserveScroll ? 'auto' : 'hidden',
    } as React.CSSProperties;
    
    return (
      <div
        ref={containerRef}
        className={`${getTransitionClasses().join(' ')} ${className}`.trim()}
        style={containerStyle}
        role="main"
        aria-live="polite"
        aria-busy={isTransitioning}
        data-transition-type={currentType}
        data-transition-state={transitionState}
        data-transition-direction={direction}
      >
        {children}
      </div>
    );
  }
);

PageTransition.displayName = 'PageTransition';

/**
 * 页面转场Hook - 简化转场控制
 */
export function usePageTransition(defaultType?: TransitionType) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentType, setCurrentType] = useState<TransitionType>(defaultType || 'slide-3d');
  
  const transitionRef = useRef<PageTransitionRef>(null);
  
  const triggerTransition = useCallback(async (type?: TransitionType) => {
    if (type) setCurrentType(type);
    setIsTransitioning(true);
    
    try {
      await transitionRef.current?.triggerTransition(type);
    } finally {
      setIsTransitioning(false);
    }
  }, []);
  
  const setTransitionState = useCallback((state: TransitionState) => {
    transitionRef.current?.setTransitionState(state);
  }, []);
  
  const getCurrentState = useCallback(() => {
    return transitionRef.current?.getCurrentState() || 'idle';
  }, []);
  
  return {
    ref: transitionRef,
    isTransitioning,
    currentType,
    setCurrentType,
    triggerTransition,
    setTransitionState,
    getCurrentState,
  };
}

/**
 * 转场上下文Provider
 */
export const TransitionContext = React.createContext<TransitionContext | null>(null);

export function useTransitionContext() {
  const context = React.useContext(TransitionContext);
  if (!context) {
    throw new Error('useTransitionContext must be used within a TransitionProvider');
  }
  return context;
}

/**
 * 内容分子化组件 - 用于分子重组动画
 */
export function MolecularText({ 
  children, 
  className = '',
  ...props 
}: { 
  children: string;
  className?: string;
  [key: string]: any;
}) {
  const chars = children.split('').map((char, index) => (
    <span key={index} className="char">
      {char === ' ' ? '\u00A0' : char}
    </span>
  ));
  
  return (
    <span className={`molecular-text ${className}`} {...props}>
      {chars}
    </span>
  );
}

/**
 * 快速转场组件 - 用于紧急情况
 */
export function QuickTransition({ 
  children, 
  className = '',
  ...props 
}: { 
  children: ReactNode;
  className?: string;
  [key: string]: any;
}) {
  return (
    <div className={`transition-fast ${className}`} {...props}>
      {children}
    </div>
  );
}

// 默认导出
export default PageTransition; 