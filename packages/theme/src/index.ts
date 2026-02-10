/**
 * AIX Theme System
 * 主题系统入口文件
 */

// ============================================================
// 类型导出
// ============================================================
export type {
  BaseTokens,
  SemanticTokens,
  ThemeTokens,
  PartialThemeTokens,
  ThemeConfig,
  ThemeMode,
  ThemePreset,
  TransitionConfig,
} from './theme-types';

// ============================================================
// 核心模块 (core/)
// ============================================================

// 颜色算法
export {
  // 类型
  type RGB,
  type RGBA,
  type HSL,
  type ColorFormat,
  type ColorSeries,
  // 解析函数
  parseColor,
  parseColorWithAlpha,
  parseHex,
  parseRGB,
  detectColorFormat,
  // 转换函数
  rgbToString,
  rgbaToString,
  rgbToHex,
  rgbaToHex,
  rgbToHsl,
  hslToRgb,
  // 调整函数
  adjustLightness,
  adjustSaturation,
  // 生成函数
  generateHoverColor,
  generateActiveColor,
  generateBgColor,
  generateBorderColor,
  generateTextColor,
  generateColorSeries,
  generateColorPalette,
} from './core/color-algorithm';

// 主题定义
export {
  defineTheme,
  generateThemeTokens,
  tokensToCSSVars,
  defaultTheme,
  // 高级 API（用于自定义主题生成）
  defaultBaseTokens,
  generateDefaultSemanticTokens,
  applyDarkAlgorithm,
} from './core/define-theme';

// 主题控制器
export { ThemeController, calculateAlgorithm } from './core/theme-controller';

// ============================================================
// Vue 集成 (vue/)
// ============================================================

// 主题 Context（推荐使用）
export {
  createTheme,
  THEME_INJECTION_KEY,
  type ThemeContext,
  type CreateThemeOptions,
} from './vue/theme-context';

// Composables
export {
  useThemeContext,
  useThemeContextOptional,
} from './vue/use-theme-context';
export { useTheme } from './vue/use-theme';
export type { UseThemeReturn } from './vue/use-theme';

// ============================================================
// 工具函数 (utils/)
// ============================================================

// CSS 变量引用工具
export {
  cssVar,
  cssVarName,
  getCSSVar,
  getCSSVarName,
  getCSSVars,
  getCSSVarRefs,
  createCSSVarRefs,
  createCSSVarNames,
} from './utils/css-var';
export type { CSSVarRefs, CSSVarNames } from './utils/css-var';

// SSR 兼容性工具
export {
  isBrowser,
  hasLocalStorage,
  hasMatchMedia,
  safeGetLocalStorage,
  safeSetLocalStorage,
  getSystemThemePreference,
  generateSSRInitScript,
  generateSSRStyleTag,
  NextAppRouterHelper,
} from './utils/ssr-utils';

// 主题验证器
export {
  validateThemeConfig,
  validateThemeConfigOrThrow,
  validateTokens,
  sanitizeThemeConfig,
} from './utils/theme-validator';

export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './utils/theme-validator';
