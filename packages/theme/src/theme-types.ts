/**
 * 主题系统类型定义
 */

/**
 * 种子Token - 主题派生的输入参数
 * 用户只需配置 ~15 个种子值即可完成全套换肤
 */
export interface SeedTokens {
  // 色彩种子
  colorPrimary: string;
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  colorInfo: string;

  // 中性色种子
  colorTextBase: string;
  colorBgBase: string;

  // 尺寸种子
  sizeUnit: number;
  sizeStep: number;

  // 圆角种子
  borderRadius: number;

  // 字体种子
  fontSize: number;
  fontFamily: string;
  fontFamilyCode: string;
  lineHeight: number;

  // 控件种子
  controlHeight: number;

  // 边框种子
  lineWidth: number;
  lineType: string;

  // 字重种子
  /** 强调字重，默认 600 */
  fontWeightStrong: number;

  // 动效种子
  motion: boolean;
  /** 动效时间单位（秒），默认 0.1 */
  motionUnit: number;
  /** 动效基准时间（秒），默认 0 */
  motionBase: number;

  /** 线框模式（默认 false） */
  wireframe: boolean;

  /** 预设色板 { name: baseColor }，默认含 7 个标准色 */
  presetColors: Record<string, string>;

  // 层级种子
  zIndexBase: number;
  zIndexPopupBase: number;
}

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

  // 边框 (P1)
  tokenLineWidth: string;
  tokenLineType: string;

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

  // 功能色 - Info
  colorInfo: string;
  colorInfoHover: string;
  colorInfoActive: string;
  colorInfoBg: string;
  colorInfoBgHover: string;
  colorInfoBorder: string;
  colorInfoBorderHover: string;
  colorInfoText: string;
  colorInfoTextHover: string;
  colorInfoTextActive: string;

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
  colorBorderDisabled: string;
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

  // 边框样式
  borderWidth: string;
  borderStyle: string;

  // 动效时长
  motionDurationFast: string;
  motionDurationMid: string;
  motionDurationSlow: string;

  // 焦点环
  controlOutline: string;
  controlOutlineWidth: string;

  // 动效缓动函数
  motionEaseInOut: string;
  motionEaseOut: string;
  motionEaseIn: string;
  motionEaseOutBack: string;
  motionEaseInBack: string;
  motionEaseOutCirc: string;
  motionEaseInOutCirc: string;

  // 字重
  fontWeightStrong: number;

  // 固定白色
  colorWhite: string;

  // 实心背景色
  colorBgSolid: string;
  colorBgSolidHover: string;
  colorBgSolidActive: string;

  // 高亮色
  colorHighlight: string;

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
 * 预设色板 Token - 由 derivePresetColorTokens 动态生成
 * 每个预设色生成 10 级色阶: colorPreset{Name}1 ~ colorPreset{Name}10
 * 默认包含 7 种颜色：Cyan, Blue, Purple, Green, Red, Orange, Gold
 *
 * 注：属性为可选是因为预设色板可被用户自定义配置覆盖
 */
export interface PresetColorTokens {
  // 预设色板 - Cyan
  colorPresetCyan1?: string;
  colorPresetCyan2?: string;
  colorPresetCyan3?: string;
  colorPresetCyan4?: string;
  colorPresetCyan5?: string;
  colorPresetCyan6?: string;
  colorPresetCyan7?: string;
  colorPresetCyan8?: string;
  colorPresetCyan9?: string;
  colorPresetCyan10?: string;

  // 预设色板 - Blue
  colorPresetBlue1?: string;
  colorPresetBlue2?: string;
  colorPresetBlue3?: string;
  colorPresetBlue4?: string;
  colorPresetBlue5?: string;
  colorPresetBlue6?: string;
  colorPresetBlue7?: string;
  colorPresetBlue8?: string;
  colorPresetBlue9?: string;
  colorPresetBlue10?: string;

