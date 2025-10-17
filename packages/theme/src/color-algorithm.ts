/**
 * 颜色生成算法
 * 基于 Ant Design 的颜色算法，用于自动生成派生颜色
 */

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

/**
 * 解析 RGB 字符串为对象
 * @example
 * parseRGB('rgb(0 180 180)') // { r: 0, g: 180, b: 180 }
 * parseRGB('rgb(0, 180, 180)') // { r: 0, g: 180, b: 180 }
 */
export function parseRGB(color: string): RGB {
  const match = color.match(
    /rgb\s*\(\s*(\d+)\s*[,\s]+\s*(\d+)\s*[,\s]+\s*(\d+)\s*\)/,
  );
  if (!match) {
    throw new Error(`Invalid RGB color: ${color}`);
  }
  return {
    r: parseInt(match[1]!, 10),
    g: parseInt(match[2]!, 10),
    b: parseInt(match[3]!, 10),
  };
}

/**
 * 将 RGB 对象转换为字符串（CSS Color Module Level 4 语法）
 */
export function rgbToString(rgb: RGB): string {
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b})`;
}

/**
 * RGB 转 HSL
 */
export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / delta + 2) / 6;
    } else {
      h = ((r - g) / delta + 4) / 6;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * HSL 转 RGB
 */
export function hslToRgb(hsl: HSL): RGB {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  let r: number;
  let g: number;
  let b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/**
 * 调整颜色亮度
 * @param color - RGB 颜色字符串
 * @param amount - 亮度调整量（-100 到 100）
 */
export function adjustLightness(color: string, amount: number): string {
  const rgb = parseRGB(color);
  const hsl = rgbToHsl(rgb);

  // 限制亮度在 0-100 范围内
  hsl.l = Math.max(0, Math.min(100, hsl.l + amount));

  const newRgb = hslToRgb(hsl);
  return rgbToString(newRgb);
}

/**
 * 调整颜色饱和度
 * @param color - RGB 颜色字符串
 * @param amount - 饱和度调整量（-100 到 100）
 */
export function adjustSaturation(color: string, amount: number): string {
  const rgb = parseRGB(color);
  const hsl = rgbToHsl(rgb);

  hsl.s = Math.max(0, Math.min(100, hsl.s + amount));

  const newRgb = hslToRgb(hsl);
  return rgbToString(newRgb);
}

/**
 * 生成颜色的悬停状态（变亮）
 */
export function generateHoverColor(color: string): string {
  return adjustLightness(color, 10);
}

/**
 * 生成颜色的激活状态（变暗）
 */
export function generateActiveColor(color: string): string {
  return adjustLightness(color, -10);
}

/**
 * 生成背景色（降低饱和度和提高亮度）
 */
export function generateBgColor(color: string, alpha = 0.1): string {
  const rgb = parseRGB(color);
  const hsl = rgbToHsl(rgb);

  // 大幅提高亮度，降低饱和度
  hsl.l = Math.min(95, hsl.l + 40);
  hsl.s = Math.max(10, hsl.s - 40);

  const newRgb = hslToRgb(hsl);
  return `rgb(${newRgb.r} ${newRgb.g} ${newRgb.b} / ${alpha})`;
}

/**
 * 生成边框色
 */
export function generateBorderColor(color: string): string {
  return adjustLightness(color, 20);
}

/**
 * 生成文本色（深色）
 */
export function generateTextColor(color: string): string {
  return adjustLightness(color, -40);
}

/**
 * 生成完整的颜色派生系列
 */
export interface ColorSeries {
  base: string;
  hover: string;
  active: string;
  bg: string;
  bgHover: string;
  border: string;
  borderHover: string;
  text: string;
  textHover: string;
  textActive: string;
}

export function generateColorSeries(baseColor: string): ColorSeries {
  return {
    base: baseColor,
    hover: generateHoverColor(baseColor),
    active: generateActiveColor(baseColor),
    bg: generateBgColor(baseColor, 1),
    bgHover: generateBgColor(baseColor, 0.7),
    border: generateBorderColor(baseColor),
    borderHover: adjustLightness(baseColor, 10),
    text: generateTextColor(baseColor),
    textHover: adjustLightness(generateTextColor(baseColor), 10),
    textActive: adjustLightness(generateTextColor(baseColor), -10),
  };
}

/**
 * 生成色盘（10个层级）
 * @param baseColor - 基础颜色（通常是第6级）
 */
export function generateColorPalette(baseColor: string): string[] {
  const rgb = parseRGB(baseColor);
  const hsl = rgbToHsl(rgb);

  const palette: string[] = [];

  // 生成10个层级的颜色
  for (let i = 1; i <= 10; i++) {
    const lightness = hsl.l + (6 - i) * 10;
    const saturation = i <= 6 ? hsl.s : hsl.s - (i - 6) * 5;

    const newHsl = {
      h: hsl.h,
      s: Math.max(0, Math.min(100, saturation)),
      l: Math.max(0, Math.min(100, lightness)),
    };

    const newRgb = hslToRgb(newHsl);
    palette.push(rgbToString(newRgb));
  }

  return palette;
}
