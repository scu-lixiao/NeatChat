/**
 * {{CHENGQI:
 * Action: Created
 * Timestamp: 2025-06-10 18:44:40 +08:00
 * Reason: P3-AR-018任务执行 - 创建智能适配层系统核心模块
 * Principle_Applied: KISS(简洁API设计)、SOLID-S(单一职责性能管理)、DRY(复用配置系统)
 * Optimization: 非阻塞异步检测、localStorage持久化、实时性能监控
 * Architectural_Note (AR): 基于现有premium-theme架构，提供统一的性能级别管理
 * Documentation_Note (DW): 完整TypeScript类型定义，详细注释说明检测原理和使用方法
 * }}
 */

// ==================== 类型定义系统 ====================

export type PerformanceLevel = 'eco' | 'balanced' | 'high' | 'extreme';
export type EffectIntensity = 'minimal' | 'subtle' | 'normal' | 'intense' | 'maximum';

export interface DeviceCapabilities {
  // CPU性能指标
  cpuCores: number;
  cpuThreads: number;
  cpuSpeed?: number; // GHz (如果可检测)
  
  // GPU和渲染能力
  gpuVendor?: string;
  gpuRenderer?: string;
  webglSupport: boolean;
  webgl2Support: boolean;
  hardwareAcceleration: boolean;
  
  // 内存和存储
  deviceMemory?: number; // GB (如果可检测)
  maxTextureSize?: number;
  
  // 显示和交互
  screenSize: { width: number; height: number };
  pixelRatio: number;
  touchSupport: boolean;
  
  // 网络和连接
  connectionType?: string;
  effectiveConnectionType?: string;
  
  // 系统偏好
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
  prefersColorScheme: 'light' | 'dark' | 'no-preference';
}

export interface PerformanceProfile {
  level: PerformanceLevel;
  score: number; // 0-100的综合性能分数
  capabilities: DeviceCapabilities;
  effectSettings: {
    animations: EffectIntensity;
    glassMorphism: EffectIntensity;
    shadows: EffectIntensity;
    particles: EffectIntensity;
    blur: EffectIntensity;
    gradients: EffectIntensity;
  };
  cssVariables: Record<string, string>;
}

export interface PerformanceMetrics {
  fps: number;
  frameTime: number; // ms
  memoryUsage?: number; // MB
  renderTime: number; // ms
  timestamp: number;
}

export interface UserPreferences {
  manualLevel?: PerformanceLevel;
  enableAutoDetection: boolean;
  enablePerformanceMonitoring: boolean;
  enableDataSaving: boolean;
  customEffects?: Partial<PerformanceProfile['effectSettings']>;
}

// ==================== 设备性能检测系统 ====================

class DeviceDetector {
  private static instance: DeviceDetector;
  private capabilities: DeviceCapabilities | null = null;

  static getInstance(): DeviceDetector {
    if (!DeviceDetector.instance) {
      DeviceDetector.instance = new DeviceDetector();
    }
    return DeviceDetector.instance;
  }

  async detectCapabilities(): Promise<DeviceCapabilities> {
    if (this.capabilities) {
      return this.capabilities;
    }

    const capabilities: DeviceCapabilities = {
      // CPU检测
      cpuCores: navigator.hardwareConcurrency || 4,
      cpuThreads: navigator.hardwareConcurrency || 4,
      
      // GPU和WebGL检测
      gpuVendor: this.getGPUInfo()?.vendor,
      gpuRenderer: this.getGPUInfo()?.renderer,
      webglSupport: this.hasWebGLSupport(),
      webgl2Support: this.hasWebGL2Support(),
      hardwareAcceleration: await this.detectHardwareAcceleration(),
      
      // 内存检测
      deviceMemory: (navigator as any).deviceMemory,
      maxTextureSize: this.getMaxTextureSize(),
      
      // 显示检测
      screenSize: {
        width: window.screen.width,
        height: window.screen.height
      },
      pixelRatio: window.devicePixelRatio || 1,
      touchSupport: 'ontouchstart' in window,
      
      // 网络检测
      connectionType: (navigator as any).connection?.type,
      effectiveConnectionType: (navigator as any).connection?.effectiveType,
      
      // 系统偏好检测
      prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      prefersHighContrast: window.matchMedia('(prefers-contrast: high)').matches,
      prefersColorScheme: this.getColorSchemePreference()
    };

    this.capabilities = capabilities;
    return capabilities;
  }

