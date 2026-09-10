/**
 * 颜色工具：解析、格式化、ΔE2000 感知色差
 */

import type { Color } from '../core/fidelity/types';

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export function rgbaToColor(r: number, g: number, b: number, a = 1): Color {
  const R = clamp255(r);
  const G = clamp255(g);
  const B = clamp255(b);
  const A = Math.max(0, Math.min(1, a));
  return { r: R, g: G, b: B, a: A, hex: toHex(R, G, B, A) };
}

export function toHex(r: number, g: number, b: number, a = 1): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  const base = `#${h(r)}${h(g)}${h(b)}`;
  return a < 1 ? `${base}${h(Math.round(a * 255))}` : base;
}

/**
 * 解析 CSS 颜色字符串（computed style 形态）：
 * rgb(a b c), rgb(a, b, c), rgba(a, b, c, d), rgb(a b c / d), #rgb, #rrggbb, #rrggbbaa, transparent
 * 无法解析返回 null
 */
export function parseCssColor(input: string | null | undefined): Color | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (!value || value === 'transparent' || value === 'none') return null;

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = hex.split('').map((c) => parseInt(c + c, 16));
      return rgbaToColor(r!, g!, b!, a === undefined ? 1 : a / 255);
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return rgbaToColor(r, g, b, a);
    }
    return null;
  }

  const fn = value.match(/^rgba?\((.+)\)$/);
  if (fn) {
    const parts = fn[1]!
      .replace('/', ' ')
      .split(/[\s,]+/)
      .filter(Boolean);
    if (parts.length < 3) return null;
    const num = (s: string) => (s.endsWith('%') ? (parseFloat(s) / 100) * 255 : parseFloat(s));
    const r = num(parts[0]!);
    const g = num(parts[1]!);
    const b = num(parts[2]!);
    let a = 1;
    if (parts[3] !== undefined) {
      a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    }
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
    if (a === 0) return null;
    return rgbaToColor(r, g, b, a);
  }

  return null;
}

// ---- ΔE2000 ----

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);

  // sRGB D65 → XYZ
  let X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  let Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  let Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;

  X /= 0.95047;
  Y /= 1.0;
  Z /= 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * CIEDE2000 色差。< 1 肉眼不可辨；1~3 仔细看可辨；> 6 明显不同。
 */
export function deltaE2000(c1: Color, c2: Color): number {
  const [L1, a1, b1] = rgbToLab(c1.r, c1.g, c1.b);
  const [L2, a2, b2] = rgbToLab(c2.r, c2.g, c2.b);

  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const h = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const v = Math.atan2(b, a) * deg;
    return v < 0 ? v + 360 : v;
  };
  const h1p = h(a1p, b1);
  const h2p = h(a2p, b2);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * rad) +
    0.24 * Math.cos(2 * hbarp * rad) +
    0.32 * Math.cos((3 * hbarp + 6) * rad) -
    0.2 * Math.cos((4 * hbarp - 63) * rad);

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;

  const kL = 1;
  const kC = 1;
  const kH = 1;

  return Math.sqrt(
    (dLp / (kL * SL)) ** 2 +
      (dCp / (kC * SC)) ** 2 +
      (dHp / (kH * SH)) ** 2 +
      RT * (dCp / (kC * SC)) * (dHp / (kH * SH)),
  );
}
