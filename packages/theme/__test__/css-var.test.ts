import { describe, expect, it } from 'vitest';
import {
  createCSSVarNames,
  createCSSVarRefs,
  CSS_VAR_PREFIX,
  cssVar,
  cssVarName,
  getCSSVar,
  getCSSVarName,
} from '../src/utils/css-var';

describe('css-var', () => {
  describe('CSS_VAR_PREFIX', () => {
    it('should be "aix"', () => {
      expect(CSS_VAR_PREFIX).toBe('aix');
    });
  });

  describe('cssVar', () => {
    it('should return var() wrapped CSS variable reference with aix prefix', () => {
      expect(cssVar.colorPrimary).toBe('var(--aix-colorPrimary)');
      expect(cssVar.fontSize).toBe('var(--aix-fontSize)');
      expect(cssVar.colorBgContainer).toBe('var(--aix-colorBgContainer)');
    });

    it('should work with any token key', () => {
      expect(cssVar.tokenCyan6).toBe('var(--aix-tokenCyan6)');
      expect(cssVar.shadowLG).toBe('var(--aix-shadowLG)');
      expect(cssVar.zIndexModal).toBe('var(--aix-zIndexModal)');
    });
  });

  describe('cssVarName', () => {
    it('should return CSS variable name with aix prefix without var() wrapper', () => {
      expect(cssVarName.colorPrimary).toBe('--aix-colorPrimary');
      expect(cssVarName.fontSize).toBe('--aix-fontSize');
    });
  });

  describe('getCSSVar', () => {
    it('should return var() reference for token key with aix prefix', () => {
      expect(getCSSVar('colorPrimary')).toBe('var(--aix-colorPrimary)');
    });

    it('should support fallback value', () => {
      expect(getCSSVar('colorPrimary', '#1890ff')).toBe(
        'var(--aix-colorPrimary, #1890ff)',
      );
      expect(getCSSVar('fontSize', '14px')).toBe('var(--aix-fontSize, 14px)');
    });

    it('should support custom prefix', () => {
      expect(getCSSVar('colorPrimary', undefined, 'my-app')).toBe(
        'var(--my-app-colorPrimary)',
      );
    });
  });

  describe('getCSSVarName', () => {
    it('should return CSS variable name with aix prefix', () => {
      expect(getCSSVarName('colorPrimary')).toBe('--aix-colorPrimary');
      expect(getCSSVarName('colorBgBase')).toBe('--aix-colorBgBase');
    });

    it('should support custom prefix', () => {
      expect(getCSSVarName('colorPrimary', 'my-app')).toBe(
        '--my-app-colorPrimary',
      );
    });
  });

  describe('createCSSVarRefs', () => {
    it('should create refs with custom prefix', () => {
      const myVar = createCSSVarRefs('custom');
      expect(myVar.colorPrimary).toBe('var(--custom-colorPrimary)');
      expect(myVar.fontSize).toBe('var(--custom-fontSize)');
    });

    it('should default to aix prefix', () => {
      const defaultVar = createCSSVarRefs();
      expect(defaultVar.colorPrimary).toBe('var(--aix-colorPrimary)');
    });
  });

  describe('createCSSVarNames', () => {
    it('should create names with custom prefix', () => {
      const myVarName = createCSSVarNames('custom');
      expect(myVarName.colorPrimary).toBe('--custom-colorPrimary');
    });

    it('should default to aix prefix', () => {
      const defaultVarName = createCSSVarNames();
      expect(defaultVarName.colorPrimary).toBe('--aix-colorPrimary');
    });
  });

  describe('use case: dynamic styles', () => {
    it('should work with style objects', () => {
      const buttonStyle = {
        color: cssVar.colorPrimary,
        backgroundColor: cssVar.colorBgContainer,
        borderRadius: cssVar.borderRadius,
        padding: `${cssVar.paddingXS} ${cssVar.paddingSM}`,
      };

      expect(buttonStyle).toEqual({
        color: 'var(--aix-colorPrimary)',
        backgroundColor: 'var(--aix-colorBgContainer)',
        borderRadius: 'var(--aix-borderRadius)',
        padding: 'var(--aix-paddingXS) var(--aix-paddingSM)',
      });
    });

    it('should work with CSS-in-JS patterns', () => {
      const styles = `
        .button {
          color: ${cssVar.colorPrimary};
          background: ${cssVar.colorBgContainer};
        }
      `;

      expect(styles).toContain('color: var(--aix-colorPrimary)');
      expect(styles).toContain('background: var(--aix-colorBgContainer)');
    });
  });
});
