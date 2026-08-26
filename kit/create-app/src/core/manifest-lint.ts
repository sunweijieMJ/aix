import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { TemplateConfig } from '../types';
import { CreateAppError } from '../utils/errors';

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

  for (const [featureId, def] of Object.entries(manifest.features)) {
    for (const rel of [...(def.dirs ?? []), ...(def.files ?? [])]) {
      const normalized = rel.replace(/\/+$/, '');
      if (!fs.existsSync(path.join(templateDir, normalized))) {
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
  warnings.push(...checkGitTracked(templateDir, manifest));
  return warnings;
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
 * 只在模板目录本身是 git 仓库时检查：git 源克隆后 .git 已被 resolver 删掉，
 * 那种场景下产物内容天然等于版本库内容。
 */
function checkGitTracked(templateDir: string, manifest: TemplateConfig): string[] {
  if (!fs.existsSync(path.join(templateDir, '.git'))) return [];

  const r = spawnSync('git', ['ls-files'], { cwd: templateDir, encoding: 'utf-8' });
  if (r.status !== 0) return [];
  const tracked = r.stdout.split('\n').filter(Boolean);

  const isTracked = (rel: string): boolean =>
    tracked.some((f) => f === rel || f.startsWith(rel + '/'));

  const warnings: string[] = [];
  for (const [featureId, def] of Object.entries(manifest.features)) {
    for (const rel of [...(def.dirs ?? []), ...(def.files ?? [])]) {
      const normalized = rel.replace(/\/+$/, '');
      if (!isTracked(normalized)) {
        warnings.push(
          `features.${featureId} 的 "${rel}" 未被 git 跟踪：` +
            `本地路径源会带上它，但用 git 源生成的项目里不会有它`,
        );
      }
    }
  }
  return warnings;
}
