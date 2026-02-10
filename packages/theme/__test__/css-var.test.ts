import { describe, expect, it } from 'vitest';
import {
  cssVar,
  cssVarName,
  getCSSVar,
  getCSSVarName,
  _getCSSVarsForTesting,
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

  describe('_getCSSVarsForTesting (internal)', () => {
    it('should return object with multiple CSS var references', () => {
      const result = _getCSSVarsForTesting([
        'colorPrimary',
        'colorSuccess',
        'fontSize',
      ]);

      expect(result).toEqual({
        colorPrimary: 'var(--colorPrimary)',
        colorSuccess: 'var(--colorSuccess)',
        fontSize: 'var(--fontSize)',
      });
    });

    it('should return empty object for empty array', () => {
      const result = _getCSSVarsForTesting([]);
      expect(result).toEqual({});
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
