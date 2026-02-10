/**
 * 颜色生成算法
 * 基于 Ant Design 的颜色算法，用于自动生成派生颜色
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RGBA extends RGB {
  a: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

/**
 * 解析 hex 颜色为 RGB 对象
 * 支持格式: #RGB, #RRGGBB, #RGBA, #RRGGBBAA
 * @example
 * parseHex('#fff') // { r: 255, g: 255, b: 255, a: 1 }
 * parseHex('#13c2c2') // { r: 19, g: 194, b: 194, a: 1 }
 * parseHex('#13c2c280') // { r: 19, g: 194, b: 194, a: 0.5 }
 */
export function parseHex(color: string): RGBA {
  const hex = color.replace('#', '');

  let r: number;
  let g: number;
  let b: number;
  let a = 1;

  if (hex.length === 3) {
    // #RGB -> #RRGGBB
    r = parseInt(hex[0]! + hex[0]!, 16);
    g = parseInt(hex[1]! + hex[1]!, 16);
    b = parseInt(hex[2]! + hex[2]!, 16);
  } else if (hex.length === 4) {
    // #RGBA -> #RRGGBBAA
    r = parseInt(hex[0]! + hex[0]!, 16);
    g = parseInt(hex[1]! + hex[1]!, 16);
    b = parseInt(hex[2]! + hex[2]!, 16);
    a = parseInt(hex[3]! + hex[3]!, 16) / 255;
  } else if (hex.length === 6) {
    // #RRGGBB
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (hex.length === 8) {
    // #RRGGBBAA
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
    a = parseInt(hex.slice(6, 8), 16) / 255;
  } else {
    throw new Error(`Invalid hex color: ${color}`);
  }

  // 验证解析结果
  if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) {
    throw new Error(`Invalid hex color: ${color}`);
  }

  return { r, g, b, a: Math.round(a * 100) / 100 };
}

/**
 * 检测颜色格式
 */
export type ColorFormat = 'hex' | 'rgb' | 'rgba' | 'hsl' | 'unknown';

export function detectColorFormat(color: string): ColorFormat {
  const trimmed = color.trim().toLowerCase();

  if (trimmed.startsWith('#')) {
    return 'hex';
  }
  if (trimmed.startsWith('rgba')) {
    return 'rgba';
  }
  if (trimmed.startsWith('rgb')) {
    // rgb() 可能包含 alpha: rgb(r g b / a)
    return trimmed.includes('/') ? 'rgba' : 'rgb';
  }
  if (trimmed.startsWith('hsl')) {
    return 'hsl';
  }
  return 'unknown';
}

/**
 * 解析颜色字符串为 RGB 对象（通用解析器）
 * 支持格式:
 * - hex: #RGB, #RRGGBB, #RGBA, #RRGGBBAA
 * - rgb: rgb(r g b), rgb(r, g, b)
 * - rgba: rgba(r, g, b, a), rgb(r g b / a)
 *
 * @example
 * parseColor('#13c2c2') // { r: 19, g: 194, b: 194 }
 * parseColor('rgb(19 194 194)') // { r: 19, g: 194, b: 194 }
 * parseColor('rgb(19, 194, 194)') // { r: 19, g: 194, b: 194 }
 * parseColor('#fff') // { r: 255, g: 255, b: 255 }
 */
