/**
 * 主题配置系统
 */

import {
  adjustLightness,
  generateColorSeries,
  hslToRgb,
  parseRGB,
  rgbToHsl,
  rgbToString,
} from './color-algorithm';
import type { ThemeConfig, ThemeTokens } from './theme-types';

/**
 * 默认的基础Token
 */
const defaultBaseTokens: Pick<
  ThemeTokens,
  keyof ThemeTokens & `token${string}`
> = {
  // Cyan 色盘
  tokenCyan1: 'rgb(230 255 251)',
  tokenCyan2: 'rgb(181 245 236)',
  tokenCyan3: 'rgb(135 232 222)',
  tokenCyan4: 'rgb(92 219 211)',
  tokenCyan5: 'rgb(54 207 201)',
  tokenCyan6: 'rgb(19 194 194)',
  tokenCyan7: 'rgb(8 151 156)',
  tokenCyan8: 'rgb(0 109 117)',
  tokenCyan9: 'rgb(0 71 79)',
  tokenCyan10: 'rgb(0 35 41)',

  // Blue 色盘
  tokenBlue1: 'rgb(230 244 255)',
  tokenBlue2: 'rgb(163 212 255)',
  tokenBlue3: 'rgb(122 189 255)',
  tokenBlue4: 'rgb(82 163 255)',
  tokenBlue5: 'rgb(41 134 255)',
  tokenBlue6: 'rgb(0 102 255)',
  tokenBlue7: 'rgb(0 79 217)',
  tokenBlue8: 'rgb(0 60 179)',
  tokenBlue9: 'rgb(0 42 140)',
  tokenBlue10: 'rgb(0 27 102)',

  // Green 色盘
  tokenGreen1: 'rgb(235 250 241)',
  tokenGreen2: 'rgb(187 237 208)',
  tokenGreen3: 'rgb(141 224 179)',
  tokenGreen4: 'rgb(99 212 154)',
  tokenGreen5: 'rgb(62 199 133)',
  tokenGreen6: 'rgb(27 185 114)',
  tokenGreen7: 'rgb(15 148 92)',
  tokenGreen8: 'rgb(5 110 70)',
  tokenGreen9: 'rgb(0 71 46)',
  tokenGreen10: 'rgb(0 33 23)',

  // Red 色盘
  tokenRed1: 'rgb(255 241 240)',
  tokenRed2: 'rgb(255 204 199)',
  tokenRed3: 'rgb(255 163 158)',
  tokenRed4: 'rgb(255 120 117)',
  tokenRed5: 'rgb(255 77 79)',
  tokenRed6: 'rgb(245 34 45)',
  tokenRed7: 'rgb(207 19 34)',
  tokenRed8: 'rgb(168 7 26)',
  tokenRed9: 'rgb(130 0 20)',
  tokenRed10: 'rgb(92 0 17)',

  // Orange 色盘
  tokenOrange1: 'rgb(255 247 230)',
  tokenOrange2: 'rgb(255 231 186)',
  tokenOrange3: 'rgb(255 213 145)',
  tokenOrange4: 'rgb(255 192 105)',
  tokenOrange5: 'rgb(255 169 64)',
  tokenOrange6: 'rgb(250 140 22)',
  tokenOrange7: 'rgb(212 107 8)',
  tokenOrange8: 'rgb(173 78 0)',
  tokenOrange9: 'rgb(135 56 0)',
  tokenOrange10: 'rgb(97 37 0)',

  // Gold 色盘
  tokenGold1: 'rgb(255 251 230)',
  tokenGold2: 'rgb(255 241 184)',
  tokenGold3: 'rgb(255 229 143)',
  tokenGold4: 'rgb(255 214 102)',
  tokenGold5: 'rgb(255 197 61)',
  tokenGold6: 'rgb(250 173 20)',
  tokenGold7: 'rgb(212 136 6)',
  tokenGold8: 'rgb(173 104 0)',
  tokenGold9: 'rgb(135 77 0)',
  tokenGold10: 'rgb(97 52 0)',

  // 间距
  tokenSpacing1: '4px',
  tokenSpacing2: '8px',
  tokenSpacing3: '12px',
  tokenSpacing4: '16px',
  tokenSpacing5: '20px',
  tokenSpacing6: '24px',
  tokenSpacing8: '32px',
  tokenSpacing12: '48px',

  // 字号
  tokenFontSize1: '12px',
  tokenFontSize2: '13px',
  tokenFontSize3: '14px',
  tokenFontSize4: '15px',
  tokenFontSize5: '16px',
  tokenFontSize6: '18px',
  tokenFontSize7: '20px',

  // 行高
  tokenLineHeight1: 1.2,
  tokenLineHeight2: 1.5,
  tokenLineHeight3: 1.8,

  // 圆角
  tokenBorderRadius1: '2px',
  tokenBorderRadius2: '4px',
  tokenBorderRadius3: '6px',
  tokenBorderRadius4: '8px',

  // 控制高度
  tokenControlHeight1: '16px',
  tokenControlHeight2: '24px',
  tokenControlHeight3: '32px',
  tokenControlHeight4: '40px',
};

