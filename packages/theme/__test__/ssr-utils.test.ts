import { describe, expect, it, beforeEach } from 'vitest';
import {
  isBrowser,
  hasLocalStorage,
  hasMatchMedia,
  safeGetLocalStorage,
  safeSetLocalStorage,
  getSystemThemePreference,
  getDocumentRoot,
  generateSSRInitScript,
  generateSSRStyleTag,
} from '../src/utils/ssr-utils';

describe('ssr-utils', () => {
  // ========== 环境检测 ==========

  describe('isBrowser', () => {
    it('在 jsdom 环境下返回 true', () => {
      expect(isBrowser()).toBe(true);
    });
  });

  describe('hasLocalStorage', () => {
    it('在 jsdom 环境下返回 true', () => {
      expect(hasLocalStorage()).toBe(true);
    });

    it('localStorage 抛出异常时返回 false', () => {
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = () => {
        throw new Error('Storage disabled');
      };
      expect(hasLocalStorage()).toBe(false);
      localStorage.setItem = originalSetItem;
    });
  });

  describe('hasMatchMedia', () => {
    it('jsdom 不提供 matchMedia，返回 false', () => {
      // jsdom 默认不实现 matchMedia
      expect(hasMatchMedia()).toBe(false);
    });
  });

  // ========== localStorage 操作 ==========

  describe('safeGetLocalStorage', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('获取已存储的值', () => {
      localStorage.setItem('test-key', 'test-value');
      expect(safeGetLocalStorage('test-key')).toBe('test-value');
    });

    it('key 不存在时返回 null', () => {
      expect(safeGetLocalStorage('nonexistent')).toBeNull();
    });
  });

  describe('safeSetLocalStorage', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('正常存储返回 true', () => {
      expect(safeSetLocalStorage('test-key', 'test-value')).toBe(true);
      expect(localStorage.getItem('test-key')).toBe('test-value');
    });

    it('存储失败返回 false', () => {
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = () => {
        throw new Error('Storage full');
      };
      expect(safeSetLocalStorage('key', 'value')).toBe(false);
      localStorage.setItem = originalSetItem;
    });
  });

  // ========== 系统主题偏好 ==========

  describe('getSystemThemePreference', () => {
    it('jsdom 无 matchMedia，返回 null', () => {
      const result = getSystemThemePreference();
      expect(result).toBeNull();
    });
  });

  // ========== DOM 引用 ==========

  describe('getDocumentRoot', () => {
    it('返回 document.documentElement', () => {
      expect(getDocumentRoot()).toBe(document.documentElement);
    });
  });

  // ========== SSR 脚本生成 ==========

  describe('generateSSRInitScript', () => {
    it('生成包含默认 storageKey 的脚本', () => {
      const script = generateSSRInitScript();
      expect(script).toContain('aix-theme-mode');
      expect(script).toContain("'light'");
      expect(script).toContain('data-theme');
    });

    it('使用自定义 storageKey 和 dark 默认模式', () => {
      const script = generateSSRInitScript('custom-key', 'dark');
      expect(script).toContain('custom-key');
      expect(script).toContain("'dark'");
    });

    it('正确转义 storageKey 防止注入', () => {
      const script = generateSSRInitScript('key"with"quotes');
      // JSON.stringify 应正确转义引号
      expect(script).toContain('\\"');
    });
  });

  describe('generateSSRStyleTag', () => {
    it('生成 light 模式的 style 标签', () => {
      const tag = generateSSRStyleTag('light');
      expect(tag).toContain('color-scheme:light');
      expect(tag).toContain('<style');
    });

    it('生成 dark 模式的 style 标签', () => {
      const tag = generateSSRStyleTag('dark');
      expect(tag).toContain('color-scheme:dark');
    });

    it('默认为 light 模式', () => {
      const tag = generateSSRStyleTag();
      expect(tag).toContain('color-scheme:light');
    });
  });
});
