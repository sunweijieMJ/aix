/**
 * 主题系统类型定义
 */

/**
 * 基础Token - 原子级设计变量
 */
export interface BaseTokens {
  // 色盘 - Cyan
  tokenCyan1: string;
  tokenCyan2: string;
  tokenCyan3: string;
  tokenCyan4: string;
  tokenCyan5: string;
  tokenCyan6: string;
  tokenCyan7: string;
  tokenCyan8: string;
  tokenCyan9: string;
  tokenCyan10: string;

  // 色盘 - Blue
  tokenBlue1: string;
  tokenBlue2: string;
  tokenBlue3: string;
  tokenBlue4: string;
  tokenBlue5: string;
  tokenBlue6: string;
  tokenBlue7: string;
  tokenBlue8: string;
  tokenBlue9: string;
  tokenBlue10: string;

  // 色盘 - Purple (P1)
  tokenPurple1: string;
  tokenPurple2: string;
  tokenPurple3: string;
  tokenPurple4: string;
  tokenPurple5: string;
  tokenPurple6: string;
  tokenPurple7: string;
  tokenPurple8: string;
  tokenPurple9: string;
  tokenPurple10: string;

  // 色盘 - Green
  tokenGreen1: string;
  tokenGreen2: string;
  tokenGreen3: string;
  tokenGreen4: string;
  tokenGreen5: string;
  tokenGreen6: string;
  tokenGreen7: string;
  tokenGreen8: string;
  tokenGreen9: string;
  tokenGreen10: string;

  // 色盘 - Red
  tokenRed1: string;
  tokenRed2: string;
  tokenRed3: string;
  tokenRed4: string;
  tokenRed5: string;
  tokenRed6: string;
  tokenRed7: string;
  tokenRed8: string;
  tokenRed9: string;
  tokenRed10: string;

  // 色盘 - Orange
  tokenOrange1: string;
  tokenOrange2: string;
  tokenOrange3: string;
  tokenOrange4: string;
  tokenOrange5: string;
  tokenOrange6: string;
  tokenOrange7: string;
  tokenOrange8: string;
  tokenOrange9: string;
  tokenOrange10: string;

  // 色盘 - Gold
  tokenGold1: string;
  tokenGold2: string;
  tokenGold3: string;
  tokenGold4: string;
  tokenGold5: string;
  tokenGold6: string;
  tokenGold7: string;
  tokenGold8: string;
  tokenGold9: string;
  tokenGold10: string;

  // 色盘 - Gray/Neutral (P0)
  tokenGray1: string;
  tokenGray2: string;
  tokenGray3: string;
  tokenGray4: string;
  tokenGray5: string;
  tokenGray6: string;
  tokenGray7: string;
  tokenGray8: string;
  tokenGray9: string;
  tokenGray10: string;
  tokenGray11: string;
  tokenGray12: string;
  tokenGray13: string;

  // 尺寸 - 基础间距
  tokenSpacing1: string; // 4px
  tokenSpacing2: string; // 8px
  tokenSpacing3: string; // 12px
  tokenSpacing4: string; // 16px
  tokenSpacing5: string; // 20px
  tokenSpacing6: string; // 24px
  tokenSpacing8: string; // 32px
  tokenSpacing12: string; // 48px

  // 字号
  tokenFontSize1: string; // 12px
  tokenFontSize2: string; // 13px
  tokenFontSize3: string; // 14px
  tokenFontSize4: string; // 15px
  tokenFontSize5: string; // 16px
  tokenFontSize6: string; // 18px
  tokenFontSize7: string; // 20px

  // 行高
  tokenLineHeight1: number; // 1.2
  tokenLineHeight2: number; // 1.5
  tokenLineHeight3: number; // 1.8

  // 圆角
  tokenBorderRadius1: string; // 2px
  tokenBorderRadius2: string; // 4px
  tokenBorderRadius3: string; // 6px
  tokenBorderRadius4: string; // 8px

  // 控制高度
  tokenControlHeight1: string; // 16px
  tokenControlHeight2: string; // 24px
  tokenControlHeight3: string; // 32px
  tokenControlHeight4: string; // 40px

  // 字体族 (P1)
  tokenFontFamily: string;
  tokenFontFamilyCode: string;

  // 阴影 (P0)
  tokenShadow1: string; // 最轻阴影
  tokenShadow2: string; // 轻阴影
  tokenShadow3: string; // 中等阴影
  tokenShadow4: string; // 重阴影

  // z-index 层级 (P0)
  tokenZIndexBase: number;
  tokenZIndexPopup: number;
  tokenZIndexAffix: number;
  tokenZIndexModal: number;
  tokenZIndexPopover: number;
  tokenZIndexTooltip: number;
  tokenZIndexNotification: number;
}

/**
 * 语义Token - 语义级设计变量
 */
export interface SemanticTokens {
  // 品牌色 - Primary
  colorPrimary: string;
  colorPrimaryHover: string;
  colorPrimaryActive: string;
  colorPrimaryBg: string;
  colorPrimaryBgHover: string;
  colorPrimaryBorder: string;
  colorPrimaryBorderHover: string;
  colorPrimaryText: string;
  colorPrimaryTextHover: string;
  colorPrimaryTextActive: string;

  // 功能色 - Success
  colorSuccess: string;
  colorSuccessHover: string;
  colorSuccessActive: string;
  colorSuccessBg: string;
  colorSuccessBgHover: string;
  colorSuccessBorder: string;
  colorSuccessBorderHover: string;
  colorSuccessText: string;
  colorSuccessTextHover: string;
  colorSuccessTextActive: string;

