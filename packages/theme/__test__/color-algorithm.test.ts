import { describe, expect, it } from 'vitest';
import {
  adjustLightness,
  adjustSaturation,
  generateActiveColor,
  generateBgColor,
  generateBorderColor,
  generateColorSeries,
  generateColorSeriesFromPalette,
  generateHoverColor,
  generatePalette,
  generateTextColor,
  hslToRgb,
  hsvToRgb,
  mixColors,
  parseColor,
  rgbToHsl,
  rgbToHsv,
  rgbToString,
} from '../src/core/color-algorithm';

describe('color-algorithm', () => {
  describe('parseColor', () => {
    it('should parse RGB color with spaces', () => {
      const result = parseColor('rgb(0 180 180)');
      expect(result).toEqual({ r: 0, g: 180, b: 180 });
    });

    it('should parse RGB color with commas', () => {
      const result = parseColor('rgb(0, 180, 180)');
      expect(result).toEqual({ r: 0, g: 180, b: 180 });
    });

    it('should throw error for invalid color', () => {
      expect(() => parseColor('invalid')).toThrow('Unsupported color format');
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

      const originalHsl = rgbToHsl(parseColor(original));
      const resultHsl = rgbToHsl(parseColor(result));

      expect(resultHsl.l).toBeGreaterThan(originalHsl.l);
    });

    it('should decrease lightness', () => {
      const original = 'rgb(0 180 180)';
      const result = adjustLightness(original, -20);

      const originalHsl = rgbToHsl(parseColor(original));
      const resultHsl = rgbToHsl(parseColor(result));

      expect(resultHsl.l).toBeLessThan(originalHsl.l);
    });

    it('should clamp lightness to 0-100', () => {
      const dark = 'rgb(10 10 10)';
      const result = adjustLightness(dark, -50);
      const hsl = rgbToHsl(parseColor(result));
      expect(hsl.l).toBeGreaterThanOrEqual(0);
    });
  });

  describe('adjustSaturation', () => {
    it('should increase saturation', () => {
      const original = 'rgb(100 150 150)';
      const result = adjustSaturation(original, 20);

      const originalHsl = rgbToHsl(parseColor(original));
      const resultHsl = rgbToHsl(parseColor(result));

      expect(resultHsl.s).toBeGreaterThan(originalHsl.s);
    });
  });

  describe('generateHoverColor', () => {
    it('should generate lighter hover color', () => {
      const base = 'rgb(0 180 180)';
      const hover = generateHoverColor(base);

      const baseHsl = rgbToHsl(parseColor(base));
      const hoverHsl = rgbToHsl(parseColor(hover));

      expect(hoverHsl.l).toBeGreaterThan(baseHsl.l);
    });
  });

  describe('generateActiveColor', () => {
    it('should generate darker active color', () => {
      const base = 'rgb(0 180 180)';
      const active = generateActiveColor(base);

      const baseHsl = rgbToHsl(parseColor(base));
      const activeHsl = rgbToHsl(parseColor(active));

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

      const baseHsl = rgbToHsl(parseColor(base));
      const borderHsl = rgbToHsl(parseColor(border));

      expect(borderHsl.l).toBeGreaterThan(baseHsl.l);
    });
  });

  describe('generateTextColor', () => {
    it('should generate darker text color', () => {
      const base = 'rgb(0 180 180)';
      const text = generateTextColor(base);

      const baseHsl = rgbToHsl(parseColor(base));
      const textHsl = rgbToHsl(parseColor(text));

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

  describe('rgbToHsv', () => {
    it('should convert pure red', () => {
      const hsv = rgbToHsv({ r: 255, g: 0, b: 0 });
      expect(hsv.h).toBeCloseTo(0, 0);
      expect(hsv.s).toBeCloseTo(100, 0);
      expect(hsv.v).toBeCloseTo(100, 0);
    });

    it('should convert pure green', () => {
      const hsv = rgbToHsv({ r: 0, g: 255, b: 0 });
      expect(hsv.h).toBeCloseTo(120, 0);
      expect(hsv.s).toBeCloseTo(100, 0);
      expect(hsv.v).toBeCloseTo(100, 0);
    });

    it('should convert cyan', () => {
      const hsv = rgbToHsv({ r: 19, g: 194, b: 194 });
      expect(hsv.h).toBeCloseTo(180, 0);
      expect(hsv.s).toBeGreaterThan(80);
      expect(hsv.v).toBeGreaterThan(70);
    });

    it('should handle grayscale', () => {
      const hsv = rgbToHsv({ r: 128, g: 128, b: 128 });
      expect(hsv.s).toBe(0);
    });

    it('should handle black', () => {
      const hsv = rgbToHsv({ r: 0, g: 0, b: 0 });
      expect(hsv.v).toBe(0);
      expect(hsv.s).toBe(0);
    });
  });

  describe('hsvToRgb', () => {
    it('should convert pure red HSV to RGB', () => {
      const rgb = hsvToRgb({ h: 0, s: 100, v: 100 });
      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);
    });

    it('should round-trip RGB → HSV → RGB', () => {
      const original = { r: 19, g: 194, b: 194 };
      const hsv = rgbToHsv(original);
      const back = hsvToRgb(hsv);
      expect(back.r).toBeCloseTo(original.r, 0);
      expect(back.g).toBeCloseTo(original.g, 0);
      expect(back.b).toBeCloseTo(original.b, 0);
    });
  });

  describe('mixColors', () => {
    it('should return color1 at weight=100', () => {
      const result = mixColors('rgb(255 0 0)', 'rgb(0 0 255)', 100);
      expect(result).toBe('rgb(255 0 0)');
    });

    it('should return color2 at weight=0', () => {
      const result = mixColors('rgb(255 0 0)', 'rgb(0 0 255)', 0);
      expect(result).toBe('rgb(0 0 255)');
    });

    it('should return midpoint at weight=50', () => {
      const result = mixColors('rgb(200 100 0)', 'rgb(0 100 200)', 50);
      expect(result).toBe('rgb(100 100 100)');
    });

    it('should mix with dark background', () => {
      const result = mixColors('rgb(19 194 194)', 'rgb(20 20 20)', 85);
      const parsed = parseColor(result);
      // Should be mostly the first color
      expect(parsed.g).toBeGreaterThan(100);
    });
  });

  describe('generateColorSeriesFromPalette', () => {
    it('should generate complete color series from palette', () => {
      const series = generateColorSeriesFromPalette('rgb(19 194 194)');
      expect(series.base).toBe('rgb(19 194 194)');
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

    it('should have lighter bg and darker active than base', () => {
      const series = generateColorSeriesFromPalette('rgb(19 194 194)');
      const baseHsl = rgbToHsl(parseColor(series.base));
      const bgHsl = rgbToHsl(parseColor(series.bg));
      const activeHsl = rgbToHsl(parseColor(series.active));
      expect(bgHsl.l).toBeGreaterThan(baseHsl.l);
      expect(activeHsl.l).toBeLessThan(baseHsl.l);
    });

    it('should work with different color inputs', () => {
      const redSeries = generateColorSeriesFromPalette('rgb(245 34 45)');
      const blueSeries = generateColorSeriesFromPalette('#1677ff');
      expect(redSeries.base).toBe('rgb(245 34 45)');
      expect(blueSeries.base).toBe('rgb(22 119 255)');
    });
  });

  describe('generatePalette', () => {
    it('should return 10 colors', () => {
      const palette = generatePalette('rgb(19 194 194)');
      expect(palette).toHaveLength(10);
    });

    it('should have base color at index 5', () => {
      const palette = generatePalette('rgb(19 194 194)');
      expect(palette[5]).toBe('rgb(19 194 194)');
    });

    it('should lighten colors at lower indices', () => {
      const palette = generatePalette('rgb(19 194 194)');
      // Index 0 should be the lightest
      const light = parseColor(palette[0]!);
      const base = parseColor(palette[5]!);
      const lightHsl = rgbToHsl(light);
      const baseHsl = rgbToHsl(base);
      expect(lightHsl.l).toBeGreaterThan(baseHsl.l);
    });

    it('should darken colors at higher indices', () => {
      const palette = generatePalette('rgb(19 194 194)');
      const dark = parseColor(palette[9]!);
      const base = parseColor(palette[5]!);
      const darkHsl = rgbToHsl(dark);
      const baseHsl = rgbToHsl(base);
      expect(darkHsl.l).toBeLessThan(baseHsl.l);
    });

    it('should work with hex colors', () => {
      const palette = generatePalette('#13c2c2');
      expect(palette).toHaveLength(10);
      expect(palette[5]).toBe('rgb(19 194 194)');
    });

    it('should produce valid rgb strings', () => {
      const palette = generatePalette('rgb(22 119 255)');
      for (const color of palette) {
        expect(color).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
      }
    });
  });
});
