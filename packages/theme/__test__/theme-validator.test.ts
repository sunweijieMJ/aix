import { describe, expect, it } from 'vitest';
import {
  validateThemeConfig,
  validateThemeConfigOrThrow,
  validateTokens,
  sanitizeThemeConfig,
} from '../src/utils/theme-validator';
import { darkAlgorithm } from '../src/core/define-theme';

describe('theme-validator', () => {
  // ========== validateThemeConfig ==========

  describe('validateThemeConfig', () => {
    it('空配置通过验证', () => {
      const result = validateThemeConfig({});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('合法配置通过验证', () => {
      const result = validateThemeConfig({
        seed: {
          colorPrimary: 'rgb(22 119 255)',
          fontSize: 14,
          borderRadius: 6,
        },
        token: {
          colorPrimary: '#1677ff',
        },
        algorithm: darkAlgorithm,
      });
      expect(result.valid).toBe(true);
    });

    // --- Seed 验证 ---

    it('seed 颜色格式错误', () => {
      const result = validateThemeConfig({
        seed: { colorPrimary: 'not-a-color' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]!.field).toBe('seed.colorPrimary');
    });

    it('seed fontSize 必须是正数', () => {
      const result = validateThemeConfig({
        seed: { fontSize: -1 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]!.field).toBe('seed.fontSize');
    });

    it('seed fontWeightStrong 范围 100~900', () => {
      const valid = validateThemeConfig({ seed: { fontWeightStrong: 700 } });
      expect(valid.valid).toBe(true);

      const invalid = validateThemeConfig({ seed: { fontWeightStrong: 1000 } });
      expect(invalid.valid).toBe(false);
    });

    it('seed wireframe 必须是布尔值', () => {
      const result = validateThemeConfig({
        seed: { wireframe: 'yes' as any },
      });
      expect(result.valid).toBe(false);
    });

    it('seed presetColors 验证', () => {
      const valid = validateThemeConfig({
        seed: { presetColors: { red: '#ff0000' } },
      });
      expect(valid.valid).toBe(true);

      const invalid = validateThemeConfig({
        seed: { presetColors: { red: 'invalid' } },
      });
      expect(invalid.valid).toBe(false);
    });

    // --- Token 验证 ---

    it('token 颜色格式验证', () => {
      const valid = validateThemeConfig({
        token: { colorPrimary: 'rgb(22 119 255)' },
      });
      expect(valid.valid).toBe(true);

      const invalid = validateThemeConfig({
        token: { colorPrimary: 'invalid-color' },
      });
      expect(invalid.valid).toBe(false);
    });

    // --- 过渡配置验证 ---

    it('transition.duration 不能为负', () => {
      const result = validateThemeConfig({
        transition: { duration: -100 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]!.field).toBe('transition.duration');
    });

    it('transition.duration 不应超过 5000ms', () => {
      const result = validateThemeConfig({
        transition: { duration: 10000 },
      });
      expect(result.valid).toBe(false);
    });

    it('transition.easing 必须是字符串', () => {
      const result = validateThemeConfig({
        transition: { easing: 123 as any },
      });
      expect(result.valid).toBe(false);
    });

    it('transition.enabled 必须是布尔值', () => {
      const result = validateThemeConfig({
        transition: { enabled: 'yes' as any },
      });
      expect(result.valid).toBe(false);
    });

    // --- 算法验证 ---

    it('algorithm 必须是函数或函数数组', () => {
      const result = validateThemeConfig({
        algorithm: 'darkAlgorithm' as any,
      });
      expect(result.valid).toBe(false);
    });

    it('algorithm 数组项必须是函数', () => {
      const result = validateThemeConfig({
        algorithm: [darkAlgorithm, 'invalid' as any],
      });
      expect(result.valid).toBe(false);
    });

    it('合法 algorithm 通过验证', () => {
      const result = validateThemeConfig({
        algorithm: [darkAlgorithm],
      });
      expect(result.valid).toBe(true);
    });
  });

  // ========== validateTokens ==========

  describe('validateTokens', () => {
    it('颜色 token 验证各种合法格式', () => {
      const formats = [
        '#fff',
        '#ffffff',
        '#ffffffaa',
        'rgb(255 255 255)',
        'rgb(255 255 255 / 0.5)',
        'rgba(255, 255, 255, 0.5)',
        'hsl(0 0% 100%)',
        'hsl(0, 0%, 100%)',
      ];
      for (const color of formats) {
        const result = validateTokens({ colorPrimary: color });
        expect(result.valid, `应接受: ${color}`).toBe(true);
      }
    });

    it('RGB 值超出范围', () => {
      const result = validateTokens({
        colorPrimary: 'rgb(300 0 0)',
      });
      expect(result.valid).toBe(false);
    });

    it('尺寸 token 验证', () => {
      const valid = validateTokens({ fontSize: '14px' });
      expect(valid.valid).toBe(true);

      const validRem = validateTokens({ fontSize: '1.5rem' });
      expect(validRem.valid).toBe(true);

      const invalid = validateTokens({ fontSize: 'big' });
      expect(invalid.valid).toBe(false);
    });

    it('数值 token 验证（lineHeight, zIndex）', () => {
      const validLh = validateTokens({ lineHeight: 1.5 });
      expect(validLh.valid).toBe(true);

      const invalidLh = validateTokens({ lineHeight: 10 });
      expect(invalidLh.valid).toBe(false);

      const invalidZi = validateTokens({ zIndexBase: 1.5 });
      expect(invalidZi.valid).toBe(false);
    });

    it('阴影 token 验证', () => {
      const valid = validateTokens({
        shadow: '0 1px 2px rgb(0 0 0 / 0.1)',
      });
      expect(valid.valid).toBe(true);

      const validNone = validateTokens({ shadow: 'none' });
      expect(validNone.valid).toBe(true);
    });

    it('字体族 token 验证', () => {
      const valid = validateTokens({
        fontFamily: 'Inter, system-ui, sans-serif',
      });
      expect(valid.valid).toBe(true);

      const invalid = validateTokens({ fontFamily: '' });
      expect(invalid.valid).toBe(false);
    });

    it('未知字段返回警告而非错误', () => {
      const result = validateTokens({
        unknownField: 'value',
      } as any);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.field).toBe('unknownField');
    });
  });

  // ========== validateThemeConfigOrThrow ==========

  describe('validateThemeConfigOrThrow', () => {
    it('合法配置不抛出', () => {
      expect(() => validateThemeConfigOrThrow({})).not.toThrow();
    });

    it('非法配置抛出错误', () => {
      expect(() =>
        validateThemeConfigOrThrow({
          seed: { colorPrimary: 'invalid' },
        }),
      ).toThrow('主题配置验证失败');
    });
  });

  // ========== sanitizeThemeConfig ==========

  describe('sanitizeThemeConfig', () => {
    it('过滤无效 token，保留有效 token', () => {
      const config = sanitizeThemeConfig({
        token: {
          colorPrimary: '#1677ff',
          colorSuccess: 'invalid-color',
        },
      });
      expect(config.token).toHaveProperty('colorPrimary');
      expect(config.token).not.toHaveProperty('colorSuccess');
    });

    it('无 token 时原样返回', () => {
      const config = { seed: { fontSize: 14 } };
      expect(sanitizeThemeConfig(config)).toBe(config);
    });

    it('保留未知字段（只有警告的字段）', () => {
      const config = sanitizeThemeConfig({
        token: {
          colorPrimary: '#1677ff',
          customField: 'any-value',
        } as any,
      });
      expect((config.token as any).customField).toBe('any-value');
    });
  });
});
