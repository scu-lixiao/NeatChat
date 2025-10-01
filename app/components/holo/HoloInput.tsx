import React, { useState, useRef, useEffect, forwardRef, useCallback } from 'react';
import { useChainReaction } from '../../hooks/useChainReaction';
import styles from './HoloInput.module.scss';

/**
 * 全息效果类型定义
 */
export type HoloEffectType = 'glass' | 'crystal' | 'plasma' | 'quantum' | 'dimension';

/**
 * 全息强度级别
 */
export type HoloIntensity = 'subtle' | 'normal' | 'intense' | 'extreme';

/**
 * 输入组件尺寸
 */
export type HoloInputSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * 数据流可视化类型
 */
export type DataFlowType = 'typing' | 'processing' | 'complete' | 'error';

/**
 * 智能状态类型
 */
export type InputStatusType = 'idle' | 'focus' | 'active' | 'complete' | 'success' | 'warning' | 'error';

/**
 * 性能模式
 */
export type PerformanceMode = 'high' | 'balanced' | 'eco';

/**
 * HoloInput组件Props接口
 */
export interface HoloInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 全息效果类型 */
  holoEffect?: HoloEffectType;
  /** 全息效果强度 */
  intensity?: HoloIntensity;
  /** 组件尺寸 */
  size?: HoloInputSize;
  /** 数据流可视化类型 */
  dataFlow?: DataFlowType;
  /** 智能状态 */
  status?: InputStatusType;
  /** 性能模式 */
  performanceMode?: PerformanceMode;
  /** 是否启用粒子效果 */
  enableParticles?: boolean;
  /** 是否启用连锁反应 */
  enableChainReaction?: boolean;
  /** 是否启用数据流可视化 */
  enableDataFlow?: boolean;
  /** 自定义光感颜色 */
  glowColor?: string;
  /** 标签文本 */
  label?: string;
  /** 辅助文本 */
  helperText?: string;
  /** 错误信息 */
  errorMessage?: string;
  /** 是否显示字符计数 */
  showCharCount?: boolean;
  /** 最大字符数 */
  maxLength?: number;
  /** 输入时的回调 */
  onInputChange?: (value: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  /** 状态变化回调 */
  onStatusChange?: (status: InputStatusType) => void;
  /** 自定义类名 */
  className?: string;
}

/**
 * HoloInput - 全息输入组件
 * 
 * 特性：
 * - 动态光感边框效果
 * - 数据流动可视化
 * - 智能状态指示
 * - 流畅的状态切换动画
 * - 完整的TypeScript类型支持
 * - 性能优化和可访问性支持
 * 
 * @example
 * ```tsx
 * <HoloInput
 *   holoEffect="quantum"
 *   intensity="intense"
 *   size="lg"
 *   enableDataFlow
 *   enableParticles
 *   label="AI Prompt"
 *   placeholder="Enter your message..."
 *   onInputChange={(value) => console.log(value)}
 * />
 * ```
 */
