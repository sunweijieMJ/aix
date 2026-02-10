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
import type {
  PartialThemeTokens,
  ThemeConfig,
  ThemeTokens,
} from '../theme-types';

/**
 * 默认的基础Token
 */
export const defaultBaseTokens: Pick<
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

  // Purple 色盘 (P1)
  tokenPurple1: 'rgb(249 240 255)',
  tokenPurple2: 'rgb(239 219 255)',
  tokenPurple3: 'rgb(211 173 247)',
  tokenPurple4: 'rgb(183 133 242)',
  tokenPurple5: 'rgb(146 84 222)',
  tokenPurple6: 'rgb(114 46 209)',
  tokenPurple7: 'rgb(83 29 171)',
  tokenPurple8: 'rgb(57 16 133)',
  tokenPurple9: 'rgb(34 7 94)',
  tokenPurple10: 'rgb(18 3 56)',

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

  // Gray/Neutral 色盘 (P0) - 13级灰阶
  tokenGray1: 'rgb(255 255 255)',
  tokenGray2: 'rgb(250 250 250)',
  tokenGray3: 'rgb(245 245 245)',
  tokenGray4: 'rgb(240 240 240)',
  tokenGray5: 'rgb(217 217 217)',
  tokenGray6: 'rgb(191 191 191)',
  tokenGray7: 'rgb(140 140 140)',
  tokenGray8: 'rgb(89 89 89)',
  tokenGray9: 'rgb(67 67 67)',
  tokenGray10: 'rgb(48 48 48)',
  tokenGray11: 'rgb(36 36 36)',
  tokenGray12: 'rgb(20 20 20)',
  tokenGray13: 'rgb(0 0 0)',

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

  // 字体族 (P1)
  tokenFontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  tokenFontFamilyCode:
    "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace",

  // 阴影 (P0) - 亮色模式
  tokenShadow1:
    '0 1px 2px 0 rgb(0 0 0 / 0.03), 0 1px 6px -1px rgb(0 0 0 / 0.02), 0 2px 4px 0 rgb(0 0 0 / 0.02)',
  tokenShadow2:
    '0 3px 6px -4px rgb(0 0 0 / 0.12), 0 6px 16px 0 rgb(0 0 0 / 0.08), 0 9px 28px 8px rgb(0 0 0 / 0.05)',
  tokenShadow3:
    '0 6px 16px -8px rgb(0 0 0 / 0.08), 0 9px 28px 0 rgb(0 0 0 / 0.05), 0 12px 48px 16px rgb(0 0 0 / 0.03)',
  tokenShadow4:
    '0 12px 24px -12px rgb(0 0 0 / 0.15), 0 24px 48px 0 rgb(0 0 0 / 0.1), 0 36px 72px 24px rgb(0 0 0 / 0.05)',

  // z-index 层级 (P0)
  tokenZIndexBase: 0,
  tokenZIndexPopup: 1000,
  tokenZIndexAffix: 1100,
  tokenZIndexModal: 1200,
  tokenZIndexPopover: 1300,
  tokenZIndexTooltip: 1400,
  tokenZIndexNotification: 1500,
};

/**
 * 生成默认的语义Token（亮色模式）
 */