/**
 * 生成默认的语义Token（亮色模式）
 */
function generateDefaultSemanticTokens(
  baseTokens: typeof defaultBaseTokens,
): Omit<ThemeTokens, keyof typeof defaultBaseTokens> {
  const primarySeries = generateColorSeries(baseTokens.tokenCyan6);
  const successSeries = generateColorSeries(baseTokens.tokenGreen6);
  const warningSeries = generateColorSeries(baseTokens.tokenGold6);
  const errorSeries = generateColorSeries(baseTokens.tokenRed6);

  return {
    // Primary
    colorPrimary: primarySeries.base,
    colorPrimaryHover: primarySeries.hover,
    colorPrimaryActive: primarySeries.active,
    colorPrimaryBg: primarySeries.bg,
    colorPrimaryBgHover: primarySeries.bgHover,
    colorPrimaryBorder: primarySeries.border,
    colorPrimaryBorderHover: primarySeries.borderHover,
    colorPrimaryText: primarySeries.text,
    colorPrimaryTextHover: primarySeries.textHover,
    colorPrimaryTextActive: primarySeries.textActive,

    // Success
    colorSuccess: successSeries.base,
    colorSuccessHover: successSeries.hover,
    colorSuccessActive: successSeries.active,
    colorSuccessBg: successSeries.bg,
    colorSuccessBgHover: successSeries.bgHover,
    colorSuccessBorder: successSeries.border,
    colorSuccessBorderHover: successSeries.borderHover,
    colorSuccessText: successSeries.text,
    colorSuccessTextHover: successSeries.textHover,
    colorSuccessTextActive: successSeries.textActive,

    // Warning
    colorWarning: warningSeries.base,
    colorWarningHover: warningSeries.hover,
    colorWarningActive: warningSeries.active,
    colorWarningBg: warningSeries.bg,
    colorWarningBgHover: warningSeries.bgHover,
    colorWarningBorder: warningSeries.border,
    colorWarningBorderHover: warningSeries.borderHover,
    colorWarningText: warningSeries.text,
    colorWarningTextHover: warningSeries.textHover,
    colorWarningTextActive: warningSeries.textActive,

    // Error
    colorError: errorSeries.base,
    colorErrorHover: errorSeries.hover,
    colorErrorActive: errorSeries.active,
    colorErrorBg: errorSeries.bg,
    colorErrorBgHover: errorSeries.bgHover,
    colorErrorBorder: errorSeries.border,
    colorErrorBorderHover: errorSeries.borderHover,
    colorErrorText: errorSeries.text,
    colorErrorTextHover: errorSeries.textHover,
    colorErrorTextActive: errorSeries.textActive,

    // Text
    colorText: 'rgb(0 0 0 / 0.88)',
    colorTextSecondary: 'rgb(0 0 0 / 0.65)',
    colorTextTertiary: 'rgb(0 0 0 / 0.45)',
    colorTextQuaternary: 'rgb(0 0 0 / 0.25)',
    colorTextDisabled: 'rgb(0 0 0 / 0.25)',
    colorTextPlaceholder: 'rgb(0 0 0 / 0.25)',
    colorTextHeading: 'rgb(0 0 0 / 0.88)',
    colorTextDescription: 'rgb(0 0 0 / 0.45)',
    colorTextBase: 'rgb(0 0 0)',
    colorTextLight: 'rgb(255 255 255)',

    // Background
    colorBgBase: 'rgb(255 255 255)',
    colorBgContainer: 'rgb(255 255 255)',
    colorBgContainerDisabled: 'rgb(0 0 0 / 0.04)',
    colorBgElevated: 'rgb(255 255 255)',
    colorBgLayout: 'rgb(245 245 245)',
    colorBgMask: 'rgb(0 0 0 / 0.45)',
    colorBgSpotlight: 'rgb(0 0 0 / 0.85)',
    colorBgTextHover: 'rgb(0 0 0 / 0.06)',
    colorBgTextActive: 'rgb(0 0 0 / 0.15)',

    // Fill
    colorFill: 'rgb(0 0 0 / 0.15)',
    colorFillSecondary: 'rgb(0 0 0 / 0.06)',
    colorFillTertiary: 'rgb(0 0 0 / 0.04)',
    colorFillQuaternary: 'rgb(0 0 0 / 0.02)',
    colorFillContent: 'rgb(0 0 0 / 0.06)',
    colorFillAlter: 'rgb(0 0 0 / 0.02)',

    // Border
    colorBorder: 'rgb(217 217 217)',
    colorBorderSecondary: 'rgb(238 238 238)',
    colorSplit: 'rgb(238 238 238)',

    // Control Item
    controlItemBgHover: 'rgb(0 0 0 / 0.04)',
    controlItemBgActive: 'rgb(230 244 255)',
    controlItemBgActiveHover: 'rgb(186 224 255)',

    // Link
    colorLink: baseTokens.tokenCyan6,
    colorLinkHover: baseTokens.tokenCyan4,
    colorLinkActive: baseTokens.tokenCyan7,

    // Icon
    colorIcon: 'rgb(0 0 0 / 0.45)',
    colorIconHover: 'rgb(0 0 0 / 0.88)',

    // Size
    sizeXXS: baseTokens.tokenSpacing1,
    sizeXS: baseTokens.tokenSpacing2,
    sizeSM: baseTokens.tokenSpacing3,
    size: baseTokens.tokenSpacing4,
    sizeMD: baseTokens.tokenSpacing5,
    sizeLG: baseTokens.tokenSpacing6,
    sizeXL: baseTokens.tokenSpacing8,
    sizeXXL: baseTokens.tokenSpacing12,

    // Padding
    paddingXXS: baseTokens.tokenSpacing1,
    paddingXS: baseTokens.tokenSpacing2,
    paddingSM: baseTokens.tokenSpacing3,
    padding: baseTokens.tokenSpacing4,
    paddingMD: baseTokens.tokenSpacing5,
    paddingLG: baseTokens.tokenSpacing6,
    paddingXL: baseTokens.tokenSpacing8,
    paddingXXL: baseTokens.tokenSpacing12,

    // Margin
    marginXXS: baseTokens.tokenSpacing1,
    marginXS: baseTokens.tokenSpacing2,
    marginSM: baseTokens.tokenSpacing3,
    margin: baseTokens.tokenSpacing4,
    marginMD: baseTokens.tokenSpacing5,
    marginLG: baseTokens.tokenSpacing6,
    marginXL: baseTokens.tokenSpacing8,
    marginXXL: baseTokens.tokenSpacing12,

    // Control Height
    controlHeightXS: baseTokens.tokenControlHeight1,
    controlHeightSM: baseTokens.tokenControlHeight2,
    controlHeight: baseTokens.tokenControlHeight3,
    controlHeightLG: baseTokens.tokenControlHeight4,

    // Border Radius
    borderRadiusXS: baseTokens.tokenBorderRadius1,
    borderRadiusSM: baseTokens.tokenBorderRadius2,
    borderRadius: baseTokens.tokenBorderRadius3,
    borderRadiusLG: baseTokens.tokenBorderRadius4,

    // Font Size
    fontSizeXS: baseTokens.tokenFontSize1,
    fontSizeSM: baseTokens.tokenFontSize2,
    fontSize: baseTokens.tokenFontSize3,
    fontSizeMD: baseTokens.tokenFontSize4,
    fontSizeLG: baseTokens.tokenFontSize5,
    fontSizeXL: baseTokens.tokenFontSize6,
    fontSizeXXL: baseTokens.tokenFontSize7,

    // Line Height
    lineHeightSM: baseTokens.tokenLineHeight1,
    lineHeight: baseTokens.tokenLineHeight2,
    lineHeightLG: baseTokens.tokenLineHeight3,
  };
}

