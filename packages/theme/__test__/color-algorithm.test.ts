import { describe, expect, it } from 'vitest';
import {
  adjustLightness,
  adjustSaturation,
  generateActiveColor,
  generateBgColor,
  generateBorderColor,
  generateColorPalette,
  generateColorSeries,
  generateHoverColor,
  generateTextColor,
  hslToRgb,
  parseRGB,
  rgbToHsl,
  rgbToString,
} from '../src/color-algorithm';

describe('color-algorithm', () => {
  describe('parseRGB', () => {
    it('should parse RGB color with spaces', () => {
      const result = parseRGB('rgb(0 180 180)');
      expect(result).toEqual({ r: 0, g: 180, b: 180 });
    });

    it('should parse RGB color with commas', () => {
      const result = parseRGB('rgb(0, 180, 180)');
      expect(result).toEqual({ r: 0, g: 180, b: 180 });
    });

    it('should throw error for invalid color', () => {
      expect(() => parseRGB('invalid')).toThrow('Invalid RGB color');
    });
  });

  describe('rgbToString', () => {
    it('should convert RGB to string', () => {
      const result = rgbToString({ r: 0, g: 180, b: 180 });
      expect(result).toBe('rgb(0 180 180)');
    });
  });

  describe('rgbToHsl', () => {
    it('should convert RGB to HSL', () => {
      const result = rgbToHsl({ r: 0, g: 180, b: 180 });
      expect(result.h).toBeCloseTo(180, 0);
      expect(result.s).toBeGreaterThan(0);
      expect(result.l).toBeGreaterThan(0);
    });

    it('should handle grayscale colors', () => {
      const result = rgbToHsl({ r: 128, g: 128, b: 128 });
      expect(result.s).toBe(0);
    });
  });

  describe('hslToRgb', () => {
    it('should convert HSL to RGB', () => {
      const result = hslToRgb({ h: 180, s: 100, l: 35 });
      expect(result.r).toBeCloseTo(0, 0);
      expect(result.g).toBeGreaterThan(0);
      expect(result.b).toBeGreaterThan(0);
    });
  });

  describe('adjustLightness', () => {
    it('should increase lightness', () => {
      const original = 'rgb(0 180 180)';
      const result = adjustLightness(original, 20);

      const originalHsl = rgbToHsl(parseRGB(original));
      const resultHsl = rgbToHsl(parseRGB(result));

      expect(resultHsl.l).toBeGreaterThan(originalHsl.l);
    });

    it('should decrease lightness', () => {
      const original = 'rgb(0 180 180)';
      const result = adjustLightness(original, -20);

      const originalHsl = rgbToHsl(parseRGB(original));
      const resultHsl = rgbToHsl(parseRGB(result));

      expect(resultHsl.l).toBeLessThan(originalHsl.l);
    });

    it('should clamp lightness to 0-100', () => {
      const dark = 'rgb(10 10 10)';
      const result = adjustLightness(dark, -50);
      const hsl = rgbToHsl(parseRGB(result));
      expect(hsl.l).toBeGreaterThanOrEqual(0);
    });
  });

  describe('adjustSaturation', () => {
    it('should increase saturation', () => {
      const original = 'rgb(100 150 150)';
      const result = adjustSaturation(original, 20);

      const originalHsl = rgbToHsl(parseRGB(original));
      const resultHsl = rgbToHsl(parseRGB(result));

      expect(resultHsl.s).toBeGreaterThan(originalHsl.s);
    });
  });

  describe('generateHoverColor', () => {
    it('should generate lighter hover color', () => {
      const base = 'rgb(0 180 180)';
      const hover = generateHoverColor(base);

      const baseHsl = rgbToHsl(parseRGB(base));
      const hoverHsl = rgbToHsl(parseRGB(hover));

      expect(hoverHsl.l).toBeGreaterThan(baseHsl.l);
    });
  });

  describe('generateActiveColor', () => {
    it('should generate darker active color', () => {
      const base = 'rgb(0 180 180)';
      const active = generateActiveColor(base);

      const baseHsl = rgbToHsl(parseRGB(base));
      const activeHsl = rgbToHsl(parseRGB(active));

      expect(activeHsl.l).toBeLessThan(baseHsl.l);
    });
  });

  describe('generateBgColor', () => {
    it('should generate background color with alpha', () => {
      const base = 'rgb(0 180 180)';
      const bg = generateBgColor(base, true, 0.1);

      expect(bg).toContain('/ 0.1');
    });
  });

  describe('generateBorderColor', () => {
    it('should generate lighter border color', () => {
      const base = 'rgb(0 180 180)';
      const border = generateBorderColor(base);

      const baseHsl = rgbToHsl(parseRGB(base));
      const borderHsl = rgbToHsl(parseRGB(border));

      expect(borderHsl.l).toBeGreaterThan(baseHsl.l);
    });
  });

  describe('generateTextColor', () => {
    it('should generate darker text color', () => {
      const base = 'rgb(0 180 180)';
      const text = generateTextColor(base);

      const baseHsl = rgbToHsl(parseRGB(base));
      const textHsl = rgbToHsl(parseRGB(text));

      expect(textHsl.l).toBeLessThan(baseHsl.l);
    });
  });

  describe('generateColorSeries', () => {
    it('should generate complete color series', () => {
      const base = 'rgb(0 180 180)';
      const series = generateColorSeries(base);

      expect(series).toHaveProperty('base', base);
      expect(series).toHaveProperty('hover');
      expect(series).toHaveProperty('active');
      expect(series).toHaveProperty('bg');
      expect(series).toHaveProperty('bgHover');
      expect(series).toHaveProperty('border');
      expect(series).toHaveProperty('borderHover');
      expect(series).toHaveProperty('text');
      expect(series).toHaveProperty('textHover');
      expect(series).toHaveProperty('textActive');
    });
  });

  describe('generateColorPalette', () => {
    it('should generate 10 color levels', () => {
      const base = 'rgb(0 180 180)';
      const palette = generateColorPalette(base);

      expect(palette).toHaveLength(10);
      palette.forEach((color) => {
        expect(color).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
      });
    });

    it('should have lightest color first and darkest last', () => {
      const base = 'rgb(0 180 180)';
      const palette = generateColorPalette(base);

      const firstHsl = rgbToHsl(parseRGB(palette[0]!));
      const lastHsl = rgbToHsl(parseRGB(palette[9]!));

      expect(firstHsl.l).toBeGreaterThan(lastHsl.l);
    });
  });
});
