import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { GeneratedFile, GenerateOptions, ModuleId, TemplateContext } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 需要独立模板目录的模块 */
const MODULE_WITH_DIR: ModuleId[] = [
  'api',
  'components',
  'constants',
  'directives',
  'layout',
  'locale',
  'router',
  'store',
];

/**
 * 生成覆盖层文件列表
 *
 * 不写入磁盘，仅返回 { path, content } 数组，由调用方决定是否写入。
 */
export function generateFiles(options: GenerateOptions): GeneratedFile[] {
  const { project, lang, modules, output: _output } = options;
  const ext = lang;

  // 模板目录：templates/{lang}/overrides/
  const templatesDir = path.resolve(__dirname, '..', 'templates', lang, 'overrides');

  const eta = new Eta({
    views: templatesDir,
    autoEscape: false,
    autoTrim: false,
  });

  const context: TemplateContext = { project, modules, lang, ext };
  const files: GeneratedFile[] = [];

  // ── 基础设施文件（始终生成） ──
  files.push({
    path: `types.${ext}`,
    content: eta.render(`./types.${ext}.eta`, context),
  });
  files.push({
    path: `index.${ext}`,
    content: eta.render(`./index.${ext}.eta`, context),
  });
  files.push({
    path: `registry.${ext}`,
    content: eta.render(`./registry.${ext}.eta`, context),
  });

  // ── 项目聚合入口（根据选中模块动态 import） ──
  files.push({
    path: `${project}/index.${ext}`,
    content: eta.render(`./project-index.${ext}.eta`, context),
  });

  // ── 各模块模板（按选择生成） ──
  for (const mod of modules) {
    if (!MODULE_WITH_DIR.includes(mod)) continue;

    const templatePath = `./${mod}/index.${ext}.eta`;
    if (fs.existsSync(path.join(templatesDir, mod, `index.${ext}.eta`))) {
      files.push({
        path: `${project}/${mod}/index.${ext}`,
        content: eta.render(templatePath, context),
      });
    }
  }

  // ── locale 额外文件 ──
  if (modules.includes('locale')) {
    files.push({
      path: `${project}/locale/zh-CN.json`,
      content: '{}',
    });
    files.push({
      path: `${project}/locale/en-US.json`,
      content: '{}',
    });
  }

  // ── views 空目录 ──
  if (modules.includes('views')) {
    files.push({
      path: `${project}/views/.gitkeep`,
      content: '',
    });
  }

  // 清理模板渲染产生的多余空行
  for (const file of files) {
    if (file.content !== null) {
      file.content = cleanContent(file.content);
    }
  }

  return files;
}

/** utils/override 目录下需要生成的文件基础名（不含扩展名） */
const OVERRIDE_UTIL_BASES = [
  'index',
  'overrideRouter',
  'overrideComponent',
  'overrideConstants',
  'overrideStore',
  'overrideApi',
  'overrideDirectives',
  'overrideLayout',
];

/**
 * 生成 src/utils/override/ 下的核心工具文件
 *
 * 调用方负责过滤已存在的文件。
 *
 * @returns 文件列表，path 相对于 src/utils/override/
 */
export function generateOverrideUtils(lang: 'ts' | 'js' = 'ts'): GeneratedFile[] {
  const utilsTemplatesDir = path.resolve(__dirname, '..', 'templates', lang, 'utils', 'override');

  if (!fs.existsSync(utilsTemplatesDir)) return [];

  const eta = new Eta({
    views: utilsTemplatesDir,
    autoEscape: false,
    autoTrim: false,
  });

  const files: GeneratedFile[] = [];

  for (const base of OVERRIDE_UTIL_BASES) {
    const fileName = `${base}.${lang}`;
    const templateFile = `${fileName}.eta`;
    if (!fs.existsSync(path.join(utilsTemplatesDir, templateFile))) continue;

    files.push({
      path: fileName,
      content: cleanContent(eta.render(`./${templateFile}`, {})),
    });
  }

  return files;
}

/**
 * 清理渲染内容：压缩连续空行为最多一个，去除首尾空行
 */
function cleanContent(content: string): string {
  return content
    .replace(/\n{3,}/g, '\n\n') // 连续 3+ 空行 → 2 行
    .replace(/^\n+/, '') // 去除开头空行
    .replace(/\n+$/, '\n'); // 结尾保留一个换行
}