/**
 * 定义主题配置
 */
export function defineTheme(config: ThemeConfig = {}): Required<ThemeConfig> {
  return {
    token: config.token || {},
    algorithm: config.algorithm || 'default',
    components: config.components || {},
    transition: config.transition || {
      duration: 200,
      easing: 'ease-in-out',
      enabled: true,
    },
  };
}

/**
 * 生成完整的主题Token
 */
export function generateThemeTokens(config: ThemeConfig): ThemeTokens {
  // 合并基础Token
  const baseTokens = {
    ...defaultBaseTokens,
    ...Object.fromEntries(
      Object.entries(config.token || {}).filter(([key]) =>
        key.startsWith('token'),
      ),
    ),
  } as typeof defaultBaseTokens;

  // 生成语义Token
  const semanticTokens = generateDefaultSemanticTokens(baseTokens);

  // 合并用户配置的语义Token
  const mergedSemanticTokens = {
    ...semanticTokens,
    ...Object.fromEntries(
      Object.entries(config.token || {}).filter(
        ([key]) => !key.startsWith('token'),
      ),
    ),
  };

  // 应用算法（暗色/紧凑模式）
  let finalTokens: ThemeTokens = {
    ...baseTokens,
    ...mergedSemanticTokens,
  } as ThemeTokens;

  if (config.algorithm === 'dark') {
    finalTokens = applyDarkAlgorithm(finalTokens);
  } else if (config.algorithm === 'compact') {
    finalTokens = applyCompactAlgorithm(finalTokens);
  }

  return finalTokens;
}