  private getGPUInfo(): { vendor?: string; renderer?: string } | null {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl || !(gl instanceof WebGLRenderingContext)) return null;

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return null;

      return {
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      };
    } catch (e) {
      return null;
    }
  }

  private hasWebGLSupport(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch (e) {
      return false;
    }
  }

  private hasWebGL2Support(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!canvas.getContext('webgl2');
    } catch (e) {
      return false;
    }
  }

  private async detectHardwareAcceleration(): Promise<boolean> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      
      const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
      if (!gl) {
        resolve(false);
        return;
      }

      // 简单的GPU渲染测试
      const vertexShader = gl.createShader(gl.VERTEX_SHADER);
      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      
      if (!vertexShader || !fragmentShader) {
        resolve(false);
        return;
      }

      // 如果能创建着色器，说明有硬件加速
      resolve(true);
    });
  }

  private getMaxTextureSize(): number | undefined {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
      return gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : undefined;
    } catch (e) {
      return undefined;
    }
  }

  private getColorSchemePreference(): 'light' | 'dark' | 'no-preference' {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'no-preference';
  }
}

// ==================== 性能分析和评分系统 ====================

class PerformanceAnalyzer {
  static calculatePerformanceScore(capabilities: DeviceCapabilities): number {
    let score = 0;
    
    // CPU性能评分 (40分)
    const cpuScore = Math.min(capabilities.cpuCores * 8, 40);
    score += cpuScore;
    
    // GPU和渲染性能评分 (30分)
    let gpuScore = 0;
    if (capabilities.webgl2Support) gpuScore += 15;
    else if (capabilities.webglSupport) gpuScore += 10;
    
    if (capabilities.hardwareAcceleration) gpuScore += 10;
    if (capabilities.maxTextureSize && capabilities.maxTextureSize >= 4096) gpuScore += 5;
    score += gpuScore;
    
    // 内存评分 (20分)
    let memoryScore = 0;
    if (capabilities.deviceMemory) {
      memoryScore = Math.min(capabilities.deviceMemory * 5, 20);
    } else {
      // 基于其他指标估算
      memoryScore = capabilities.cpuCores >= 8 ? 15 : 10;
    }
    score += memoryScore;
    
    // 显示和网络评分 (10分)
    let displayScore = 0;
    if (capabilities.pixelRatio >= 2) displayScore += 3;
    if (capabilities.screenSize.width >= 1920) displayScore += 2;
    if (capabilities.effectiveConnectionType === '4g') displayScore += 3;
    else if (capabilities.effectiveConnectionType === '3g') displayScore += 1;
    displayScore += 2; // 基础分
    score += displayScore;
    
    return Math.min(Math.max(score, 0), 100);
  }

  static determinePerformanceLevel(score: number, preferences: UserPreferences): PerformanceLevel {
    // 优先使用用户手动设置
    if (preferences.manualLevel) {
      return preferences.manualLevel;
    }

    // 基于自动检测
    if (score >= 85) return 'extreme';
    if (score >= 65) return 'high';
    if (score >= 40) return 'balanced';
    return 'eco';
  }

  static generateEffectSettings(level: PerformanceLevel, capabilities: DeviceCapabilities): PerformanceProfile['effectSettings'] {
    const baseSettings = {
      eco: {
        animations: 'minimal' as EffectIntensity,
        glassMorphism: 'minimal' as EffectIntensity,
        shadows: 'minimal' as EffectIntensity,
        particles: 'minimal' as EffectIntensity,
        blur: 'minimal' as EffectIntensity,
        gradients: 'subtle' as EffectIntensity,
      },
      balanced: {
        animations: 'subtle' as EffectIntensity,
        glassMorphism: 'subtle' as EffectIntensity,
        shadows: 'normal' as EffectIntensity,
        particles: 'subtle' as EffectIntensity,
        blur: 'subtle' as EffectIntensity,
        gradients: 'normal' as EffectIntensity,
      },
      high: {
        animations: 'normal' as EffectIntensity,
        glassMorphism: 'normal' as EffectIntensity,
        shadows: 'intense' as EffectIntensity,
        particles: 'normal' as EffectIntensity,
        blur: 'normal' as EffectIntensity,
        gradients: 'intense' as EffectIntensity,
      },
      extreme: {
        animations: 'intense' as EffectIntensity,
        glassMorphism: 'intense' as EffectIntensity,
        shadows: 'maximum' as EffectIntensity,
        particles: 'intense' as EffectIntensity,
        blur: 'intense' as EffectIntensity,
        gradients: 'maximum' as EffectIntensity,
      }
    };

    let settings = { ...baseSettings[level] };

    // 基于特定能力调整
    if (capabilities.prefersReducedMotion) {
      settings.animations = 'minimal';
      settings.particles = 'minimal';
    }

    if (!capabilities.webgl2Support) {
      settings.glassMorphism = Math.min(settings.glassMorphism === 'maximum' ? 4 : 
        settings.glassMorphism === 'intense' ? 3 : 
        settings.glassMorphism === 'normal' ? 2 : 
        settings.glassMorphism === 'subtle' ? 1 : 0, 2) === 0 ? 'minimal' :
        Math.min(settings.glassMorphism === 'maximum' ? 4 : 
        settings.glassMorphism === 'intense' ? 3 : 
        settings.glassMorphism === 'normal' ? 2 : 
        settings.glassMorphism === 'subtle' ? 1 : 0, 2) === 1 ? 'subtle' : 'normal';
      settings.blur = 'subtle';
    }

    return settings;
  }

