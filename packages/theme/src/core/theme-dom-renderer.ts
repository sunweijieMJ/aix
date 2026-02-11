/**
 * 主题 DOM 渲染器
 * 职责：将主题数据应用到 DOM
 *
 * 内部状态：
 * - root: 缓存的文档根元素
 * - styleEl: 缓存的 <style> 元素引用（用于注入覆写 CSS 变量）
 */

import type { ThemeMode, TransitionConfig } from '../theme-types';
import { CSS_VAR_PREFIX } from '../utils/css-var';
import { getDocumentRoot, isBrowser } from '../utils/ssr-utils';

/**
 * DOM 渲染器构造选项
 */
export interface ThemeDOMRendererOptions {
  /** CSS 变量前缀 */
  prefix?: string;
  /** 是否使用 :where() 包裹选择器（降低特异性） */
  useWhere?: boolean;
  /** 作用域 class（用于嵌套主题） */
  scopeClass?: string;
  /** 作用域容器元素（用于嵌套主题） */
  container?: HTMLElement;
}

/**
 * 主题 DOM 渲染器
 * 通过 <style> 标签注入差异化 CSS 变量覆写，无自定义时零注入
 */
export class ThemeDOMRenderer {
  private root: HTMLElement | null;
  private styleEl: HTMLStyleElement | null = null;
  private componentStyleEl: HTMLStyleElement | null = null;
  private prefix: string;
  private transitionClass: string;
  private useWhere: boolean;
  private scopeClass: string | null;

  constructor(options: ThemeDOMRendererOptions | string = CSS_VAR_PREFIX) {
    if (typeof options === 'string') {
      options = { prefix: options };
    }
    this.prefix = options.prefix || CSS_VAR_PREFIX;
    this.useWhere = options.useWhere || false;
    this.scopeClass = options.scopeClass || null;
    this.root = options.container || getDocumentRoot();
    this.transitionClass = `${this.prefix}-theme-transition`;
  }

  /**
   * 检查是否在浏览器环境且 DOM 可用
   */
  private canAccessDOM(): boolean {
    return this.root !== null && typeof this.root.style !== 'undefined';
  }

  /**
   * 获取 style 标签 ID
   */
  private get styleId(): string {
    const suffix = this.scopeClass ? `-${this.scopeClass}` : '';
    return `${this.prefix}-theme-overrides${suffix}`;
  }

  /**
   * 设置 data-theme 属性
   */
  setDataTheme(mode: ThemeMode): void {
    if (this.canAccessDOM()) {
      this.root!.setAttribute('data-theme', mode);
    }
  }

  /**
   * 更新根元素引用（用于 scoped 模式延迟挂载）
   */
  setRoot(element: HTMLElement): void {
    this.root = element;
  }

  /**
   * 应用覆写 CSS 变量
   * 仅在有差异时注入 <style> 标签，无差异则移除
   */
  applyOverrides(mode: ThemeMode, overrides: Record<string, string>): void {
    if (!isBrowser()) return;

    const keys = Object.keys(overrides);

    if (keys.length === 0) {
      this.clearOverrides();
      return;
    }

    // 构建 CSS 文本
    const declarations = keys
      .map((key) => `  ${key}: ${overrides[key]};`)
      .join('\n');

    let selector: string;
    if (this.scopeClass) {
      selector = `.${this.scopeClass}[data-theme='${mode}']`;
    } else {
      const baseSelector = `:root[data-theme='${mode}']`;
      selector = this.useWhere ? `:where(${baseSelector})` : baseSelector;
    }
    const cssText = `${selector} {\n${declarations}\n}`;

    // 复用或创建 style 标签
    if (!this.styleEl) {
      this.styleEl =
        (document.getElementById(this.styleId) as HTMLStyleElement) || null;
    }

    if (!this.styleEl) {
      this.styleEl = document.createElement('style');
      this.styleEl.id = this.styleId;
      document.head.appendChild(this.styleEl);
    }

    this.styleEl.textContent = cssText;
  }

  /**
   * 清除覆写 style 标签
   */
  clearOverrides(): void {
    if (!isBrowser()) return;

    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
  }

  /**
   * 应用过渡动画配置
   */
  applyTransition(config: Required<TransitionConfig>): void {
    if (!this.canAccessDOM() || !this.root?.classList) return;

    const { enabled, duration, easing } = config;

    if (enabled) {
      this.root.classList.add(this.transitionClass);
      this.root.style.setProperty(
        `--${this.prefix}-transition-duration`,
        `${duration}ms`,
      );
      this.root.style.setProperty(`--${this.prefix}-transition-easing`, easing);
    } else {
      this.removeTransition();
    }
  }

  /**
   * 移除过渡动画
   */
  removeTransition(): void {
    if (!this.canAccessDOM() || !this.root?.classList) return;

    this.root.classList.remove(this.transitionClass);
    this.root.style.removeProperty(`--${this.prefix}-transition-duration`);
    this.root.style.removeProperty(`--${this.prefix}-transition-easing`);
  }

  /**
   * 应用组件级 CSS 变量覆写
   * 生成 .aix-{component}, :root[data-theme] .aix-{component} 选择器
   */
  applyComponentOverrides(
    overrides: Record<string, Record<string, string>>,
  ): void {
    if (!isBrowser()) return;
    const blocks: string[] = [];
    const scopePrefix = this.scopeClass ? `.${this.scopeClass} ` : '';

    for (const [name, tokenOverrides] of Object.entries(overrides)) {
      const keys = Object.keys(tokenOverrides);
      if (keys.length === 0) continue;
      const decls = keys
        .map((k) => `  --${this.prefix}-${k}: ${tokenOverrides[k]};`)
        .join('\n');
      blocks.push(
        `${scopePrefix}.${this.prefix}-${name},\n:root[data-theme] ${scopePrefix}.${this.prefix}-${name} {\n${decls}\n}`,
      );
    }

    const scopeSuffix = this.scopeClass ? `-${this.scopeClass}` : '';
    const styleId = `${this.prefix}-component-overrides${scopeSuffix}`;
    if (blocks.length === 0) {
      this.clearComponentOverrides();
      return;
    }

    if (!this.componentStyleEl) {
      this.componentStyleEl =
        (document.getElementById(styleId) as HTMLStyleElement) || null;
    }
    if (!this.componentStyleEl) {
      this.componentStyleEl = document.createElement('style');
      this.componentStyleEl.id = styleId;
      document.head.appendChild(this.componentStyleEl);
    }
    this.componentStyleEl.textContent = blocks.join('\n\n');
  }

  /**
   * 清除组件覆写 style 标签
   */
  clearComponentOverrides(): void {
    if (!isBrowser() || !this.componentStyleEl) return;
    this.componentStyleEl.remove();
    this.componentStyleEl = null;
  }

  /**
   * 重置 DOM 状态
   * 移除覆写样式和过渡动画，调用方应在 reset 后调用 syncToDOM 设置新值
   */
  reset(): void {
    this.clearOverrides();
    this.clearComponentOverrides();
    this.removeTransition();
  }
}

/**
 * 创建 DOM 渲染器实例
 */
export function createThemeDOMRenderer(
  options?: ThemeDOMRendererOptions | string,
): ThemeDOMRenderer {
  return new ThemeDOMRenderer(options);
}