/**
 * 智能生成暗色模式的功能色系列
 * 根据主题色动态调整亮度，而非使用硬编码值
 */
function generateDarkColorSeries(baseColor: string) {
  try {
    const rgb = parseRGB(baseColor);
    const hsl = rgbToHsl(rgb);

    // 在暗色模式下，主色应该更亮一些以确保可读性
    const adjustedHsl = { ...hsl };

    // 如果主色较暗，提亮它
    if (hsl.l < 50) {
      adjustedHsl.l = Math.min(70, hsl.l + 20);
    } else if (hsl.l < 60) {
      adjustedHsl.l = Math.min(75, hsl.l + 15);
    } else {
      adjustedHsl.l = Math.min(80, hsl.l + 10);
    }

    // 微调饱和度，在暗色模式下保持鲜艳
    adjustedHsl.s = Math.min(100, hsl.s + 5);

    const adjustedBase = rgbToString(hslToRgb(adjustedHsl));

    // 生成派生颜色
    return {
      base: adjustedBase,
      hover: adjustLightness(adjustedBase, 8),
      active: adjustLightness(adjustedBase, -8),
      bg: (() => {
        // 背景色：保留色相，极低亮度，降低饱和度
        const bgHsl = { ...adjustedHsl };
        bgHsl.l = 15;
        bgHsl.s = Math.max(20, adjustedHsl.s - 30);
        return rgbToString(hslToRgb(bgHsl));
      })(),
      bgHover: (() => {
        const bgHsl = { ...adjustedHsl };
        bgHsl.l = 20;
        bgHsl.s = Math.max(25, adjustedHsl.s - 25);
        return rgbToString(hslToRgb(bgHsl));
      })(),
      border: (() => {
        const borderHsl = { ...adjustedHsl };
        borderHsl.l = 30;
        borderHsl.s = Math.max(30, adjustedHsl.s - 20);
        return rgbToString(hslToRgb(borderHsl));
      })(),
      borderHover: (() => {
        const borderHsl = { ...adjustedHsl };
        borderHsl.l = 40;
        borderHsl.s = Math.max(35, adjustedHsl.s - 15);
        return rgbToString(hslToRgb(borderHsl));
      })(),
      text: adjustedBase,
      textHover: adjustLightness(adjustedBase, 8),
      textActive: adjustLightness(adjustedBase, -8),
    };
  } catch {
    // 如果解析失败，返回默认颜色
    return generateColorSeries(baseColor);
  }
}

