/**
 * 主题配置系统
 */

import {
  adjustLightness,
  generatePalette,
  hslToRgb,
  mixColors,
  parseColor,
  rgbToHsl,
  rgbToString,
} from './color-algorithm';
import {
  DEFAULT_PRESET_COLORS,
  defaultSeedTokens,
  deriveMapTokens,
  deriveAliasTokens,
  derivePresetColorTokens,
} from './seed-derivation';
import type {
  BaseTokens,
  ComponentsConfig,
  ComponentThemeConfig,
  PartialThemeTokens,
  SeedTokens,
  ThemeAlgorithm,
  ThemeConfig,
  ThemeTokens,
} from '../theme-types';
import { CSS_VAR_PREFIX } from '../utils/css-var';

/**
 * 定义主题配置
 */
export function defineTheme(config: ThemeConfig = {}): Required<ThemeConfig> {
  return {
    seed: config.seed || {},
    token: config.token || {},
    algorithm: config.algorithm || [],
    transition: config.transition || {
      duration: 200,
      easing: 'ease-in-out',
      enabled: true,
    },
    components: config.components || {},
  };
}

/**
 * 默认算法（恒等函数，不做任何修改）
 */
export const defaultAlgorithm: ThemeAlgorithm = () => ({});

/**
 * 计算两组 Token 的差异部分
 */
export function computeTokenDiff(
  base: ThemeTokens,
  target: ThemeTokens,
): Partial<ThemeTokens> {
  const diff: Partial<ThemeTokens> = {};
  for (const key of Object.keys(target) as Array<keyof ThemeTokens>) {
    if (String(target[key]) !== String(base[key])) {
      (diff as Record<string, unknown>)[key] = target[key];
    }
  }
  return diff;
}

/**
 * 暗色算法
 * 包装 applyDarkAlgorithm，返回 diff 而非完整 tokens
 */
export const darkAlgorithm: ThemeAlgorithm = (tokens) =>
  computeTokenDiff(tokens, applyDarkAlgorithm(tokens));

/**
 * 线框模式算法
 * 移除所有填充/阴影，边框使用文本色，圆角归零
 */
export const wireframeAlgorithm: ThemeAlgorithm = (tokens) => ({
  colorFill: 'transparent',
  colorFillSecondary: 'transparent',
  colorFillTertiary: 'transparent',
  colorFillQuaternary: 'transparent',
  colorFillContent: 'transparent',
  colorFillAlter: 'transparent',
  colorBgContainer: 'transparent',
  colorBgElevated: 'transparent',
  controlItemBgHover: 'transparent',
  controlItemBgActive: 'transparent',
  controlItemBgActiveHover: 'transparent',
  colorBgSolid: 'transparent',
  colorBgSolidHover: 'transparent',
  colorBgSolidActive: 'transparent',
  colorBorder: tokens.colorText,
  colorBorderSecondary: tokens.colorTextSecondary,
  borderRadiusXS: '0px',
  borderRadiusSM: '0px',
  borderRadius: '0px',
  borderRadiusLG: '0px',
  shadowXS: 'none',
  shadowSM: 'none',
  shadow: 'none',
  shadowMD: 'none',
  shadowLG: 'none',
  shadowXL: 'none',
});

/**
 * 紧凑算法
 * 包装 applyCompactAlgorithm，返回 diff 而非完整 tokens
 */
export const compactAlgorithm: ThemeAlgorithm = (tokens) =>
  computeTokenDiff(tokens, applyCompactAlgorithm(tokens));

/**
 * 将 algorithm 配置规范化为 ThemeAlgorithm 数组
 */
export function normalizeAlgorithm(
  algorithm: ThemeConfig['algorithm'],
): ThemeAlgorithm[] {
  if (!algorithm) return [];
  if (Array.isArray(algorithm)) return algorithm;
  return [algorithm];
}

/**
 * 类型安全的 Token 提取函数
 */
type BaseTokenKeys = keyof BaseTokens;

