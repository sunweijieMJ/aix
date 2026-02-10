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
 * 基础 Token 分组元数据（用于 CSS 生成）
 */
export const BASE_TOKEN_GROUPS = {
  '色盘 - Cyan': [
    'tokenCyan1',
    'tokenCyan2',
    'tokenCyan3',
    'tokenCyan4',
    'tokenCyan5',
    'tokenCyan6',
    'tokenCyan7',
    'tokenCyan8',
    'tokenCyan9',
    'tokenCyan10',
  ],
  '色盘 - Blue': [
    'tokenBlue1',
    'tokenBlue2',
    'tokenBlue3',
    'tokenBlue4',
    'tokenBlue5',
    'tokenBlue6',
    'tokenBlue7',
    'tokenBlue8',
    'tokenBlue9',
    'tokenBlue10',
  ],
  '色盘 - Purple (P1)': [
    'tokenPurple1',
    'tokenPurple2',
    'tokenPurple3',
    'tokenPurple4',
    'tokenPurple5',
    'tokenPurple6',
    'tokenPurple7',
    'tokenPurple8',
    'tokenPurple9',
    'tokenPurple10',
  ],
  '色盘 - Green': [
    'tokenGreen1',
    'tokenGreen2',
    'tokenGreen3',
    'tokenGreen4',
    'tokenGreen5',
    'tokenGreen6',
    'tokenGreen7',
    'tokenGreen8',
    'tokenGreen9',
    'tokenGreen10',
  ],
  '色盘 - Red': [
    'tokenRed1',
    'tokenRed2',
    'tokenRed3',
    'tokenRed4',
    'tokenRed5',
    'tokenRed6',
    'tokenRed7',
    'tokenRed8',
    'tokenRed9',
    'tokenRed10',
  ],
  '色盘 - Orange': [
    'tokenOrange1',
    'tokenOrange2',
    'tokenOrange3',
    'tokenOrange4',
    'tokenOrange5',
    'tokenOrange6',
    'tokenOrange7',
    'tokenOrange8',
    'tokenOrange9',
    'tokenOrange10',
  ],
  '色盘 - Gold': [
    'tokenGold1',
    'tokenGold2',
    'tokenGold3',
    'tokenGold4',
    'tokenGold5',
    'tokenGold6',
    'tokenGold7',
    'tokenGold8',
    'tokenGold9',
    'tokenGold10',
  ],
  '色盘 - Gray/Neutral (P0)': [
    'tokenGray1',
    'tokenGray2',
    'tokenGray3',
    'tokenGray4',
    'tokenGray5',
    'tokenGray6',
    'tokenGray7',
    'tokenGray8',
    'tokenGray9',
    'tokenGray10',
    'tokenGray11',
    'tokenGray12',
    'tokenGray13',
  ],
  间距Token: [
    'tokenSpacing1',
    'tokenSpacing2',
    'tokenSpacing3',
    'tokenSpacing4',
    'tokenSpacing5',
    'tokenSpacing6',
    'tokenSpacing8',
    'tokenSpacing12',
  ],
  字号Token: [
    'tokenFontSize1',
    'tokenFontSize2',
    'tokenFontSize3',
    'tokenFontSize4',
    'tokenFontSize5',
    'tokenFontSize6',
    'tokenFontSize7',
  ],
  行高Token: ['tokenLineHeight1', 'tokenLineHeight2', 'tokenLineHeight3'],
  圆角Token: [
    'tokenBorderRadius1',
    'tokenBorderRadius2',
    'tokenBorderRadius3',
    'tokenBorderRadius4',
  ],
  控制高度Token: [
    'tokenControlHeight1',
    'tokenControlHeight2',
    'tokenControlHeight3',
    'tokenControlHeight4',
  ],
  '字体族Token (P1)': ['tokenFontFamily', 'tokenFontFamilyCode'],
  '阴影Token (P0)': [
    'tokenShadow1',
    'tokenShadow2',
    'tokenShadow3',
    'tokenShadow4',
  ],
  'z-index层级Token (P0)': [
    'tokenZIndexBase',
    'tokenZIndexPopup',
    'tokenZIndexAffix',
    'tokenZIndexModal',
    'tokenZIndexPopover',
    'tokenZIndexTooltip',
    'tokenZIndexNotification',
  ],
} as const;

/**
 * 语义 Token 分组元数据（用于 CSS 生成）
 */
