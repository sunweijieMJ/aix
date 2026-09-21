import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { TemplateConfig } from '../types';
import { CreateAppError } from '../utils/errors';
import { normalizeManifestPath } from './manifest-path';

/**
 * 模板清单体检：Zod 只保证清单的形状对，保证不了它指的东西存在
 *
 * 分级依据「写错了会不会产出坏项目」：
 * - `features.dirs/files` 路径不存在 → 硬失败，等同于这条裁剪声明不存在
 * - 路径存在但未被 git 跟踪 → 警告（见 checkGitTracked）
 * - `deps/devDeps/scripts` 不在 package.json → 警告，多写一条只是无操作
 * - `exclude` 路径不存在 → 不报，`.env` 这类是有意的防御性声明
 */
export function lintManifest(templateDir: string, manifest: TemplateConfig): string[] {
  const warnings: string[] = [];
  const stale: string[] = [];
  const tracked = listTrackedFiles(templateDir);

  for (const [featureId, def] of Object.entries(manifest.features)) {
    for (const rel of [...(def.dirs ?? []), ...(def.files ?? [])]) {
      if (!existsExact(templateDir, normalizeManifestPath(rel), tracked)) {
        stale.push(`  features.${featureId}: ${rel}`);
      }
    }
  }

  if (stale.length > 0) {
    throw new CreateAppError(
      'E_STALE_MANIFEST_PATH',
      `模板清单声明的路径在模板中不存在:\n${stale.join('\n')}`,
      '真源可能已改名或删除了这些路径，请更新 .template/config.ts 的 features.dirs / files',
    );
  }

  warnings.push(...checkPackageJsonRefs(templateDir, manifest));
  warnings.push(...checkGitTracked(tracked, manifest));
  return warnings;
}

/**
 * 路径存在性判定：**大小写精确**，不能用 existsSync
 *
 * macOS / Windows 的文件系统大小写不敏感：清单写 `src/Extra`、真源里是 `src/extra` 时
 * existsSync 会说存在，体检放行；而 composer 的裁剪是纯字符串前缀比对，`src/Extra`
 * 对 `src/extra/...` 永不命中——又一次「体检绿、裁剪静默失效」。而且 CI 上的 Linux
 * 会在同一份清单上硬失败，本机复现不出来。
 *
 * 先与 `git ls-files` 精确比对（真源本地路径源的常规形态，一次 spawn 覆盖全部声明）；
 * 未被跟踪的路径不能就此判为不存在——「工作区有、git 里没有」是 checkGitTracked 的
 * 警告级情形，降级到逐段 readdirSync 精确匹配（也是 git 源克隆后 .git 已删时的唯一通路）。
 */
function existsExact(templateDir: string, rel: string, tracked: string[] | null): boolean {
  if (tracked?.some((f) => f === rel || f.startsWith(rel + '/'))) return true;

  let current = templateDir;
  for (const segment of rel.split('/')) {
    if (segment === '') continue;
    let entries: string[];
    try {
      entries = fs.readdirSync(current);
    } catch {
      return false; // 中途某段不是目录 / 不可读
    }
    if (!entries.includes(segment)) return false;
    current = path.join(current, segment);
  }
  return true;
}

/** `git ls-files` 的结果；null = 模板目录不是 git 仓库或 git 不可用 */
function listTrackedFiles(templateDir: string): string[] | null {
  if (!fs.existsSync(path.join(templateDir, '.git'))) return null;

  const r = spawnSync('git', ['ls-files'], { cwd: templateDir, encoding: 'utf-8' });
  if (r.status !== 0) return null;
  return r.stdout.split('\n').filter(Boolean);
}

/** deps / devDeps / scripts 指向 package.json 里不存在的条目 */
function checkPackageJsonRefs(templateDir: string, manifest: TemplateConfig): string[] {
  const pkgPath = path.join(templateDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];

  let pkg: Record<string, Record<string, string> | undefined>;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    // package.json 解析失败会在 composer 里以更准确的上下文炸出来，这里不抢报错
    return [];
  }

  const warnings: string[] = [];
  const check = (label: string, names: string[] | undefined, field: string): void => {
    for (const name of names ?? []) {
      if (!pkg[field]?.[name]) {
        warnings.push(`清单 ${label} 声明了 "${name}"，但 package.json 的 ${field} 里没有它`);
      }
    }
  };

  for (const [featureId, def] of Object.entries(manifest.features)) {
    check(`features.${featureId}.deps`, def.deps, 'dependencies');
    check(`features.${featureId}.devDeps`, def.devDeps, 'devDependencies');
    check(`features.${featureId}.scripts`, def.scripts, 'scripts');
  }
  check('removeScripts', manifest.removeScripts, 'scripts');

  return warnings;
}

/**
 * 声明的路径在工作区有、却没被 git 跟踪——专治「本地路径源能跑通、git 源产物却少东西」
 *
 * 只在模板目录本身是 git 仓库时检查（否则 tracked 为 null，直接跳过）：git 源克隆后
 * .git 已被 resolver 删掉，那种场景下产物内容天然等于版本库内容。
 */
function checkGitTracked(tracked: string[] | null, manifest: TemplateConfig): string[] {
  if (tracked === null) return [];

  const isTracked = (rel: string): boolean =>
    tracked.some((f) => f === rel || f.startsWith(rel + '/'));

  const warnings: string[] = [];
  for (const [featureId, def] of Object.entries(manifest.features)) {
    for (const rel of [...(def.dirs ?? []), ...(def.files ?? [])]) {
      // 与 composer 的裁剪比对同一套归一化，否则 `src/locale/` 这类写法会假警告
      if (!isTracked(normalizeManifestPath(rel))) {
        warnings.push(
          `features.${featureId} 的 "${rel}" 未被 git 跟踪：` +
            `本地路径源会带上它，但用 git 源生成的项目里不会有它`,
        );
      }
    }
  }
  return warnings;
}
