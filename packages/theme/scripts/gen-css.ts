/**
 * CSS 变量自动生成脚本
 * 从 TypeScript Token 定义生成 CSS 变量文件
 *
 * 用法:
 *   pnpm gen:css          # 生成 CSS 文件
 */

import fs from 'fs/promises';
import path from 'path';
import prettier from 'prettier';
import { fileURLToPath } from 'url';

import { applyDarkAlgorithm } from '../src/core/define-theme';
import {
  DEFAULT_PRESET_COLORS,
  defaultSeedTokens,
  deriveMapTokens,
  deriveAliasTokens,
  derivePresetColorTokens,
} from '../src/core/seed-derivation';
import { CSS_VAR_PREFIX } from '../src/utils/css-var';
import {
  BASE_TOKEN_GROUPS,
  SEMANTIC_TOKEN_GROUPS,
  SEMANTIC_VAR_REFS,
  generatePresetColorGroups,
} from '../src/utils/token-metadata';
import type { ThemeTokens } from '../src/theme-types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../src/vars');

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * CSS 生成器类
 */
class ThemeCSSGenerator {
  private baseTokens: ReturnType<typeof deriveMapTokens>;
  private lightSemanticTokens: ReturnType<typeof deriveAliasTokens>;
  private presetColorTokens: Record<string, string>;
  private darkTokens: ThemeTokens;
  private useWhere: boolean;

  constructor(useWhere: boolean = false) {
    this.useWhere = useWhere;
    const seed = defaultSeedTokens;
    const map = deriveMapTokens(seed);
    this.baseTokens = map;
    this.lightSemanticTokens = deriveAliasTokens(map, seed);
    this.presetColorTokens = derivePresetColorTokens(seed.presetColors ?? DEFAULT_PRESET_COLORS);

    const fullLightTokens = {
      ...map,
      ...this.lightSemanticTokens,
    } as ThemeTokens;
    this.darkTokens = applyDarkAlgorithm(fullLightTokens);
  }

  /**
   * 包裹选择器（:where() 兼容模式）
   */
  private wrapSelector(selector: string): string {
    return this.useWhere ? `:where(${selector})` : selector;
  }

  /**
   * 生成分组注释
   */
  private generateGroupComment(name: string): string {
    return `  /* ========== ${name} ========== */`;
  }

  /**
   * 格式化 CSS 值
   */
  private formatValue(value: string | number): string {
    return typeof value === 'number' ? String(value) : value;
  }

  /**
   * 生成 CSS 变量声明
   */
  private generateVarDeclaration(key: string, value: string | number): string {
    return `  --${CSS_VAR_PREFIX}-${key}: ${this.formatValue(value)};`;
  }

