/**
 * 构建时主题 CSS 生成
 *
 * 从 seed 派生整套主题 token 并渲染为 CSS 字符串：亮色全量输出到 lightSelector，
 * 暗色仅输出与亮色不同的变量（diff）到 darkSelector。
 * 这是「构建时生成品牌主题 CSS」的规范入口，供业务仓库构建脚本与 CLI 复用，
 * 避免各处手写 派生→diff→渲染 流水线。
 */
import { CSS_VAR_PREFIX } from '../utils/css-var';
import { applyDarkAlgorithm, tokensToCSSVars } from './define-theme';
import {
  DEFAULT_PRESET_COLORS,
  defaultSeedTokens,
  derivePresetColorTokens,
  deriveThemeTokens,
} from './seed-derivation';
import type { SeedTokens, ThemeTokens } from '../theme-types';

export interface GenerateThemeCSSOptions {
  /** 种子覆写，与 defaultSeedTokens 合并。默认 {} */
  seed?: Partial<SeedTokens>;
  /** CSS 变量前缀，默认 'aix' */
  prefix?: string;
  /** 亮色选择器，默认 ':root' */
  lightSelector?: string;
  /** 暗色选择器，默认 ":root[data-theme='dark'],\n.dark" */
  darkSelector?: string;
  /** 是否输出暗色块（仅输出与亮色不同的 diff），默认 true */
  includeDark?: boolean;
  /** 是否包含预设色板 token（colorPreset*），默认 true */
  includePresetColors?: boolean;
}

const DEFAULT_DARK_SELECTOR = ":root[data-theme='dark'],\n.dark";

function renderBlock(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `${selector} {\n${body}\n}`;
}

export function generateThemeCSS(options: GenerateThemeCSSOptions = {}): string {
  const {
    seed,
    prefix = CSS_VAR_PREFIX,
    lightSelector = ':root',
    darkSelector = DEFAULT_DARK_SELECTOR,
    includeDark = true,
    includePresetColors = true,
  } = options;

  const resolvedSeed: SeedTokens = { ...defaultSeedTokens, ...seed };

  // 亮色：map + alias，可选并入预设色板（预设色板与模式无关，仅亮色块输出）
  const lightTokens = deriveThemeTokens(resolvedSeed);
  const lightFull: ThemeTokens = includePresetColors
    ? ({
        ...lightTokens,
        ...derivePresetColorTokens(resolvedSeed.presetColors ?? DEFAULT_PRESET_COLORS),
      } as ThemeTokens)
    : lightTokens;

  // 暗色：仅对 map+alias 应用暗色算法（预设色板不变，不参与暗色 diff）
  const darkTokens = applyDarkAlgorithm(lightTokens);

  const lightVars = tokensToCSSVars(lightFull, prefix);
  const blocks: string[] = [renderBlock(lightSelector, lightVars)];

  if (includeDark) {
    const darkVars = tokensToCSSVars(darkTokens, prefix);
    const darkDiff: Record<string, string> = {};
    for (const [name, value] of Object.entries(darkVars)) {
      if (value !== lightVars[name]) darkDiff[name] = value;
    }
    if (Object.keys(darkDiff).length > 0) blocks.push(renderBlock(darkSelector, darkDiff));
  }

  return `${blocks.join('\n\n')}\n`;
}
