import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTheme,
  THEME_INJECTION_KEY,
  type ThemeContext,
} from '../src/theme-context';
import { useTheme } from '../src/use-theme';

// Shared theme context for all tests
let sharedThemeContext: ThemeContext;

// Mock Vue's inject to return our shared context
vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');

  return {
    ...actual,
    inject: vi.fn((key: symbol, defaultValue?: any) => {
      if (key === THEME_INJECTION_KEY) {
        return sharedThemeContext;
      }
      return defaultValue;
    }),
  };
});

describe('useTheme', () => {
  let mockRoot: any;

  beforeEach(() => {
    // 模拟 DOM 环境
    mockRoot = {
      setAttribute: vi.fn(),
      style: {
        setProperty: vi.fn(),
        transition: '',
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

    // 模拟 window 事件系统
    const eventListeners = new Map<string, Set<EventListener>>();

    vi.stubGlobal(
      'addEventListener',
      vi.fn((event: string, listener: EventListener) => {
        if (!eventListeners.has(event)) {
          eventListeners.set(event, new Set());
        }
        eventListeners.get(event)!.add(listener);
      }),
    );

    vi.stubGlobal(
      'removeEventListener',
      vi.fn((event: string, listener: EventListener) => {
        eventListeners.get(event)?.delete(listener);
      }),
    );

    vi.stubGlobal(
      'dispatchEvent',
      vi.fn((event: Event) => {
        const listeners = eventListeners.get(event.type);
        if (listeners) {
          listeners.forEach((listener) => listener(event));
        }
        return true;
      }),
    );

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

    // 创建 theme context（在浏览器环境设置完成后）
    const { themeContext } = createTheme({
      initialMode: 'light',
      persist: false,
    });
    sharedThemeContext = themeContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('initialization', () => {
    it('should initialize with current theme mode', () => {
      const { mode } = useTheme();
      expect(mode.value).toBe('light');
    });
  });

  describe('mode management', () => {
    it('should update mode reactively', () => {
      const { mode, setMode } = useTheme();
      expect(mode.value).toBe('light');

      setMode('dark');
      expect(mode.value).toBe('dark');
    });

    it('should toggle mode', () => {
      const { mode, toggleMode } = useTheme();
      expect(mode.value).toBe('light');

      const newMode = toggleMode();
      expect(newMode).toBe('dark');
      expect(mode.value).toBe('dark');

      toggleMode();
      expect(mode.value).toBe('light');
    });

    it('should update mode when setMode is called', () => {
      const { setMode, mode } = useTheme();

      setMode('dark');
      expect(mode.value).toBe('dark');

      setMode('light');
      expect(mode.value).toBe('light');
    });
  });

  describe('theme configuration', () => {
    it('should apply theme configuration', () => {
      const { applyTheme, config } = useTheme();
      const newConfig = {
        token: { colorPrimary: 'rgb(255 0 0)' },
        algorithm: 'default' as const,
        components: {},
      };

      applyTheme(newConfig);
      expect(config.value.token?.colorPrimary).toBe('rgb(255 0 0)');
    });

    it('should set single token without throwing', () => {
      const { setToken } = useTheme();
      expect(() => setToken('colorPrimary', 'rgb(255 0 0)')).not.toThrow();
    });

    it('should set multiple tokens without throwing', () => {
      const { setTokens } = useTheme();
      expect(() =>
        setTokens({
          colorPrimary: 'rgb(255 0 0)',
          fontSize: '18px',
        }),
      ).not.toThrow();
    });
  });

  describe('preset management', () => {
    it('should apply preset theme without throwing', () => {
      const { applyPreset } = useTheme();
      expect(() => applyPreset('tech')).not.toThrow();
    });

    it('should register custom preset', () => {
      const { registerPreset, getPresets } = useTheme();
      const customPreset = {
        name: 'custom',
        displayName: 'Custom Theme',
        token: { colorPrimary: 'rgb(128 128 128)' },
      };

      registerPreset(customPreset);
      const presets = getPresets();
      const foundPreset = presets.find((p) => p.name === 'custom');

      expect(foundPreset).toBeDefined();
      expect(foundPreset?.displayName).toBe('Custom Theme');
    });

    it('should get all available presets', () => {
      const { getPresets } = useTheme();
      const presets = getPresets();

      expect(presets).toBeInstanceOf(Array);
      expect(presets.length).toBeGreaterThan(0);

      const names = presets.map((p) => p.name);
      expect(names).toContain('default');
      expect(names).toContain('tech');
      expect(names).toContain('nature');
    });
  });

  describe('reset', () => {
    it('should reset to default theme', () => {
      const { mode, setMode, reset } = useTheme();

      setMode('dark');
      expect(mode.value).toBe('dark');

      reset();
      expect(mode.value).toBe('light');
    });
  });

  describe('integration', () => {
    it('should work with multiple composable instances', () => {
      const theme1 = useTheme();
      const theme2 = useTheme();

      theme1.setMode('dark');

      // 两个实例应该同步（共享同一个 Context）
      expect(theme1.mode.value).toBe('dark');
      expect(theme2.mode.value).toBe('dark');
    });

    it('should handle rapid mode changes', () => {
      const { setMode, mode } = useTheme();

      setMode('dark');
      setMode('light');
      setMode('dark');

      expect(mode.value).toBe('dark');
    });

    it('should handle preset changes with mode changes', () => {
      const { setMode, applyPreset, mode } = useTheme();

      setMode('dark');
      applyPreset('tech');

      expect(mode.value).toBe('dark');
    });
  });
});