export function parseColor(color: string): RGB {
  const trimmed = color.trim();
  const format = detectColorFormat(trimmed);

  switch (format) {
    case 'hex': {
      const { r, g, b } = parseHex(trimmed);
      return { r, g, b };
    }

    case 'rgb':
    case 'rgba': {
      // 匹配 rgb(r g b), rgb(r, g, b), rgba(r, g, b, a), rgb(r g b / a)
      const match = trimmed.match(
        /rgba?\s*\(\s*(\d+)\s*[,\s]+\s*(\d+)\s*[,\s]+\s*(\d+)/,
      );
      if (!match) {
        throw new Error(`Invalid RGB/RGBA color: ${color}`);
      }
      return {
        r: parseInt(match[1]!, 10),
        g: parseInt(match[2]!, 10),
        b: parseInt(match[3]!, 10),
      };
    }

    case 'hsl': {
      // 匹配 hsl(h, s%, l%) 或 hsl(h s% l%)
      const match = trimmed.match(
        /hsla?\s*\(\s*(\d+)\s*[,\s]+\s*(\d+)%?\s*[,\s]+\s*(\d+)%?/,
      );
      if (!match) {
        throw new Error(`Invalid HSL color: ${color}`);
      }
      const hsl: HSL = {
        h: parseInt(match[1]!, 10),
        s: parseInt(match[2]!, 10),
        l: parseInt(match[3]!, 10),
      };
      return hslToRgb(hsl);
    }

    default:
      throw new Error(`Unsupported color format: ${color}`);
  }
}

/**
 * 解析颜色字符串为 RGBA 对象（包含 alpha 通道）
 * @example
 * parseColorWithAlpha('#13c2c280') // { r: 19, g: 194, b: 194, a: 0.5 }
 * parseColorWithAlpha('rgb(19 194 194 / 0.5)') // { r: 19, g: 194, b: 194, a: 0.5 }
 */
export function parseColorWithAlpha(color: string): RGBA {
  const trimmed = color.trim();
  const format = detectColorFormat(trimmed);

  switch (format) {
    case 'hex': {
      return parseHex(trimmed);
    }

    case 'rgba': {
      // 匹配 rgba(r, g, b, a) 或 rgb(r g b / a)
      const slashMatch = trimmed.match(
        /rgba?\s*\(\s*(\d+)\s*[,\s]+\s*(\d+)\s*[,\s]+\s*(\d+)\s*\/\s*([\d.]+)\s*\)/,
      );
      if (slashMatch) {
        return {
          r: parseInt(slashMatch[1]!, 10),
          g: parseInt(slashMatch[2]!, 10),
          b: parseInt(slashMatch[3]!, 10),
          a: parseFloat(slashMatch[4]!),
        };
      }

      const commaMatch = trimmed.match(
        /rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/,
      );
      if (commaMatch) {
        return {
          r: parseInt(commaMatch[1]!, 10),
          g: parseInt(commaMatch[2]!, 10),
          b: parseInt(commaMatch[3]!, 10),
          a: parseFloat(commaMatch[4]!),
        };
      }

      throw new Error(`Invalid RGBA color: ${color}`);
    }

    case 'rgb':
    case 'hsl': {
      // rgb 和 hsl 不带 alpha 时，默认 a = 1
      const { r, g, b } = parseColor(trimmed);
      return { r, g, b, a: 1 };
    }

    default:
      throw new Error(`Unsupported color format: ${color}`);
  }
}

/**
 * 解析 RGB 字符串为对象（向后兼容，现在支持多种格式）
 * @example
 * parseRGB('rgb(0 180 180)') // { r: 0, g: 180, b: 180 }
 * parseRGB('rgb(0, 180, 180)') // { r: 0, g: 180, b: 180 }
 * parseRGB('#13c2c2') // { r: 19, g: 194, b: 194 }
 * parseRGB('#fff') // { r: 255, g: 255, b: 255 }
 */
export function parseRGB(color: string): RGB {
  return parseColor(color);
}

/**
 * 将 RGB 对象转换为字符串（CSS Color Module Level 4 语法）
 */
export function rgbToString(rgb: RGB): string {
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b})`;
}

/**
 * 将 RGBA 对象转换为字符串（CSS Color Module Level 4 语法）
 */
export function rgbaToString(rgba: RGBA): string {
  if (rgba.a === 1) {
    return `rgb(${rgba.r} ${rgba.g} ${rgba.b})`;
  }
  return `rgb(${rgba.r} ${rgba.g} ${rgba.b} / ${rgba.a})`;
}

/**
 * 将数值转换为两位 hex 字符串
 */
function toHex(n: number): string {
  const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
  return hex.length === 1 ? '0' + hex : hex;
}

/**
 * 将 RGB 对象转换为 hex 字符串
 * @example
 * rgbToHex({ r: 19, g: 194, b: 194 }) // '#13c2c2'
 */
export function rgbToHex(rgb: RGB): string {
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * 将 RGBA 对象转换为 hex 字符串（包含 alpha）
 * @example
 * rgbaToHex({ r: 19, g: 194, b: 194, a: 0.5 }) // '#13c2c280'
 */
export function rgbaToHex(rgba: RGBA): string {
  const alphaHex = toHex(rgba.a * 255);
  return `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}${alphaHex}`;
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
 * @param color - RGB 颜色字符串
 * @param useAlpha - 是否使用 alpha 通道（默认 false，返回纯色）
 * @param alpha - alpha 值（0-1，仅当 useAlpha 为 true 时生效）
 */
export function generateBgColor(
  color: string,
  useAlpha = false,
  alpha = 0.1,
): string {
  const rgb = parseRGB(color);
  const hsl = rgbToHsl(rgb);

  // 大幅提高亮度，降低饱和度
  hsl.l = Math.min(95, hsl.l + 40);
  hsl.s = Math.max(10, hsl.s - 40);

  const newRgb = hslToRgb(hsl);

  if (useAlpha) {
    return `rgb(${newRgb.r} ${newRgb.g} ${newRgb.b} / ${alpha})`;
  }
  return rgbToString(newRgb);
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
  const rgb = parseRGB(baseColor);
  const hsl = rgbToHsl(rgb);

  // 统一转换为 rgb 格式，确保输出一致
  const normalizedBase = rgbToString(rgb);

  // 生成背景色：保留色相，高亮度，低饱和度
  const bgHsl = {
    ...hsl,
    l: Math.min(95, hsl.l + 40),
    s: Math.max(10, hsl.s - 40),
  };
  const bgHoverHsl = {
    ...hsl,
    l: Math.min(90, hsl.l + 35),
    s: Math.max(15, hsl.s - 35),
  };

  return {
    base: normalizedBase,
    hover: generateHoverColor(normalizedBase),
    active: generateActiveColor(normalizedBase),
    bg: rgbToString(hslToRgb(bgHsl)),
    bgHover: rgbToString(hslToRgb(bgHoverHsl)),
    border: generateBorderColor(normalizedBase),
    borderHover: adjustLightness(normalizedBase, 10),
    text: normalizedBase, // 文本色使用主色本身，而非过暗的派生色
    textHover: generateHoverColor(normalizedBase),
    textActive: generateActiveColor(normalizedBase),
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
