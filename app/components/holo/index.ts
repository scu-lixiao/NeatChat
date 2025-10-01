/**
 * NextChat Holographic Design Language System
 * 全息设计语言组件库统一导出
 * 
 * Created: 2025-06-10 by P3-LD-019 Task
 * Version: 1.0.0
 * 
 * 这是NextChat高端UI系统的全息组件库，提供完整的"月付费100美元级别"UI体验。
 * 基于深邃空间主题系统、量子流体动效系统和全息材质效果系统构建。
 * 
 * 特性:
 * - 🌌 深邃空间主题 (6层背景深度 + 星光边框)
 * - ⚡ 量子流体动效 (18种物理动画曲线)
 * - 🌈 全息材质效果 (磨砂玻璃 + 光折射 + 维度切换)
 * - 🎯 完整TypeScript类型支持
 * - ♿ 完整可访问性支持 (WCAG 2.1 AA)
 * - 🚀 GPU硬件加速 + 性能优化
 * 
 * @example
 * ```tsx
 * import { HoloButton, HoloCard, HoloInput, HoloModal } from '@/components/holo';
 * 
 * function App() {
 *   return (
 *     <HoloCard holoEffect="quantum" intensity="intense" size="lg">
 *       <HoloInput 
 *         holoEffect="quantum"
 *         enableDataFlow
 *         enableParticles
 *         label="AI Prompt"
 *         placeholder="Enter your message..."
 *       />
 *       <HoloButton 
 *         holoEffect="energy" 
 *         energyField 
 *         text="Submit"
 *         onClick={handleSubmit}
 *       />
 *     </HoloCard>
 *   );
 * }
 * ```
 */

// =============================================================================
// 核心组件导出
// =============================================================================

// HoloButton - 全息按钮组件
export { default as HoloButton } from './HoloButton';
export type {
  HoloButtonProps,
  HoloButtonRef,
  HoloEffect,
  HoloIntensity as ButtonHoloIntensity,
  HoloAnimation as ButtonHoloAnimation,
  EnergyFieldMode,
} from './HoloButton';

// HoloCard - 全息卡片组件
export { default as HoloCard } from './HoloCard';
export type {
  HoloCardProps,
  HoloCardRef,
  HoloCardEffect,
  HoloCardIntensity,
  HoloCardAnimation,
  DimensionMode,
  HoloCardSize,
  RefractionIntensity,
} from './HoloCard';

// HoloInput - 全息输入组件
export { default as HoloInput } from './HoloInput';
export type {
  HoloInputProps,
  HoloEffectType as InputHoloEffect,
  HoloIntensity as InputHoloIntensity,
  HoloInputSize,
  DataFlowType,
  InputStatusType,
  PerformanceMode as InputPerformanceMode,
} from './HoloInput';

// HoloModal - 全息模态框组件
export { default as HoloModal } from './HoloModal';
export type {
  HoloModalProps,
  HoloEffectType as ModalHoloEffect,
  HoloIntensity as ModalHoloIntensity,
  HoloSize as ModalHoloSize,
  HoloDimension as ModalHoloDimension,
  PerformanceMode as ModalPerformanceMode,
} from './HoloModal';

// =============================================================================
// 统一类型系统
// =============================================================================

/**
 * 全息设计语言统一类型定义
 * 为整个组件库提供一致的类型系统
 */
export namespace HoloTypes {
  // 通用全息效果类型
  export type UnifiedHoloEffect = 
    | 'glass'      // 磨砂玻璃效果
    | 'crystal'    // 水晶材质效果  
    | 'plasma'     // 等离子体效果
    | 'quantum'    // 量子发光效果
    | 'dimension'  // 维度切换效果
    | 'rainbow'    // 彩虹全息效果
    | 'aurora'     // 极光效果
    | 'nebula'     // 星云效果
    | 'energy';    // 能量场效果

