/**
 * 主题 DOM 渲染器
 * 职责：将主题数据应用到 DOM
 *
 * 内部状态：
 * - root: 缓存的文档根元素
 * - pendingUpdates: RAF 批量更新队列
 * - rafId: 当前 RAF 请求 ID
 */

import type { ThemeMode, ThemeTokens, TransitionConfig } from '../theme-types';
import { getDocumentRoot } from '../utils/ssr-utils';
import { tokensToCSSVars } from './define-theme';

/**
 * 过渡动画 CSS 类名
 */
const TRANSITION_CLASS = 'aix-theme-transition';

/**
 * 主题 DOM 渲染器
 * 封装 DOM 操作，使用 RAF 批量更新优化性能
 */
export class ThemeDOMRenderer {
  private root: HTMLElement | null;
  private pendingUpdates: Record<string, string> = {};
  private rafId: number | null = null;

  constructor() {
    this.root = getDocumentRoot();
  }

  /**
   * 检查是否在浏览器环境且 DOM 可用
   */
  private canAccessDOM(): boolean {
    return this.root !== null && typeof this.root.style !== 'undefined';
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
   * 应用 CSS 变量（使用 RAF 批量更新）
   */
  applyTokens(tokens: ThemeTokens): void {
    if (!this.canAccessDOM()) return;

    const cssVars = tokensToCSSVars(tokens);
    this.batchUpdateCSSVars(cssVars);
  }

  /**
   * 同步应用 CSS 变量（不使用 RAF，立即生效）
   */
  applyTokensSync(tokens: ThemeTokens): void {
    if (!this.canAccessDOM()) return;

    // 取消待处理的批处理
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingUpdates = {};

    const cssVars = tokensToCSSVars(tokens);
    Object.entries(cssVars).forEach(([key, value]) => {
      this.root!.style.setProperty(key, value);
    });
  }

  /**
   * 应用过渡动画配置
   */
  applyTransition(config: Required<TransitionConfig>): void {
    if (!this.canAccessDOM() || !this.root?.classList) return;

    const { enabled, duration, easing } = config;

    if (enabled) {
      this.root.classList.add(TRANSITION_CLASS);
      this.root.style.setProperty('--aix-transition-duration', `${duration}ms`);
      this.root.style.setProperty('--aix-transition-easing', easing);
    } else {
      this.removeTransition();
    }
  }

  /**
   * 移除过渡动画
   */
  removeTransition(): void {
    if (!this.canAccessDOM() || !this.root?.classList) return;

    this.root.classList.remove(TRANSITION_CLASS);
    this.root.style.removeProperty('--aix-transition-duration');
    this.root.style.removeProperty('--aix-transition-easing');
  }

  /**
   * 重置 DOM 状态
   * 注意：不清理 CSS 变量，因为调用方应在 reset 后调用 applyTokens 设置新值
   */
  reset(): void {
    // 取消待处理的动画帧
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingUpdates = {};

    if (this.canAccessDOM()) {
      this.root!.setAttribute('data-theme', 'light');
      // 移除过渡动画相关状态
      this.removeTransition();
    }
  }

  /**
   * 批量更新 CSS 变量（使用 RAF 优化性能）
   */
  private batchUpdateCSSVars(vars: Record<string, string>): void {
    if (!this.canAccessDOM()) return;

    Object.assign(this.pendingUpdates, vars);

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }

    this.rafId = requestAnimationFrame(() => {
      this.flushCSSUpdates();
      this.rafId = null;
    });
  }

  /**
   * 立即应用所有待处理的 CSS 变量更新
   */
  private flushCSSUpdates(): void {
    if (!this.canAccessDOM()) return;

    Object.entries(this.pendingUpdates).forEach(([key, value]) => {
      this.root!.style.setProperty(key, value);
    });
    this.pendingUpdates = {};
  }
}

/**
 * 创建 DOM 渲染器实例
 */
export function createThemeDOMRenderer(): ThemeDOMRenderer {
  return new ThemeDOMRenderer();
}