  static generateCSSVariables(effectSettings: PerformanceProfile['effectSettings']): Record<string, string> {
    const intensityToValue = {
      minimal: '0.2',
      subtle: '0.5',
      normal: '1.0',
      intense: '1.5',
      maximum: '2.0'
    };

    return {
      '--performance-animation-scale': intensityToValue[effectSettings.animations],
      '--performance-glass-opacity': intensityToValue[effectSettings.glassMorphism],
      '--performance-shadow-intensity': intensityToValue[effectSettings.shadows],
      '--performance-particle-density': intensityToValue[effectSettings.particles],
      '--performance-blur-intensity': intensityToValue[effectSettings.blur],
      '--performance-gradient-complexity': intensityToValue[effectSettings.gradients],
      
      // 动画持续时间调整
      '--performance-duration-scale': effectSettings.animations === 'minimal' ? '0.5' : 
                                    effectSettings.animations === 'subtle' ? '0.8' : '1.0',
      
      // 帧率目标
      '--performance-target-fps': effectSettings.animations === 'minimal' ? '30' : '60',
    };
  }
}

// ==================== 性能监控系统 ====================

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private frameCount = 0;
  private isMonitoring = false;

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.measureFrame();
  }

  stopMonitoring(): void {
    this.isMonitoring = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private measureFrame = (): void => {
    if (!this.isMonitoring) return;

    const now = performance.now();
    const frameTime = now - this.lastFrameTime;
    this.frameCount++;

    // 每秒计算一次FPS
    if (this.frameCount >= 60) {
      const fps = Math.round(1000 / (frameTime / this.frameCount));
      const avgFrameTime = frameTime / this.frameCount;

      const metrics: PerformanceMetrics = {
        fps,
        frameTime: avgFrameTime,
        memoryUsage: this.getMemoryUsage(),
        renderTime: avgFrameTime,
        timestamp: now
      };

      this.metrics.push(metrics);
      
      // 只保留最近100个样本
      if (this.metrics.length > 100) {
        this.metrics.shift();
      }

      this.frameCount = 0;
      this.lastFrameTime = now;
    }

    this.rafId = requestAnimationFrame(this.measureFrame);
  };

  private getMemoryUsage(): number | undefined {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return Math.round(memory.usedJSHeapSize / 1024 / 1024); // MB
    }
    return undefined;
  }

  getCurrentMetrics(): PerformanceMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  getAverageMetrics(samples = 10): PerformanceMetrics | null {
    if (this.metrics.length === 0) return null;

    const recentMetrics = this.metrics.slice(-samples);
    const sum = recentMetrics.reduce((acc, metric) => ({
      fps: acc.fps + metric.fps,
      frameTime: acc.frameTime + metric.frameTime,
      memoryUsage: (acc.memoryUsage || 0) + (metric.memoryUsage || 0),
      renderTime: acc.renderTime + metric.renderTime,
      timestamp: metric.timestamp
    }), { fps: 0, frameTime: 0, memoryUsage: 0, renderTime: 0, timestamp: 0 });

    return {
      fps: Math.round(sum.fps / recentMetrics.length),
      frameTime: sum.frameTime / recentMetrics.length,
      memoryUsage: sum.memoryUsage ? Math.round(sum.memoryUsage / recentMetrics.length) : undefined,
      renderTime: sum.renderTime / recentMetrics.length,
      timestamp: sum.timestamp
    };
  }
}

// ==================== 用户偏好管理系统 ====================

