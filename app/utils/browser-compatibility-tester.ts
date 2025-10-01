/**
 * {{CHENGQI:
 * Action: Created for P3-TE-020
 * Timestamp: 2025-06-10 18:34:17 +08:00
 * Reason: 浏览器兼容性测试验证 - 确保目标浏览器完整功能支持
 * Principle_Applied: 渐进增强、优雅降级、跨浏览器兼容
 * Optimization: 特性检测、自动fallback、性能友好
 * Architectural_Note (AR): 模块化兼容性检测架构，支持动态降级策略
 * Documentation_Note (DW): 详细的浏览器兼容性报告和降级建议
 * }}
 */

// ==================== 类型定义 ====================

export interface BrowserInfo {
  name: string;
  version: string;
  engine: string;
  platform: string;
  userAgent: string;
  features: BrowserFeatures;
}

export interface BrowserFeatures {
  // CSS特性
  cssVariables: boolean;
  cssGrid: boolean;
  flexbox: boolean;
  backdropFilter: boolean;
  cssFilters: boolean;
  transforms3d: boolean;
  animations: boolean;
  transitions: boolean;
  
  // JavaScript特性
  es6: boolean;
  es2017: boolean;
  es2020: boolean;
  webgl: boolean;
  webgl2: boolean;
  intersectionObserver: boolean;
  resizeObserver: boolean;
  performanceObserver: boolean;
  
  // Web APIs
  serviceWorker: boolean;
  webWorker: boolean;
  localStorage: boolean;
  sessionStorage: boolean;
  indexedDB: boolean;
  fetch: boolean;
  
  // Media
  webp: boolean;
  avif: boolean;
  webm: boolean;
  mp4: boolean;
}

export interface CompatibilityIssue {
  type: 'critical' | 'major' | 'minor' | 'info';
  feature: string;
  supported: boolean;
  fallback: string | null;
  impact: string;
  recommendation: string;
}

export interface CompatibilityReport {
  browser: BrowserInfo;
  overall: 'excellent' | 'good' | 'fair' | 'poor';
  score: number;
  supportedFeatures: number;
  totalFeatures: number;
  issues: CompatibilityIssue[];
  recommendations: string[];
  fallbacksNeeded: string[];
}

// ==================== 浏览器兼容性测试器 ====================

export class BrowserCompatibilityTester {
  private issues: CompatibilityIssue[] = [];

  // ==================== 主要测试方法 ====================

  public async runCompatibilityTest(): Promise<CompatibilityReport> {
    console.log('🌐 开始浏览器兼容性测试...');
    
    this.issues = [];
    
    const browserInfo = this.getBrowserInfo();
    const features = await this.detectFeatures();
    
    browserInfo.features = features;
    
    // 检查关键特性
    this.checkCriticalFeatures(features);
    this.checkPremiumUIFeatures(features);
    this.checkPerformanceFeatures(features);
    this.checkSecurityFeatures(features);
    
    return this.generateReport(browserInfo);
  }

  // ==================== 浏览器信息检测 ====================

  private getBrowserInfo(): BrowserInfo {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    
    const browserInfo: BrowserInfo = {
      name: this.detectBrowserName(userAgent),
      version: this.detectBrowserVersion(userAgent),
      engine: this.detectBrowserEngine(userAgent),
      platform,
      userAgent,
      features: {} as BrowserFeatures
    };
    
    return browserInfo;
  }

