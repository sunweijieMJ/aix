import fs from 'node:fs';
import path from 'node:path';
import { Eta } from 'eta';
import { findPackageRoot } from '../utils/pkg-root';
import type { GeneratedFile, GenerateOptions, ModuleId, TemplateContext } from './types';

/**
 * templates-override/ 的父目录 = 本包根目录
 *
 * 不能按 `__dirname` 上跳固定层级：源码运行（tsx）时本模块在 `src/override/`，
 * 打包后被压到 `dist/`，两者层级差一级——写死 `'..'` 在源码布局下会指到 `src/`，
 * Eta 找不到模板目录，`override add` 必崩。
 */
const PKG_ROOT = findPackageRoot(import.meta.url);

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
 * 覆盖层内核：必须由**模板真源**提供（admin 模板的 `overrides` 特性），本包不再自带拷贝
 *
 * 曾经这里有一份内核与基础设施的 eta 拷贝，用于给「还没有内核的项目」兜底。它带来的是
 * 一份必然漂移的第二真源：真源为紧耦合优化（直接 import `@/api/core/request`、
 * `@/constants/menu`、`@/layout/useLayoutContext`、`@/utils/auth`），而兜底拷贝必须自包含，
 * 于是两边逻辑越走越远（`override-store` 曾差 33 行、`initOverrides` 的签名都不一样）。
 *
 * 现在收口成单一真源：内核与基础设施一律来自模板，本包只生成「按租户的那部分骨架」。
 */
const REQUIRED_KERNEL_FILE = 'src/plugins/override/index.ts';

/** 覆盖层基础设施：与内核同理，由模板的 `overrides` 特性提供（位于 output 目录下） */
const REQUIRED_INFRA_FILES = ['types.ts', 'index.ts', 'registry.ts'];

/**
 * 检查生成骨架所需的前置文件，返回缺失的相对路径（相对 cwd）
 *
 * 骨架会 `import type { OverrideConfig } from '../types'` 和 `from '@/plugins/override'`——
 * 前置条件不满足就生成，等于产出一堆编译不过的死 import。
 */
export function findMissingPrerequisites(cwd: string, outputDir: string): string[] {
  const missing: string[] = [];
  if (!fs.existsSync(path.join(cwd, REQUIRED_KERNEL_FILE))) missing.push(REQUIRED_KERNEL_FILE);
  for (const rel of REQUIRED_INFRA_FILES) {
    const full = path.join(outputDir, rel);
    if (!fs.existsSync(full)) missing.push(path.relative(cwd, full));
  }
  return missing;
}

/**
 * 生成覆盖层文件列表（只含「按租户」的那部分：聚合入口 + 各模块骨架）
 *
 * 不写入磁盘，仅返回 { path, content } 数组，由调用方决定是否写入。
 * 内核（`src/plugins/override/`）与基础设施（`<output>/types.ts` 等）不在此生成，
 * 由模板的 `overrides` 特性提供 —— 见 REQUIRED_KERNEL_FILE 的注释。
 */
export function generateFiles(options: GenerateOptions): GeneratedFile[] {
  const { project, modules } = options;

  // 模板目录：<包根>/templates-override/overrides/（只发 TypeScript）
  const templatesDir = path.resolve(PKG_ROOT, 'templates-override', 'overrides');

  const eta = new Eta({
    views: templatesDir,
    autoEscape: false,
    autoTrim: false,
  });

  const context: TemplateContext = { project, modules };
  const files: GeneratedFile[] = [];

  // ── 项目聚合入口（根据选中模块动态 import） ──
  files.push({
    path: `${project}/index.ts`,
    content: eta.render('./project-index.ts.eta', context),
  });

  // ── 各模块模板（按选择生成） ──
  for (const mod of modules) {
    if (!MODULE_WITH_DIR.includes(mod)) continue;

    if (fs.existsSync(path.join(templatesDir, mod, 'index.ts.eta'))) {
      files.push({
        path: `${project}/${mod}/index.ts`,
        content: eta.render(`./${mod}/index.ts.eta`, context),
      });
    }
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

/**
 * 清理渲染内容：压缩连续空行为最多一个，去除首尾空行
 */
function cleanContent(content: string): string {
  return content
    .replace(/\n{3,}/g, '\n\n') // 连续 3+ 空行 → 2 行
    .replace(/^\n+/, '') // 去除开头空行
    .replace(/\n+$/, '\n'); // 结尾保留一个换行
}
