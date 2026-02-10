import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeDOMRenderer } from '../src/core/theme-dom-renderer';
import { generateThemeTokens } from '../src/core/define-theme';

describe('ThemeDOMRenderer', () => {
  let renderer: ThemeDOMRenderer;
  let mockRoot: HTMLElement;

  beforeEach(() => {
    // 模拟 DOM 环境
    mockRoot = {
      setAttribute: vi.fn(),
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
      style: {
        setProperty: vi.fn(),
        removeProperty: vi.fn(),
      },
    } as any;

    // 模拟 document
    vi.stubGlobal('document', {
      documentElement: mockRoot,
    });

    // 模拟 requestAnimationFrame 和 cancelAnimationFrame - 同步执行
    let rafId = 0;

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = ++rafId;
        // 立即同步执行回调
        callback(performance.now());
        return id;
      }),
    );

    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((_id: number) => {
        // noop
      }),
    );

    // 创建新的渲染器实例
    renderer = new ThemeDOMRenderer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('setDataTheme', () => {
    it('should set data-theme attribute to dark', () => {
      renderer.setDataTheme('dark');
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });

    it('should set data-theme attribute to light', () => {
      renderer.setDataTheme('light');
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });
  });

  describe('applyTokens', () => {
    it('should apply CSS variables to root element', async () => {
      const tokens = generateThemeTokens({ algorithm: 'default' });
      renderer.applyTokens(tokens);

      // 等待 RAF 执行
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRoot.style.setProperty).toHaveBeenCalled();
      expect(mockRoot.style.setProperty).toHaveBeenCalledWith(
        expect.stringContaining('--'),
        expect.any(String),
      );
    });
  });

  describe('applyTokensSync', () => {
    it('should apply CSS variables synchronously', () => {
      const tokens = generateThemeTokens({ algorithm: 'default' });
      renderer.applyTokensSync(tokens);

      expect(mockRoot.style.setProperty).toHaveBeenCalled();
      expect(mockRoot.style.setProperty).toHaveBeenCalledWith(
        expect.stringContaining('--'),
        expect.any(String),
      );
    });
  });

  describe('applyTransition', () => {
    it('should add transition class when enabled', () => {
      renderer.applyTransition({
        enabled: true,
        duration: 200,
        easing: 'ease-in-out',
      });

      expect(mockRoot.classList.add).toHaveBeenCalledWith(
        'aix-theme-transition',
      );
      expect(mockRoot.style.setProperty).toHaveBeenCalledWith(
        '--aix-transition-duration',
        '200ms',
      );
      expect(mockRoot.style.setProperty).toHaveBeenCalledWith(
        '--aix-transition-easing',
        'ease-in-out',
      );
    });

    it('should remove transition class when disabled', () => {
      renderer.applyTransition({
        enabled: false,
        duration: 200,
        easing: 'ease-in-out',
      });

      expect(mockRoot.classList.remove).toHaveBeenCalledWith(
        'aix-theme-transition',
      );
    });
  });

  describe('removeTransition', () => {
    it('should remove transition class and properties', () => {
      renderer.removeTransition();

      expect(mockRoot.classList.remove).toHaveBeenCalledWith(
        'aix-theme-transition',
      );
      expect(mockRoot.style.removeProperty).toHaveBeenCalledWith(
        '--aix-transition-duration',
      );
      expect(mockRoot.style.removeProperty).toHaveBeenCalledWith(
        '--aix-transition-easing',
      );
    });
  });

  describe('reset', () => {
    it('should reset to light mode', () => {
      renderer.reset();
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });
  });

  describe('SSR compatibility', () => {
    it('should handle missing document', () => {
      vi.stubGlobal('document', undefined);
      const newRenderer = new ThemeDOMRenderer();
      expect(() => newRenderer.setDataTheme('dark')).not.toThrow();
    });

    it('should handle missing window', () => {
      vi.stubGlobal('window', undefined);
      const newRenderer = new ThemeDOMRenderer();
      expect(() => newRenderer.reset()).not.toThrow();
    });
  });
});
