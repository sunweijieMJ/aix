import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { builtInPresets, ThemeController } from '../src/theme-controller';

describe('ThemeController', () => {
  let controller: ThemeController;
  let mockRoot: HTMLElement;

  beforeEach(() => {
    // 模拟 DOM 环境
    mockRoot = {
      setAttribute: vi.fn(),
      style: {
        setProperty: vi.fn(),
      },
    } as any;

    // 模拟 document
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

    // 清除 localStorage
    localStorage.clear();

    // 创建新的控制器实例
    controller = new ThemeController();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('initialization', () => {
    it('should initialize with light mode by default', () => {
      expect(controller.getMode()).toBe('light');
    });
  });

  describe('getMode', () => {
    it('should return current theme mode', () => {
      expect(controller.getMode()).toBe('light');
    });
  });

  describe('setMode', () => {
    it('should set theme mode to dark', () => {
      controller.setMode('dark');
      expect(controller.getMode()).toBe('dark');
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });

    it('should set theme mode to light', () => {
      controller.setMode('light');
      expect(controller.getMode()).toBe('light');
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });

    it('should apply CSS variables', async () => {
      controller.setMode('dark');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRoot.style.setProperty).toHaveBeenCalled();
    });
  });

  describe('toggleMode', () => {
    it('should toggle from light to dark', () => {
      controller.setMode('light');
      const newMode = controller.toggleMode();
      expect(newMode).toBe('dark');
      expect(controller.getMode()).toBe('dark');
    });

    it('should toggle from dark to light', () => {
      controller.setMode('dark');
      const newMode = controller.toggleMode();
      expect(newMode).toBe('light');
      expect(controller.getMode()).toBe('light');
    });
  });

  describe('applyTheme', () => {
    it('should apply theme configuration', async () => {
      const config = {
        token: { colorPrimary: 'rgb(255 0 0)' },
        algorithm: 'default' as const,
        components: {},
      };

      controller.applyTheme(config);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRoot.style.setProperty).toHaveBeenCalled();
    });

    it('should apply CSS variables to root element', async () => {
      const config = {
        token: { colorPrimary: 'rgb(255 0 0)' },
        algorithm: 'default' as const,
        components: {},
      };

      controller.applyTheme(config);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRoot.style.setProperty).toHaveBeenCalledWith(
        expect.stringContaining('--'),
        expect.any(String),
      );
    });
  });

  describe('setToken', () => {
    it('should set single token value', async () => {
      controller.setToken('colorPrimary', 'rgb(255 0 0)');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRoot.style.setProperty).toHaveBeenCalled();
    });

    it('should update theme configuration', async () => {
      controller.setToken('fontSize', '18px');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRoot.style.setProperty).toHaveBeenCalled();
    });
  });

  describe('setTokens', () => {
    it('should set multiple tokens at once', async () => {
      const tokens = {
        colorPrimary: 'rgb(255 0 0)',
        fontSize: '18px',
        borderRadius: '8px',
      };

      controller.setTokens(tokens);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRoot.style.setProperty).toHaveBeenCalled();
    });

    it('should merge with existing tokens', async () => {
      controller.setToken('colorPrimary', 'rgb(0 0 255)');
      controller.setTokens({ fontSize: '16px' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRoot.style.setProperty).toHaveBeenCalled();
    });
  });

  describe('applyPreset', () => {
    it('should apply built-in tech preset', async () => {
      controller.applyPreset('tech');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRoot.style.setProperty).toHaveBeenCalled();
    });

    it('should apply built-in nature preset', async () => {
      controller.applyPreset('nature');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRoot.style.setProperty).toHaveBeenCalled();
    });

    it('should apply built-in sunset preset', async () => {
      controller.applyPreset('sunset');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRoot.style.setProperty).toHaveBeenCalled();
    });

    it('should apply built-in purple preset', async () => {
      controller.applyPreset('purple');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRoot.style.setProperty).toHaveBeenCalled();
    });

    it('should warn for non-existent preset', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      controller.applyPreset('nonexistent');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Preset "nonexistent" not found'),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('registerPreset', () => {
    it('should register custom preset', () => {
      const customPreset = {
        name: 'custom',
        displayName: 'Custom Theme',
        token: { colorPrimary: 'rgb(128 128 128)' },
      };

      controller.registerPreset(customPreset);
      expect(builtInPresets['custom']).toEqual(customPreset);
    });

    it('should allow applying registered preset', async () => {
      const customPreset = {
        name: 'custom',
        displayName: 'Custom Theme',
        token: { colorPrimary: 'rgb(128 128 128)' },
      };

      controller.registerPreset(customPreset);
      controller.applyPreset('custom');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRoot.style.setProperty).toHaveBeenCalled();
    });

    it('should override existing preset', () => {
      const newDefault = {
        name: 'default',
        displayName: 'New Default',
        token: { colorPrimary: 'rgb(200 200 200)' },
      };

      controller.registerPreset(newDefault);
      expect(builtInPresets['default']).toEqual(newDefault);
    });
  });

  describe('getPresets', () => {
    it('should return all available presets', () => {
      const presets = controller.getPresets();
      expect(presets).toBeInstanceOf(Array);
      expect(presets.length).toBeGreaterThan(0);
    });

    it('should include built-in presets', () => {
      const presets = controller.getPresets();
      const names = presets.map((p) => p.name);
      expect(names).toContain('default');
      expect(names).toContain('tech');
      expect(names).toContain('nature');
      expect(names).toContain('sunset');
      expect(names).toContain('purple');
    });
  });

  describe('reset', () => {
    it('should reset to default theme and light mode', () => {
      controller.setMode('dark');
      controller.setToken('colorPrimary', 'rgb(255 0 0)');

      controller.reset();

      expect(controller.getMode()).toBe('light');
      expect(mockRoot.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });
  });

  describe('built-in presets', () => {
    it('should have default preset', () => {
      expect(builtInPresets.default).toBeDefined();
      expect(builtInPresets.default!.name).toBe('default');
    });

    it('should have tech preset with blue primary color', () => {
      expect(builtInPresets.tech).toBeDefined();
      expect(builtInPresets.tech!.token.colorPrimary).toContain('0 102 255');
    });

    it('should have nature preset with green primary color', () => {
      expect(builtInPresets.nature).toBeDefined();
      expect(builtInPresets.nature!.token.colorPrimary).toContain('82 196 26');
    });

    it('should have sunset preset with orange primary color', () => {
      expect(builtInPresets.sunset).toBeDefined();
      expect(builtInPresets.sunset!.token.colorPrimary).toContain('250 140 22');
    });

    it('should have purple preset with purple primary color', () => {
      expect(builtInPresets.purple).toBeDefined();
      expect(builtInPresets.purple!.token.colorPrimary).toContain('114 46 209');
    });
  });

  describe('SSR compatibility', () => {
    it('should handle missing document', () => {
      vi.stubGlobal('document', undefined);
      const newController = new ThemeController();
      expect(() => newController.setMode('dark')).not.toThrow();
    });

    it('should handle missing window', () => {
      vi.stubGlobal('window', undefined);
      const newController = new ThemeController();
      expect(() => newController.reset()).not.toThrow();
    });

    it('should handle missing localStorage', () => {
      vi.stubGlobal('localStorage', undefined);
      const newController = new ThemeController();
      expect(() => newController.setMode('dark')).not.toThrow();
    });
  });
});