  // 功能色 - Warning
  colorWarning: string;
  colorWarningHover: string;
  colorWarningActive: string;
  colorWarningBg: string;
  colorWarningBgHover: string;
  colorWarningBorder: string;
  colorWarningBorderHover: string;
  colorWarningText: string;
  colorWarningTextHover: string;
  colorWarningTextActive: string;

  // 功能色 - Error
  colorError: string;
  colorErrorHover: string;
  colorErrorActive: string;
  colorErrorBg: string;
  colorErrorBgHover: string;
  colorErrorBorder: string;
  colorErrorBorderHover: string;
  colorErrorText: string;
  colorErrorTextHover: string;
  colorErrorTextActive: string;

  // 文本色
  colorText: string;
  colorTextSecondary: string;
  colorTextTertiary: string;
  colorTextQuaternary: string;
  colorTextDisabled: string;
  colorTextPlaceholder: string;
  colorTextHeading: string;
  colorTextDescription: string;
  colorTextBase: string;
  colorTextLight: string;

  // 背景色
  colorBgBase: string;
  colorBgContainer: string;
  colorBgContainerDisabled: string;
  colorBgElevated: string;
  colorBgLayout: string;
  colorBgMask: string;
  colorBgSpotlight: string;
  colorBgTextHover: string;
  colorBgTextActive: string;

  // 填充色
  colorFill: string;
  colorFillSecondary: string;
  colorFillTertiary: string;
  colorFillQuaternary: string;
  colorFillContent: string;
  colorFillAlter: string;

  // 边框色
  colorBorder: string;
  colorBorderSecondary: string;
  colorSplit: string;

  // 控制项颜色
  controlItemBgHover: string;
  controlItemBgActive: string;
  controlItemBgActiveHover: string;

  // 链接色
  colorLink: string;
  colorLinkHover: string;
  colorLinkActive: string;

  // 图标色
  colorIcon: string;
  colorIconHover: string;

  // 间距 - 语义化命名
  sizeXXS: string;
  sizeXS: string;
  sizeSM: string;
  size: string;
  sizeMD: string;
  sizeLG: string;
  sizeXL: string;
  sizeXXL: string;

  paddingXXS: string;
  paddingXS: string;
  paddingSM: string;
  padding: string;
  paddingMD: string;
  paddingLG: string;
  paddingXL: string;
  paddingXXL: string;

  marginXXS: string;
  marginXS: string;
  marginSM: string;
  margin: string;
  marginMD: string;
  marginLG: string;
  marginXL: string;
  marginXXL: string;

  // 控制高度
  controlHeightXS: string;
  controlHeightSM: string;
  controlHeight: string;
  controlHeightLG: string;

  // 圆角
  borderRadiusXS: string;
  borderRadiusSM: string;
  borderRadius: string;
  borderRadiusLG: string;

  // 字号
  fontSizeXS: string;
  fontSizeSM: string;
  fontSize: string;
  fontSizeMD: string;
  fontSizeLG: string;
  fontSizeXL: string;
  fontSizeXXL: string;

  // 行高
  lineHeightSM: number;
  lineHeight: number;
  lineHeightLG: number;

  // 字体族 (P1)
  fontFamily: string;
  fontFamilyCode: string;

  // 阴影 (P0)
  shadowXS: string;
  shadowSM: string;
  shadow: string;
  shadowMD: string;
  shadowLG: string;
  shadowXL: string;

  // z-index 层级 (P0)
  zIndexBase: number;
  zIndexPopupBase: number;
  zIndexAffix: number;
  zIndexModal: number;
  zIndexModalMask: number;
  zIndexPopover: number;
  zIndexDropdown: number;
  zIndexTooltip: number;
  zIndexNotification: number;
  zIndexMessage: number;

  // 中性色/填充色扩展 (P0)
  colorNeutral1: string;
  colorNeutral2: string;
  colorNeutral3: string;
  colorNeutral4: string;
  colorNeutral5: string;
  colorNeutral6: string;
  colorNeutral7: string;
  colorNeutral8: string;
  colorNeutral9: string;
  colorNeutral10: string;
}

/**
 * 完整的主题Token
 */
export type ThemeTokens = BaseTokens & SemanticTokens;

/**
 * 用户可配置的主题Token（部分）
 */
export type PartialThemeTokens = Partial<ThemeTokens>;

/**
 * 过渡动画配置
 */
export interface TransitionConfig {
  /**
   * 过渡时长（毫秒）
   * @default 200
   */
  duration?: number;

  /**
   * 缓动函数
   * @default 'ease-in-out'
   */
  easing?: string;

  /**
   * 是否启用过渡动画
   * @default true
   */
  enabled?: boolean;
}

/**
 * 主题配置
 */
export interface ThemeConfig {
  /**
   * Token配置
   */
  token?: PartialThemeTokens;

  /**
   * 算法模式
   * - default: 默认亮色
   * - dark: 暗色模式
   * - compact: 紧凑模式（减小间距）
   */
  algorithm?: 'default' | 'dark' | 'compact';

  /**
   * 组件级覆盖（预留）
   */
  components?: Record<string, any>;

  /**
   * 过渡动画配置
   */
  transition?: TransitionConfig;
}

/**
 * 主题模式
 */
export type ThemeMode = 'light' | 'dark';

/**
 * 主题预设
 */
export interface ThemePreset {
  name: string;
  displayName: string;
  token: PartialThemeTokens;
}

/**
 * CSS变量名
 */
export type CSSVarName = `--${keyof ThemeTokens}`;
