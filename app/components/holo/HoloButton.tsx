import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { IconButton } from '../button';
import styles from './HoloButton.module.scss';

// {{CHENGQI:
// Action: Created
// Timestamp: 2025-06-10 18:39:15 +08:00
// Reason: P3-LD-014任务 - 创建HoloButton高端组件，实现全息材质效果
// Principle_Applied: SOLID-S(单一职责全息效果), DRY(复用premium变量系统), KISS(清晰组件接口)
// Optimization: TypeScript类型安全 + GPU加速动画 + 性能监控
// Architectural_Note (AR): 基于现有Button组件架构，保持API兼容性，支持全息效果扩展
// Documentation_Note (DW): 完整TypeScript类型定义，支持全息特效配置和性能优化
// }}

// 全息效果类型定义
export type HoloEffect = 'rainbow' | 'aurora' | 'nebula' | 'quantum' | 'energy';
export type HoloIntensity = 'subtle' | 'normal' | 'intense' | 'extreme';
export type HoloAnimation = 'static' | 'pulse' | 'flow' | 'shimmer' | 'breathing';

// 能量场模式
export type EnergyFieldMode = 'default' | 'charging' | 'active' | 'critical';

// HoloButton属性接口
export interface HoloButtonProps {
  // 基础按钮属性（继承现有Button接口）
  text?: string;
  icon?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  tabIndex?: number;
  
  // 全息效果属性
  holoEffect?: HoloEffect;
  holoIntensity?: HoloIntensity;
  holoAnimation?: HoloAnimation;
  
  // 能量场效果
  energyField?: boolean;
  energyFieldMode?: EnergyFieldMode;
  
  // 高级配置
  glassMorphism?: boolean;  // 磨砂玻璃效果
  quantumGlow?: boolean;    // 量子发光效果
  dimensionalDepth?: boolean; // 维度深度效果
  particleTrail?: boolean;  // 粒子轨迹效果
  
  // 性能与可访问性
  reducedMotion?: boolean;  // 减少动画（可访问性）
  performanceMode?: 'high' | 'balanced' | 'eco'; // 性能模式
  
  // 回调函数
  onHoloEffectStart?: () => void;
  onHoloEffectEnd?: () => void;
  onEnergyFieldActivate?: () => void;
}

// HoloButton Ref接口
export interface HoloButtonRef {
  element: HTMLButtonElement | null;
  triggerHoloEffect: (effect: HoloEffect) => void;
  activateEnergyField: () => void;
  getPerformanceMetrics: () => HoloPerformanceMetrics;
}

// 性能指标接口
interface HoloPerformanceMetrics {
  renderTime: number;
  animationFrames: number;
  memoryUsage: number;
  gpuAccelerated: boolean;
}