  private detectBrowserName(userAgent: string): string {
    if (userAgent.includes('Edge/')) return 'Microsoft Edge Legacy';
    if (userAgent.includes('Edg/')) return 'Microsoft Edge';
    if (userAgent.includes('Chrome/')) return 'Google Chrome';
    if (userAgent.includes('Firefox/')) return 'Mozilla Firefox';
    if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) return 'Apple Safari';
    if (userAgent.includes('Opera/') || userAgent.includes('OPR/')) return 'Opera';
    return 'Unknown Browser';
  }

  private detectBrowserVersion(userAgent: string): string {
    const patterns = [
      /(?:Chrome|CriOS)\/(\d+\.\d+)/,
      /(?:Firefox|FxiOS)\/(\d+\.\d+)/,
      /(?:Version)\/(\d+\.\d+).*Safari/,
      /(?:Edge?)\/(\d+\.\d+)/,
      /(?:Opera|OPR)\/(\d+\.\d+)/
    ];
    
    for (const pattern of patterns) {
      const match = userAgent.match(pattern);
      if (match) return match[1];
    }
    
    return 'Unknown';
  }

  private detectBrowserEngine(userAgent: string): string {
    if (userAgent.includes('Blink')) return 'Blink';
    if (userAgent.includes('Gecko')) return 'Gecko';
    if (userAgent.includes('WebKit')) return 'WebKit';
    if (userAgent.includes('Trident')) return 'Trident';
    return 'Unknown';
  }

  // ==================== 特性检测 ====================

  private async detectFeatures(): Promise<BrowserFeatures> {
    const features: BrowserFeatures = {
      // CSS特性检测
      cssVariables: this.supportsCSSVariables(),
      cssGrid: this.supportsCSSGrid(),
      flexbox: this.supportsFlexbox(),
      backdropFilter: this.supportsBackdropFilter(),
      cssFilters: this.supportsCSSFilters(),
      transforms3d: this.supportsTransforms3D(),
      animations: this.supportsCSSAnimations(),
      transitions: this.supportsCSSTransitions(),
      
      // JavaScript特性检测
      es6: this.supportsES6(),
      es2017: this.supportsES2017(),
      es2020: this.supportsES2020(),
      webgl: this.supportsWebGL(),
      webgl2: this.supportsWebGL2(),
      intersectionObserver: this.supportsIntersectionObserver(),
      resizeObserver: this.supportsResizeObserver(),
      performanceObserver: this.supportsPerformanceObserver(),
      
      // Web APIs检测
      serviceWorker: this.supportsServiceWorker(),
      webWorker: this.supportsWebWorker(),
      localStorage: this.supportsLocalStorage(),
      sessionStorage: this.supportsSessionStorage(),
      indexedDB: this.supportsIndexedDB(),
      fetch: this.supportsFetch(),
      
      // 媒体格式检测
      webp: await this.supportsWebP(),
      avif: await this.supportsAVIF(),
      webm: this.supportsWebM(),
      mp4: this.supportsMP4()
    };
    
    return features;
  }

  // ==================== CSS特性检测方法 ====================

  private supportsCSSVariables(): boolean {
    return CSS.supports('--test', '0');
  }

  private supportsCSSGrid(): boolean {
    return CSS.supports('display', 'grid');
  }

  private supportsFlexbox(): boolean {
    return CSS.supports('display', 'flex');
  }

  private supportsBackdropFilter(): boolean {
    return CSS.supports('backdrop-filter', 'blur(1px)') || 
           CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
  }

  private supportsCSSFilters(): boolean {
    return CSS.supports('filter', 'blur(1px)');
  }

  private supportsTransforms3D(): boolean {
    return CSS.supports('transform', 'translateZ(0)');
  }

  private supportsCSSAnimations(): boolean {
    return CSS.supports('animation', 'test 1s linear');
  }

  private supportsCSSTransitions(): boolean {
    return CSS.supports('transition', 'all 1s ease');
  }

  // ==================== JavaScript特性检测方法 ====================

  private supportsES6(): boolean {
    try {
      return typeof Symbol !== 'undefined' && 
             typeof Promise !== 'undefined' && 
             typeof Array.from === 'function';
    } catch {
      return false;
    }
  }

  private supportsES2017(): boolean {
    try {
      return typeof Object.values === 'function' && 
             typeof Object.entries === 'function';
    } catch {
      return false;
    }
  }

  private supportsES2020(): boolean {
    try {
      return typeof BigInt !== 'undefined' && 
             typeof globalThis !== 'undefined';
    } catch {
      return false;
    }
  }

  private supportsWebGL(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  }

  private supportsWebGL2(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!canvas.getContext('webgl2');
    } catch {
      return false;
    }
  }

  private supportsIntersectionObserver(): boolean {
    return 'IntersectionObserver' in window;
  }

  private supportsResizeObserver(): boolean {
    return 'ResizeObserver' in window;
  }

  private supportsPerformanceObserver(): boolean {
    return 'PerformanceObserver' in window;
  }

  // ==================== Web APIs检测方法 ====================

  private supportsServiceWorker(): boolean {
    return 'serviceWorker' in navigator;
  }

  private supportsWebWorker(): boolean {
    return 'Worker' in window;
  }

  private supportsLocalStorage(): boolean {
    try {
      const test = 'test';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  private supportsSessionStorage(): boolean {
    try {
      const test = 'test';
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  private supportsIndexedDB(): boolean {
    return 'indexedDB' in window;
  }

  private supportsFetch(): boolean {
    return 'fetch' in window;
  }

  // ==================== 媒体格式检测方法 ====================

  private async supportsWebP(): Promise<boolean> {
    return new Promise((resolve) => {
      const webP = new Image();
      webP.onload = webP.onerror = () => {
        resolve(webP.height === 2);
      };
      webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
    });
  }

  private async supportsAVIF(): Promise<boolean> {
    return new Promise((resolve) => {
      const avif = new Image();
      avif.onload = avif.onerror = () => {
        resolve(avif.height === 2);
      };
      avif.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgABogQEAwgMg8f8D///8WfhwB8+ErK42A=';
    });
  }

  private supportsWebM(): boolean {
    const video = document.createElement('video');
    return video.canPlayType('video/webm') !== '';
  }

  private supportsMP4(): boolean {
    const video = document.createElement('video');
    return video.canPlayType('video/mp4') !== '';
  }

  // ==================== 关键特性检查 ====================

  private checkCriticalFeatures(features: BrowserFeatures): void {
    // CSS Variables - 关键特性
    if (!features.cssVariables) {
      this.addIssue({
        type: 'critical',
        feature: 'CSS Variables',
        supported: false,
        fallback: '静态CSS值',
        impact: '无法动态切换主题和效果强度',
        recommendation: '升级到支持CSS Variables的浏览器版本'
      });
    }

    // Flexbox - 关键特性
    if (!features.flexbox) {
      this.addIssue({
        type: 'critical',
        feature: 'CSS Flexbox',
        supported: false,
        fallback: 'float和display:table布局',
        impact: '布局可能出现问题',
        recommendation: '升级浏览器或使用flexbox polyfill'
      });
    }

    // ES6 - 关键特性
    if (!features.es6) {
      this.addIssue({
        type: 'critical',
        feature: 'ES6/ES2015',
        supported: false,
        fallback: 'Babel转译',
        impact: 'JavaScript功能受限',
        recommendation: '使用现代浏览器或配置Babel转译'
      });
    }

    // WebGL - 性能关键
    if (!features.webgl) {
      this.addIssue({
        type: 'major',
        feature: 'WebGL',
        supported: false,
        fallback: 'CSS动画替代',
        impact: '无法使用GPU加速，动画性能降低',
        recommendation: '启用硬件加速或升级显卡驱动'
      });
    }
  }

  private checkPremiumUIFeatures(features: BrowserFeatures): void {
    // Backdrop Filter - 高端效果
    if (!features.backdropFilter) {
      this.addIssue({
        type: 'major',
        feature: 'Backdrop Filter',
        supported: false,
        fallback: '半透明背景色',
        impact: '磨砂玻璃效果无法显示',
        recommendation: '使用支持backdrop-filter的浏览器版本'
      });
    }

    // CSS Filters - 视觉效果
    if (!features.cssFilters) {
      this.addIssue({
        type: 'minor',
        feature: 'CSS Filters',
        supported: false,
        fallback: '静态样式',
        impact: '滤镜效果无法显示',
        recommendation: '升级浏览器以获得更好的视觉效果'
      });
    }

    // 3D Transforms - 动画效果
    if (!features.transforms3d) {
      this.addIssue({
        type: 'minor',
        feature: '3D Transforms',
        supported: false,
        fallback: '2D变换',
        impact: '3D动画效果降级为2D',
        recommendation: '使用支持3D变换的浏览器'
      });
    }

    // CSS Grid - 高级布局
    if (!features.cssGrid) {
      this.addIssue({
        type: 'minor',
        feature: 'CSS Grid',
        supported: false,
        fallback: 'Flexbox布局',
        impact: '复杂布局可能需要调整',
        recommendation: '升级浏览器以获得更好的布局支持'
      });
    }
  }

  private checkPerformanceFeatures(features: BrowserFeatures): void {
    // Intersection Observer - 性能优化
    if (!features.intersectionObserver) {
      this.addIssue({
        type: 'minor',
        feature: 'Intersection Observer',
        supported: false,
        fallback: 'scroll事件监听',
        impact: '滚动性能可能降低',
        recommendation: '升级浏览器以获得更好的滚动性能'
      });
    }

    // Performance Observer - 性能监控
    if (!features.performanceObserver) {
      this.addIssue({
        type: 'info',
        feature: 'Performance Observer',
        supported: false,
        fallback: '基础性能API',
        impact: '性能监控功能受限',
        recommendation: '升级浏览器以获得完整的性能监控'
      });
    }

    // Service Worker - 缓存优化
    if (!features.serviceWorker) {
      this.addIssue({
        type: 'minor',
        feature: 'Service Worker',
        supported: false,
        fallback: '浏览器缓存',
        impact: '离线功能和缓存优化不可用',
        recommendation: '使用支持Service Worker的浏览器'
      });
    }
  }

  private checkSecurityFeatures(features: BrowserFeatures): void {
    // Local Storage - 数据存储
    if (!features.localStorage) {
      this.addIssue({
        type: 'major',
        feature: 'Local Storage',
        supported: false,
        fallback: 'Cookie存储',
        impact: '用户设置无法持久化',
        recommendation: '启用浏览器存储功能'
      });
    }

    // Fetch API - 网络请求
    if (!features.fetch) {
      this.addIssue({
        type: 'minor',
        feature: 'Fetch API',
        supported: false,
        fallback: 'XMLHttpRequest',
        impact: '网络请求功能正常但API较旧',
        recommendation: '升级浏览器以使用现代网络API'
      });
    }
  }

  // ==================== 报告生成 ====================

  private generateReport(browserInfo: BrowserInfo): CompatibilityReport {
    const features = browserInfo.features;
    const featureEntries = Object.entries(features);
    const supportedFeatures = featureEntries.filter(([, supported]) => supported).length;
    const totalFeatures = featureEntries.length;
    
    const score = Math.round((supportedFeatures / totalFeatures) * 100);
    
    let overall: 'excellent' | 'good' | 'fair' | 'poor';
    if (score >= 90) overall = 'excellent';
    else if (score >= 80) overall = 'good';
    else if (score >= 60) overall = 'fair';
    else overall = 'poor';

    const recommendations = this.generateRecommendations();
    const fallbacksNeeded = this.issues
      .filter(issue => issue.fallback)
      .map(issue => issue.fallback as string);

    return {
      browser: browserInfo,
      overall,
      score,
      supportedFeatures,
      totalFeatures,
      issues: this.issues,
      recommendations,
      fallbacksNeeded
    };
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    const criticalIssues = this.issues.filter(issue => issue.type === 'critical');
    const majorIssues = this.issues.filter(issue => issue.type === 'major');
    
    if (criticalIssues.length > 0) {
      recommendations.push('⚠️ 检测到关键兼容性问题，建议升级浏览器');
      recommendations.push('🔧 配置必要的polyfill和fallback机制');
    }
    
    if (majorIssues.length > 0) {
      recommendations.push('🎨 部分高端视觉效果可能无法显示');
      recommendations.push('⚡ 考虑启用浏览器硬件加速功能');
    }
    
    if (this.issues.some(issue => issue.feature.includes('WebGL'))) {
      recommendations.push('🖥️ 检查显卡驱动是否为最新版本');
    }
    
    if (this.issues.some(issue => issue.feature.includes('Storage'))) {
      recommendations.push('💾 确保浏览器存储功能已启用');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✅ 浏览器兼容性优秀，所有功能均可正常使用');
    }

    return recommendations;
  }

  // ==================== 辅助方法 ====================

  private addIssue(issue: CompatibilityIssue): void {
    this.issues.push(issue);
  }
}

// ==================== 导出便捷函数 ====================

export const runBrowserCompatibilityTest = async (): Promise<CompatibilityReport> => {
  const tester = new BrowserCompatibilityTester();
  return tester.runCompatibilityTest();
};

export const getBrowserInfo = (): BrowserInfo => {
  const tester = new BrowserCompatibilityTester();
  return (tester as any).getBrowserInfo();
};

export const checkFeatureSupport = async (feature: string): Promise<boolean> => {
  const tester = new BrowserCompatibilityTester();
  const features = await (tester as any).detectFeatures();
  return features[feature as keyof BrowserFeatures] || false;
}; 