  /**
   * 生成 base-tokens.css
   */
  generateBaseTokens(): string {
    const rootSelector = this.wrapSelector(':root');
    const lines: string[] = [
      '/**',
      ' * 基础Token - 原子级设计变量',
      ' * 这些是最底层的设计原子，不应该直接在组件中使用',
      ' *',
      ' * @generated - 此文件由脚本自动生成，请勿手动修改',
      ' * 如需修改 Token，请编辑 src/define-theme.ts 后运行 pnpm gen:css',
      ' */',
      '',
      `${rootSelector} {`,
    ];

    // 按分组生成 CSS
    for (const [groupName, tokenKeys] of Object.entries(BASE_TOKEN_GROUPS)) {
      lines.push(this.generateGroupComment(groupName));

      for (const key of tokenKeys) {
        const value = this.baseTokens[key as keyof typeof this.baseTokens];
        if (value !== undefined) {
          lines.push(this.generateVarDeclaration(key, value));
        }
      }

      lines.push('');
    }

    // 预设色板
    const presetGroups = generatePresetColorGroups(
      defaultSeedTokens.presetColors ?? DEFAULT_PRESET_COLORS,
    );
    for (const [groupName, tokenKeys] of Object.entries(presetGroups)) {
      lines.push(this.generateGroupComment(groupName));

      for (const key of tokenKeys) {
        const value = this.presetColorTokens[key];
        if (value !== undefined) {
          lines.push(this.generateVarDeclaration(key, value));
        }
      }

      lines.push('');
    }

    // 移除最后的空行，添加闭合括号
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 生成 semantic-tokens-light.css
   */
  generateSemanticTokensLight(): string {
    const rootSelector = this.wrapSelector(':root');
    const lines: string[] = [
      '/**',
      ' * 语义Token - 亮色模式',
      ' * 这些是语义级变量，映射自基础Token，组件应该使用这些变量',
      ' *',
      ' * @generated - 此文件由脚本自动生成，请勿手动修改',
      ' * 如需修改 Token，请编辑 src/define-theme.ts 后运行 pnpm gen:css',
      ' */',
      '',
      `${rootSelector} {`,
    ];

    // 按分组生成 CSS
    for (const [groupName, tokenKeys] of Object.entries(SEMANTIC_TOKEN_GROUPS)) {
      lines.push(this.generateGroupComment(groupName));

      for (const key of tokenKeys) {
        const value = this.lightSemanticTokens[key as keyof typeof this.lightSemanticTokens];
        if (value !== undefined) {
          // 检查是否应该使用 var() 引用
          const refToken = SEMANTIC_VAR_REFS[key];
          if (refToken) {
            lines.push(`  --${CSS_VAR_PREFIX}-${key}: var(--${CSS_VAR_PREFIX}-${refToken});`);
          } else {
            lines.push(this.generateVarDeclaration(key, value));
          }
        }
      }

      lines.push('');
    }

    // 移除最后的空行，添加闭合括号
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 生成 semantic-tokens-dark.css
   */
  generateSemanticTokensDark(): string {
    const darkRootSelector = this.wrapSelector(":root[data-theme='dark']");
    const darkClassSelector = this.wrapSelector('.dark');
    const lines: string[] = [
      '/**',
      ' * 语义Token - 暗色模式',
      ' * 覆盖亮色模式的语义变量',
      ' *',
      ' * @generated - 此文件由脚本自动生成，请勿手动修改',
      ' * 如需修改 Token，请编辑 src/define-theme.ts 后运行 pnpm gen:css',
      ' */',
      '',
      `${darkRootSelector},`,
      `${darkClassSelector} {`,
    ];

    // 获取亮色模式的完整 Token 用于比较
    const fullLightTokens = {
      ...this.baseTokens,
      ...this.lightSemanticTokens,
    } as ThemeTokens;

    // 按分组生成 CSS（只生成与亮色不同的值）
    for (const [groupName, tokenKeys] of Object.entries(SEMANTIC_TOKEN_GROUPS)) {
      const changedTokens: string[] = [];

      for (const key of tokenKeys) {
        const darkValue = this.darkTokens[key as keyof ThemeTokens];
        const lightValue = fullLightTokens[key as keyof ThemeTokens];

        // colorNeutral 系列始终输出（保持暗色模式的完整性和语义一致性）
        // 即使某些值碰巧与亮色模式相同（如 colorNeutral7）
        const alwaysOutput = key.startsWith('colorNeutral');

        // 输出与亮色模式不同的值，或 colorNeutral 系列
        if (darkValue !== undefined && (darkValue !== lightValue || alwaysOutput)) {
          changedTokens.push(this.generateVarDeclaration(key, darkValue));
        }
      }

      // 只有当分组有变化时才添加分组注释
      if (changedTokens.length > 0) {
        lines.push(this.generateGroupComment(`${groupName} (暗色模式)`));
        lines.push(...changedTokens);
        lines.push('');
      }
    }

    // 移除最后的空行，添加闭合括号
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 生成 index.css
   */
  generateIndexCSS(): string {
    const suffix = this.useWhere ? '.compat' : '';
    return `/**
 * 主题变量入口文件${this.useWhere ? '（:where() 兼容模式）' : ''}
 * 使用 CSS Cascade Layers 明确优先级
 *
 * @generated - Token CSS 文件由脚本自动生成
 * 如需修改 Token，请编辑 src/define-theme.ts 后运行 pnpm gen:css
 * transition.css 为手动维护，不会被覆盖
 */

/* 定义层级顺序：base < semantic-light < semantic-dark */
@layer theme.base, theme.semantic-light, theme.semantic-dark;

/* 导入并分配到对应的 layer */
@import './base-tokens${suffix}.css' layer(theme.base);
@import './semantic-tokens-light${suffix}.css' layer(theme.semantic-light);
@import './semantic-tokens-dark${suffix}.css' layer(theme.semantic-dark);

/* 过渡动画样式（手动维护） */
@import './transition.css';
`;
  }
}

/**
 * 生成所有 CSS 文件
 */
async function generateAllCSS(): Promise<void> {
  const startTime = Date.now();
  log('\n🎨 生成 CSS 变量文件...', 'blue');

  const generator = new ThemeCSSGenerator(false);
  const compatGenerator = new ThemeCSSGenerator(true);

  // 确保输出目录存在
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // 生成标准版 + compat 版
  const files = [
    // 标准版
    { name: 'base-tokens.css', content: generator.generateBaseTokens() },
    {
      name: 'semantic-tokens-light.css',
      content: generator.generateSemanticTokensLight(),
    },
    {
      name: 'semantic-tokens-dark.css',
      content: generator.generateSemanticTokensDark(),
    },
    { name: 'index.css', content: generator.generateIndexCSS() },
    // compat 版（:where() 包裹）
    {
      name: 'base-tokens.compat.css',
      content: compatGenerator.generateBaseTokens(),
    },
    {
      name: 'semantic-tokens-light.compat.css',
      content: compatGenerator.generateSemanticTokensLight(),
    },
    {
      name: 'semantic-tokens-dark.compat.css',
      content: compatGenerator.generateSemanticTokensDark(),
    },
    {
      name: 'index.compat.css',
      content: compatGenerator.generateIndexCSS(),
    },
  ];

  const prettierConfig = await prettier.resolveConfig(OUTPUT_DIR);

  for (const file of files) {
    const filePath = path.join(OUTPUT_DIR, file.name);
    const formatted = await prettier.format(file.content, {
      ...prettierConfig,
      parser: 'css',
    });
    await fs.writeFile(filePath, formatted, 'utf-8');
    log(`  ✓ ${file.name}`, 'green');
  }

  const elapsed = Date.now() - startTime;
  log(`\n✅ CSS 文件生成完成 (${elapsed}ms)\n`, 'green');
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  await generateAllCSS();
}

main().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