// HoloButton组件实现
const HoloButton = forwardRef<HoloButtonRef, HoloButtonProps>(({
  text,
  icon,
  onClick,
  onMouseEnter,
  onMouseLeave,
  disabled = false,
  loading = false,
  type = 'button',
  className = '',
  style = {},
  title,
  tabIndex,
  
  // 全息效果配置
  holoEffect = 'rainbow',
  holoIntensity = 'normal',
  holoAnimation = 'shimmer',
  
  // 能量场配置
  energyField = true,
  energyFieldMode = 'default',
  
  // 高级效果配置
  glassMorphism = true,
  quantumGlow = true,
  dimensionalDepth = true,
  particleTrail = false,
  
  // 性能配置
  reducedMotion = false,
  performanceMode = 'balanced',
  
  // 回调函数
  onHoloEffectStart,
  onHoloEffectEnd,
  onEnergyFieldActivate
}, ref) => {
  
  // 状态管理
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isHoloActive, setIsHoloActive] = useState(false);
  const [currentEffect, setCurrentEffect] = useState<HoloEffect>(holoEffect);
  const [performanceMetrics, setPerformanceMetrics] = useState<HoloPerformanceMetrics>({
    renderTime: 0,
    animationFrames: 0,
    memoryUsage: 0,
    gpuAccelerated: true
  });
  
  // Refs
  const buttonRef = useRef<HTMLButtonElement>(null);
  const animationFrameRef = useRef<number>(0);
  const renderStartTime = useRef<number>(0);
  
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
    
    if (performanceMode === 'high') {
      animationFrameRef.current = requestAnimationFrame(updateMetrics);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [performanceMode, isHoloActive]);
  
  // 全息效果触发
  const triggerHoloEffect = (effect: HoloEffect) => {
    if (disabled || loading) return;
    
    setCurrentEffect(effect);
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
  
  // 能量场激活
  const activateEnergyField = () => {
    if (disabled || loading) return;
    onEnergyFieldActivate?.();
  };
  
  // 事件处理器
  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsHovered(true);
    if (energyField) {
      triggerHoloEffect(currentEffect);
    }
    onMouseEnter?.(e);
  };
  
  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsHovered(false);
    onMouseLeave?.(e);
  };
  
  const handleMouseDown = () => {
    setIsPressed(true);
    if (energyField) {
      activateEnergyField();
    }
  };
  
  const handleMouseUp = () => {
    setIsPressed(false);
  };
  
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;
    
    // 点击时触发强化全息效果
    triggerHoloEffect(currentEffect);
    onClick?.(e);
  };
  
  // 暴露组件方法
  useImperativeHandle(ref, () => ({
    element: buttonRef.current,
    triggerHoloEffect,
    activateEnergyField,
    getPerformanceMetrics: () => performanceMetrics
  }));
  
  // 动态样式类名
  const getButtonClasses = () => {
    const classes = [
      styles.holoButton,
      styles[`holo-${holoEffect}`],
      styles[`intensity-${holoIntensity}`],
      styles[`animation-${holoAnimation}`],
      className
    ];
    
    if (isHovered) classes.push(styles.hovered);
    if (isPressed) classes.push(styles.pressed);
    if (isHoloActive) classes.push(styles.holoActive);
    if (disabled) classes.push(styles.disabled);
    if (loading) classes.push(styles.loading);
    
    if (energyField) {
      classes.push(styles.energyField);
      classes.push(styles[`energy-${energyFieldMode}`]);
    }
    
    if (glassMorphism) classes.push(styles.glassMorphism);
    if (quantumGlow) classes.push(styles.quantumGlow);
    if (dimensionalDepth) classes.push(styles.dimensionalDepth);
    if (particleTrail && isHovered) classes.push(styles.particleTrail);
    
    if (reducedMotion) classes.push(styles.reducedMotion);
    classes.push(styles[`performance-${performanceMode}`]);
    
    return classes.filter(Boolean).join(' ');
  };
  
  // 动态内联样式
  const getDynamicStyles = (): React.CSSProperties => {
    const dynamicStyle: React.CSSProperties = {
      ...style,
      '--holo-intensity': holoIntensity === 'subtle' ? '0.3' :
                         holoIntensity === 'normal' ? '0.6' :
                         holoIntensity === 'intense' ? '0.8' : '1.0',
      '--energy-field-strength': energyFieldMode === 'critical' ? '1.0' :
                                energyFieldMode === 'active' ? '0.8' :
                                energyFieldMode === 'charging' ? '0.6' : '0.4'
    } as React.CSSProperties;
    
    return dynamicStyle;
  };
  
  return (
    <button
      ref={buttonRef}
      type={type}
      className={getButtonClasses()}
      style={getDynamicStyles()}
      disabled={disabled || loading}
      title={title}
      tabIndex={tabIndex}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      aria-label={text || title}
      aria-pressed={isPressed}
      aria-disabled={disabled}
    >
      {/* 全息背景层 */}
      <div className={styles.holoBackground}>
        <div className={styles.holoLayer1} />
        <div className={styles.holoLayer2} />
        <div className={styles.holoLayer3} />
      </div>
      
      {/* 能量场效果层 */}
      {energyField && (
        <div className={styles.energyFieldContainer}>
          <div className={styles.energyFieldCore} />
          <div className={styles.energyFieldAura} />
          <div className={styles.energyFieldPulse} />
        </div>
      )}
      
      {/* 量子发光层 */}
      {quantumGlow && (
        <div className={styles.quantumGlowContainer}>
          <div className={styles.quantumGlowInner} />
          <div className={styles.quantumGlowOuter} />
        </div>
      )}
      
      {/* 按钮内容 */}
      <div className={styles.buttonContent}>
        {loading && (
          <div className={styles.loadingSpinner}>
            <div className={styles.quantumSpinner} />
          </div>
        )}
        
        {icon && (
          <div className={styles.buttonIcon}>
            {icon}
          </div>
        )}
        
        {text && (
          <span className={styles.buttonText}>
            {text}
          </span>
        )}
      </div>
      
      {/* 粒子轨迹效果 */}
      {particleTrail && isHovered && (
        <div className={styles.particleTrailContainer}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`${styles.particle} ${styles[`particle-${i}`]}`} />
          ))}
        </div>
      )}
      
      {/* 维度深度边框 */}
      {dimensionalDepth && (
        <div className={styles.dimensionalBorder}>
          <div className={styles.dimensionalLayer1} />
          <div className={styles.dimensionalLayer2} />
          <div className={styles.dimensionalLayer3} />
        </div>
      )}
    </button>
  );
});

HoloButton.displayName = 'HoloButton';

export default HoloButton; 