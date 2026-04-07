/**
 * aix-theme-export CLI
 * 导出全量主题 Token 参考文件到指定目录
 *
 * 用法:
 *   npx aix-theme-export --output ./public/theme/
 *
 * 输出:
 *   theme-tokens.css       亮色模式全量变量（实际值，无 var() 引用）
 *   theme-tokens-dark.css  暗色模式覆盖变量
 *   theme-tokens.ts        TypeScript 常量（含 JSDoc 类型提示）
 *   theme-tokens.json      结构化 JSON 数据
 */

import fs from 'fs/promises';
import path from 'path';

import { applyDarkAlgorithm } from './core/define-theme';
import { defaultSeedTokens, deriveMapTokens, deriveAliasTokens } from './core/seed-derivation';
import { CSS_VAR_PREFIX } from './utils/css-var';
import { BASE_TOKEN_GROUPS, SEMANTIC_TOKEN_GROUPS } from './utils/token-metadata';
import type { BaseTokens, ThemeTokens } from './theme-types';

// ============================================================
// CLI 参数解析
// ============================================================

function printHelp() {
  console.log(`
aix-theme-export - 导出全量主题 Token 参考文件

用法:
  aix-theme-export --output <目录路径> [选项]

选项:
  --output <路径>   输出目录（必需）
  --config <路径>   自定义 seed 配置文件（JSON 格式，可选）
  --help, -h        显示帮助信息

示例:
  npx aix-theme-export --output ./public/theme/
  npx aix-theme-export --output ./public/theme/ --config ./theme-seed.json

配置文件格式 (theme-seed.json):
  {
    "colorPrimary": "rgb(22 119 255)",
    "fontSize": 16,
    "borderRadius": 8
  }

输出文件:
  theme-tokens.css       亮色模式全量变量（实际值）
  theme-tokens-dark.css  暗色模式覆盖变量
  theme-tokens.ts        TypeScript 常量（含 JSDoc）
  theme-tokens.json      结构化 JSON 数据
`);
}

function parseArgs(): { output: string; configPath?: string } {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const outputIndex = args.indexOf('--output');
  if (outputIndex === -1 || !args[outputIndex + 1]) {
    console.error('用法: aix-theme-export --output <目录路径>');
    console.error('运行 aix-theme-export --help 查看更多选项');
    process.exit(1);
  }

  const configIndex = args.indexOf('--config');
  const configPath =
    configIndex !== -1 && args[configIndex + 1] ? path.resolve(args[configIndex + 1]!) : undefined;

  return { output: path.resolve(args[outputIndex + 1]!), configPath };
}

// ============================================================
// Token 数据准备
// ============================================================

function prepareTokenData(customSeed?: Partial<typeof defaultSeedTokens>) {
  const seed = customSeed ? { ...defaultSeedTokens, ...customSeed } : defaultSeedTokens;
  const baseTokens = deriveMapTokens(seed);
  const lightSemanticTokens = deriveAliasTokens(baseTokens, seed);

  const fullLightTokens = {
    ...baseTokens,
    ...lightSemanticTokens,
  } as ThemeTokens;

  const darkTokens = applyDarkAlgorithm(fullLightTokens);

  return { baseTokens, fullLightTokens, darkTokens };
}

// ============================================================
// JSDoc 描述生成
// ============================================================

/** 语义 Token 前缀 → 中文描述 */
const SEMANTIC_PREFIXES: [string, string][] = [
  // 长前缀优先匹配
  ['controlItemBg', '控件背景'],
  ['controlHeight', '控件高度'],
  ['borderRadius', '圆角'],
  ['colorPrimary', '品牌主色'],
  ['colorSuccess', '成功色'],
  ['colorWarning', '警告色'],
  ['colorError', '错误色'],
  ['colorInfo', '信息色'],
  ['colorText', '文本色'],
  ['colorBg', '背景色'],
  ['colorFill', '填充色'],
  ['colorBorder', '边框色'],
  ['colorLink', '链接色'],
  ['colorIcon', '图标色'],
  ['colorNeutral', '中性色'],
  ['colorSplit', '分割线'],
  ['fontSize', '字号'],
  ['fontFamily', '字体族'],
  ['lineHeight', '行高'],
  ['padding', '内边距'],
  ['margin', '外边距'],
  ['shadow', '阴影'],
  ['zIndex', '层级'],
  ['size', '尺寸'],
];

