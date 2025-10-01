import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import styles from './HoloCard.module.scss';

// {{CHENGQI:
// Action: Created
// Timestamp: 2025-06-10 20:51:02 +08:00
// Reason: P3-LD-015任务 - 创建HoloCard全息卡片组件，实现光折射背景、悬浮感、维度切换效果
// Principle_Applied: SOLID-S(单一职责全息卡片), DRY(复用premium变量和HoloButton模式), KISS(清晰组件接口)
// Optimization: TypeScript类型安全 + GPU加速动画 + 磨砂玻璃效果 + 3D变换优化
// Architectural_Note (AR): 基于现有HoloButton架构，保持API一致性，支持全息效果扩展和性能优化
// Documentation_Note (DW): 完整TypeScript类型定义，支持全息特效配置、维度切换和可访问性
// }}

// 全息卡片效果类型定义
export type HoloCardEffect = 'glass' | 'crystal' | 'plasma' | 'quantum' | 'dimension';
export type HoloCardIntensity = 'subtle' | 'normal' | 'intense' | 'extreme';
export type HoloCardAnimation = 'static' | 'floating' | 'dimensional' | 'ethereal' | 'quantum-shift';

// 维度切换模式
export type DimensionMode = 'normal' | 'elevated' | 'transcendent' | 'void';

// 卡片尺寸类型
export type HoloCardSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

// 光折射强度
export type RefractionIntensity = 'none' | 'subtle' | 'normal' | 'intense';

// HoloCard属性接口
export interface HoloCardProps {
  // 基础卡片属性
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLDivElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void;
  
  // 卡片配置
  size?: HoloCardSize;
  padding?: boolean;
  interactive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  
  // 全息效果属性
  holoEffect?: HoloCardEffect;
  holoIntensity?: HoloCardIntensity;
  holoAnimation?: HoloCardAnimation;
  
  // 磨砂玻璃效果
  glassMorphism?: boolean;
  glassOpacity?: number; // 0-1
  glassBlur?: number; // px
  
  // 3D悬浮感效果
  floatingEffect?: boolean;
  floatingHeight?: number; // px
  tiltEffect?: boolean;
  tiltMaxAngle?: number; // degrees
  
  // 维度切换效果
  dimensionalShift?: boolean;
  dimensionMode?: DimensionMode;
  dimensionTransition?: number; // ms
  
  // 光折射效果
  lightRefraction?: boolean;
  refractionIntensity?: RefractionIntensity;
  refractionColor?: string;
  
  // 高级配置
  quantumGlow?: boolean;    // 量子发光效果
  energyField?: boolean;    // 能量场边界
  particleEffect?: boolean; // 粒子效果
  depthShadow?: boolean;    // 深度阴影
  
  // 性能与可访问性
  reducedMotion?: boolean;  // 减少动画（可访问性）
  performanceMode?: 'high' | 'balanced' | 'eco'; // 性能模式
  highContrast?: boolean;   // 高对比度模式
  
  // 可访问性
  role?: string;
  tabIndex?: number;
  'aria-label'?: string;
  'aria-describedby'?: string;
  
  // 回调函数
  onHoloEffectStart?: () => void;
  onHoloEffectEnd?: () => void;
  onDimensionShift?: (mode: DimensionMode) => void;
  onFloatingStart?: () => void;
  onFloatingEnd?: () => void;
}

// HoloCard Ref接口
export interface HoloCardRef {
  element: HTMLDivElement | null;
  triggerHoloEffect: (effect: HoloCardEffect) => void;
  shiftDimension: (mode: DimensionMode) => void;
  activateQuantumGlow: () => void;
  getPerformanceMetrics: () => HoloCardPerformanceMetrics;
}

// 性能指标接口
interface HoloCardPerformanceMetrics {
  renderTime: number;
  animationFrames: number;
  memoryUsage: number;
  gpuAccelerated: boolean;
  dimensionShifts: number;
}

