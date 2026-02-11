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
 * 主题 DOM 渲染器
 * 通过 <style> 标签注入差异化 CSS 变量覆写，无自定义时零注入
 */
export class ThemeDOMRenderer {
  private root: HTMLElement | null;
  private styleEl: HTMLStyleElement | null = null;
  private prefix: string;
  private transitionClass: string;

  constructor(prefix: string = CSS_VAR_PREFIX) {
    this.root = getDocumentRoot();
    this.prefix = prefix;
    this.transitionClass = `${prefix}-theme-transition`;
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
    return `${this.prefix}-theme-overrides`;
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
    const cssText = `:root[data-theme='${mode}'] {\n${declarations}\n}`;

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
   * 重置 DOM 状态
   * 移除覆写样式和过渡动画，调用方应在 reset 后调用 syncToDOM 设置新值
   */
  reset(): void {
    this.clearOverrides();
    this.removeTransition();
  }
}

/**
 * 创建 DOM 渲染器实例
 */
export function createThemeDOMRenderer(prefix?: string): ThemeDOMRenderer {
  return new ThemeDOMRenderer(prefix);
}
