/**
 * 模板渲染器 - 使用 Eta 模板引擎
 * 支持目录结构映射：模板目录结构 = 输出目录结构
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// 初始化 Eta 实例
const eta = new Eta({
  views: TEMPLATES_DIR,
  autoEscape: false,
  autoTrim: false,
});

/**
 * 模板上下文数据
 */
export interface TemplateContext {
  componentName: string;
  pascalName: string;
  description: string;
  features: {
    i18n: boolean;
    scss: boolean;
    composables: boolean;
  };
  dependencies: string[];
}

/**
 * 文件生成配置
 */
export interface FileGeneratorOptions {
  eslint: boolean;
  stylelint: boolean;
  readme: boolean;
  stories: boolean;
  tests: boolean;
  globalTypes: boolean;
}

/**
 * 生成的文件信息
 */
export interface GeneratedFileInfo {
  path: string;
  content: string;
  type: 'config' | 'source' | 'test' | 'story' | 'docs' | 'style';
}

/**
 * 条件配置：哪些模板文件需要满足什么条件才生成
 */
const CONDITIONS: Record<
  string,
  (ctx: TemplateContext, opts: FileGeneratorOptions) => boolean
> = {
  // 源码条件
  'src/index.scss.eta': (ctx) => ctx.features.scss,
  'src/use[pascalName].ts.eta': (ctx) => ctx.features.composables,

  // locale 条件
  'src/locale/types.ts.eta': (ctx) => ctx.features.i18n,
  'src/locale/en-US.ts.eta': (ctx) => ctx.features.i18n,
  'src/locale/zh-CN.ts.eta': (ctx) => ctx.features.i18n,
  'src/locale/index.ts.eta': (ctx) => ctx.features.i18n,

  // 工具链条件
  'eslint.config.ts.eta': (_, opts) => opts.eslint,
  'stylelint.config.ts.eta': (_, opts) => opts.stylelint,

  // 文件生成条件
  '__test__/[pascalName].test.ts.eta': (_, opts) => opts.tests,
  'stories/[pascalName].stories.ts.eta': (_, opts) => opts.stories,
  'README.md.eta': (_, opts) => opts.readme,
  'typings/global.d.ts.eta': (_, opts) => opts.globalTypes,
};

/**
 * 文件类型映射
 */
function getFileType(filePath: string): GeneratedFileInfo['type'] {
  if (filePath.startsWith('__test__/')) return 'test';
  if (filePath.startsWith('stories/')) return 'story';
  if (filePath.endsWith('.md')) return 'docs';
  if (filePath.endsWith('.scss')) return 'style';
  if (
    filePath.endsWith('.json') ||
    filePath.endsWith('.js') ||
    filePath.startsWith('eslint') ||
    filePath.startsWith('stylelint')
  ) {
    return 'config';
  }
  return 'source';
}

/**
 * 递归扫描目录获取所有模板文件
 */
function scanTemplates(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanTemplates(fullPath, baseDir));
    } else if (entry.name.endsWith('.eta')) {
      // 获取相对于模板根目录的路径
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * 替换文件名中的占位符
 * [pascalName] -> 实际的 PascalCase 名称
 */
function resolveOutputPath(
  templatePath: string,
  context: TemplateContext,
): string {
  return templatePath
    .replace(/\[pascalName\]/g, context.pascalName)
    .replace(/\.eta$/, ''); // 移除 .eta 扩展名
}

/**
 * 检查模板是否应该生成
 */
function shouldGenerate(
  templatePath: string,
  context: TemplateContext,
  options: FileGeneratorOptions,
): boolean {
  const condition = CONDITIONS[templatePath];
  if (condition) {
    return condition(context, options);
  }
  // 没有条件限制的模板默认生成
  return true;
}

/**
 * 批量渲染模板
 */
export function renderTemplates(
  context: TemplateContext,
  options: FileGeneratorOptions,
): GeneratedFileInfo[] {
  const files: GeneratedFileInfo[] = [];
  const templateFiles = scanTemplates(TEMPLATES_DIR);

  for (const templatePath of templateFiles) {
    // 检查是否满足生成条件
    if (!shouldGenerate(templatePath, context, options)) {
      continue;
    }

    // 解析输出路径
    const outputPath = resolveOutputPath(templatePath, context);

    // 渲染模板
    const content = eta.render(templatePath, context);

    files.push({
      path: outputPath,
      content,
      type: getFileType(outputPath),
    });
  }

  // 按路径排序，确保输出顺序一致
  files.sort((a, b) => a.path.localeCompare(b.path));

  return files;
}