  // 通用强度级别
  export type UnifiedIntensity = 
    | 'subtle'   // 微妙 - 25%强度
    | 'normal'   // 正常 - 50%强度
    | 'intense'  // 强烈 - 75%强度
    | 'extreme'; // 极限 - 100%强度

  // 通用尺寸系统
  export type UnifiedSize = 
    | 'sm'   // 小尺寸
    | 'md'   // 中等尺寸（默认）
    | 'lg'   // 大尺寸
    | 'xl'   // 超大尺寸
    | 'full'; // 全尺寸

  // 通用性能模式
  export type UnifiedPerformanceMode = 
    | 'high'     // 高性能模式 - 所有效果开启
    | 'balanced' // 平衡模式 - 适中效果（默认）
    | 'eco';     // 节能模式 - 最小化效果

  // 通用动画状态
  export type AnimationState = 
    | 'idle'      // 空闲状态
    | 'hover'     // 悬停状态
    | 'active'    // 激活状态
    | 'focus'     // 聚焦状态
    | 'disabled'  // 禁用状态
    | 'loading';  // 加载状态

  // 全息材质属性
  export interface HoloMaterialProps {
    /** 磨砂玻璃效果 */
    glassMorphism?: boolean;
    /** 玻璃透明度 (0-1) */
    glassOpacity?: number;
    /** 模糊强度 (px) */
    glassBlur?: number;
    /** 量子发光效果 */
    quantumGlow?: boolean;
    /** 能量场边界 */
    energyField?: boolean;
    /** 粒子效果 */
    particleEffect?: boolean;
    /** 深度阴影 */
    depthShadow?: boolean;
  }

  // 性能配置属性
  export interface PerformanceProps {
    /** 性能模式 */
    performanceMode?: UnifiedPerformanceMode;
    /** 减少动画（可访问性） */
    reducedMotion?: boolean;
    /** 高对比度模式 */
    highContrast?: boolean;
    /** GPU加速 */
    gpuAccelerated?: boolean;
  }

  // 可访问性属性
  export interface AccessibilityProps {
    /** ARIA标签 */
    'aria-label'?: string;
    /** ARIA描述 */
    'aria-describedby'?: string;
    /** 角色定义 */
    role?: string;
    /** 键盘导航索引 */
    tabIndex?: number;
  }

  // 回调函数类型
  export interface HoloCallbacks {
    /** 全息效果开始回调 */
    onHoloEffectStart?: () => void;
    /** 全息效果结束回调 */
    onHoloEffectEnd?: () => void;
    /** 维度切换回调 */
    onDimensionShift?: (dimension: string) => void;
    /** 性能指标回调 */
    onPerformanceMetrics?: (metrics: PerformanceMetrics) => void;
  }

  // 性能指标接口
  export interface PerformanceMetrics {
    /** 渲染时间 (ms) */
    renderTime: number;
    /** 动画帧数 */
    animationFrames: number;
    /** 内存使用 (MB) */
    memoryUsage: number;
    /** GPU加速状态 */
    gpuAccelerated: boolean;
    /** 当前FPS */
    currentFPS: number;
  }
}

// =============================================================================
// 组件工厂函数
// =============================================================================

/**
 * 全息组件工厂
 * 提供统一的组件创建和配置方法
 */
export namespace HoloFactory {
  
  /**
   * 创建默认全息按钮配置
   */
  export const createButtonConfig = (
    effect: HoloTypes.UnifiedHoloEffect = 'quantum',
    intensity: HoloTypes.UnifiedIntensity = 'normal'
  ) => ({
    holoEffect: effect,
    holoIntensity: intensity,
    energyField: true,
    glassMorphism: true,
    quantumGlow: intensity !== 'subtle',
    dimensionalDepth: true,
    performanceMode: 'balanced',
  });