export const HoloInput = forwardRef<HTMLInputElement, HoloInputProps>(({
  holoEffect = 'quantum',
  intensity = 'normal',
  size = 'md',
  dataFlow = 'idle',
  status = 'idle',
  performanceMode = 'balanced',
  enableParticles = true,
  enableChainReaction = true,
  enableDataFlow = true,
  glowColor,
  label,
  helperText,
  errorMessage,
  showCharCount = false,
  maxLength,
  onInputChange,
  onStatusChange,
  className = '',
  style,
  onFocus,
  onBlur,
  onChange,
  value,
  defaultValue,
  ...inputProps
}, ref) => {
  // 状态管理
  const [currentStatus, setCurrentStatus] = useState<InputStatusType>(status);
  const [isFocused, setIsFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState(value || defaultValue || '');
  const [charCount, setCharCount] = useState(0);
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  
  // 连锁反应Hook
  const chainReaction = useChainReaction({
    id: `holo-input-${Math.random().toString(36).substring(7)}`,
    type: 'both',
    effects: ['ripple', 'energy-transfer']
  });
  
  // 生成组件类名
  const getComponentClasses = useCallback(() => {
    const classes = [
      styles.holoInput,
      styles[`holo-${holoEffect}`],
      styles[`intensity-${intensity}`],
      styles[`size-${size}`],
      styles[`status-${currentStatus}`],
      styles[`performance-${performanceMode}`],
    ];
    
    if (isFocused) classes.push(styles.focused);
    if (isTyping) classes.push(styles.typing);
    if (enableParticles) classes.push(styles.particles);
    if (enableDataFlow) classes.push(styles.dataFlow);
    if (errorMessage) classes.push(styles.error);
    
    return classes.filter(Boolean).join(' ');
  }, [holoEffect, intensity, size, currentStatus, performanceMode, isFocused, isTyping, enableParticles, enableDataFlow, errorMessage]);

  // 处理焦点事件
  const handleFocus = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setCurrentStatus('focus');
    
    // 触发连锁反应
    if (enableChainReaction) {
      chainReaction.triggerReaction({
        type: 'focus',
        intensity: intensity === 'subtle' ? 0.3 : intensity === 'normal' ? 0.6 : 0.9,
        direction: 'outward'
      });
    }
    
    onStatusChange?.(currentStatus);
    onFocus?.(event);
  }, [enableChainReaction, intensity, chainReaction, onStatusChange, onFocus, currentStatus]);

  // 处理失去焦点事件
  const handleBlur = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    setIsTyping(false);
    
    // 根据输入内容确定状态
    const newStatus = inputValue ? 'complete' : 'idle';
    setCurrentStatus(newStatus);
    
    onStatusChange?.(newStatus);
    onBlur?.(event);
  }, [inputValue, onStatusChange, onBlur]);

  // 处理输入变化
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setInputValue(newValue);
    setCharCount(newValue.length);
    setIsTyping(true);
    setCurrentStatus('active');
    
    // 清除之前的定时器
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // 设置新的定时器，500ms后认为停止输入
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      setCurrentStatus(isFocused ? 'focus' : 'idle');
    }, 500);
    
    // 触发能量传递效果
    if (enableChainReaction) {
      chainReaction.triggerReaction({
        type: 'data-update',
        intensity: intensity === 'subtle' ? 0.5 : intensity === 'normal' ? 1 : 1.5,
        direction: 'outward'
      });
    }
    
    onInputChange?.(newValue, event);
    onChange?.(event);
  }, [isFocused, enableChainReaction, intensity, chainReaction, onInputChange, onChange]);

  // 获取状态指示文本
  const getStatusText = useCallback(() => {
    if (errorMessage) return errorMessage;
    if (helperText) return helperText;
    return '';
  }, [errorMessage, helperText]);

  // 获取字符计数显示
  const getCharCountDisplay = useCallback(() => {
    if (!showCharCount) return null;
    
    const maxLengthText = maxLength ? `/${maxLength}` : '';
    const isOverLimit = maxLength && charCount > maxLength;
    
    return (
      <span className={`${styles.charCount} ${isOverLimit ? styles.overLimit : ''}`}>
        {charCount}{maxLengthText}
      </span>
    );
  }, [showCharCount, maxLength, charCount]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // 同步外部状态
  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  // 同步外部值
  useEffect(() => {
    if (value !== undefined) {
      setInputValue(String(value));
      setCharCount(String(value).length);
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={`${getComponentClasses()} ${className}`}
      style={{
        '--custom-glow-color': glowColor,
        ...style
      } as React.CSSProperties}
      data-testid="holo-input-container"
    >
      {/* 标签 */}
      {label && (
        <label className={styles.label} htmlFor={inputProps.id}>
          {label}
        </label>
      )}
      
      {/* 输入框容器 */}
      <div className={styles.inputContainer}>
        {/* 背景层效果 */}
        <div className={styles.backgroundLayers}>
          <div className={styles.layer1}></div>
          <div className={styles.layer2}></div>
          <div className={styles.layer3}></div>
        </div>
        
        {/* 光感边框 */}
        <div className={styles.glowBorder}></div>
        
        {/* 数据流效果 */}
        {enableDataFlow && (
          <div className={styles.dataFlowContainer}>
            <div className={styles.dataFlow1}></div>
            <div className={styles.dataFlow2}></div>
            <div className={styles.dataFlow3}></div>
          </div>
        )}
        
        {/* 粒子效果 */}
        {enableParticles && (
          <div className={styles.particleContainer}>
            <div className={styles.particle1}></div>
            <div className={styles.particle2}></div>
            <div className={styles.particle3}></div>
            <div className={styles.particle4}></div>
          </div>
        )}
        
        {/* 实际输入框 */}
        <input
          ref={(element) => {
            if (inputRef.current !== element) {
              (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = element;
            }
            if (typeof ref === 'function') {
              ref(element);
            } else if (ref && 'current' in ref) {
              (ref as React.MutableRefObject<HTMLInputElement | null>).current = element;
            }
          }}
          {...inputProps}
          className={styles.input}
          value={inputValue}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          maxLength={maxLength}
          data-testid="holo-input"
        />
        
        {/* 状态指示器 */}
        <div className={styles.statusIndicator}>
          <div className={styles.statusDot}></div>
        </div>
      </div>
      
      {/* 底部信息区域 */}
      <div className={styles.infoContainer}>
        {/* 状态文本 */}
        {getStatusText() && (
          <span className={styles.statusText}>
            {getStatusText()}
          </span>
        )}
        
        {/* 字符计数 */}
        {getCharCountDisplay()}
      </div>
    </div>
  );
});

HoloInput.displayName = 'HoloInput';

export default HoloInput; 