export function generateDefaultSemanticTokens(
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

    // Control Item - 使用主题色的派生色
    controlItemBgHover: 'rgb(0 0 0 / 0.04)',
    controlItemBgActive: primarySeries.bg,
    controlItemBgActiveHover: primarySeries.bgHover,

    // Link - 使用主题色
    colorLink: primarySeries.base,
    colorLinkHover: primarySeries.hover,
    colorLinkActive: primarySeries.active,

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

    // 字体族 (P1)
    fontFamily: baseTokens.tokenFontFamily,
    fontFamilyCode: baseTokens.tokenFontFamilyCode,

    // 阴影 (P0)
    shadowXS: baseTokens.tokenShadow1,
    shadowSM: baseTokens.tokenShadow1,
    shadow: baseTokens.tokenShadow2,
    shadowMD: baseTokens.tokenShadow2,
    shadowLG: baseTokens.tokenShadow3,
    shadowXL: baseTokens.tokenShadow4,

    // z-index 层级 (P0)
    zIndexBase: baseTokens.tokenZIndexBase,
    zIndexPopupBase: baseTokens.tokenZIndexPopup,
    zIndexAffix: baseTokens.tokenZIndexAffix,
    zIndexModal: baseTokens.tokenZIndexModal,
    zIndexModalMask: baseTokens.tokenZIndexModal - 1,
    zIndexPopover: baseTokens.tokenZIndexPopover,
    zIndexDropdown: baseTokens.tokenZIndexPopup + 50,
    zIndexTooltip: baseTokens.tokenZIndexTooltip,
    zIndexNotification: baseTokens.tokenZIndexNotification,
    zIndexMessage: baseTokens.tokenZIndexNotification + 10,

    // 中性色 (P0) - 亮色模式，从灰阶映射
    colorNeutral1: baseTokens.tokenGray1,
    colorNeutral2: baseTokens.tokenGray2,
    colorNeutral3: baseTokens.tokenGray3,
    colorNeutral4: baseTokens.tokenGray4,
    colorNeutral5: baseTokens.tokenGray5,
    colorNeutral6: baseTokens.tokenGray6,
    colorNeutral7: baseTokens.tokenGray7,
    colorNeutral8: baseTokens.tokenGray8,
    colorNeutral9: baseTokens.tokenGray9,
    colorNeutral10: baseTokens.tokenGray10,
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
 * 类型安全的 Token 提取函数
 */
type BaseTokenKeys = keyof typeof defaultBaseTokens;

function extractBaseTokenOverrides(
  token: PartialThemeTokens | undefined,
): Partial<typeof defaultBaseTokens> {
  if (!token) return {};
  const result: Partial<typeof defaultBaseTokens> = {};
  for (const [key, value] of Object.entries(token)) {
    if (key.startsWith('token') && value !== undefined) {
      (result as Record<string, unknown>)[key as BaseTokenKeys] = value;
    }
  }
  return result;
}

function extractSemanticTokenOverrides(
  token: PartialThemeTokens | undefined,
): Partial<Omit<ThemeTokens, BaseTokenKeys>> {
  if (!token) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(token)) {
    if (!key.startsWith('token') && value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<Omit<ThemeTokens, BaseTokenKeys>>;
}

/**
 * 生成完整的主题Token
 */
export function generateThemeTokens(config: ThemeConfig): ThemeTokens {
  // 合并基础 Token（类型安全）
  const baseTokenOverrides = extractBaseTokenOverrides(config.token);
  const baseTokens: typeof defaultBaseTokens = {
    ...defaultBaseTokens,
    ...baseTokenOverrides,
  };

  // 生成语义 Token
  const semanticTokens = generateDefaultSemanticTokens(baseTokens);

  // 合并用户配置的语义 Token（类型安全）
  const semanticOverrides = extractSemanticTokenOverrides(config.token);
  const mergedSemanticTokens = {
    ...semanticTokens,
    ...semanticOverrides,
  };

  // 应用算法（暗色/紧凑模式，支持组合）
  let finalTokens: ThemeTokens = {
    ...baseTokens,
    ...mergedSemanticTokens,
  };

  const algorithm = config.algorithm || 'default';

  // 判断是否需要应用暗色算法
  const isDark = algorithm === 'dark' || algorithm === 'dark-compact';
  // 判断是否需要应用紧凑算法
  const isCompact = algorithm === 'compact' || algorithm === 'dark-compact';

  // 先应用暗色算法（颜色相关）
  if (isDark) {
    finalTokens = applyDarkAlgorithm(finalTokens);
  }

  // 再应用紧凑算法（尺寸相关）
  if (isCompact) {
    finalTokens = applyCompactAlgorithm(finalTokens);
  }

  return finalTokens;
}

/**
 * 暗色模式颜色调整常量
 */
const DARK_MODE_ADJUSTMENTS = {
  // 主色亮度调整阈值和参数
  lightness: {
    low: { threshold: 50, boost: 20, max: 70 },
    medium: { threshold: 60, boost: 15, max: 75 },
    high: { boost: 10, max: 80 },
  },
  // 饱和度微调
  saturationBoost: 5,
  // 交互状态亮度调整
  hoverLightnessShift: 8,
  activeLightnessShift: -8,
  // 背景色参数
  bg: { lightness: 15, minSaturation: 20, saturationDrop: 30 },
  bgHover: { lightness: 20, minSaturation: 25, saturationDrop: 25 },
  // 边框色参数
  border: { lightness: 30, minSaturation: 30, saturationDrop: 20 },
  borderHover: { lightness: 40, minSaturation: 35, saturationDrop: 15 },
} as const;

/**
 * 智能生成暗色模式的功能色系列
 * 根据主题色动态调整亮度，而非使用硬编码值
 */
function generateDarkColorSeries(baseColor: string) {
  const {
    lightness: lt,
    bg,
    bgHover,
    border,
    borderHover,
  } = DARK_MODE_ADJUSTMENTS;

  try {
    const rgb = parseRGB(baseColor);
    const hsl = rgbToHsl(rgb);

    // 在暗色模式下，主色应该更亮一些以确保可读性
    const adjustedHsl = { ...hsl };

    // 如果主色较暗，提亮它
    if (hsl.l < lt.low.threshold) {
      adjustedHsl.l = Math.min(lt.low.max, hsl.l + lt.low.boost);
    } else if (hsl.l < lt.medium.threshold) {
      adjustedHsl.l = Math.min(lt.medium.max, hsl.l + lt.medium.boost);
    } else {
      adjustedHsl.l = Math.min(lt.high.max, hsl.l + lt.high.boost);
    }

    // 微调饱和度，在暗色模式下保持鲜艳
    adjustedHsl.s = Math.min(
      100,
      hsl.s + DARK_MODE_ADJUSTMENTS.saturationBoost,
    );

    const adjustedBase = rgbToString(hslToRgb(adjustedHsl));
    const { hoverLightnessShift, activeLightnessShift } = DARK_MODE_ADJUSTMENTS;

    // 生成派生颜色
    return {
      base: adjustedBase,
      hover: adjustLightness(adjustedBase, hoverLightnessShift),
      active: adjustLightness(adjustedBase, activeLightnessShift),
      bg: (() => {
        // 背景色：保留色相，极低亮度，降低饱和度
        const bgHsl = { ...adjustedHsl };
        bgHsl.l = bg.lightness;
        bgHsl.s = Math.max(bg.minSaturation, adjustedHsl.s - bg.saturationDrop);
        return rgbToString(hslToRgb(bgHsl));
      })(),
      bgHover: (() => {
        const hoverHsl = { ...adjustedHsl };
        hoverHsl.l = bgHover.lightness;
        hoverHsl.s = Math.max(
          bgHover.minSaturation,
          adjustedHsl.s - bgHover.saturationDrop,
        );
        return rgbToString(hslToRgb(hoverHsl));
      })(),
      border: (() => {
        const borderHsl = { ...adjustedHsl };
        borderHsl.l = border.lightness;
        borderHsl.s = Math.max(
          border.minSaturation,
          adjustedHsl.s - border.saturationDrop,
        );
        return rgbToString(hslToRgb(borderHsl));
      })(),
      borderHover: (() => {
        const hoverHsl = { ...adjustedHsl };
        hoverHsl.l = borderHover.lightness;
        hoverHsl.s = Math.max(
          borderHover.minSaturation,
          adjustedHsl.s - borderHover.saturationDrop,
        );
        return rgbToString(hslToRgb(hoverHsl));
      })(),
      text: adjustedBase,
      textHover: adjustLightness(adjustedBase, hoverLightnessShift),
      textActive: adjustLightness(adjustedBase, activeLightnessShift),
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
export function applyDarkAlgorithm(tokens: ThemeTokens): ThemeTokens {
  // 智能生成功能色系列
  // 注意：使用语义色而非 base token，这样用户自定义的颜色才会被正确应用
  const primarySeries = generateDarkColorSeries(tokens.colorPrimary);
  const successSeries = generateDarkColorSeries(tokens.colorSuccess);
  const warningSeries = generateDarkColorSeries(tokens.colorWarning);
  const errorSeries = generateDarkColorSeries(tokens.colorError);

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
    controlItemBgActive: primarySeries.bg,
    controlItemBgActiveHover: primarySeries.bgHover,

    // 链接色 - 使用主题色
    colorLink: primarySeries.base,
    colorLinkHover: primarySeries.hover,
    colorLinkActive: primarySeries.active,

    // 图标色
    colorIcon: 'rgb(255 255 255 / 0.45)',
    colorIconHover: 'rgb(255 255 255 / 0.85)',

    // 阴影 - 暗色模式 (P0)
    shadowXS:
      '0 1px 2px 0 rgb(0 0 0 / 0.1), 0 1px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px 0 rgb(0 0 0 / 0.08)',
    shadowSM:
      '0 1px 2px 0 rgb(0 0 0 / 0.1), 0 1px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px 0 rgb(0 0 0 / 0.08)',
    shadow:
      '0 3px 6px -4px rgb(0 0 0 / 0.24), 0 6px 16px 0 rgb(0 0 0 / 0.16), 0 9px 28px 8px rgb(0 0 0 / 0.1)',
    shadowMD:
      '0 3px 6px -4px rgb(0 0 0 / 0.24), 0 6px 16px 0 rgb(0 0 0 / 0.16), 0 9px 28px 8px rgb(0 0 0 / 0.1)',
    shadowLG:
      '0 6px 16px -8px rgb(0 0 0 / 0.16), 0 9px 28px 0 rgb(0 0 0 / 0.1), 0 12px 48px 16px rgb(0 0 0 / 0.08)',
    shadowXL:
      '0 12px 24px -12px rgb(0 0 0 / 0.3), 0 24px 48px 0 rgb(0 0 0 / 0.2), 0 36px 72px 24px rgb(0 0 0 / 0.1)',

    // 中性色 - 暗色模式反转 (P0)
    colorNeutral1: tokens.tokenGray13,
    colorNeutral2: tokens.tokenGray12,
    colorNeutral3: tokens.tokenGray11,
    colorNeutral4: tokens.tokenGray10,
    colorNeutral5: tokens.tokenGray9,
    colorNeutral6: tokens.tokenGray8,
    colorNeutral7: tokens.tokenGray7,
    colorNeutral8: tokens.tokenGray6,
    colorNeutral9: tokens.tokenGray5,
    colorNeutral10: tokens.tokenGray4,
  };
}

/**
 * 应用紧凑算法（减小间距、控制高度和字号）
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

    // 减小 margin
    marginXXS: '2px',
    marginXS: '4px',
    marginSM: '8px',
    margin: '12px',
    marginMD: '16px',
    marginLG: '20px',
    marginXL: '24px',
    marginXXL: '32px',

    // 减小 size
    sizeXXS: '2px',
    sizeXS: '4px',
    sizeSM: '8px',
    size: '12px',
    sizeMD: '16px',
    sizeLG: '20px',
    sizeXL: '24px',
    sizeXXL: '32px',

    // 减小控制高度
    controlHeightXS: '14px',
    controlHeightSM: '20px',
    controlHeight: '28px',
    controlHeightLG: '36px',

    // 减小字号
    fontSizeXS: '11px',
    fontSizeSM: '12px',
    fontSize: '13px',
    fontSizeMD: '14px',
    fontSizeLG: '15px',
    fontSizeXL: '16px',
    fontSizeXXL: '18px',

    // 减小圆角
    borderRadiusXS: '1px',
    borderRadiusSM: '2px',
    borderRadius: '4px',
    borderRadiusLG: '6px',
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
