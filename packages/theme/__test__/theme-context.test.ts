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

    vi.stubGlobal('document', {
      documentElement: mockRoot,
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

    // 模拟 requestAnimationFrame - 同步执行
    let rafId = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = ++rafId;
        callback(performance.now());
        return id;
      }),
    );

    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn(() => {}),
    );

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

  describe('preset management', () => {
    it('should have built-in presets', () => {
      const { themeContext } = createTheme();
      const presets = themeContext.getPresets();
      const names = presets.map((p) => p.name);

      expect(names).toContain('default');
      expect(names).toContain('tech');
      expect(names).toContain('nature');
      expect(names).toContain('sunset');
      expect(names).toContain('purple');
    });

    it('should apply preset theme', () => {
      const { themeContext } = createTheme();
      themeContext.applyPreset('tech');
      expect(themeContext.config.token?.colorPrimary).toContain('0 102 255');
    });

    it('should warn for non-existent preset', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { themeContext } = createTheme();
      themeContext.applyPreset('nonexistent');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Preset "nonexistent" not found'),
      );
      consoleSpy.mockRestore();
    });

    it('should register custom preset', () => {
      const { themeContext } = createTheme();
      const customPreset = {
        name: 'custom',
        displayName: 'Custom Theme',
        token: { colorPrimary: 'rgb(128 128 128)' },
      };

      themeContext.registerPreset(customPreset);
      expect(themeContext.hasPreset('custom')).toBe(true);

      const presets = themeContext.getPresets();
      const registered = presets.find((p) => p.name === 'custom');
      expect(registered).toBeDefined();
      expect(registered?.token.colorPrimary).toBe('rgb(128 128 128)');
    });

    it('should apply registered custom preset', () => {
      const { themeContext } = createTheme();
      themeContext.registerPreset({
        name: 'custom',
        displayName: 'Custom',
        token: { colorPrimary: 'rgb(128 128 128)' },
      });

      themeContext.applyPreset('custom');
      expect(themeContext.config.token?.colorPrimary).toBe('rgb(128 128 128)');
    });

    it('should check preset existence', () => {
      const { themeContext } = createTheme();
      expect(themeContext.hasPreset('default')).toBe(true);
      expect(themeContext.hasPreset('nonexistent')).toBe(false);
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

  describe('instance isolation', () => {
    it('should have isolated presets per instance', () => {
      const { themeContext: context1 } = createTheme();
      const { themeContext: context2 } = createTheme();

      context1.registerPreset({
        name: 'isolated',
        displayName: 'Isolated',
        token: { colorPrimary: 'rgb(50 50 50)' },
      });

      expect(context1.hasPreset('isolated')).toBe(true);
      expect(context2.hasPreset('isolated')).toBe(false);
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