  /**
   * 创建默认全息卡片配置
   */
  export const createCardConfig = (
    effect: HoloTypes.UnifiedHoloEffect = 'glass',
    size: HoloTypes.UnifiedSize = 'md'
  ) => ({
    holoEffect: effect,
    size: size,
    glassMorphism: true,
    floatingEffect: true,
    dimensionalShift: true,
    lightRefraction: true,
    performanceMode: 'balanced',
  });

  /**
   * 创建默认全息输入配置
   */
  export const createInputConfig = (
    effect: HoloTypes.UnifiedHoloEffect = 'quantum',
    size: HoloTypes.UnifiedSize = 'md'
  ) => ({
    holoEffect: effect,
    size: size,
    enableDataFlow: true,
    enableParticles: true,
    enableChainReaction: true,
    performanceMode: 'balanced',
  });

  /**
   * 创建默认全息模态框配置
   */
  export const createModalConfig = (
    effect: HoloTypes.UnifiedHoloEffect = 'quantum',
    size: HoloTypes.UnifiedSize = 'md'
  ) => ({
    effect: effect,
    size: size,
    enableParticles: true,
    enableEnergyField: true,
    enableDimensionShift: true,
    performanceMode: 'balanced',
  });
}

// =============================================================================
// 主题配置系统
// =============================================================================

/**
 * 全息设计语言主题配置
 */
export namespace HoloTheme {
  
  /**
   * 深邃空间主题配置
   */
  export const DeepSpaceTheme = {
    name: 'Deep Space',
    description: '深邃宇宙空间主题',
    colors: {
      cosmos: 'rgb(4, 4, 4)',      // 宇宙深空
      void: 'rgb(8, 8, 8)',        // 虚空
      space: 'rgb(12, 12, 12)',    // 太空
      nebula: 'rgb(16, 16, 16)',   // 星云
      stellar: 'rgb(20, 20, 20)',  // 恒星
      aurora: 'rgb(28, 28, 28)',   // 极光
    },
    effects: {
      starlight: 'rgba(100, 150, 255, 0.3)',
      quantumGlow: 'rgba(100, 150, 255, 0.6)',
      energyField: 'rgba(100, 150, 255, 0.8)',
    },
    shadows: {
      xs: '0 1px 2px rgba(0, 0, 0, 0.5)',
      sm: '0 2px 4px rgba(0, 0, 0, 0.6)',
      md: '0 4px 8px rgba(0, 0, 0, 0.7)',
      lg: '0 8px 16px rgba(0, 0, 0, 0.8)',
      xl: '0 16px 32px rgba(0, 0, 0, 0.9)',
    }
  };

  /**
   * 量子动画配置
   */
  export const QuantumAnimations = {
    durations: {
      instant: '50ms',
      fast: '150ms',
      normal: '300ms',
      slow: '600ms',
      slower: '1000ms',
    },
    easings: {
      quantum: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      elastic: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      bounce: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
      smooth: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    }
  };

  /**
   * 性能级别配置
   */
  export const PerformanceLevels = {
    high: {
      particles: true,
      reflections: true,
      shadows: 'complex',
      animations: 'full',
      gpuAcceleration: true,
    },
    balanced: {
      particles: true,
      reflections: false,
      shadows: 'simple',
      animations: 'reduced',
      gpuAcceleration: true,
    },
    eco: {
      particles: false,
      reflections: false,
      shadows: 'minimal',
      animations: 'essential',
      gpuAcceleration: false,
    }
  };
}

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 全息组件库工具函数
 */
export namespace HoloUtils {
  
  /**
   * 检测设备性能级别
   */
  export const detectPerformanceLevel = (): HoloTypes.UnifiedPerformanceMode => {
    if (typeof window === 'undefined') return 'balanced';
    
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
    
    if (!gl) return 'eco';
    
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    
    // 高端GPU检测
    if (typeof renderer === 'string') {
      if (renderer.includes('RTX') || renderer.includes('GTX 1080') || renderer.includes('RX 6800')) {
        return 'high';
      }
      
      // 中端GPU或现代集成显卡
      if (renderer.includes('GTX') || renderer.includes('RX') || renderer.includes('Iris')) {
        return 'balanced';
      }
    }
    
    return 'eco';
  };

