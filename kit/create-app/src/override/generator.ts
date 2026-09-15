import fs from 'node:fs';
import path from 'node:path';
import { Eta } from 'eta';
import { findPackageRoot } from '../utils/pkg-root';
import { MODULE_REGISTRY } from './types';
import type { GeneratedFile, GenerateOptions, TemplateContext } from './types';

/**
 * templates-override/ 的父目录 = 本包根目录
 *
 * 不能按 `__dirname` 上跳固定层级：源码运行（tsx）时本模块在 `src/override/`，
 * 打包后被压到 `dist/`，两者层级差一级——写死 `'..'` 在源码布局下会指到 `src/`，
 * Eta 找不到模板目录，`override add` 必崩。
 */
const PKG_ROOT = findPackageRoot(import.meta.url);

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
export const OVERRIDE_KERNEL_FILE = 'src/plugins/override/index.ts';

/**
 * 覆盖层基础设施：与内核同理，由模板的 `overrides` 特性提供（位于 output 目录下）
 *
 * - `index.ts`：glob 租户 `index.ts`（运行时维度 + router），并导出装配函数 `setupOverrides()`
 * - `constants.ts`：glob 租户 `constants.ts`（常量维度，`@/constants` 在模块加载期消费）
 * - `registry.ts`：Cookie → 学校代码
 */
export const OVERRIDE_INFRA_FILES = ['index.ts', 'constants.ts', 'registry.ts'];

/**
 * 检查生成骨架所需的前置文件，返回缺失的相对路径（相对 cwd）
 *
 * 骨架的类型来自 `@/plugins/override`，装载依赖基础设施的两条 glob——
 * 前置条件不满足就生成，等于产出一堆装不上的死文件。
 */
export function findMissingPrerequisites(cwd: string, outputDir: string): string[] {
  const missing: string[] = [];
  if (!fs.existsSync(path.join(cwd, OVERRIDE_KERNEL_FILE))) missing.push(OVERRIDE_KERNEL_FILE);
  for (const rel of OVERRIDE_INFRA_FILES) {
    const full = path.join(outputDir, rel);
    if (!fs.existsSync(full)) missing.push(path.relative(cwd, full));
  }
  return missing;
}

/** 会以 `./<id>` 形式被租户 index.ts 引用的模块（`views` 只是目录，`constants` 渲染成单文件） */
const IMPORTED_MODULE_DIRS: string[] = Object.entries(MODULE_REGISTRY)
  .filter(([, def]) => def.hasDir && !def.file)
  .map(([id]) => id);

/**
 * 盘上存在、却没有被租户 `index.ts` 引用的模块目录
 *
 * 缩减模块集（`-m` 给的比上次少）时旧目录不会被删——里面是用户自己的代码；而基础设施
 * glob 的是 `<output>/*\/index.ts`（只到租户层），落不到模块层，没被 index.ts 引用即无人加载。
 *
 * 判据取**盘上那份 index.ts 的实际 import**，不是本次声明的模块集：不带 `--force` 时
 * 已存在的 index.ts 会被跳过、仍然引用着旧模块，按声明集判会报出一批其实还在用的目录。
 * 只认注册表里的模块名，用户自建的目录（`assets` 之类）不在判定范围内。
 */
export function findOrphanModuleDirs(outputDir: string, project: string): string[] {
  const tenantDir = path.join(outputDir, project);

  let index: string;
  let entries: fs.Dirent[];
  try {
    index = fs.readFileSync(path.join(tenantDir, 'index.ts'), 'utf-8');
    entries = fs.readdirSync(tenantDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const onDisk = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  return IMPORTED_MODULE_DIRS.filter(
    (id) => onDisk.has(id) && !index.includes(`from './${id}'`),
  ).sort();
}

/**
 * 生成覆盖层文件列表（只含「按租户」的那部分：聚合入口 + 各模块骨架）
 *
 * 不写入磁盘，仅返回 { path, content } 数组，由调用方决定是否写入。
 * 内核（`src/plugins/override/`）与基础设施（`<output>/index.ts` 等）不在此生成，
 * 由模板的 `overrides` 特性提供 —— 见 OVERRIDE_KERNEL_FILE 的注释。
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
    // 没有独立 eta 目录的模块（views）不在这里出文件；用 `?.` 兜住外部直接调用
    // generateFiles 传进来的未知模块名（CLI 侧已校验过，这里只防公共 API 的误用）
    if (!MODULE_REGISTRY[mod]?.hasDir) continue;

    if (fs.existsSync(path.join(templatesDir, mod, 'index.ts.eta'))) {
      files.push({
        path: `${project}/${MODULE_REGISTRY[mod].file ?? `${mod}/index.ts`}`,
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
