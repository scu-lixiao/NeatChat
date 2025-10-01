/**
 * {{CHENGQI:
 * Action: Created for P3-TE-020
 * Timestamp: 2025-06-10 18:34:17 +08:00
 * Reason: 可访问性测试验证 - 确保WCAG 2.1 AA标准合规
 * Principle_Applied: 无障碍设计、包容性设计、标准合规
 * Optimization: 自动化测试、详细报告、修复建议
 * Architectural_Note (AR): 模块化测试架构，支持扩展和自定义规则
 * Documentation_Note (DW): 完整的可访问性指南和测试文档
 * }}
 */

// ==================== 类型定义 ====================

export interface AccessibilityIssue {
  type: 'error' | 'warning' | 'info';
  level: 'A' | 'AA' | 'AAA';
  principle: 'perceivable' | 'operable' | 'understandable' | 'robust';
  guideline: string;
  element: Element;
  message: string;
  suggestion: string;
  xpath: string;
}

export interface ContrastTestResult {
  foreground: string;
  background: string;
  ratio: number;
  level: 'AA' | 'AAA' | 'fail';
  normal: boolean;
  large: boolean;
}

export interface AccessibilityReport {
  score: number;
  level: 'A' | 'AA' | 'AAA' | 'fail';
  summary: {
    errors: number;
    warnings: number;
    passed: number;
    total: number;
  };
  issues: AccessibilityIssue[];
  contrastResults: ContrastTestResult[];
  keyboardNavigation: boolean;
  focusManagement: boolean;
  ariaCompliance: boolean;
  semanticStructure: boolean;
  recommendations: string[];
}

// ==================== 核心可访问性测试器 ====================

export class AccessibilityTester {
  private issues: AccessibilityIssue[] = [];
  private contrastResults: ContrastTestResult[] = [];

  // ==================== 主要测试方法 ====================

  public async runFullAccessibilityTest(): Promise<AccessibilityReport> {
    console.log('🔍 开始可访问性测试...');
    
    this.issues = [];
    this.contrastResults = [];

    // 运行所有测试
    await this.testColorContrast();
    await this.testKeyboardNavigation();
    await this.testFocusManagement();
    await this.testAriaCompliance();
    await this.testSemanticStructure();
    await this.testImages();
    await this.testForms();
    await this.testLinks();
    await this.testAnimations();

    return this.generateReport();
  }

  // ==================== 颜色对比度测试 ====================

  private async testColorContrast(): Promise<void> {
    console.log('🎨 测试颜色对比度...');

    const textElements = document.querySelectorAll([
      'p', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'button', 'a', 'label', 'input', 'textarea', 'li'
    ].join(','));

    textElements.forEach(element => {
      const styles = window.getComputedStyle(element);
      const foreground = styles.color;
      const background = this.getEffectiveBackgroundColor(element);
      
      if (foreground && background) {
        const ratio = this.calculateContrastRatio(foreground, background);
        const fontSize = parseFloat(styles.fontSize);
        const fontWeight = styles.fontWeight;
        const isLarge = fontSize >= 18 || (fontSize >= 14 && (fontWeight === 'bold' || parseInt(fontWeight) >= 700));
        
        const result: ContrastTestResult = {
          foreground,
          background,
          ratio,
          level: this.getContrastLevel(ratio, isLarge),
          normal: ratio >= 4.5,
          large: ratio >= 3.0
        };

        this.contrastResults.push(result);

        // 检查是否达到AA标准
        if ((isLarge && ratio < 3.0) || (!isLarge && ratio < 4.5)) {
          this.addIssue({
            type: 'error',
            level: 'AA',
            principle: 'perceivable',
            guideline: 'WCAG 1.4.3 Contrast (Minimum)',
            element,
            message: `对比度不足: ${ratio.toFixed(2)}:1 (最低要求: ${isLarge ? '3:1' : '4.5:1'})`,
            suggestion: '调整文字颜色或背景颜色以提高对比度',
            xpath: this.getXPath(element)
          });
        }
      }
    });
  }

  private getEffectiveBackgroundColor(element: Element): string {
    let current = element as HTMLElement;
    
    while (current && current !== document.body) {
      const styles = window.getComputedStyle(current);
      const bgColor = styles.backgroundColor;
      
      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
        return bgColor;
      }
      
      current = current.parentElement as HTMLElement;
    }
    