  /**
   * 获取用户的动画偏好
   */
  export const getUserMotionPreference = (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  /**
   * 生成唯一组件ID
   */
  export const generateHoloId = (prefix: string = 'holo'): string => {
    return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
  };

  /**
   * 计算全息效果强度数值
   */
  export const getIntensityValue = (intensity: HoloTypes.UnifiedIntensity): number => {
    const intensityMap = {
      subtle: 0.25,
      normal: 0.5,
      intense: 0.75,
      extreme: 1.0,
    };
    return intensityMap[intensity] || 0.5;
  };

  /**
   * 获取性能优化的样式属性
   */
  export const getOptimizedStyles = (
    performanceMode: HoloTypes.UnifiedPerformanceMode
  ): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      backfaceVisibility: 'hidden',
      perspective: '1000px',
    };

    switch (performanceMode) {
      case 'high':
        return {
          ...baseStyles,
          willChange: 'transform, opacity, box-shadow',
          transform: 'translateZ(0)',
        };
      case 'balanced':
        return {
          ...baseStyles,
          willChange: 'transform',
        };
      case 'eco':
        return baseStyles;
      default:
        return baseStyles;
    }
  };
}

// =============================================================================
// 版本信息与元数据
// =============================================================================

/**
 * 全息设计语言系统版本信息
 */
export const HoloSystemInfo = {
  version: '1.0.0',
  buildDate: '2025-06-10',
  description: 'NextChat Holographic Design Language System',
  author: 'NextChat Team',
  license: 'MIT',
  
  // 组件统计
  components: {
    HoloButton: '1.0.0',
    HoloCard: '1.0.0', 
    HoloInput: '1.0.0',
    HoloModal: '1.0.0',
  },
  
  // 功能特性
  features: [
    '深邃空间主题系统',
    '量子流体动效系统', 
    '全息材质效果系统',
    '完整TypeScript类型支持',
    '可访问性支持 (WCAG 2.1 AA)',
    'GPU硬件加速优化',
    '智能性能管理',
    '响应式设计支持',
  ],
  
  // 浏览器支持
  browserSupport: {
    chrome: '90+',
    firefox: '88+',
    safari: '14+',
    edge: '90+',
  },
  
  // 必需的CSS特性
  requiredFeatures: [
    'CSS Variables',
    'CSS Grid',
    'Flexbox',
    'backdrop-filter',
    'transform3d',
    'will-change',
  ],
} as const;

// =============================================================================
// 默认导出（便于全量导入）
// =============================================================================

/**
 * 全息组件库默认导出
 * 包含系统信息和工具函数
 */
const HoloDesignSystem = {
  // 系统信息
  HoloSystemInfo,
  
  // 工具函数
  HoloFactory,
  HoloTheme,
  HoloUtils,
};

export default HoloDesignSystem;

/**
 * 使用示例：
 * 
 * 1. 单独导入组件：
 * ```tsx
 * import { HoloButton, HoloCard } from '@/components/holo';
 * ```
 * 
 * 2. 全量导入：
 * ```tsx
 * import HoloDesignSystem from '@/components/holo';
 * const { HoloButton, HoloCard } = HoloDesignSystem;
 * ```
 * 
 * 3. 工具函数导入：
 * ```tsx
 * import { HoloUtils, HoloFactory } from '@/components/holo';
 * const config = HoloFactory.createButtonConfig('quantum', 'intense');
 * ```
 * 
 * 4. 类型定义导入：
 * ```tsx
 * import type { HoloTypes } from '@/components/holo';
 * const effect: HoloTypes.UnifiedHoloEffect = 'quantum';
 * ```
 */ 