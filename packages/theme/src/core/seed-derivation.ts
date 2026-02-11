/**
 * 种子Token派生逻辑
 * Seed → Map (BaseTokens) + Map → Alias (SemanticTokens)
 */

import {
  adjustLightness,
  generateColorSeriesFromPalette,
  generatePalette,
  parseColor,
  rgbToString,
} from './color-algorithm';
import type {
  BaseTokens,
  SemanticTokens,
  SeedTokens,
  ThemeTokens,
} from '../theme-types';

/**
 * 四舍五入到偶数（用于字号派生，确保像素对齐）
 */
function roundToEven(n: number): number {
  return Math.round(n / 2) * 2;
}

/**
 * 圆角断点映射
 */
function deriveBorderRadius(base: number) {
  if (base <= 2) return { xs: 1, sm: 2, md: base, lg: Math.max(base, 4) };
  if (base <= 4) return { xs: 1, sm: 2, md: base, lg: base + 2 };
  if (base <= 6) return { xs: 2, sm: 4, md: base, lg: base + 2 };
  if (base <= 8) return { xs: 2, sm: 4, md: base, lg: base + 4 };
  if (base < 16) return { xs: 4, sm: 6, md: base, lg: Math.min(base + 4, 16) };
  return { xs: 6, sm: 8, md: base, lg: 16 };
}

/**
 * 默认预设色板（7 个标准色）
 */
export const DEFAULT_PRESET_COLORS: Record<string, string> = {
  Cyan: 'rgb(19 194 194)',
  Blue: 'rgb(22 119 255)',
  Purple: 'rgb(114 46 209)',
  Green: 'rgb(82 196 26)',
  Red: 'rgb(245 34 45)',
  Orange: 'rgb(250 140 22)',
  Gold: 'rgb(250 173 20)',
};

/**
 * 默认种子值
 */
export const defaultSeedTokens: SeedTokens = {
  // 色彩种子
  colorPrimary: 'rgb(19 194 194)',
  colorSuccess: 'rgb(82 196 26)',
  colorWarning: 'rgb(250 173 20)',
  colorError: 'rgb(245 34 45)',
  colorInfo: 'rgb(19 194 194)',

  // 中性色种子
  colorTextBase: 'rgb(0 0 0)',
  colorBgBase: 'rgb(255 255 255)',

  // 尺寸种子
  sizeUnit: 4,
  sizeStep: 4,

  // 圆角种子
  borderRadius: 6,

  // 字体种子
  fontSize: 14,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  fontFamilyCode:
    "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
  lineHeight: 1.5,

  // 控件种子
  controlHeight: 32,

  // 边框种子
  lineWidth: 1,
  lineType: 'solid',

  // 字重种子
  fontWeightStrong: 600,

  // 动效种子
  motion: true,
  motionUnit: 0.1,
  motionBase: 0,

  // 线框模式
  wireframe: false,

  // 预设色板
  presetColors: DEFAULT_PRESET_COLORS,

  // 层级种子
  zIndexBase: 0,
  zIndexPopupBase: 1000,
};

/**
 * Seed → Map (BaseTokens) 派生
 */