export const SEMANTIC_TOKEN_GROUPS = {
  '品牌色 - Primary': [
    'colorPrimary',
    'colorPrimaryHover',
    'colorPrimaryActive',
    'colorPrimaryBg',
    'colorPrimaryBgHover',
    'colorPrimaryBorder',
    'colorPrimaryBorderHover',
    'colorPrimaryText',
    'colorPrimaryTextHover',
    'colorPrimaryTextActive',
  ],
  '功能色 - Success': [
    'colorSuccess',
    'colorSuccessHover',
    'colorSuccessActive',
    'colorSuccessBg',
    'colorSuccessBgHover',
    'colorSuccessBorder',
    'colorSuccessBorderHover',
    'colorSuccessText',
    'colorSuccessTextHover',
    'colorSuccessTextActive',
  ],
  '功能色 - Warning': [
    'colorWarning',
    'colorWarningHover',
    'colorWarningActive',
    'colorWarningBg',
    'colorWarningBgHover',
    'colorWarningBorder',
    'colorWarningBorderHover',
    'colorWarningText',
    'colorWarningTextHover',
    'colorWarningTextActive',
  ],
  '功能色 - Error': [
    'colorError',
    'colorErrorHover',
    'colorErrorActive',
    'colorErrorBg',
    'colorErrorBgHover',
    'colorErrorBorder',
    'colorErrorBorderHover',
    'colorErrorText',
    'colorErrorTextHover',
    'colorErrorTextActive',
  ],
  文本色: [
    'colorText',
    'colorTextSecondary',
    'colorTextTertiary',
    'colorTextQuaternary',
    'colorTextDisabled',
    'colorTextPlaceholder',
    'colorTextHeading',
    'colorTextDescription',
    'colorTextBase',
    'colorTextLight',
  ],
  背景色: [
    'colorBgBase',
    'colorBgContainer',
    'colorBgContainerDisabled',
    'colorBgElevated',
    'colorBgLayout',
    'colorBgMask',
    'colorBgSpotlight',
    'colorBgTextHover',
    'colorBgTextActive',
  ],
  填充色: [
    'colorFill',
    'colorFillSecondary',
    'colorFillTertiary',
    'colorFillQuaternary',
    'colorFillContent',
    'colorFillAlter',
  ],
  边框色: ['colorBorder', 'colorBorderSecondary', 'colorSplit'],
  控制项颜色: [
    'controlItemBgHover',
    'controlItemBgActive',
    'controlItemBgActiveHover',
  ],
  链接色: ['colorLink', 'colorLinkHover', 'colorLinkActive'],
  图标色: ['colorIcon', 'colorIconHover'],
  '间距 - 语义化命名': [
    'sizeXXS',
    'sizeXS',
    'sizeSM',
    'size',
    'sizeMD',
    'sizeLG',
    'sizeXL',
    'sizeXXL',
    'paddingXXS',
    'paddingXS',
    'paddingSM',
    'padding',
    'paddingMD',
    'paddingLG',
    'paddingXL',
    'paddingXXL',
    'marginXXS',
    'marginXS',
    'marginSM',
    'margin',
    'marginMD',
    'marginLG',
    'marginXL',
    'marginXXL',
  ],
  控制高度: [
    'controlHeightXS',
    'controlHeightSM',
    'controlHeight',
    'controlHeightLG',
  ],
  圆角: ['borderRadiusXS', 'borderRadiusSM', 'borderRadius', 'borderRadiusLG'],
  字号: [
    'fontSizeXS',
    'fontSizeSM',
    'fontSize',
    'fontSizeMD',
    'fontSizeLG',
    'fontSizeXL',
    'fontSizeXXL',
  ],
  行高: ['lineHeightSM', 'lineHeight', 'lineHeightLG'],
  '字体族 (P1)': ['fontFamily', 'fontFamilyCode'],
  '阴影 (P0)': [
    'shadowXS',
    'shadowSM',
    'shadow',
    'shadowMD',
    'shadowLG',
    'shadowXL',
  ],
  'z-index层级 (P0)': [
    'zIndexBase',
    'zIndexPopupBase',
    'zIndexAffix',
    'zIndexModal',
    'zIndexModalMask',
    'zIndexPopover',
    'zIndexDropdown',
    'zIndexTooltip',
    'zIndexNotification',
    'zIndexMessage',
  ],
  '中性色 (P0)': [
    'colorNeutral1',
    'colorNeutral2',
    'colorNeutral3',
    'colorNeutral4',
    'colorNeutral5',
    'colorNeutral6',
    'colorNeutral7',
    'colorNeutral8',
    'colorNeutral9',
    'colorNeutral10',
  ],
} as const;

