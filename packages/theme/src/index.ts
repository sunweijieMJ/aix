/**
 * AIX Theme System
 * 主题系统入口文件
 */

// 类型导出
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

// 颜色算法导出
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
} from './color-algorithm';

// 主题配置导出
export {
  defineTheme,
  generateThemeTokens,
  tokensToCSSVars,
  defaultTheme,
  // 高级 API（用于自定义主题生成）
  defaultBaseTokens,
  generateDefaultSemanticTokens,
  applyDarkAlgorithm,
} from './define-theme';

// 主题控制器导出
export { ThemeController, calculateAlgorithm } from './theme-controller';

// 主题 Context 导出（推荐使用）
export {
  createTheme,
  THEME_INJECTION_KEY,
  type ThemeContext,
  type CreateThemeOptions,
} from './theme-context';

export { useThemeContext, useThemeContextOptional } from './use-theme-context';

// Vue Composition API 导出
export { useTheme } from './use-theme';
export type { UseThemeReturn } from './use-theme';

// CSS 变量引用工具导出
export {
  cssVar,
  cssVarName,
  getCSSVar,
  getCSSVarName,
  getCSSVars,
  getCSSVarRefs,
  createCSSVarRefs,
  createCSSVarNames,
} from './css-var';
export type { CSSVarRefs, CSSVarNames } from './css-var';

// SSR 兼容性工具导出
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
} from './ssr-utils';

// 主题验证器导出
export {
  validateThemeConfig,
  validateThemeConfigOrThrow,
  validateTokens,
  sanitizeThemeConfig,
} from './theme-validator';

export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './theme-validator';