export function deriveMapTokens(seed: SeedTokens): BaseTokens {
  return {
    // 命名色板：硬编码（Ant Design 官方值），不随 seed 变化
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
    tokenBlue2: 'rgb(186 224 255)',
    tokenBlue3: 'rgb(145 202 255)',
    tokenBlue4: 'rgb(105 177 255)',
    tokenBlue5: 'rgb(64 150 255)',
    tokenBlue6: 'rgb(22 119 255)',
    tokenBlue7: 'rgb(9 88 217)',
    tokenBlue8: 'rgb(0 62 179)',
    tokenBlue9: 'rgb(0 44 140)',
    tokenBlue10: 'rgb(0 29 102)',

    // Purple 色盘
    tokenPurple1: 'rgb(249 240 255)',
    tokenPurple2: 'rgb(239 219 255)',
    tokenPurple3: 'rgb(211 173 247)',
    tokenPurple4: 'rgb(179 127 235)',
    tokenPurple5: 'rgb(146 84 222)',
    tokenPurple6: 'rgb(114 46 209)',
    tokenPurple7: 'rgb(83 29 171)',
    tokenPurple8: 'rgb(57 16 133)',
    tokenPurple9: 'rgb(34 7 94)',
    tokenPurple10: 'rgb(18 3 56)',

    // Green 色盘
    tokenGreen1: 'rgb(246 255 237)',
    tokenGreen2: 'rgb(217 247 190)',
    tokenGreen3: 'rgb(183 235 143)',
    tokenGreen4: 'rgb(149 222 100)',
    tokenGreen5: 'rgb(115 209 61)',
    tokenGreen6: 'rgb(82 196 26)',
    tokenGreen7: 'rgb(56 158 13)',
    tokenGreen8: 'rgb(35 120 4)',
    tokenGreen9: 'rgb(19 82 0)',
    tokenGreen10: 'rgb(9 43 0)',

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

    // Gray/Neutral 色盘 - 13级灰阶
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

    // 间距：从 sizeUnit 派生
    tokenSpacing1: `${seed.sizeUnit * 1}px`,
    tokenSpacing2: `${seed.sizeUnit * 2}px`,
    tokenSpacing3: `${seed.sizeUnit * 3}px`,
    tokenSpacing4: `${seed.sizeUnit * 4}px`,
    tokenSpacing5: `${seed.sizeUnit * 5}px`,
    tokenSpacing6: `${seed.sizeUnit * 6}px`,
    tokenSpacing8: `${seed.sizeUnit * 8}px`,
    tokenSpacing12: `${seed.sizeUnit * 12}px`,

    // 字号：指数缩放 base * e^(i/5)，i 以 tokenFontSize3 为基准 (i=0)
    tokenFontSize1: `${roundToEven(seed.fontSize * Math.E ** (-2 / 5))}px`,
    tokenFontSize2: `${roundToEven(seed.fontSize * Math.E ** (-1 / 5))}px`,
    tokenFontSize3: `${seed.fontSize}px`,
    tokenFontSize4: `${roundToEven(seed.fontSize * Math.E ** (1 / 5))}px`,
    tokenFontSize5: `${roundToEven(seed.fontSize * Math.E ** (2 / 5))}px`,
    tokenFontSize6: `${roundToEven(seed.fontSize * Math.E ** (3 / 5))}px`,
    tokenFontSize7: `${roundToEven(seed.fontSize * Math.E ** (4 / 5))}px`,

    // 行高：(fontSize + 8) / fontSize — 大字更紧凑
    tokenLineHeight1: (() => {
      const fs = roundToEven(seed.fontSize * Math.E ** (-1 / 5));
      return Math.round(((fs + 8) / fs) * 100) / 100;
    })(),
    tokenLineHeight2:
      Math.round(((seed.fontSize + 8) / seed.fontSize) * 100) / 100,
    tokenLineHeight3: (() => {
      const fs = roundToEven(seed.fontSize * Math.E ** (3 / 5));
      return Math.round(((fs + 8) / fs) * 100) / 100;
    })(),

    // 圆角：断点映射
    ...(() => {
      const r = deriveBorderRadius(seed.borderRadius);
      return {
        tokenBorderRadius1: `${r.xs}px`,
        tokenBorderRadius2: `${r.sm}px`,
        tokenBorderRadius3: `${r.md}px`,
        tokenBorderRadius4: `${r.lg}px`,
      };
    })(),

    // 控制高度：从 controlHeight 派生
    tokenControlHeight1: `${Math.max(0, seed.controlHeight - 16)}px`,
    tokenControlHeight2: `${Math.max(0, seed.controlHeight - 8)}px`,
    tokenControlHeight3: `${seed.controlHeight}px`,
    tokenControlHeight4: `${seed.controlHeight + 8}px`,

    // 字体族：直接透传
    tokenFontFamily: seed.fontFamily,
    tokenFontFamilyCode: seed.fontFamilyCode,

    // 边框：从 lineWidth/lineType 透传
    tokenLineWidth: `${seed.lineWidth}px`,
    tokenLineType: seed.lineType,

    // 阴影：硬编码（不随 seed 变化）
    tokenShadow1:
      '0 1px 2px 0 rgb(0 0 0 / 0.03), 0 1px 6px -1px rgb(0 0 0 / 0.02), 0 2px 4px 0 rgb(0 0 0 / 0.02)',
    tokenShadow2:
      '0 3px 6px -4px rgb(0 0 0 / 0.12), 0 6px 16px 0 rgb(0 0 0 / 0.08), 0 9px 28px 8px rgb(0 0 0 / 0.05)',
    tokenShadow3:
      '0 6px 16px -8px rgb(0 0 0 / 0.08), 0 9px 28px 0 rgb(0 0 0 / 0.05), 0 12px 48px 16px rgb(0 0 0 / 0.03)',
    tokenShadow4:
      '0 12px 24px -12px rgb(0 0 0 / 0.15), 0 24px 48px 0 rgb(0 0 0 / 0.1), 0 36px 72px 24px rgb(0 0 0 / 0.05)',

    // z-index 层级：从 zIndexBase/zIndexPopupBase 派生
    tokenZIndexBase: seed.zIndexBase,
    tokenZIndexPopup: seed.zIndexPopupBase,
    tokenZIndexAffix: seed.zIndexPopupBase + 100,
    tokenZIndexModal: seed.zIndexPopupBase + 200,
    tokenZIndexPopover: seed.zIndexPopupBase + 300,
    tokenZIndexTooltip: seed.zIndexPopupBase + 400,
    tokenZIndexNotification: seed.zIndexPopupBase + 500,
  };
}

