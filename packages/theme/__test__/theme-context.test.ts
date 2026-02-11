import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTheme } from '../src/vue/theme-context';

describe('ThemeContext', () => {
  let mockRoot: any;

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
    };

    const mockStyleEl = {
      id: '',
      textContent: null as string | null,
      remove: vi.fn(),
    };

    vi.stubGlobal('document', {
      documentElement: mockRoot,
      head: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      getElementById: vi.fn((_id: string) => null),
      createElement: vi.fn((_tag: string) => ({ ...mockStyleEl })),
    });

    // 模拟 localStorage
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        },
      };
    })();
    vi.stubGlobal('localStorage', localStorageMock);

    // 模拟 window.matchMedia
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMediaMock);

    // 模拟 window.dispatchEvent
    vi.stubGlobal('dispatchEvent', vi.fn());

    // 清除 localStorage
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('initialization', () => {
    it('should initialize with light mode by default', () => {
      const { themeContext } = createTheme();
      expect(themeContext.mode).toBe('light');
    });

    it('should initialize with custom initial mode', () => {
      const { themeContext } = createTheme({ initialMode: 'dark' });
      expect(themeContext.mode).toBe('dark');
    });
  });

  describe('mode management', () => {
    it('should set theme mode to dark', () => {
      const { themeContext } = createTheme();
      themeContext.setMode('dark');
      expect(themeContext.mode).toBe('dark');
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });

    it('should set theme mode to light', () => {
      const { themeContext } = createTheme({ initialMode: 'dark' });
      themeContext.setMode('light');
      expect(themeContext.mode).toBe('light');
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });

    it('should toggle from light to dark', () => {
      const { themeContext } = createTheme();
      const newMode = themeContext.toggleMode();
      expect(newMode).toBe('dark');
      expect(themeContext.mode).toBe('dark');
    });

    it('should toggle from dark to light', () => {
      const { themeContext } = createTheme({ initialMode: 'dark' });
      const newMode = themeContext.toggleMode();
      expect(newMode).toBe('light');
      expect(themeContext.mode).toBe('light');
    });
  });

  describe('applyTheme', () => {
    it('should apply theme configuration', () => {
      const { themeContext } = createTheme();
      const config = {
        token: { colorPrimary: 'rgb(255 0 0)' },
        algorithm: 'default' as const,
      };

      themeContext.applyTheme(config);
      expect(themeContext.config.token?.colorPrimary).toBe('rgb(255 0 0)');
    });

    it('should sync mode when applying dark algorithm', () => {
      const { themeContext } = createTheme();
      themeContext.applyTheme({ algorithm: 'dark' });
      expect(themeContext.mode).toBe('dark');
    });
  });

  describe('token management', () => {
    it('should set single token', () => {
      const { themeContext } = createTheme();
      themeContext.setToken('colorPrimary', 'rgb(255 0 0)');
      expect(themeContext.config.token?.colorPrimary).toBe('rgb(255 0 0)');
    });

    it('should set multiple tokens', () => {
      const { themeContext } = createTheme();
      themeContext.setTokens({
        colorPrimary: 'rgb(255 0 0)',
        fontSize: '18px',
      });
      expect(themeContext.config.token?.colorPrimary).toBe('rgb(255 0 0)');
      expect(themeContext.config.token?.fontSize).toBe('18px');
    });

    it('should get token value', () => {
      const { themeContext } = createTheme();
      const value = themeContext.getToken('colorPrimary');
      expect(value).toBeDefined();
      expect(typeof value).toBe('string');
    });

    it('should get all tokens', () => {
      const { themeContext } = createTheme();
      const tokens = themeContext.getTokens();
      expect(tokens).toHaveProperty('colorPrimary');
      expect(tokens).toHaveProperty('fontSize');
    });
  });

  describe('transition management', () => {
    it('should set transition config', () => {
      const { themeContext } = createTheme();
      themeContext.setTransition({ duration: 300, easing: 'linear' });
      const config = themeContext.getTransition();
      expect(config.duration).toBe(300);
      expect(config.easing).toBe('linear');
    });

    it('should get transition config', () => {
      const { themeContext } = createTheme();
      const config = themeContext.getTransition();
      expect(config).toHaveProperty('duration');
      expect(config).toHaveProperty('easing');
      expect(config).toHaveProperty('enabled');
    });
  });

  describe('reset', () => {
    it('should reset to default theme', () => {
      const { themeContext } = createTheme();

      themeContext.setMode('dark');
      themeContext.setToken('colorPrimary', 'rgb(255 0 0)');

      themeContext.reset();

      expect(themeContext.mode).toBe('light');
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });
  });

  describe('SSR compatibility', () => {
    it('should handle missing document', () => {
      vi.stubGlobal('document', undefined);
      const { themeContext } = createTheme();
      expect(() => themeContext.setMode('dark')).not.toThrow();
    });

    it('should handle missing localStorage', () => {
      vi.stubGlobal('localStorage', undefined);
      const { themeContext } = createTheme();
      expect(() => themeContext.setMode('dark')).not.toThrow();
    });
  });
});