/** 变体后缀 → 中文描述（长后缀优先） */
const VARIANT_SUFFIXES: [string, string][] = [
  ['ContainerDisabled', '容器禁用'],
  ['ActiveHover', '激活悬停'],
  ['BgHover', '背景悬停'],
  ['BorderHover', '边框悬停'],
  ['TextActive', '文字激活'],
  ['TextHover', '文字悬停'],
  ['Container', '容器'],
  ['Elevated', '浮层'],
  ['Spotlight', '聚光'],
  ['Description', '描述'],
  ['Placeholder', '占位'],
  ['PopupBase', '弹出基础'],
  ['ModalMask', '弹窗遮罩'],
  ['Secondary', '次级'],
  ['Tertiary', '三级'],
  ['Quaternary', '四级'],
  ['Disabled', '禁用'],
  ['Dropdown', '下拉'],
  ['Heading', '标题'],
  ['Content', '内容'],
  ['Layout', '布局'],
  ['Border', '边框'],
  ['Hover', '悬停'],
  ['Active', '激活'],
  ['Light', '浅色'],
  ['Alter', '交替'],
  ['Mask', '遮罩'],
  ['Message', '消息'],
  ['Text', '文字'],
  ['Base', '基准'],
  ['Code', '等宽'],
  ['Bg', '背景'],
];

/** 尺寸后缀 → 中文描述 */
const SIZE_MAP: Record<string, string> = {
  XXS: '极小',
  XS: '超小',
  SM: '小',
  MD: '中',
  LG: '大',
  XL: '超大',
  XXL: '极大',
};

function getTokenJSDoc(key: string): string {
  // 色盘 token: tokenCyan1 → "Cyan 1"
  const paletteMatch = key.match(/^token(Cyan|Blue|Purple|Green|Red|Orange|Gold|Gray)(\d+)$/);
  if (paletteMatch) return `${paletteMatch[1]} ${paletteMatch[2]}`;

  // 基础 token（带数字后缀）: tokenSpacing4 → "基础间距 4"
  if (key.startsWith('token')) {
    const numMatch = key.match(/(\d+)$/);
    if (numMatch) {
      const name = key.slice(5, -numMatch[1]!.length); // 去掉 token 前缀和数字
      const nameMap: Record<string, string> = {
        Spacing: '基础间距',
        FontSize: '基础字号',
        LineHeight: '基础行高',
        BorderRadius: '基础圆角',
        ControlHeight: '基础控件高度',
        Shadow: '基础阴影',
      };
      return `${nameMap[name] || name} ${numMatch[1]}`;
    }
    // 特殊基础 token
    if (key === 'tokenFontFamily') return '系统字体族';
    if (key === 'tokenFontFamilyCode') return '等宽字体族';
    if (key.startsWith('tokenZIndex')) return `基础层级 ${key.slice(11)}`;
    return key;
  }

  // 语义 token：前缀匹配 + 后缀解析
  for (const [prefix, desc] of SEMANTIC_PREFIXES) {
    if (!key.startsWith(prefix)) continue;

    const rest = key.slice(prefix.length);
    if (!rest) return desc;

    // 数字后缀: colorNeutral5 → "中性色 5"
    if (/^\d+$/.test(rest)) return `${desc} ${rest}`;

    // 尺寸后缀: paddingXS → "内边距 超小"
    if (SIZE_MAP[rest]) return `${desc} ${SIZE_MAP[rest]}`;

    // 变体后缀: colorPrimaryHover → "品牌主色 - 悬停"
    for (const [suffix, variantDesc] of VARIANT_SUFFIXES) {
      if (rest === suffix) return `${desc} - ${variantDesc}`;
    }

    return `${desc} ${rest}`;
  }

  return key;
}

// ============================================================
// 格式化工具
// ============================================================

const P = CSS_VAR_PREFIX;

function fmtVal(value: string | number): string {
  return typeof value === 'number' ? String(value) : value;
}

// ============================================================
// CSS 生成
// ============================================================

