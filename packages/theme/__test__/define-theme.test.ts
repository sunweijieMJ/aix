import { describe, expect, it } from 'vitest';
import {
  generateThemeTokens,
  defaultAlgorithm,
  darkAlgorithm,
  darkMixAlgorithm,
  compactAlgorithm,
  wireframeAlgorithm,
  generateAllComponentOverrides,
  generateComponentTokenOverrides,
} from '../src/core/define-theme';
import { defaultSeedTokens } from '../src/core/seed-derivation';
import type { ThemeAlgorithm } from '../src/theme-types';

describe('define-theme', () => {
  describe('token overrides', () => {
    it('should apply token overrides without seed', () => {
      const tokens = generateThemeTokens({
        token: { colorPrimary: 'rgb(255 0 0)' },
      });
      expect(tokens.colorPrimary).toBe('rgb(255 0 0)');
    });

    it('should apply base token overrides', () => {
      const tokens = generateThemeTokens({
        token: { tokenCyan6: 'rgb(0 0 255)' },
      });
      expect(tokens.tokenCyan6).toBe('rgb(0 0 255)');
    });
  });

  describe('CSS variable names completeness', () => {
    it('should include all current ThemeTokens keys', () => {
      const tokens = generateThemeTokens({});
      const allKeys = Object.keys(tokens);

      const buttonVars = [
        'colorPrimary',
        'colorPrimaryHover',
        'colorPrimaryActive',
        'colorPrimaryBg',
        'colorPrimaryText',
        'colorBgContainer',
        'colorBorder',
        'colorText',
        'colorTextDisabled',
        'colorBgContainerDisabled',
        'borderRadius',
        'fontSize',
        'controlHeight',
        'paddingXS',
        'padding',
        'fontFamily',
        'lineHeight',
        'colorLink',
        'colorLinkHover',
      ];

      for (const varName of buttonVars) {
        expect(allKeys).toContain(varName);
      }
    });

    it('should include Info tokens', () => {
      const tokens = generateThemeTokens({});
      expect(tokens.colorInfo).toBeDefined();
      expect(tokens.colorInfoHover).toBeDefined();
      expect(tokens.colorBorderDisabled).toBeDefined();
    });
  });

  describe('composable algorithm API', () => {
    it('defaultAlgorithm is identity function', () => {
      const base = generateThemeTokens({});
      const withDefault = generateThemeTokens({
        algorithm: defaultAlgorithm,
      });
      for (const key of Object.keys(base) as Array<keyof typeof base>) {
        expect(String(withDefault[key])).toBe(String(base[key]));
      }
    });

    it('[darkAlgorithm, compactAlgorithm] produces combined result', () => {
      const darkTokens = generateThemeTokens({ algorithm: darkAlgorithm });
      const compactTokens = generateThemeTokens({
        algorithm: compactAlgorithm,
      });
      const combined = generateThemeTokens({
        algorithm: [darkAlgorithm, compactAlgorithm],
      });

      expect(combined.colorBgBase).toBe(darkTokens.colorBgBase);
      expect(combined.controlHeight).toBe(compactTokens.controlHeight);
    });

    it('custom algorithm function receives tokens and returns overrides', () => {
      const customAlgo: ThemeAlgorithm = (tokens) => {
        expect(tokens.colorPrimary).toBeDefined();
        return { colorPrimary: 'rgb(255 0 0)' };
      };

      const tokens = generateThemeTokens({ algorithm: customAlgo });
      expect(tokens.colorPrimary).toBe('rgb(255 0 0)');
    });

    it('user token overrides have highest priority over algorithms', () => {
      const tokens = generateThemeTokens({
        algorithm: [darkAlgorithm, compactAlgorithm],
        token: { colorPrimary: 'rgb(0 255 0)' },
      });
      expect(tokens.colorPrimary).toBe('rgb(0 255 0)');
    });

    it('algorithms execute in order (later sees earlier results)', () => {
      const first: ThemeAlgorithm = () => ({
        colorPrimary: 'rgb(100 0 0)',
      });
      const second: ThemeAlgorithm = (tokens) => {
        expect(tokens.colorPrimary).toBe('rgb(100 0 0)');
        return { colorSuccess: 'rgb(0 100 0)' };
      };

      const tokens = generateThemeTokens({ algorithm: [first, second] });
      expect(tokens.colorPrimary).toBe('rgb(100 0 0)');
      expect(tokens.colorSuccess).toBe('rgb(0 100 0)');
    });

    it('single function form works same as array', () => {
      const single = generateThemeTokens({ algorithm: darkAlgorithm });
      const array = generateThemeTokens({ algorithm: [darkAlgorithm] });

      for (const key of Object.keys(single) as Array<keyof typeof single>) {
        expect(String(array[key])).toBe(String(single[key]));
      }
    });
  });

  describe('darkMixAlgorithm', () => {
    it('should produce dark background and neutral overrides', () => {
      const tokens = generateThemeTokens({ algorithm: darkMixAlgorithm });
      expect(tokens.colorBgBase).toBe('rgb(0 0 0)');
      expect(tokens.colorText).toBe('rgb(255 255 255 / 0.85)');
    });

    it('should differ from standard darkAlgorithm in color values', () => {
      const dark = generateThemeTokens({ algorithm: darkAlgorithm });
      const darkMix = generateThemeTokens({ algorithm: darkMixAlgorithm });
      expect(darkMix.colorBgBase).toBe(dark.colorBgBase);
      expect(darkMix.colorText).toBe(dark.colorText);
      expect(darkMix.colorPrimary).not.toBe(dark.colorPrimary);
    });

    it('should combine with compact algorithm', () => {
      const tokens = generateThemeTokens({
        algorithm: [darkMixAlgorithm, compactAlgorithm],
      });
      expect(tokens.colorBgBase).toBe('rgb(0 0 0)');
      expect(tokens.controlHeight).toBeDefined();
    });
  });

  describe('wireframeAlgorithm', () => {
    it('should set fills to transparent and radii to 0', () => {
      const tokens = generateThemeTokens({ algorithm: wireframeAlgorithm });
      expect(tokens.colorFill).toBe('transparent');
      expect(tokens.colorFillSecondary).toBe('transparent');
      expect(tokens.colorBgContainer).toBe('transparent');
      expect(tokens.colorBgElevated).toBe('transparent');
      expect(tokens.borderRadius).toBe('0px');
      expect(tokens.borderRadiusLG).toBe('0px');
      expect(tokens.shadow).toBe('none');
      expect(tokens.shadowLG).toBe('none');
    });

    it('should set border color to text color', () => {
      const tokens = generateThemeTokens({ algorithm: wireframeAlgorithm });
      expect(tokens.colorBorder).toBe(tokens.colorText);
    });

    it('should combine with dark algorithm', () => {
      const tokens = generateThemeTokens({
        algorithm: [darkAlgorithm, wireframeAlgorithm],
      });
      expect(tokens.colorText).toBe('rgb(255 255 255 / 0.85)');
      expect(tokens.colorFill).toBe('transparent');
      expect(tokens.borderRadius).toBe('0px');
    });

    it('should combine with compact algorithm', () => {
      const tokens = generateThemeTokens({
        algorithm: [compactAlgorithm, wireframeAlgorithm],
      });
      expect(tokens.colorFill).toBe('transparent');
      expect(tokens.borderRadius).toBe('0px');
      expect(tokens.controlHeight).toBeDefined();
    });
  });

  describe('component-level token overrides', () => {
    it('should generate direct token overrides for a component', () => {
      const globalTokens = generateThemeTokens({});
      const diff = generateComponentTokenOverrides(
        { token: { colorPrimary: 'rgb(255 0 0)' } },
        globalTokens,
        defaultSeedTokens,
        [],
      );
      expect(diff.colorPrimary).toBe('rgb(255 0 0)');
    });

    it('should derive component tokens from seed when algorithm=true', () => {
      const globalTokens = generateThemeTokens({});
      const diff = generateComponentTokenOverrides(
        {
          seed: { colorPrimary: 'rgb(255 0 0)' },
          algorithm: true,
        },
        globalTokens,
        defaultSeedTokens,
        [],
      );
      expect(diff.colorPrimary).toBeDefined();
      expect(diff.colorPrimary).not.toBe(globalTokens.colorPrimary);
    });

    it('should produce minimal diff with algorithm=true seed derivation', () => {
      const globalTokens = generateThemeTokens({});
      const diff = generateComponentTokenOverrides(
        { seed: {}, algorithm: true },
        globalTokens,
        defaultSeedTokens,
        [],
      );
      expect(Object.keys(diff)).toHaveLength(0);
    });

    it('should generate overrides for multiple components', () => {
      const globalTokens = generateThemeTokens({});
      const result = generateAllComponentOverrides(
        {
          button: { token: { colorPrimary: 'rgb(255 0 0)' } },
          input: { token: { borderRadius: '8px' } },
        },
        globalTokens,
        defaultSeedTokens,
        [],
      );
      expect(result.button).toBeDefined();
      expect(result.button!.colorPrimary).toBe('rgb(255 0 0)');
      expect(result.input).toBeDefined();
      expect(result.input!.borderRadius).toBe('8px');
    });

    it('should apply global algorithms to component seed derivation', () => {
      const globalTokens = generateThemeTokens({ algorithm: darkAlgorithm });
      const diff = generateComponentTokenOverrides(
        {
          seed: { colorPrimary: 'rgb(255 0 0)' },
          algorithm: true,
        },
        globalTokens,
        defaultSeedTokens,
        [darkAlgorithm],
      );
      expect(diff.colorPrimary).toBeDefined();
    });
  });

  describe('generateThemeTokens API', () => {
    it('accepts empty config', () => {
      const tokens = generateThemeTokens({});
      expect(tokens.colorPrimary).toBeDefined();
      expect(tokens.fontSize).toBeDefined();
    });

    it('accepts algorithm config', () => {
      const darkTokens = generateThemeTokens({ algorithm: darkAlgorithm });
      expect(darkTokens.colorBgBase).toBe('rgb(0 0 0)');

      const compactTokens = generateThemeTokens({
        algorithm: compactAlgorithm,
      });
      expect(compactTokens.fontSize).toBeDefined();
    });

    it('seed overrides drive token derivation', () => {
      const tokens = generateThemeTokens({
        seed: { colorPrimary: 'rgb(255 0 0)' },
      });
      expect(tokens.colorPrimary).toContain('rgb(');
    });

    it('seed + token overrides work together', () => {
      const tokens = generateThemeTokens({
        seed: { fontSize: 16 },
        token: { colorPrimary: 'rgb(0 0 255)' },
      });
      expect(tokens.fontSize).toBe('16px');
      expect(tokens.colorPrimary).toBe('rgb(0 0 255)');
    });

    it('user token overrides have highest priority over algorithms', () => {
      const tokens = generateThemeTokens({
        algorithm: darkAlgorithm,
        token: { colorPrimary: 'rgb(255 0 0)' },
      });
      expect(tokens.colorPrimary).toBe('rgb(255 0 0)');
    });
  });
});
