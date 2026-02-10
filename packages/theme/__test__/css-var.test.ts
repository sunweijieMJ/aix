import { describe, expect, it } from 'vitest';
import {
  createCSSVarNames,
  createCSSVarRefs,
  cssVar,
  cssVarName,
  getCSSVar,
  getCSSVarName,
  getCSSVarRefs,
  getCSSVars,
} from '../src/utils/css-var';

describe('css-var', () => {
  describe('cssVar', () => {
    it('should return var() wrapped CSS variable reference', () => {
      expect(cssVar.colorPrimary).toBe('var(--colorPrimary)');
      expect(cssVar.fontSize).toBe('var(--fontSize)');
      expect(cssVar.colorBgContainer).toBe('var(--colorBgContainer)');
    });

    it('should work with any token key', () => {
      expect(cssVar.tokenCyan6).toBe('var(--tokenCyan6)');
      expect(cssVar.shadowLG).toBe('var(--shadowLG)');
      expect(cssVar.zIndexModal).toBe('var(--zIndexModal)');
    });
  });

  describe('cssVarName', () => {
    it('should return CSS variable name without var() wrapper', () => {
      expect(cssVarName.colorPrimary).toBe('--colorPrimary');
      expect(cssVarName.fontSize).toBe('--fontSize');
    });
  });

  describe('getCSSVar', () => {
    it('should return var() reference for token key', () => {
      expect(getCSSVar('colorPrimary')).toBe('var(--colorPrimary)');
    });

    it('should support fallback value', () => {
      expect(getCSSVar('colorPrimary', '#1890ff')).toBe(
        'var(--colorPrimary, #1890ff)',
      );
      expect(getCSSVar('fontSize', '14px')).toBe('var(--fontSize, 14px)');
    });
  });

  describe('getCSSVarName', () => {
    it('should return CSS variable name', () => {
      expect(getCSSVarName('colorPrimary')).toBe('--colorPrimary');
      expect(getCSSVarName('colorBgBase')).toBe('--colorBgBase');
    });
  });

  describe('getCSSVars', () => {
    it('should return object with multiple CSS var references', () => {
      const result = getCSSVars(['colorPrimary', 'colorSuccess', 'fontSize']);

      expect(result).toEqual({
        colorPrimary: 'var(--colorPrimary)',
        colorSuccess: 'var(--colorSuccess)',
        fontSize: 'var(--fontSize)',
      });
    });

    it('should return empty object for empty array', () => {
      const result = getCSSVars([]);
      expect(result).toEqual({});
    });
  });

  describe('createCSSVarRefs', () => {
    it('should create a new proxy instance', () => {
      const refs1 = createCSSVarRefs();
      const refs2 = createCSSVarRefs();

      // Different instances
      expect(refs1).not.toBe(refs2);

      // Same behavior
      expect(refs1.colorPrimary).toBe('var(--colorPrimary)');
      expect(refs2.colorPrimary).toBe('var(--colorPrimary)');
    });
  });

  describe('createCSSVarNames', () => {
    it('should create a new proxy instance for var names', () => {
      const names = createCSSVarNames();
      expect(names.colorPrimary).toBe('--colorPrimary');
      expect(names.colorBgContainer).toBe('--colorBgContainer');
    });
  });

  describe('getCSSVarRefs', () => {
    it('should return singleton instance', () => {
      const refs1 = getCSSVarRefs();
      const refs2 = getCSSVarRefs();

      expect(refs1).toBe(refs2);
      expect(refs1.colorPrimary).toBe('var(--colorPrimary)');
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
        color: 'var(--colorPrimary)',
        backgroundColor: 'var(--colorBgContainer)',
        borderRadius: 'var(--borderRadius)',
        padding: 'var(--paddingXS) var(--paddingSM)',
      });
    });

    it('should work with CSS-in-JS patterns', () => {
      const styles = `
        .button {
          color: ${cssVar.colorPrimary};
          background: ${cssVar.colorBgContainer};
        }
      `;

      expect(styles).toContain('color: var(--colorPrimary)');
      expect(styles).toContain('background: var(--colorBgContainer)');
    });
  });
});