function generateLightCSS(baseTokens: BaseTokens, fullLightTokens: ThemeTokens): string {
  const lines: string[] = [
    '/**',
    ' * AIX 主题 Token - 亮色模式（全量解析值）',
    ` * CSS 变量前缀: --${P}-`,
    ' *',
    ' * @generated - 由 aix-theme-export 自动生成，请勿手动修改',
    ' */',
    '',
    ':root {',
  ];

  for (const [groupName, tokenKeys] of Object.entries(BASE_TOKEN_GROUPS)) {
    lines.push(`  /* ========== ${groupName} ========== */`);
    for (const key of tokenKeys) {
      const value = baseTokens[key as keyof typeof baseTokens];
      if (value !== undefined) {
        lines.push(`  --${P}-${key}: ${fmtVal(value)};`);
      }
    }
    lines.push('');
  }

  for (const [groupName, tokenKeys] of Object.entries(SEMANTIC_TOKEN_GROUPS)) {
    lines.push(`  /* ========== ${groupName} ========== */`);
    for (const key of tokenKeys) {
      const value = fullLightTokens[key as keyof ThemeTokens];
      if (value !== undefined) {
        lines.push(`  --${P}-${key}: ${fmtVal(value)};`);
      }
    }
    lines.push('');
  }

  if (lines[lines.length - 1] === '') lines.pop();
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function generateDarkCSS(fullLightTokens: ThemeTokens, darkTokens: ThemeTokens): string {
  const lines: string[] = [
    '/**',
    ' * AIX 主题 Token - 暗色模式覆盖',
    ' *',
    ' * @generated - 由 aix-theme-export 自动生成，请勿手动修改',
    ' */',
    '',
    ":root[data-theme='dark'],",
    '.dark {',
  ];

  for (const [groupName, tokenKeys] of Object.entries(SEMANTIC_TOKEN_GROUPS)) {
    const changed: string[] = [];
    for (const key of tokenKeys) {
      const darkValue = darkTokens[key as keyof ThemeTokens];
      const lightValue = fullLightTokens[key as keyof ThemeTokens];
      const alwaysOutput = key.startsWith('colorNeutral');
      if (darkValue !== undefined && (darkValue !== lightValue || alwaysOutput)) {
        changed.push(`  --${P}-${key}: ${fmtVal(darkValue)};`);
      }
    }
    if (changed.length > 0) {
      lines.push(`  /* ========== ${groupName} (暗色模式) ========== */`);
      lines.push(...changed);
      lines.push('');
    }
  }

  if (lines[lines.length - 1] === '') lines.pop();
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ============================================================
// JSON 生成
// ============================================================

function generateJSON(
  baseTokens: BaseTokens,
  fullLightTokens: ThemeTokens,
  darkTokens: ThemeTokens,
): string {
  const buildGroup = (
    groups: Record<string, readonly string[]>,
    source: Record<string, string | number>,
  ) => {
    const result: Record<string, Record<string, string | number>> = {};
    for (const [groupName, tokenKeys] of Object.entries(groups)) {
      const vars: Record<string, string | number> = {};
      for (const key of tokenKeys) {
        const value = source[key as keyof typeof source];
        if (value !== undefined) {
          vars[`--${P}-${key}`] = value;
        }
      }
      if (Object.keys(vars).length > 0) {
        result[groupName] = vars;
      }
    }
    return result;
  };

  const json = {
    $description:
      '全量 CSS 变量参考（自动生成）。运行 npx aix-theme-export --output <dir> 重新生成。',
    $prefix: P,
    base: buildGroup(BASE_TOKEN_GROUPS, baseTokens as unknown as Record<string, string | number>),
    light: buildGroup(
      SEMANTIC_TOKEN_GROUPS,
      fullLightTokens as unknown as Record<string, string | number>,
    ),
    dark: buildGroup(
      SEMANTIC_TOKEN_GROUPS,
      darkTokens as unknown as Record<string, string | number>,
    ),
  };

  return JSON.stringify(json, null, 2) + '\n';
}

// ============================================================
// TypeScript 生成
// ============================================================

function generateTS(
  baseTokens: BaseTokens,
  fullLightTokens: ThemeTokens,
  darkTokens: ThemeTokens,
): string {
  const lines: string[] = [
    '/**',
    ' * AIX 主题 Token 全量参考',
    ` * CSS 变量前缀: --${P}-`,
    ' *',
    ' * @generated - 由 aix-theme-export 自动生成，请勿手动修改',
    ' */',
    '',
    `/** CSS 变量前缀 */`,
    `export const cssVarPrefix = '${P}' as const;`,
    '',
    '/** 亮色模式全量 Token（base + semantic） */',
    'export const lightTokens = {',
  ];

  const addTokens = (
    groupName: string,
    tokenKeys: readonly string[],
    source: Record<string, string | number>,
  ) => {
    lines.push(`  // ========== ${groupName} ==========`);
    for (const key of tokenKeys) {
      const value = source[key];
      if (value !== undefined) {
        const desc = getTokenJSDoc(key);
        const formatted =
          typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "\\'")}'`;
        lines.push(`  /** ${desc} */`);
        lines.push(`  '${key}': ${formatted},`);
      }
    }
    lines.push('');
  };

  for (const [groupName, tokenKeys] of Object.entries(BASE_TOKEN_GROUPS)) {
    addTokens(groupName, tokenKeys, baseTokens as unknown as Record<string, string | number>);
  }
  for (const [groupName, tokenKeys] of Object.entries(SEMANTIC_TOKEN_GROUPS)) {
    addTokens(groupName, tokenKeys, fullLightTokens as unknown as Record<string, string | number>);
  }

  if (lines[lines.length - 1] === '') lines.pop();
  lines.push('} as const;');
  lines.push('');

  // Dark tokens
  lines.push('/** 暗色模式覆盖 Token */');
  lines.push('export const darkTokens = {');
  for (const [groupName, tokenKeys] of Object.entries(SEMANTIC_TOKEN_GROUPS)) {
    const changed: Array<{ key: string; value: string | number }> = [];
    for (const key of tokenKeys) {
      const darkValue = darkTokens[key as keyof ThemeTokens];
      const lightValue = fullLightTokens[key as keyof ThemeTokens];
      const alwaysOutput = key.startsWith('colorNeutral');
      if (darkValue !== undefined && (darkValue !== lightValue || alwaysOutput)) {
        changed.push({ key, value: darkValue });
      }
    }
    if (changed.length > 0) {
      lines.push(`  // ========== ${groupName} (暗色模式) ==========`);
      for (const { key, value } of changed) {
        const desc = getTokenJSDoc(key);
        const formatted =
          typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "\\'")}'`;
        lines.push(`  /** ${desc} */`);
        lines.push(`  '${key}': ${formatted},`);
      }
      lines.push('');
    }
  }
  if (lines[lines.length - 1] === '') lines.pop();
  lines.push('} as const;');
  lines.push('');

  // Type exports
  lines.push('/** 全量 Token 键名 */');
  lines.push('export type TokenKey = keyof typeof lightTokens;');
  lines.push('');
  lines.push('/** 暗色模式覆盖的 Token 键名 */');
  lines.push('export type DarkTokenKey = keyof typeof darkTokens;');
  lines.push('');

  return lines.join('\n');
}