function extractBaseTokenOverrides(
  token: PartialThemeTokens | undefined,
): Partial<BaseTokens> {
  if (!token) return {};
  const result: Partial<BaseTokens> = {};
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
 * 生成完整的主题Token（三层管线）
 */
export function generateThemeTokens(config: ThemeConfig): ThemeTokens {
  // 1. 合并 Seed 覆写
  const resolvedSeed: SeedTokens = { ...defaultSeedTokens, ...config.seed };

  // 2. Seed → Map 派生
  const mapTokens = deriveMapTokens(resolvedSeed);

  // 3. 合并用户对 Map 层的覆写
  const mapOverrides = extractBaseTokenOverrides(config.token);
  const resolvedMap: BaseTokens = { ...mapTokens, ...mapOverrides };

  // 4. Map → Alias 派生
  const aliasTokens = deriveAliasTokens(resolvedMap, resolvedSeed);

  // 5. 合并用户对 Alias 层的覆写
  const aliasOverrides = extractSemanticTokenOverrides(config.token);
  const resolvedAlias = { ...aliasTokens, ...aliasOverrides };

  // 6. 组装完整 Token
  let finalTokens: ThemeTokens = { ...resolvedMap, ...resolvedAlias };

  // 6.5 生成预设色板（作为附加属性挂载）
  const presetTokens = derivePresetColorTokens(
    resolvedSeed.presetColors ?? DEFAULT_PRESET_COLORS,
  );
  finalTokens = { ...finalTokens, ...presetTokens };

  // 7. 应用算法（支持组合叠加）
  const algos = normalizeAlgorithm(config.algorithm);
  for (const algo of algos) {
    finalTokens = { ...finalTokens, ...algo(finalTokens) };
  }

  // 8. 重新应用用户覆写（最高优先级）
  if (algos.length > 0) {
    finalTokens = {
      ...finalTokens,
      ...mapOverrides,
      ...aliasOverrides,
    };
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

  const rgb = parseColor(baseColor);
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
  adjustedHsl.s = Math.min(100, hsl.s + DARK_MODE_ADJUSTMENTS.saturationBoost);

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
}

/**
 * 暗色模式中性覆写（文本/背景/填充/边框/阴影/中性色）
 * 由 applyDarkAlgorithm 和 applyDarkMixAlgorithm 共用
 */
function getDarkNeutralOverrides(tokens: ThemeTokens): Partial<ThemeTokens> {
  return {
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
    colorBgContainer: 'rgb(28 28 28)',
    colorBgContainerDisabled: 'rgb(255 255 255 / 0.08)',
    colorBgElevated: 'rgb(38 38 38)',
    colorBgLayout: 'rgb(15 15 15)',
    colorBgMask: 'rgb(0 0 0 / 0.65)',
    colorBgSpotlight: 'rgb(255 255 255 / 0.85)',
    colorBgTextHover: 'rgb(255 255 255 / 0.12)',
    colorBgTextActive: 'rgb(255 255 255 / 0.18)',

    // 填充色反转
    colorFill: 'rgb(255 255 255 / 0.18)',
    colorFillSecondary: 'rgb(255 255 255 / 0.12)',
    colorFillTertiary: 'rgb(255 255 255 / 0.08)',
    colorFillQuaternary: 'rgb(255 255 255 / 0.06)',
    colorFillContent: 'rgb(255 255 255 / 0.12)',
    colorFillAlter: 'rgb(255 255 255 / 0.06)',

    // 边框色反转
    colorBorder: 'rgb(255 255 255 / 0.25)',
    colorBorderSecondary: 'rgb(255 255 255 / 0.15)',
    colorBorderDisabled: 'rgb(255 255 255 / 0.15)',
    colorSplit: 'rgb(255 255 255 / 0.12)',

    // 控制项颜色
    controlItemBgHover: 'rgb(255 255 255 / 0.12)',

    // 图标色
    colorIcon: 'rgb(255 255 255 / 0.45)',
    colorIconHover: 'rgb(255 255 255 / 0.85)',

    // 阴影 - 暗色模式 (P0) - 递进层级
    shadowXS:
      '0 1px 2px 0 rgb(0 0 0 / 0.1), 0 1px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px 0 rgb(0 0 0 / 0.08)',
    shadowSM:
      '0 2px 4px 0 rgb(0 0 0 / 0.12), 0 1px 6px -1px rgb(0 0 0 / 0.1), 0 1px 2px 0 rgb(0 0 0 / 0.1)',
    shadow:
      '0 3px 6px -4px rgb(0 0 0 / 0.24), 0 6px 16px 0 rgb(0 0 0 / 0.16), 0 9px 28px 8px rgb(0 0 0 / 0.1)',
    shadowMD:
      '0 4px 12px -4px rgb(0 0 0 / 0.2), 0 8px 24px 0 rgb(0 0 0 / 0.12), 0 12px 40px 12px rgb(0 0 0 / 0.08)',
    shadowLG:
      '0 6px 16px -8px rgb(0 0 0 / 0.16), 0 9px 28px 0 rgb(0 0 0 / 0.1), 0 12px 48px 16px rgb(0 0 0 / 0.08)',
    shadowXL:
      '0 12px 24px -12px rgb(0 0 0 / 0.3), 0 24px 48px 0 rgb(0 0 0 / 0.2), 0 36px 72px 24px rgb(0 0 0 / 0.1)',

    // 实心背景色 - 暗色模式反转
    colorBgSolid: 'rgb(255 255 255)',
    colorBgSolidHover: 'rgb(255 255 255 / 0.75)',
    colorBgSolidActive: 'rgb(255 255 255 / 0.95)',

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
 * 生成功能色覆写（从 series 对象映射到 Token 字段）
 */
function colorSeriesToOverrides(
  prefix: string,
  series: ReturnType<typeof generateDarkColorSeries>,
): Partial<ThemeTokens> {
  return {
    [`color${prefix}`]: series.base,
    [`color${prefix}Hover`]: series.hover,
    [`color${prefix}Active`]: series.active,
    [`color${prefix}Bg`]: series.bg,
    [`color${prefix}BgHover`]: series.bgHover,
    [`color${prefix}Border`]: series.border,
    [`color${prefix}BorderHover`]: series.borderHover,
    [`color${prefix}Text`]: series.text,
    [`color${prefix}TextHover`]: series.textHover,
    [`color${prefix}TextActive`]: series.textActive,
  } as unknown as Partial<ThemeTokens>;
}

/**
 * 应用智能暗色算法
 * 根据主题色动态生成暗色方案，而非使用硬编码值
 */
export function applyDarkAlgorithm(tokens: ThemeTokens): ThemeTokens {
  const primarySeries = generateDarkColorSeries(tokens.colorPrimary);
  const successSeries = generateDarkColorSeries(tokens.colorSuccess);
  const warningSeries = generateDarkColorSeries(tokens.colorWarning);
  const errorSeries = generateDarkColorSeries(tokens.colorError);
  const infoSeries = generateDarkColorSeries(tokens.colorInfo);

  return {
    ...tokens,
    ...getDarkNeutralOverrides(tokens),
    ...colorSeriesToOverrides('Primary', primarySeries),
    ...colorSeriesToOverrides('Success', successSeries),
    ...colorSeriesToOverrides('Warning', warningSeries),
    ...colorSeriesToOverrides('Error', errorSeries),
    ...colorSeriesToOverrides('Info', infoSeries),
    controlItemBgActive: primarySeries.bg,
    controlItemBgActiveHover: primarySeries.bgHover,
    colorLink: primarySeries.base,
    colorLinkHover: primarySeries.hover,
    colorLinkActive: primarySeries.active,
    controlOutline: (() => {
      const rgb = parseColor(primarySeries.base);
      return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / 0.15)`;
    })(),
    colorHighlight: errorSeries.bg,
  };
}

/**
 * 暗色混合算法（Ant Design 风格）
 * 使用色板与暗色背景混合，而非 HSL 调整
 */
const DARK_MIX_BG = 'rgb(20 20 20)';
const DARK_COLOR_MAP: Array<{ index: number; amount: number }> = [
  { index: 7, amount: 15 },
  { index: 6, amount: 25 },
  { index: 5, amount: 30 },
  { index: 5, amount: 45 },
  { index: 5, amount: 65 },
  { index: 5, amount: 85 },
  { index: 4, amount: 90 },
  { index: 3, amount: 95 },
  { index: 2, amount: 97 },
  { index: 1, amount: 98 },
];

function generateDarkMixColorSeries(baseColor: string) {
  const palette = generatePalette(baseColor);
  const mixed = DARK_COLOR_MAP.map(({ index, amount }) =>
    mixColors(palette[index]!, DARK_MIX_BG, amount),
  );
  return {
    base: mixed[5]!,
    hover: mixed[4]!,
    active: mixed[6]!,
    bg: mixed[0]!,
    bgHover: mixed[1]!,
    border: mixed[2]!,
    borderHover: mixed[3]!,
    text: mixed[5]!,
    textHover: mixed[4]!,
    textActive: mixed[6]!,
  };
}

export function applyDarkMixAlgorithm(tokens: ThemeTokens): ThemeTokens {
  const primarySeries = generateDarkMixColorSeries(tokens.colorPrimary);
  const successSeries = generateDarkMixColorSeries(tokens.colorSuccess);
  const warningSeries = generateDarkMixColorSeries(tokens.colorWarning);
  const errorSeries = generateDarkMixColorSeries(tokens.colorError);
  const infoSeries = generateDarkMixColorSeries(tokens.colorInfo);

  return {
    ...tokens,
    ...getDarkNeutralOverrides(tokens),
    ...colorSeriesToOverrides('Primary', primarySeries),
    ...colorSeriesToOverrides('Success', successSeries),
    ...colorSeriesToOverrides('Warning', warningSeries),
    ...colorSeriesToOverrides('Error', errorSeries),
    ...colorSeriesToOverrides('Info', infoSeries),
    controlItemBgActive: primarySeries.bg,
    controlItemBgActiveHover: primarySeries.bgHover,
    colorLink: primarySeries.base,
    colorLinkHover: primarySeries.hover,
    colorLinkActive: primarySeries.active,
    controlOutline: (() => {
      const rgb = parseColor(primarySeries.base);
      return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / 0.15)`;
    })(),
    colorHighlight: errorSeries.bg,
  };
}

export const darkMixAlgorithm: ThemeAlgorithm = (tokens) =>
  computeTokenDiff(tokens, applyDarkMixAlgorithm(tokens));

/**
 * 应用紧凑算法（使用缩小的种子重新派生尺寸相关 Token）
 */
function applyCompactAlgorithm(tokens: ThemeTokens): ThemeTokens {
  const compactSeed: Partial<SeedTokens> = {
    sizeUnit: 2,
    sizeStep: 4,
    fontSize: 13,
    borderRadius: 4,
    controlHeight: 28,
    lineWidth: 1,
  };

  const resolvedSeed = { ...defaultSeedTokens, ...compactSeed };
  const compactMap = deriveMapTokens(resolvedSeed);
  const compactAlias = deriveAliasTokens(compactMap, resolvedSeed);

  return {
    ...tokens,
    // 从 compactAlias 取尺寸类 Token
    paddingXXS: compactAlias.paddingXXS,
    paddingXS: compactAlias.paddingXS,
    paddingSM: compactAlias.paddingSM,
    padding: compactAlias.padding,
    paddingMD: compactAlias.paddingMD,
    paddingLG: compactAlias.paddingLG,
    paddingXL: compactAlias.paddingXL,
    paddingXXL: compactAlias.paddingXXL,

    marginXXS: compactAlias.marginXXS,
    marginXS: compactAlias.marginXS,
    marginSM: compactAlias.marginSM,
    margin: compactAlias.margin,
    marginMD: compactAlias.marginMD,
    marginLG: compactAlias.marginLG,
    marginXL: compactAlias.marginXL,
    marginXXL: compactAlias.marginXXL,

    sizeXXS: compactAlias.sizeXXS,
    sizeXS: compactAlias.sizeXS,
    sizeSM: compactAlias.sizeSM,
    size: compactAlias.size,
    sizeMD: compactAlias.sizeMD,
    sizeLG: compactAlias.sizeLG,
    sizeXL: compactAlias.sizeXL,
    sizeXXL: compactAlias.sizeXXL,

    controlHeightXS: compactAlias.controlHeightXS,
    controlHeightSM: compactAlias.controlHeightSM,
    controlHeight: compactAlias.controlHeight,
    controlHeightLG: compactAlias.controlHeightLG,

    fontSizeXS: compactAlias.fontSizeXS,
    fontSizeSM: compactAlias.fontSizeSM,
    fontSize: compactAlias.fontSize,
    fontSizeMD: compactAlias.fontSizeMD,
    fontSizeLG: compactAlias.fontSizeLG,
    fontSizeXL: compactAlias.fontSizeXL,
    fontSizeXXL: compactAlias.fontSizeXXL,

    borderRadiusXS: compactAlias.borderRadiusXS,
    borderRadiusSM: compactAlias.borderRadiusSM,
    borderRadius: compactAlias.borderRadius,
    borderRadiusLG: compactAlias.borderRadiusLG,
  };
}

/**
 * 将Token转换为CSS变量对象
 * @param tokens 主题 Token 对象
 * @param prefix CSS 变量前缀，默认 'aix'
 */
export function tokensToCSSVars(
  tokens: ThemeTokens,
  prefix: string = CSS_VAR_PREFIX,
): Record<string, string> {
  const cssVars: Record<string, string> = {};

  Object.entries(tokens).forEach(([key, value]) => {
    cssVars[`--${prefix}-${key}`] =
      typeof value === 'number' ? String(value) : value;
  });

  return cssVars;
}

/**
 * 生成单个组件的 Token 覆写
 */
export function generateComponentTokenOverrides(
  componentConfig: ComponentThemeConfig,
  globalTokens: ThemeTokens,
  globalSeed: SeedTokens,
  globalAlgorithms: ThemeAlgorithm[],
): Partial<ThemeTokens> {
  if (componentConfig.algorithm && componentConfig.seed) {
    const componentSeed = { ...globalSeed, ...componentConfig.seed };
    const map = deriveMapTokens(componentSeed);
    const alias = deriveAliasTokens(map, componentSeed);
    let componentTokens: ThemeTokens = { ...map, ...alias } as ThemeTokens;
    for (const algo of globalAlgorithms) {
      componentTokens = { ...componentTokens, ...algo(componentTokens) };
    }
    if (componentConfig.token) {
      componentTokens = { ...componentTokens, ...componentConfig.token };
    }
    return computeTokenDiff(globalTokens, componentTokens);
  }
  return componentConfig.token || {};
}

/**
 * 生成所有组件的 CSS 变量覆写
 * @returns Record<componentName, Record<tokenKey, value>>
 */
export function generateAllComponentOverrides(
  components: ComponentsConfig,
  globalTokens: ThemeTokens,
  globalSeed: SeedTokens,
  globalAlgorithms: ThemeAlgorithm[],
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const [name, config] of Object.entries(components)) {
    const diff = generateComponentTokenOverrides(
      config,
      globalTokens,
      globalSeed,
      globalAlgorithms,
    );
    const keys = Object.keys(diff);
    if (keys.length === 0) continue;
    const vars: Record<string, string> = {};
    for (const key of keys) {
      const val = (diff as Record<string, unknown>)[key];
      vars[key] = typeof val === 'number' ? String(val) : String(val);
    }
    result[name] = vars;
  }
  return result;
}

/**
 * 默认主题
 */
export const defaultTheme = defineTheme({});
