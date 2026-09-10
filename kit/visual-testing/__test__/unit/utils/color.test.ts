import { describe, it, expect } from 'vitest';
import { parseCssColor, rgbaToColor, deltaE2000, toHex } from '../../../src/utils/color';

describe('parseCssColor', () => {
  it('parses computed-style rgb / rgba forms', () => {
    expect(parseCssColor('rgb(31, 35, 41)')!.hex).toBe('#1f2329');
    expect(parseCssColor('rgba(31, 35, 41, 0.5)')!.a).toBe(0.5);
    expect(parseCssColor('rgb(31 35 41 / 50%)')!.a).toBe(0.5);
  });
  it('parses hex forms', () => {
    expect(parseCssColor('#fff')!.hex).toBe('#ffffff');
    expect(parseCssColor('#1F2329')!.hex).toBe('#1f2329');
    expect(parseCssColor('#00000080')!.a).toBeCloseTo(0.5, 1);
  });
  it('returns null for transparent / invalid', () => {
    expect(parseCssColor('transparent')).toBeNull();
    expect(parseCssColor('rgba(0, 0, 0, 0)')).toBeNull();
    expect(parseCssColor('none')).toBeNull();
    expect(parseCssColor('blue')).toBeNull();
    expect(parseCssColor(undefined)).toBeNull();
  });
});

describe('toHex / rgbaToColor', () => {
  it('appends alpha only when < 1', () => {
    expect(toHex(255, 0, 0)).toBe('#ff0000');
    expect(toHex(255, 0, 0, 0.5)).toBe('#ff000080');
    expect(rgbaToColor(300, -5, 12.6).hex).toBe('#ff000d');
  });
});

describe('deltaE2000', () => {
  it('is 0 for identical colors and ~100 for black vs white', () => {
    const a = rgbaToColor(10, 20, 30);
    expect(deltaE2000(a, a)).toBe(0);
    expect(deltaE2000(rgbaToColor(0, 0, 0), rgbaToColor(255, 255, 255))).toBeCloseTo(100, 0);
  });
  it('is small for near colors and larger for distinct ones', () => {
    const near = deltaE2000(rgbaToColor(31, 35, 41), rgbaToColor(33, 36, 42));
    const far = deltaE2000(rgbaToColor(31, 35, 41), rgbaToColor(51, 51, 51));
    expect(near).toBeLessThan(1.5);
    expect(far).toBeGreaterThan(3);
    expect(far).toBeLessThan(10);
  });
  it('is symmetric', () => {
    const a = rgbaToColor(0, 88, 38);
    const b = rgbaToColor(16, 101, 50);
    expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 6);
  });
});