// ============================================================
// Main
// ============================================================

async function main() {
  const { output, configPath } = parseArgs();

  let customSeed: Partial<typeof defaultSeedTokens> | undefined;
  if (configPath) {
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      customSeed = JSON.parse(configContent);
      console.log(`\n📋 使用自定义配置: ${configPath}`);
    } catch (e) {
      console.error(`错误: 无法读取配置文件 ${configPath}`);
      console.error((e as Error).message);
      process.exit(1);
    }
  }

  console.log(`\n🎨 导出主题 Token 到 ${output}`);

  const { baseTokens, fullLightTokens, darkTokens } = prepareTokenData(customSeed);

  await fs.mkdir(output, { recursive: true });

  const files = [
    {
      name: 'theme-tokens.css',
      content: generateLightCSS(baseTokens, fullLightTokens),
    },
    {
      name: 'theme-tokens-dark.css',
      content: generateDarkCSS(fullLightTokens, darkTokens),
    },
    {
      name: 'theme-tokens.ts',
      content: generateTS(baseTokens, fullLightTokens, darkTokens),
    },
    {
      name: 'theme-tokens.json',
      content: generateJSON(baseTokens, fullLightTokens, darkTokens),
    },
  ];

  for (const file of files) {
    await fs.writeFile(path.join(output, file.name), file.content, 'utf-8');
    console.log(`  ✓ ${file.name}`);
  }

  console.log(`\n✅ 导出完成\n`);
}

main().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