  // 预设色板 - Purple
  colorPresetPurple1?: string;
  colorPresetPurple2?: string;
  colorPresetPurple3?: string;
  colorPresetPurple4?: string;
  colorPresetPurple5?: string;
  colorPresetPurple6?: string;
  colorPresetPurple7?: string;
  colorPresetPurple8?: string;
  colorPresetPurple9?: string;
  colorPresetPurple10?: string;

  // 预设色板 - Green
  colorPresetGreen1?: string;
  colorPresetGreen2?: string;
  colorPresetGreen3?: string;
  colorPresetGreen4?: string;
  colorPresetGreen5?: string;
  colorPresetGreen6?: string;
  colorPresetGreen7?: string;
  colorPresetGreen8?: string;
  colorPresetGreen9?: string;
  colorPresetGreen10?: string;

  // 预设色板 - Red
  colorPresetRed1?: string;
  colorPresetRed2?: string;
  colorPresetRed3?: string;
  colorPresetRed4?: string;
  colorPresetRed5?: string;
  colorPresetRed6?: string;
  colorPresetRed7?: string;
  colorPresetRed8?: string;
  colorPresetRed9?: string;
  colorPresetRed10?: string;

  // 预设色板 - Orange
  colorPresetOrange1?: string;
  colorPresetOrange2?: string;
  colorPresetOrange3?: string;
  colorPresetOrange4?: string;
  colorPresetOrange5?: string;
  colorPresetOrange6?: string;
  colorPresetOrange7?: string;
  colorPresetOrange8?: string;
  colorPresetOrange9?: string;
  colorPresetOrange10?: string;

  // 预设色板 - Gold
  colorPresetGold1?: string;
  colorPresetGold2?: string;
  colorPresetGold3?: string;
  colorPresetGold4?: string;
  colorPresetGold5?: string;
  colorPresetGold6?: string;
  colorPresetGold7?: string;
  colorPresetGold8?: string;
  colorPresetGold9?: string;
  colorPresetGold10?: string;

  /** 动态预设色板索引签名，支持用户自定义预设色 */
  [key: `colorPreset${string}${number}`]: string | undefined;
}

/**
 * 完整的主题Token
 */
export type ThemeTokens = BaseTokens & SemanticTokens & PresetColorTokens;

/**
 * 主题算法函数
 * 接收当前 tokens，返回需要覆写的 token 子集
 */
export type ThemeAlgorithm = (tokens: ThemeTokens) => Partial<ThemeTokens>;

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
 * 组件级主题配置
 */
export interface ComponentThemeConfig {
  /** 种子覆写（algorithm=true 时走完整派生） */
  seed?: Partial<SeedTokens>;
  /** Token 直接覆写 */
  token?: PartialThemeTokens;
  /** 是否对 seed 执行派生管线（默认 false） */
  algorithm?: boolean;
}

/**
 * 组件主题配置映射
 */
export type ComponentsConfig = Record<string, ComponentThemeConfig>;

/**
 * 主题配置
 */
export interface ThemeConfig {
  /**
   * 种子Token配置（推荐配置入口）
   * 只需设置 ~15 个种子值即可驱动全套 Token 派生
   */
  seed?: Partial<SeedTokens>;

  /**
   * Token配置（高级覆写，逃生舱）
   */
  token?: PartialThemeTokens;

  /**
   * 主题算法
   * 支持单个算法函数或多个算法组合叠加
   *
   * @example
   * // 单个算法
   * { algorithm: darkAlgorithm }
   *
   * // 组合叠加
   * { algorithm: [darkAlgorithm, compactAlgorithm] }
   *
   * // 自定义算法
   * { algorithm: (tokens) => ({ colorPrimary: 'rgb(255 0 0)' }) }
   */
  algorithm?: ThemeAlgorithm | ThemeAlgorithm[];

  /**
   * 过渡动画配置
   */
  transition?: TransitionConfig;

  /**
   * 组件级主题覆写
   * key 为组件名（如 'button', 'input'），value 为组件级配置
   */
  components?: ComponentsConfig;
}

/**
 * 主题模式
 */
export type ThemeMode = 'light' | 'dark';