class PreferencesManager {
  private static readonly STORAGE_KEY = 'nextchat-performance-preferences';

  static savePreferences(preferences: UserPreferences): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(preferences));
    } catch (e) {
      console.warn('Failed to save performance preferences:', e);
    }
  }

  static loadPreferences(): UserPreferences {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return { ...this.getDefaultPreferences(), ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Failed to load performance preferences:', e);
    }
    return this.getDefaultPreferences();
  }

  private static getDefaultPreferences(): UserPreferences {
    return {
      enableAutoDetection: true,
      enablePerformanceMonitoring: true,
      enableDataSaving: false
    };
  }
}

// ==================== 主要的性能适配器类 ====================

export class PerformanceAdapter {
  private static instance: PerformanceAdapter;
  private currentProfile: PerformanceProfile | null = null;
  private detector = DeviceDetector.getInstance();
  private monitor = PerformanceMonitor.getInstance();
  private preferences: UserPreferences;
  private listeners: Array<(profile: PerformanceProfile) => void> = [];

  private constructor() {
    this.preferences = PreferencesManager.loadPreferences();
  }

  static getInstance(): PerformanceAdapter {
    if (!PerformanceAdapter.instance) {
      PerformanceAdapter.instance = new PerformanceAdapter();
    }
    return PerformanceAdapter.instance;
  }

  async initialize(): Promise<PerformanceProfile> {
    const capabilities = await this.detector.detectCapabilities();
    const score = PerformanceAnalyzer.calculatePerformanceScore(capabilities);
    const level = PerformanceAnalyzer.determinePerformanceLevel(score, this.preferences);
    const effectSettings = PerformanceAnalyzer.generateEffectSettings(level, capabilities);
    const cssVariables = PerformanceAnalyzer.generateCSSVariables(effectSettings);

    this.currentProfile = {
      level,
      score,
      capabilities,
      effectSettings,
      cssVariables
    };

    // 应用CSS变量到根元素
    this.applyCSSVariables();

    // 启动性能监控
    if (this.preferences.enablePerformanceMonitoring) {
      this.monitor.startMonitoring();
    }

    // 通知监听器
    this.notifyListeners();

    return this.currentProfile;
  }

  getCurrentProfile(): PerformanceProfile | null {
    return this.currentProfile;
  }

  updatePreferences(newPreferences: Partial<UserPreferences>): void {
    this.preferences = { ...this.preferences, ...newPreferences };
    PreferencesManager.savePreferences(this.preferences);

    // 如果性能级别改变，重新初始化
    if (newPreferences.manualLevel !== undefined || newPreferences.enableAutoDetection !== undefined) {
      this.initialize();
    }

    // 更新监控状态
    if (newPreferences.enablePerformanceMonitoring !== undefined) {
      if (newPreferences.enablePerformanceMonitoring) {
        this.monitor.startMonitoring();
      } else {
        this.monitor.stopMonitoring();
      }
    }
  }

  getPreferences(): UserPreferences {
    return { ...this.preferences };
  }

  getCurrentMetrics(): PerformanceMetrics | null {
    return this.monitor.getCurrentMetrics();
  }

  getAverageMetrics(samples?: number): PerformanceMetrics | null {
    return this.monitor.getAverageMetrics(samples);
  }

  onProfileChange(listener: (profile: PerformanceProfile) => void): () => void {
    this.listeners.push(listener);
    
    // 返回取消订阅函数
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private applyCSSVariables(): void {
    if (!this.currentProfile) return;

    const root = document.documentElement;
    Object.entries(this.currentProfile.cssVariables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }

  private notifyListeners(): void {
    if (!this.currentProfile) return;
    
    this.listeners.forEach(listener => {
      try {
        listener(this.currentProfile!);
      } catch (e) {
        console.warn('Performance adapter listener error:', e);
      }
    });
  }
}

// ==================== 导出的便捷函数 ====================

export const performanceAdapter = PerformanceAdapter.getInstance();

export const initializePerformanceAdapter = () => performanceAdapter.initialize();

export const getPerformanceProfile = () => performanceAdapter.getCurrentProfile();

export const updatePerformancePreferences = (preferences: Partial<UserPreferences>) => 
  performanceAdapter.updatePreferences(preferences);

export const getCurrentPerformanceMetrics = () => performanceAdapter.getCurrentMetrics();

export const onPerformanceProfileChange = (listener: (profile: PerformanceProfile) => void) => 
  performanceAdapter.onProfileChange(listener); 