/**
 * 应用智能暗色算法
 * 根据主题色动态生成暗色方案，而非使用硬编码值
 */
function applyDarkAlgorithm(tokens: ThemeTokens): ThemeTokens {
  // 智能生成功能色系列
  const primarySeries = generateDarkColorSeries(tokens.colorPrimary);
  const successSeries = generateDarkColorSeries(tokens.tokenGreen6);
  const warningSeries = generateDarkColorSeries(tokens.tokenGold6);
  const errorSeries = generateDarkColorSeries(tokens.tokenRed6);

  return {
    ...tokens,

    // 品牌色 - 智能调整
    colorPrimary: primarySeries.base,
    colorPrimaryHover: primarySeries.hover,
    colorPrimaryActive: primarySeries.active,
    colorPrimaryBg: primarySeries.bg,
    colorPrimaryBgHover: primarySeries.bgHover,
    colorPrimaryBorder: primarySeries.border,
    colorPrimaryBorderHover: primarySeries.borderHover,
    colorPrimaryText: primarySeries.text,
    colorPrimaryTextHover: primarySeries.textHover,
    colorPrimaryTextActive: primarySeries.textActive,

    // 功能色 - Success
    colorSuccess: successSeries.base,
    colorSuccessHover: successSeries.hover,
    colorSuccessActive: successSeries.active,
    colorSuccessBg: successSeries.bg,
    colorSuccessBgHover: successSeries.bgHover,
    colorSuccessBorder: successSeries.border,
    colorSuccessBorderHover: successSeries.borderHover,
    colorSuccessText: successSeries.text,
    colorSuccessTextHover: successSeries.textHover,
    colorSuccessTextActive: successSeries.textActive,

    // 功能色 - Warning
    colorWarning: warningSeries.base,
    colorWarningHover: warningSeries.hover,
    colorWarningActive: warningSeries.active,
    colorWarningBg: warningSeries.bg,
    colorWarningBgHover: warningSeries.bgHover,
    colorWarningBorder: warningSeries.border,
    colorWarningBorderHover: warningSeries.borderHover,
    colorWarningText: warningSeries.text,
    colorWarningTextHover: warningSeries.textHover,
    colorWarningTextActive: warningSeries.textActive,

    // 功能色 - Error
    colorError: errorSeries.base,
    colorErrorHover: errorSeries.hover,
    colorErrorActive: errorSeries.active,
    colorErrorBg: errorSeries.bg,
    colorErrorBgHover: errorSeries.bgHover,
    colorErrorBorder: errorSeries.border,
    colorErrorBorderHover: errorSeries.borderHover,
    colorErrorText: errorSeries.text,
    colorErrorTextHover: errorSeries.textHover,
    colorErrorTextActive: errorSeries.textActive,

    // 文本色反转
    colorText: 'rgb(255 255 255 / 0.85)',
    colorTextSecondary: 'rgb(255 255 255 / 0.65)',
    colorTextTertiary: 'rgb(255 255 255 / 0.45)',
    colorTextQuaternary: 'rgb(255 255 255 / 0.25)',
    colorTextDisabled: 'rgb(255 255 255 / 0.25)',
    colorTextPlaceholder: 'rgb(255 255 255 / 0.25)',
    colorTextHeading: 'rgb(255 255 255 / 0.85)',
    colorTextDescription: 'rgb(255 255 255 / 0.45)',
    colorTextBase: 'rgb(255 255 255)',
    colorTextLight: 'rgb(0 0 0)',

    // 背景色反转
    colorBgBase: 'rgb(0 0 0)',
    colorBgContainer: 'rgb(20 20 20)',
    colorBgContainerDisabled: 'rgb(255 255 255 / 0.08)',
    colorBgElevated: 'rgb(30 30 30)',
    colorBgLayout: 'rgb(10 10 10)',
    colorBgMask: 'rgb(0 0 0 / 0.65)',
    colorBgSpotlight: 'rgb(255 255 255 / 0.85)',
    colorBgTextHover: 'rgb(255 255 255 / 0.08)',
    colorBgTextActive: 'rgb(255 255 255 / 0.15)',

    // 填充色反转
    colorFill: 'rgb(255 255 255 / 0.18)',
    colorFillSecondary: 'rgb(255 255 255 / 0.12)',
    colorFillTertiary: 'rgb(255 255 255 / 0.08)',
    colorFillQuaternary: 'rgb(255 255 255 / 0.04)',
    colorFillContent: 'rgb(255 255 255 / 0.12)',
    colorFillAlter: 'rgb(255 255 255 / 0.04)',

    // 边框色反转
    colorBorder: 'rgb(255 255 255 / 0.15)',
    colorBorderSecondary: 'rgb(255 255 255 / 0.06)',
    colorSplit: 'rgb(255 255 255 / 0.06)',

    // 控制项颜色 - 使用主题色
    controlItemBgHover: 'rgb(255 255 255 / 0.08)',
    controlItemBgActive: `${primarySeries.base} / 0.15`,
    controlItemBgActiveHover: `${primarySeries.base} / 0.25`,

    // 链接色 - 使用主题色
    colorLink: primarySeries.base,
    colorLinkHover: primarySeries.hover,
    colorLinkActive: primarySeries.active,

    // 图标色
    colorIcon: 'rgb(255 255 255 / 0.45)',
    colorIconHover: 'rgb(255 255 255 / 0.85)',
  };
}

/**
 * 应用紧凑算法（减小间距）
 */
function applyCompactAlgorithm(tokens: ThemeTokens): ThemeTokens {
  return {
    ...tokens,
    // 减小间距
    paddingXXS: '2px',
    paddingXS: '4px',
    paddingSM: '8px',
    padding: '12px',
    paddingMD: '16px',
    paddingLG: '20px',
    paddingXL: '24px',
    paddingXXL: '32px',

    // 减小控制高度
    controlHeightXS: '14px',
    controlHeightSM: '20px',
    controlHeight: '28px',
    controlHeightLG: '36px',
  };
}

/**
 * 将Token转换为CSS变量对象
 */
export function tokensToCSSVars(tokens: ThemeTokens): Record<string, string> {
  const cssVars: Record<string, string> = {};

  Object.entries(tokens).forEach(([key, value]) => {
    cssVars[`--${key}`] = typeof value === 'number' ? String(value) : value;
  });

  return cssVars;
}

/**
 * 默认主题
 */
export const defaultTheme = defineTheme({
  algorithm: 'default',
});