    return 'rgb(255, 255, 255)'; // 默认白色背景
  }

  private calculateContrastRatio(foreground: string, background: string): number {
    const fgLuminance = this.getLuminance(foreground);
    const bgLuminance = this.getLuminance(background);
    
    const lighter = Math.max(fgLuminance, bgLuminance);
    const darker = Math.min(fgLuminance, bgLuminance);
    
    return (lighter + 0.05) / (darker + 0.05);
  }

  private getLuminance(color: string): number {
    const rgb = this.parseColor(color);
    if (!rgb) return 0;

    const [r, g, b] = rgb.map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  private parseColor(color: string): number[] | null {
    const div = document.createElement('div');
    div.style.color = color;
    document.body.appendChild(div);
    
    const computed = window.getComputedStyle(div).color;
    document.body.removeChild(div);
    
    const match = computed.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : null;
  }

  private getContrastLevel(ratio: number, isLarge: boolean): 'AA' | 'AAA' | 'fail' {
    if (isLarge) {
      if (ratio >= 4.5) return 'AAA';
      if (ratio >= 3.0) return 'AA';
    } else {
      if (ratio >= 7.0) return 'AAA';
      if (ratio >= 4.5) return 'AA';
    }
    return 'fail';
  }

  // ==================== 键盘导航测试 ====================

  private async testKeyboardNavigation(): Promise<void> {
    console.log('⌨️ 测试键盘导航...');

    const interactiveElements = document.querySelectorAll([
      'button', 'a[href]', 'input', 'textarea', 'select',
      '[tabindex]:not([tabindex="-1"])', '[contenteditable]'
    ].join(','));

    let tabOrderIssues = 0;

    interactiveElements.forEach((element, index) => {
      const tabIndex = (element as HTMLElement).tabIndex;
      
      // 检查tabindex使用
      if (tabIndex > 0) {
        this.addIssue({
          type: 'warning',
          level: 'AA',
          principle: 'operable',
          guideline: 'WCAG 2.4.3 Focus Order',
          element,
          message: '避免使用正数tabindex，推荐使用0或-1',
          suggestion: '使用tabindex="0"或调整DOM顺序来控制焦点顺序',
          xpath: this.getXPath(element)
        });
        tabOrderIssues++;
      }

      // 检查焦点可见性
      if (!this.hasFocusStyles(element)) {
        this.addIssue({
          type: 'error',
          level: 'AA',
          principle: 'operable',
          guideline: 'WCAG 2.4.7 Focus Visible',
          element,
          message: '缺少焦点样式',
          suggestion: '添加:focus样式使焦点状态可见',
          xpath: this.getXPath(element)
        });
      }
    });

    // 检查跳转链接
    const skipLinks = document.querySelectorAll('a[href^="#"]');
    if (skipLinks.length === 0) {
      this.addIssue({
        type: 'warning',
        level: 'AA',
        principle: 'operable',
        guideline: 'WCAG 2.4.1 Bypass Blocks',
        element: document.body,
        message: '建议添加跳转链接以便键盘用户快速导航',
        suggestion: '在页面开始处添加"跳到主内容"链接',
        xpath: '/html/body'
      });
    }
  }

  private hasFocusStyles(element: Element): boolean {
    // 创建临时样式来检测焦点样式
    const testElement = element.cloneNode(true) as HTMLElement;
    testElement.style.position = 'absolute';
    testElement.style.left = '-9999px';
    document.body.appendChild(testElement);
    
    testElement.focus();
    const focusedStyles = window.getComputedStyle(testElement);
    
    testElement.blur();
    const normalStyles = window.getComputedStyle(testElement);
    
    document.body.removeChild(testElement);
    
    // 检查是否有焦点样式差异
    return (
      focusedStyles.outline !== normalStyles.outline ||
      focusedStyles.border !== normalStyles.border ||
      focusedStyles.backgroundColor !== normalStyles.backgroundColor ||
      focusedStyles.boxShadow !== normalStyles.boxShadow
    );
  }

  // ==================== 焦点管理测试 ====================

  private async testFocusManagement(): Promise<void> {
    console.log('🎯 测试焦点管理...');

    // 检查模态框焦点陷阱
    const modals = document.querySelectorAll('[role="dialog"], .modal, [aria-modal="true"]');
    modals.forEach(modal => {
      const focusableElements = modal.querySelectorAll([
        'button', 'a[href]', 'input', 'textarea', 'select',
        '[tabindex]:not([tabindex="-1"])'
      ].join(','));

      if (focusableElements.length === 0) {
        this.addIssue({
          type: 'error',
          level: 'AA',
          principle: 'operable',
          guideline: 'WCAG 2.4.3 Focus Order',
          element: modal,
          message: '模态框内无可焦点元素',
          suggestion: '确保模态框内至少有一个可焦点的元素',
          xpath: this.getXPath(modal)
        });
      }
    });

    // 检查焦点陷阱实现
    const visibleModals = Array.from(modals).filter(modal => {
      const styles = window.getComputedStyle(modal);
      return styles.display !== 'none' && styles.visibility !== 'hidden';
    });

    if (visibleModals.length > 0) {
      // 在实际项目中，这里会测试Tab键是否被正确拦截
      console.log('检测到可见模态框，需要确保焦点陷阱正常工作');
    }
  }

  // ==================== ARIA 合规性测试 ====================

  private async testAriaCompliance(): Promise<void> {
    console.log('🏷️ 测试ARIA合规性...');

    // 检查ARIA标签
    const elementsWithAria = document.querySelectorAll('[aria-label], [aria-labelledby], [aria-describedby]');
    elementsWithAria.forEach(element => {
      const ariaLabelledby = element.getAttribute('aria-labelledby');
      const ariaDescribedby = element.getAttribute('aria-describedby');

      if (ariaLabelledby) {
        const labelElement = document.getElementById(ariaLabelledby);
        if (!labelElement) {
          this.addIssue({
            type: 'error',
            level: 'A',
            principle: 'robust',
            guideline: 'WCAG 4.1.2 Name, Role, Value',
            element,
            message: `aria-labelledby指向不存在的元素: ${ariaLabelledby}`,
            suggestion: '确保aria-labelledby指向的元素存在',
            xpath: this.getXPath(element)
          });
        }
      }

      if (ariaDescribedby) {
        const descElement = document.getElementById(ariaDescribedby);
        if (!descElement) {
          this.addIssue({
            type: 'error',
            level: 'A',
            principle: 'robust',
            guideline: 'WCAG 4.1.2 Name, Role, Value',
            element,
            message: `aria-describedby指向不存在的元素: ${ariaDescribedby}`,
            suggestion: '确保aria-describedby指向的元素存在',
            xpath: this.getXPath(element)
          });
        }
      }
    });

    // 检查role属性
    const elementsWithRole = document.querySelectorAll('[role]');
    const validRoles = [
      'alert', 'button', 'checkbox', 'dialog', 'grid', 'group', 'heading',
      'img', 'link', 'list', 'listitem', 'menu', 'menubar', 'menuitem',
      'presentation', 'progressbar', 'radio', 'radiogroup', 'region',
      'row', 'rowgroup', 'search', 'slider', 'spinbutton', 'status',
      'tab', 'tablist', 'tabpanel', 'textbox', 'toolbar', 'tooltip'
    ];

    elementsWithRole.forEach(element => {
      const role = element.getAttribute('role');
      if (role && !validRoles.includes(role)) {
        this.addIssue({
          type: 'warning',
          level: 'A',
          principle: 'robust',
          guideline: 'WCAG 4.1.2 Name, Role, Value',
          element,
          message: `无效的role属性: ${role}`,
          suggestion: '使用标准的ARIA role值',
          xpath: this.getXPath(element)
        });
      }
    });
  }

  // ==================== 语义结构测试 ====================

  private async testSemanticStructure(): Promise<void> {
    console.log('📋 测试语义结构...');

    // 检查标题层级
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let previousLevel = 0;

    headings.forEach(heading => {
      const currentLevel = parseInt(heading.tagName[1]);
      
      if (previousLevel > 0 && currentLevel > previousLevel + 1) {
        this.addIssue({
          type: 'warning',
          level: 'AA',
          principle: 'perceivable',
          guideline: 'WCAG 1.3.1 Info and Relationships',
          element: heading,
          message: `标题层级跳跃: 从h${previousLevel}跳到h${currentLevel}`,
          suggestion: '保持标题层级的连续性',
          xpath: this.getXPath(heading)
        });
      }
      
      previousLevel = currentLevel;
    });

    // 检查主要地标
    const main = document.querySelector('main, [role="main"]');
    if (!main) {
      this.addIssue({
        type: 'error',
        level: 'AA',
        principle: 'perceivable',
        guideline: 'WCAG 1.3.1 Info and Relationships',
        element: document.body,
        message: '缺少主要内容地标',
        suggestion: '添加<main>元素或role="main"',
        xpath: '/html/body'
      });
    }

    // 检查导航地标
    const nav = document.querySelector('nav, [role="navigation"]');
    if (!nav) {
      this.addIssue({
        type: 'warning',
        level: 'AA',
        principle: 'perceivable',
        guideline: 'WCAG 1.3.1 Info and Relationships',
        element: document.body,
        message: '建议添加导航地标',
        suggestion: '添加<nav>元素或role="navigation"',
        xpath: '/html/body'
      });
    }
  }

  // ==================== 图片测试 ====================

  private async testImages(): Promise<void> {
    console.log('🖼️ 测试图片可访问性...');

    const images = document.querySelectorAll('img');
    images.forEach(img => {
      const alt = img.getAttribute('alt');
      const src = img.getAttribute('src');

      if (alt === null) {
        this.addIssue({
          type: 'error',
          level: 'A',
          principle: 'perceivable',
          guideline: 'WCAG 1.1.1 Non-text Content',
          element: img,
          message: '图片缺少alt属性',
          suggestion: '添加描述性的alt属性',
          xpath: this.getXPath(img)
        });
      } else if (alt === '' && !img.hasAttribute('role')) {
        // 装饰性图片应该有空alt或role="presentation"
        console.log('检测到装饰性图片（空alt）');
      } else if (alt && alt.length > 125) {
        this.addIssue({
          type: 'warning',
          level: 'AA',
          principle: 'perceivable',
          guideline: 'WCAG 1.1.1 Non-text Content',
          element: img,
          message: 'alt文本过长',
          suggestion: '保持alt文本简洁（建议少于125字符）',
          xpath: this.getXPath(img)
        });
      }
    });
  }

  // ==================== 表单测试 ====================

  private async testForms(): Promise<void> {
    console.log('📝 测试表单可访问性...');

    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      const label = this.getAssociatedLabel(input);
      const id = input.getAttribute('id');

      if (!label && input.getAttribute('type') !== 'hidden') {
        this.addIssue({
          type: 'error',
          level: 'A',
          principle: 'perceivable',
          guideline: 'WCAG 1.3.1 Info and Relationships',
          element: input,
          message: '表单控件缺少标签',
          suggestion: '添加<label>元素或aria-label属性',
          xpath: this.getXPath(input)
        });
      }

      // 检查必填字段
      if (input.hasAttribute('required')) {
        const ariaRequired = input.getAttribute('aria-required');
        if (ariaRequired !== 'true') {
          this.addIssue({
            type: 'warning',
            level: 'AA',
            principle: 'robust',
            guideline: 'WCAG 4.1.2 Name, Role, Value',
            element: input,
            message: '必填字段建议添加aria-required="true"',
            suggestion: '为必填字段添加aria-required属性',
            xpath: this.getXPath(input)
          });
        }
      }
    });
  }

  private getAssociatedLabel(input: Element): Element | null {
    const id = input.getAttribute('id');
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return label;
    }

    // 检查包装label
    const parentLabel = input.closest('label');
    if (parentLabel) return parentLabel;

    // 检查aria-labelledby
    const ariaLabelledby = input.getAttribute('aria-labelledby');
    if (ariaLabelledby) {
      return document.getElementById(ariaLabelledby);
    }

    return null;
  }

  // ==================== 链接测试 ====================

  private async testLinks(): Promise<void> {
    console.log('🔗 测试链接可访问性...');

    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
      const href = link.getAttribute('href');
      const text = (link.textContent || '').trim();

      if (!text && !link.querySelector('img[alt]') && !link.getAttribute('aria-label')) {
        this.addIssue({
          type: 'error',
          level: 'A',
          principle: 'perceivable',
          guideline: 'WCAG 1.1.1 Non-text Content',
          element: link,
          message: '链接缺少描述性文本',
          suggestion: '添加链接文本、alt属性或aria-label',
          xpath: this.getXPath(link)
        });
      }

      // 检查"点击这里"等无意义文本
      const vagueTexts = ['点击这里', 'click here', '更多', 'more', '阅读更多', 'read more'];
      if (vagueTexts.some(vague => text.toLowerCase().includes(vague.toLowerCase()))) {
        this.addIssue({
          type: 'warning',
          level: 'AA',
          principle: 'understandable',
          guideline: 'WCAG 2.4.4 Link Purpose',
          element: link,
          message: '链接文本不够描述性',
          suggestion: '使用描述链接目标的文本',
          xpath: this.getXPath(link)
        });
      }

      // 检查外部链接
      if (href && (href.startsWith('http') && !href.includes(window.location.hostname))) {
        if (!link.getAttribute('target') && !link.textContent?.includes('(新窗口)')) {
          this.addIssue({
            type: 'info',
            level: 'AAA',
            principle: 'understandable',
            guideline: 'WCAG 3.2.5 Change on Request',
            element: link,
            message: '外部链接建议明确指示',
            suggestion: '添加"(新窗口)"或相关图标说明',
            xpath: this.getXPath(link)
          });
        }
      }
    });
  }

  // ==================== 动画测试 ====================

  private async testAnimations(): Promise<void> {
    console.log('🎬 测试动画可访问性...');

    // 检查prefers-reduced-motion支持
    const animatedElements = document.querySelectorAll([
      '[class*="animation"]', '[class*="transition"]', 
      '.starlight-border', '.energy-border', '.quantum-particles'
    ].join(','));

    if (animatedElements.length > 0) {
      // 检查是否有reduced motion支持
      const hasReducedMotionCSS = Array.from(document.styleSheets).some(sheet => {
        try {
          return Array.from(sheet.cssRules).some(rule => 
            rule.cssText.includes('prefers-reduced-motion')
          );
        } catch (e) {
          return false;
        }
      });

      if (!hasReducedMotionCSS) {
        this.addIssue({
          type: 'warning',
          level: 'AAA',
          principle: 'operable',
          guideline: 'WCAG 2.3.3 Animation from Interactions',
          element: document.body,
          message: '建议支持减少动画偏好设置',
          suggestion: '添加@media (prefers-reduced-motion: reduce)规则',
          xpath: '/html/body'
        });
      }
    }
  }

  // ==================== 报告生成 ====================

  private generateReport(): AccessibilityReport {
    const errors = this.issues.filter(issue => issue.type === 'error').length;
    const warnings = this.issues.filter(issue => issue.type === 'warning').length;
    const total = this.issues.length;
    const passed = Math.max(0, 100 - total); // 简化的评分

    const score = Math.max(0, 100 - (errors * 10 + warnings * 5));
    
    let level: 'A' | 'AA' | 'AAA' | 'fail';
    if (score >= 90) level = 'AAA';
    else if (score >= 80) level = 'AA';
    else if (score >= 70) level = 'A';
    else level = 'fail';

    const recommendations = this.generateRecommendations();

    return {
      score,
      level,
      summary: {
        errors,
        warnings,
        passed,
        total
      },
      issues: this.issues,
      contrastResults: this.contrastResults,
      keyboardNavigation: errors === 0,
      focusManagement: this.issues.filter(i => i.guideline.includes('Focus')).length === 0,
      ariaCompliance: this.issues.filter(i => i.principle === 'robust').length === 0,
      semanticStructure: this.issues.filter(i => i.guideline.includes('Info and Relationships')).length === 0,
      recommendations
    };
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (this.contrastResults.some(r => r.level === 'fail')) {
      recommendations.push('提高文本与背景的对比度至WCAG AA标准');
    }
    
    if (this.issues.some(i => i.guideline.includes('Focus'))) {
      recommendations.push('改善键盘导航和焦点管理');
    }
    
    if (this.issues.some(i => i.guideline.includes('Non-text Content'))) {
      recommendations.push('为所有图片和非文本内容添加替代文本');
    }
    
    if (this.issues.some(i => i.principle === 'robust')) {
      recommendations.push('改善ARIA标签和语义标记的使用');
    }

    if (recommendations.length === 0) {
      recommendations.push('可访问性测试通过！继续保持良好的无障碍设计实践。');
    }

    return recommendations;
  }

  // ==================== 辅助方法 ====================

  private addIssue(issue: Omit<AccessibilityIssue, 'xpath'> & { xpath: string }): void {
    this.issues.push(issue as AccessibilityIssue);
  }

  private getXPath(element: Element): string {
    if (element === document.body) return '/html/body';
    
    const path: string[] = [];
    let current = element;
    
    while (current && current !== document.body) {
      let index = 1;
      let sibling = current.previousElementSibling;
      
      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }
      
      path.unshift(`${current.tagName.toLowerCase()}[${index}]`);
      current = current.parentElement as Element;
    }
    
    return '/html/body/' + path.join('/');
  }
}

// ==================== 导出便捷函数 ====================

export const runAccessibilityTest = async (): Promise<AccessibilityReport> => {
  const tester = new AccessibilityTester();
  return tester.runFullAccessibilityTest();
};

export const testColorContrast = (foreground: string, background: string): ContrastTestResult => {
  const tester = new AccessibilityTester();
  const ratio = (tester as any).calculateContrastRatio(foreground, background);
  return {
    foreground,
    background,
    ratio,
    level: (tester as any).getContrastLevel(ratio, false),
    normal: ratio >= 4.5,
    large: ratio >= 3.0
  };
}; 