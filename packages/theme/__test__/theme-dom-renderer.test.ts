import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeDOMRenderer } from '../src/core/theme-dom-renderer';

describe('ThemeDOMRenderer', () => {
  let renderer: ThemeDOMRenderer;
  let mockRoot: HTMLElement;
  let mockHead: {
    appendChild: ReturnType<typeof vi.fn>;
    removeChild: ReturnType<typeof vi.fn>;
  };
  let createdStyleElements: Array<{
    id: string;
    textContent: string | null;
    remove: ReturnType<typeof vi.fn>;
  }>;

  beforeEach(() => {
    createdStyleElements = [];

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

    mockHead = {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    };

    // 模拟 document
    vi.stubGlobal('document', {
      documentElement: mockRoot,
      head: mockHead,
      getElementById: vi.fn((_id: string) => null),
      createElement: vi.fn((tag: string) => {
        const el = {
          tagName: tag.toUpperCase(),
          id: '',
          textContent: null as string | null,
          remove: vi.fn(),
        };
        createdStyleElements.push(el);
        return el;
      }),
    });

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

  describe('applyOverrides', () => {
    it('should not inject style tag when overrides is empty', () => {
      renderer.applyOverrides('light', {});
      expect(document.createElement).not.toHaveBeenCalled();
      expect(mockHead.appendChild).not.toHaveBeenCalled();
    });

    it('should create style tag with correct selector and content', () => {
      renderer.applyOverrides('light', {
        '--aix-colorPrimary': 'rgb(0 102 255)',
        '--aix-colorPrimaryHover': 'rgb(64 150 255)',
      });

      expect(document.createElement).toHaveBeenCalledWith('style');
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);

      const styleEl = createdStyleElements[0]!;
      expect(styleEl.id).toBe('aix-theme-overrides');
      expect(styleEl.textContent).toContain(":root[data-theme='light']");
      expect(styleEl.textContent).toContain(
        '--aix-colorPrimary: rgb(0 102 255);',
      );
      expect(styleEl.textContent).toContain(
        '--aix-colorPrimaryHover: rgb(64 150 255);',
      );
    });

    it('should use dark mode selector for dark mode', () => {
      renderer.applyOverrides('dark', {
        '--aix-colorPrimary': 'rgb(0 102 255)',
      });

      const styleEl = createdStyleElements[0]!;
      expect(styleEl.textContent).toContain(":root[data-theme='dark']");
    });

    it('should reuse existing style tag on subsequent calls', () => {
      renderer.applyOverrides('light', {
        '--aix-colorPrimary': 'rgb(0 102 255)',
      });

      renderer.applyOverrides('light', {
        '--aix-colorPrimary': 'rgb(255 0 0)',
      });

      // createElement should be called only once
      expect(document.createElement).toHaveBeenCalledTimes(1);
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);

      // Content should be updated
      const styleEl = createdStyleElements[0]!;
      expect(styleEl.textContent).toContain(
        '--aix-colorPrimary: rgb(255 0 0);',
      );
    });

    it('should remove style tag when overrides become empty', () => {
      renderer.applyOverrides('light', {
        '--aix-colorPrimary': 'rgb(0 102 255)',
      });

      const styleEl = createdStyleElements[0]!;
      renderer.applyOverrides('light', {});

      expect(styleEl.remove).toHaveBeenCalled();
    });

    it('should find existing style tag by id', () => {
      const existingStyleEl = {
        id: 'aix-theme-overrides',
        textContent: null as string | null,
        remove: vi.fn(),
      };

      vi.mocked(document.getElementById).mockReturnValue(
        existingStyleEl as any,
      );

      renderer.applyOverrides('light', {
        '--aix-colorPrimary': 'rgb(0 102 255)',
      });

      // Should not create a new element
      expect(document.createElement).not.toHaveBeenCalled();
      expect(mockHead.appendChild).not.toHaveBeenCalled();
      expect(existingStyleEl.textContent).toContain(
        '--aix-colorPrimary: rgb(0 102 255);',
      );
    });
  });

  describe('clearOverrides', () => {
    it('should remove style tag if present', () => {
      renderer.applyOverrides('light', {
        '--aix-colorPrimary': 'rgb(0 102 255)',
      });

      const styleEl = createdStyleElements[0]!;
      renderer.clearOverrides();

      expect(styleEl.remove).toHaveBeenCalled();
    });

    it('should be safe to call when no style tag exists', () => {
      expect(() => renderer.clearOverrides()).not.toThrow();
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
    it('should remove style tag and transition', () => {
      renderer.applyOverrides('light', {
        '--aix-colorPrimary': 'rgb(0 102 255)',
      });

      const styleEl = createdStyleElements[0]!;
      renderer.reset();

      // style tag removed
      expect(styleEl.remove).toHaveBeenCalled();
      // transition removed
      expect(mockRoot.classList.remove).toHaveBeenCalledWith(
        'aix-theme-transition',
      );
    });

    it('should not set data-theme (caller handles it via syncToDOM)', () => {
      renderer.reset();
      expect(mockRoot.setAttribute).not.toHaveBeenCalled();
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