// HoloCard组件实现
const HoloCard = forwardRef<HoloCardRef, HoloCardProps>(({
  children,
  className = '',
  style = {},
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  
  // 卡片配置
  size = 'md',
  padding = true,
  interactive = false,
  disabled = false,
  loading = false,
  
  // 全息效果配置
  holoEffect = 'glass',
  holoIntensity = 'normal',
  holoAnimation = 'floating',
  
  // 磨砂玻璃配置
  glassMorphism = true,
  glassOpacity = 0.1,
  glassBlur = 20,
  
  // 3D悬浮感配置
  floatingEffect = true,
  floatingHeight = 4,
  tiltEffect = false,
  tiltMaxAngle = 10,
  
  // 维度切换配置
  dimensionalShift = true,
  dimensionMode = 'normal',
  dimensionTransition = 400,
  
  // 光折射配置
  lightRefraction = true,
  refractionIntensity = 'subtle',
  refractionColor = 'rgba(100, 150, 255, 0.3)',
  
  // 高级效果配置
  quantumGlow = false,
  energyField = false,
  particleEffect = false,
  depthShadow = true,
  
  // 性能配置
  reducedMotion = false,
  performanceMode = 'balanced',
  highContrast = false,
  
  // 可访问性配置
  role = 'article',
  tabIndex,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  
  // 回调函数
  onHoloEffectStart,
  onHoloEffectEnd,
  onDimensionShift,
  onFloatingStart,
  onFloatingEnd
}, ref) => {
  
  // 状态管理
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isHoloActive, setIsHoloActive] = useState(false);
  const [currentDimension, setCurrentDimension] = useState<DimensionMode>(dimensionMode);
  const [isFloating, setIsFloating] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [performanceMetrics, setPerformanceMetrics] = useState<HoloCardPerformanceMetrics>({
    renderTime: 0,
    animationFrames: 0,
    memoryUsage: 0,
    gpuAccelerated: true,
    dimensionShifts: 0
  });
  
  // Refs
  const cardRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>(0);
  const renderStartTime = useRef<number>(0);
  const tiltTimeoutRef = useRef<NodeJS.Timeout>();
  
  // 性能监控
  useEffect(() => {
    renderStartTime.current = performance.now();
    
    const updateMetrics = () => {
      const renderTime = performance.now() - renderStartTime.current;
      setPerformanceMetrics(prev => ({
        ...prev,
        renderTime,
        animationFrames: prev.animationFrames + 1
      }));
    };
    
    if (performanceMode === 'high' && !reducedMotion) {
      animationFrameRef.current = requestAnimationFrame(updateMetrics);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [performanceMode, isHoloActive, reducedMotion]);
  
  // 全息效果触发
  const triggerHoloEffect = (effect: HoloCardEffect) => {
    if (disabled || loading || reducedMotion) return;
    
    setIsHoloActive(true);
    onHoloEffectStart?.();
    
    // 效果持续时间基于强度
    const duration = holoIntensity === 'subtle' ? 300 : 
                    holoIntensity === 'normal' ? 600 :
                    holoIntensity === 'intense' ? 900 : 1200;
    
    setTimeout(() => {
      setIsHoloActive(false);
      onHoloEffectEnd?.();
    }, duration);
  };
  
  // 维度切换
  const shiftDimension = (mode: DimensionMode) => {
    if (disabled || loading || reducedMotion) return;
    
    setCurrentDimension(mode);
    setPerformanceMetrics(prev => ({
      ...prev,
      dimensionShifts: prev.dimensionShifts + 1
    }));
    onDimensionShift?.(mode);
  };
  
  // 量子发光激活
  const activateQuantumGlow = () => {
    if (disabled || loading || reducedMotion) return;
    triggerHoloEffect('quantum');
  };
  
  // 鼠标移动处理（用于倾斜效果）
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tiltEffect || disabled || reducedMotion) return;
    
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    
    setMousePosition({ x, y });
  };
  
  // 事件处理器
  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    
    setIsHovered(true);
    if (floatingEffect) {
      setIsFloating(true);
      onFloatingStart?.();
    }
    if (dimensionalShift) {
      shiftDimension('elevated');
    }
    if (holoAnimation !== 'static') {
      triggerHoloEffect(holoEffect);
    }
    onMouseEnter?.(e);
  };
  
  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    
    setIsHovered(false);
    setIsFloating(false);
    setMousePosition({ x: 0, y: 0 });
    onFloatingEnd?.();
    
    if (dimensionalShift) {
      shiftDimension('normal');
    }
    
    // 清除倾斜效果
    if (tiltTimeoutRef.current) {
      clearTimeout(tiltTimeoutRef.current);
    }
    
    onMouseLeave?.(e);
  };
  
  const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    if (disabled) return;
    
    setIsFocused(true);
    if (dimensionalShift) {
      shiftDimension('elevated');
    }
    onFocus?.(e);
  };
  
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (disabled) return;
    
    setIsFocused(false);
    if (dimensionalShift) {
      shiftDimension('normal');
    }
    onBlur?.(e);
  };
  
  const handleMouseDown = () => {
    if (disabled || !interactive) return;
    setIsPressed(true);
  };
  
  const handleMouseUp = () => {
    if (disabled || !interactive) return;
    setIsPressed(false);
  };
  
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !interactive) return;
    
    // 触发点击全息效果
    if (quantumGlow) {
      activateQuantumGlow();
    }
    
    onClick?.(e);
  };
  
  // 获取性能指标
  const getPerformanceMetrics = () => performanceMetrics;
  
  // 暴露组件方法
  useImperativeHandle(ref, () => ({
    element: cardRef.current,
    triggerHoloEffect,
    shiftDimension,
    activateQuantumGlow,
    getPerformanceMetrics
  }), [activateQuantumGlow, getPerformanceMetrics, shiftDimension, triggerHoloEffect]);
  
  // 生成CSS类名
  const getCardClasses = () => {
    const classes = [styles.holoCard];
    
    // 尺寸类
    classes.push(styles[`size-${size}`]);
    
    // 全息效果类
    classes.push(styles[`holo-${holoEffect}`]);
    classes.push(styles[`intensity-${holoIntensity}`]);
    classes.push(styles[`animation-${holoAnimation}`]);
    
    // 状态类
    if (isHovered) classes.push(styles.hovered);
    if (isFocused) classes.push(styles.focused);
    if (isPressed) classes.push(styles.pressed);
    if (isHoloActive) classes.push(styles.holoActive);
    if (isFloating) classes.push(styles.floating);
    if (disabled) classes.push(styles.disabled);
    if (loading) classes.push(styles.loading);
    if (interactive) classes.push(styles.interactive);
    
    // 维度模式类
    classes.push(styles[`dimension-${currentDimension}`]);
    
    // 特效类
    if (glassMorphism) classes.push(styles.glassMorphism);
    if (floatingEffect) classes.push(styles.floatingEffect);
    if (tiltEffect) classes.push(styles.tiltEffect);
    if (dimensionalShift) classes.push(styles.dimensionalShift);
    if (lightRefraction) classes.push(styles.lightRefraction);
    if (quantumGlow) classes.push(styles.quantumGlow);
    if (energyField) classes.push(styles.energyField);
    if (particleEffect) classes.push(styles.particleEffect);
    if (depthShadow) classes.push(styles.depthShadow);
    if (padding) classes.push(styles.padding);
    
    // 可访问性类
    if (reducedMotion) classes.push(styles.reducedMotion);
    if (highContrast) classes.push(styles.highContrast);
    
    // 性能模式类
    classes.push(styles[`performance-${performanceMode}`]);
    
    // 光折射强度类
    classes.push(styles[`refraction-${refractionIntensity}`]);
    
    // 自定义类名
    if (className) classes.push(className);
    
    return classes.join(' ');
  };
  
  // 生成动态样式
  const getDynamicStyles = (): React.CSSProperties => {
    const dynamicStyles: React.CSSProperties & { [key: string]: any } = {
      ...style
    };
    
    // 磨砂玻璃自定义属性
    if (glassMorphism) {
      dynamicStyles['--glass-opacity'] = glassOpacity;
      dynamicStyles['--glass-blur'] = `${glassBlur}px`;
    }
    
    // 悬浮高度
    if (floatingEffect) {
      dynamicStyles['--floating-height'] = `${floatingHeight}px`;
    }
    
    // 倾斜效果
    if (tiltEffect && (isHovered || isFocused)) {
      const tiltX = mousePosition.y * tiltMaxAngle;
      const tiltY = mousePosition.x * -tiltMaxAngle;
      dynamicStyles.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    }
    
    // 维度切换过渡时间
    if (dimensionalShift) {
      dynamicStyles['--dimension-transition'] = `${dimensionTransition}ms`;
    }
    
    // 光折射颜色
    if (lightRefraction) {
      dynamicStyles['--refraction-color'] = refractionColor;
    }
    
    return dynamicStyles;
  };
  
  return (
    <div
      ref={cardRef}
      className={getCardClasses()}
      style={getDynamicStyles()}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onFocus={handleFocus}
      onBlur={handleBlur}
      role={role}
      tabIndex={interactive ? (tabIndex ?? 0) : undefined}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-disabled={disabled}
    >
      {/* 全息背景层系统 */}
      <div className={styles.holoBackground}>
        <div className={styles.holoLayer1} />
        <div className={styles.holoLayer2} />
        <div className={styles.holoLayer3} />
      </div>
      
      {/* 光折射效果层 */}
      {lightRefraction && (
        <div className={styles.refractionLayer}>
          <div className={styles.refractionBeam1} />
          <div className={styles.refractionBeam2} />
          <div className={styles.refractionBeam3} />
        </div>
      )}
      
      {/* 能量场边界 */}
      {energyField && (
        <div className={styles.energyFieldBoundary} />
      )}
      
      {/* 粒子效果层 */}
      {particleEffect && (
        <div className={styles.particleContainer}>
          <div className={styles.particle1} />
          <div className={styles.particle2} />
          <div className={styles.particle3} />
          <div className={styles.particle4} />
        </div>
      )}
      
      {/* 加载状态指示器 */}
      {loading && (
        <div className={styles.loadingIndicator}>
          <div className={styles.loadingSpinner} />
        </div>
      )}
      
      {/* 卡片内容 */}
      <div className={styles.cardContent}>
        {children}
      </div>
    </div>
  );
});

HoloCard.displayName = 'HoloCard';

export default HoloCard;