/**
 * 语义 Token 中使用 var() 引用基础 Token 的映射
 * 亮色模式下这些 Token 使用 var(--tokenXxx) 形式
 */
export const SEMANTIC_VAR_REFS: Record<string, string> = {
  // Primary 使用 Cyan
  colorPrimary: 'tokenCyan6',
  colorPrimaryText: 'tokenCyan6',
  // Success 使用 Green
  colorSuccess: 'tokenGreen6',
  // Warning 使用 Gold
  colorWarning: 'tokenGold6',
  // Error 使用 Red
  colorError: 'tokenRed6',
  // Link
  colorLink: 'tokenCyan6',
  colorLinkHover: 'tokenCyan4',
  colorLinkActive: 'tokenCyan7',
  // Size 映射
  sizeXXS: 'tokenSpacing1',
  sizeXS: 'tokenSpacing2',
  sizeSM: 'tokenSpacing3',
  size: 'tokenSpacing4',
  sizeMD: 'tokenSpacing5',
  sizeLG: 'tokenSpacing6',
  sizeXL: 'tokenSpacing8',
  sizeXXL: 'tokenSpacing12',
  // Padding 映射
  paddingXXS: 'tokenSpacing1',
  paddingXS: 'tokenSpacing2',
  paddingSM: 'tokenSpacing3',
  padding: 'tokenSpacing4',
  paddingMD: 'tokenSpacing5',
  paddingLG: 'tokenSpacing6',
  paddingXL: 'tokenSpacing8',
  paddingXXL: 'tokenSpacing12',
  // Margin 映射
  marginXXS: 'tokenSpacing1',
  marginXS: 'tokenSpacing2',
  marginSM: 'tokenSpacing3',
  margin: 'tokenSpacing4',
  marginMD: 'tokenSpacing5',
  marginLG: 'tokenSpacing6',
  marginXL: 'tokenSpacing8',
  marginXXL: 'tokenSpacing12',
  // Control Height 映射
  controlHeightXS: 'tokenControlHeight1',
  controlHeightSM: 'tokenControlHeight2',
  controlHeight: 'tokenControlHeight3',
  controlHeightLG: 'tokenControlHeight4',
  // Border Radius 映射
  borderRadiusXS: 'tokenBorderRadius1',
  borderRadiusSM: 'tokenBorderRadius2',
  borderRadius: 'tokenBorderRadius3',
  borderRadiusLG: 'tokenBorderRadius4',
  // Font Size 映射
  fontSizeXS: 'tokenFontSize1',
  fontSizeSM: 'tokenFontSize2',
  fontSize: 'tokenFontSize3',
  fontSizeMD: 'tokenFontSize4',
  fontSizeLG: 'tokenFontSize5',
  fontSizeXL: 'tokenFontSize6',
  fontSizeXXL: 'tokenFontSize7',
  // Line Height 映射
  lineHeightSM: 'tokenLineHeight1',
  lineHeight: 'tokenLineHeight2',
  lineHeightLG: 'tokenLineHeight3',
  // Font Family 映射
  fontFamily: 'tokenFontFamily',
  fontFamilyCode: 'tokenFontFamilyCode',
  // Shadow 映射
  shadowXS: 'tokenShadow1',
  shadowSM: 'tokenShadow1',
  shadow: 'tokenShadow2',
  shadowMD: 'tokenShadow2',
  shadowLG: 'tokenShadow3',
  shadowXL: 'tokenShadow4',
  // z-index 映射
  zIndexBase: 'tokenZIndexBase',
  zIndexPopupBase: 'tokenZIndexPopup',
  zIndexAffix: 'tokenZIndexAffix',
  zIndexModal: 'tokenZIndexModal',
  zIndexPopover: 'tokenZIndexPopover',
  zIndexTooltip: 'tokenZIndexTooltip',
  zIndexNotification: 'tokenZIndexNotification',
  // Neutral 映射
  colorNeutral1: 'tokenGray1',
  colorNeutral2: 'tokenGray2',
  colorNeutral3: 'tokenGray3',
  colorNeutral4: 'tokenGray4',
  colorNeutral5: 'tokenGray5',
  colorNeutral6: 'tokenGray6',
  colorNeutral7: 'tokenGray7',
  colorNeutral8: 'tokenGray8',
  colorNeutral9: 'tokenGray9',
  colorNeutral10: 'tokenGray10',
};

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
export function applyDarkAlgorithm(tokens: ThemeTokens): ThemeTokens {
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