/**
 * Map + Seed → Alias (SemanticTokens) 派生
 */
export function deriveAliasTokens(
  map: BaseTokens,
  seed: SeedTokens,
): SemanticTokens {
  // 使用 10 色阶色板生成色彩系列（HSV 步进法）
  const primarySeries = generateColorSeriesFromPalette(seed.colorPrimary);
  const successSeries = generateColorSeriesFromPalette(seed.colorSuccess);
  const warningSeries = generateColorSeriesFromPalette(seed.colorWarning);
  const errorSeries = generateColorSeriesFromPalette(seed.colorError);
  const infoSeries = generateColorSeriesFromPalette(seed.colorInfo);

  // 从 seed 解析中性色基准
  const tb = parseColor(seed.colorTextBase);
  const textRGB = `${tb.r} ${tb.g} ${tb.b}`;
  const bgBase = rgbToString(parseColor(seed.colorBgBase));

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

    // Info
    colorInfo: infoSeries.base,
    colorInfoHover: infoSeries.hover,
    colorInfoActive: infoSeries.active,
    colorInfoBg: infoSeries.bg,
    colorInfoBgHover: infoSeries.bgHover,
    colorInfoBorder: infoSeries.border,
    colorInfoBorderHover: infoSeries.borderHover,
    colorInfoText: infoSeries.text,
    colorInfoTextHover: infoSeries.textHover,
    colorInfoTextActive: infoSeries.textActive,

    // Text — 从 seed.colorTextBase 动态派生（alpha 透明度方案）
    colorText: `rgb(${textRGB} / 0.88)`,
    colorTextSecondary: `rgb(${textRGB} / 0.65)`,
    colorTextTertiary: `rgb(${textRGB} / 0.45)`,
    colorTextQuaternary: `rgb(${textRGB} / 0.25)`,
    colorTextDisabled: `rgb(${textRGB} / 0.25)`,
    colorTextPlaceholder: `rgb(${textRGB} / 0.25)`,
    colorTextHeading: `rgb(${textRGB} / 0.88)`,
    colorTextDescription: `rgb(${textRGB} / 0.45)`,
    colorTextBase: seed.colorTextBase,
    colorTextLight: bgBase,

    // Background — 从 seed.colorBgBase 动态派生
    colorBgBase: seed.colorBgBase,
    colorBgContainer: bgBase,
    colorBgContainerDisabled: `rgb(${textRGB} / 0.04)`,
    colorBgElevated: bgBase,
    colorBgLayout: adjustLightness(bgBase, -4),
    colorBgMask: `rgb(${textRGB} / 0.45)`,
    colorBgSpotlight: `rgb(${textRGB} / 0.85)`,
    colorBgTextHover: `rgb(${textRGB} / 0.06)`,
    colorBgTextActive: `rgb(${textRGB} / 0.15)`,

    // Fill — 从 seed.colorTextBase 动态派生
    colorFill: `rgb(${textRGB} / 0.15)`,
    colorFillSecondary: `rgb(${textRGB} / 0.06)`,
    colorFillTertiary: `rgb(${textRGB} / 0.04)`,
    colorFillQuaternary: `rgb(${textRGB} / 0.02)`,
    colorFillContent: `rgb(${textRGB} / 0.06)`,
    colorFillAlter: `rgb(${textRGB} / 0.02)`,

    // Border — 从 seed.colorBgBase 动态派生
    colorBorder: adjustLightness(bgBase, -15),
    colorBorderSecondary: adjustLightness(bgBase, -7),
    colorBorderDisabled: `rgb(${textRGB} / 0.15)`,
    colorSplit: adjustLightness(bgBase, -7),

    // Control Item
    controlItemBgHover: `rgb(${textRGB} / 0.04)`,
    controlItemBgActive: primarySeries.bg,
    controlItemBgActiveHover: primarySeries.bgHover,

    // Link
    colorLink: primarySeries.base,
    colorLinkHover: primarySeries.hover,
    colorLinkActive: primarySeries.active,

    // Icon
    colorIcon: `rgb(${textRGB} / 0.45)`,
    colorIconHover: `rgb(${textRGB} / 0.88)`,

    // Size
    sizeXXS: map.tokenSpacing1,
    sizeXS: map.tokenSpacing2,
    sizeSM: map.tokenSpacing3,
    size: map.tokenSpacing4,
    sizeMD: map.tokenSpacing5,
    sizeLG: map.tokenSpacing6,
    sizeXL: map.tokenSpacing8,
    sizeXXL: map.tokenSpacing12,

    // Padding
    paddingXXS: map.tokenSpacing1,
    paddingXS: map.tokenSpacing2,
    paddingSM: map.tokenSpacing3,
    padding: map.tokenSpacing4,
    paddingMD: map.tokenSpacing5,
    paddingLG: map.tokenSpacing6,
    paddingXL: map.tokenSpacing8,
    paddingXXL: map.tokenSpacing12,

    // Margin
    marginXXS: map.tokenSpacing1,
    marginXS: map.tokenSpacing2,
    marginSM: map.tokenSpacing3,
    margin: map.tokenSpacing4,
    marginMD: map.tokenSpacing5,
    marginLG: map.tokenSpacing6,
    marginXL: map.tokenSpacing8,
    marginXXL: map.tokenSpacing12,

    // Control Height
    controlHeightXS: map.tokenControlHeight1,
    controlHeightSM: map.tokenControlHeight2,
    controlHeight: map.tokenControlHeight3,
    controlHeightLG: map.tokenControlHeight4,

    // Border Radius
    borderRadiusXS: map.tokenBorderRadius1,
    borderRadiusSM: map.tokenBorderRadius2,
    borderRadius: map.tokenBorderRadius3,
    borderRadiusLG: map.tokenBorderRadius4,

    // Border Style
    borderWidth: map.tokenLineWidth,
    borderStyle: map.tokenLineType,

    // Motion — 从 motionUnit/motionBase 派生
    motionDurationFast: seed.motion
      ? `${Math.round((seed.motionBase + seed.motionUnit) * 1000)}ms`
      : '0s',
    motionDurationMid: seed.motion
      ? `${Math.round((seed.motionBase + seed.motionUnit * 2) * 1000)}ms`
      : '0s',
    motionDurationSlow: seed.motion
      ? `${Math.round((seed.motionBase + seed.motionUnit * 3) * 1000)}ms`
      : '0s',

    // Font Size
    fontSizeXS: map.tokenFontSize1,
    fontSizeSM: map.tokenFontSize2,
    fontSize: map.tokenFontSize3,
    fontSizeMD: map.tokenFontSize4,
    fontSizeLG: map.tokenFontSize5,
    fontSizeXL: map.tokenFontSize6,
    fontSizeXXL: map.tokenFontSize7,

    // Line Height
    lineHeightSM: map.tokenLineHeight1,
    lineHeight: map.tokenLineHeight2,
    lineHeightLG: map.tokenLineHeight3,

    // Font Family
    fontFamily: map.tokenFontFamily,
    fontFamilyCode: map.tokenFontFamilyCode,

    // Shadow
    shadowXS: map.tokenShadow1,
    shadowSM:
      '0 2px 4px 0 rgb(0 0 0 / 0.04), 0 1px 6px -1px rgb(0 0 0 / 0.03), 0 1px 2px 0 rgb(0 0 0 / 0.03)',
    shadow: map.tokenShadow2,
    shadowMD:
      '0 4px 12px -4px rgb(0 0 0 / 0.1), 0 8px 24px 0 rgb(0 0 0 / 0.06), 0 12px 40px 12px rgb(0 0 0 / 0.04)',
    shadowLG: map.tokenShadow3,
    shadowXL: map.tokenShadow4,

    // z-index
    zIndexBase: map.tokenZIndexBase,
    zIndexPopupBase: map.tokenZIndexPopup,
    zIndexAffix: map.tokenZIndexAffix,
    zIndexModal: map.tokenZIndexModal,
    zIndexModalMask: map.tokenZIndexModal - 1,
    zIndexPopover: map.tokenZIndexPopover,
    zIndexDropdown: map.tokenZIndexPopup + 50,
    zIndexTooltip: map.tokenZIndexTooltip,
    zIndexNotification: map.tokenZIndexNotification,
    zIndexMessage: map.tokenZIndexNotification + 10,

    // 焦点环
    controlOutline: (() => {
      const rgb = parseColor(seed.colorPrimary);
      return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / 0.1)`;
    })(),
    controlOutlineWidth: '2px',

    // 动效缓动函数（常量，不随 seed/mode 变化）
    motionEaseInOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
    motionEaseOut: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
    motionEaseIn: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
    motionEaseOutBack: 'cubic-bezier(0.12, 0.4, 0.29, 1.46)',
    motionEaseInBack: 'cubic-bezier(0.71, -0.46, 0.88, 0.6)',
    motionEaseOutCirc: 'cubic-bezier(0.08, 0.82, 0.17, 1)',
    motionEaseInOutCirc: 'cubic-bezier(0.78, 0.14, 0.15, 0.86)',

    // 字重
    fontWeightStrong: seed.fontWeightStrong,

    // 固定白色
    colorWhite: 'rgb(255 255 255)',

    // 实心背景色
    colorBgSolid: `rgb(${textRGB})`,
    colorBgSolidHover: `rgb(${textRGB} / 0.75)`,
    colorBgSolidActive: `rgb(${textRGB} / 0.95)`,

    // 高亮色（跟随 Error 背景色）
    colorHighlight: errorSeries.bg,

    // Neutral
    colorNeutral1: map.tokenGray1,
    colorNeutral2: map.tokenGray2,
    colorNeutral3: map.tokenGray3,
    colorNeutral4: map.tokenGray4,
    colorNeutral5: map.tokenGray5,
    colorNeutral6: map.tokenGray6,
    colorNeutral7: map.tokenGray7,
    colorNeutral8: map.tokenGray8,
    colorNeutral9: map.tokenGray9,
    colorNeutral10: map.tokenGray10,
  };
}

/**
 * 从预设色板生成色板 Token
 * 每个预设色生成 10 级色阶: colorPreset{Name}1 ~ colorPreset{Name}10
 */
export function derivePresetColorTokens(
  presetColors: Record<string, string>,
): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [name, baseColor] of Object.entries(presetColors)) {
    const palette = generatePalette(baseColor);
    for (let i = 0; i < 10; i++) {
      tokens[`colorPreset${name}${i + 1}`] = palette[i]!;
    }
  }
  return tokens;
}

/**
 * 完整的 Seed → ThemeTokens 派生（便捷函数）
 */
export function deriveThemeTokens(seed: SeedTokens): ThemeTokens {
  const map = deriveMapTokens(seed);
  const alias = deriveAliasTokens(map, seed);
  return { ...map, ...alias };
}
