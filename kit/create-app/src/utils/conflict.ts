import fs from 'node:fs';
import path from 'node:path';
import { select, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import type { GeneratedFile } from '../override/types';
import { CreateAppError } from './errors';

export type ConflictStrategy = 'skip' | 'overwrite' | 'cancel';

/**
 * 非 TTY 下即将弹冲突问答时直接失败（问答读不到输入，取消分支会被当成用户取消）
 *
 * 拦截点必须在问答现场而不是命令入口的预判：「输出目录存在」不等于「会撞冲突」，
 * 入口预判会误杀全参数、无冲突的 CI 运行。
 */
function assertPromptable(what: string): void {
  if (process.stdin.isTTY) return;
  throw new CreateAppError(
    'E_NON_INTERACTIVE',
    `当前不是交互式终端（stdin 非 TTY），但${what}需要交互确认`,
    '请加 -y（跳过已有文件）或 --force（覆盖已有文件）后重试',
  );
}

/**
 * 检测项目代码重名
 *
 * @returns true 表示可以继续，false 表示用户取消
 */
export async function checkProjectConflict(
  project: string,
  outputDir: string,
  options: { force: boolean; yes: boolean },
): Promise<boolean> {
  const projectDir = path.join(outputDir, project);
  if (!fs.existsSync(projectDir)) return true;

  // 检查目录下是否有文件（排除空目录）
  const entries = fs.readdirSync(projectDir, { recursive: true, withFileTypes: false });
  if (entries.length === 0) return true;

  console.log(pc.yellow(`\n⚠️  项目目录已存在：${pc.bold(project + '/')}`));
  console.log(pc.dim(`   路径: ${projectDir}`));

  if (options.force) {
    console.log(pc.dim('   → --force 模式，继续覆盖'));
    return true;
  }

  if (options.yes) {
    console.log(pc.dim('   → 跳过已有文件（使用 --force 覆盖）'));
    return true;
  }

  assertPromptable(`项目 "${project}" 的定制目录已存在，`);
  const result = await select({
    message: `项目 "${project}" 的定制目录已存在，如何处理？`,
    options: [
      { label: '继续（逐文件处理冲突）', value: 'continue' },
      { label: '取消操作', value: 'cancel' },
    ],
  });

  if (isCancel(result)) return false;
  return result === 'continue';
}

/**
 * 检查并处理文件冲突
 *
 * @returns 过滤后的文件列表（跳过已有的文件），或 null（用户取消）
 */
export async function resolveConflicts(
  files: GeneratedFile[],
  outputDir: string,
  options: { force: boolean; yes: boolean },
): Promise<GeneratedFile[] | null> {
  const conflicts: GeneratedFile[] = [];
  const safe: GeneratedFile[] = [];

  for (const file of files) {
    const fullPath = path.join(outputDir, file.path);
    if (fs.existsSync(fullPath)) {
      conflicts.push(file);
    } else {
      safe.push(file);
    }
  }

  if (conflicts.length === 0) return files;

  // --force：直接覆盖所有
  if (options.force) {
    console.log(pc.yellow(`⚠️  将覆盖 ${conflicts.length} 个已有文件`));
    return files;
  }

  console.log(pc.yellow(`\n⚠️  发现 ${conflicts.length} 个已有文件：`));
  for (const f of conflicts) {
    console.log(pc.dim(`   ${f.path}`));
  }

  // --yes 模式：默认跳过已有文件
  if (options.yes) {
    console.log(pc.dim('   → 跳过已有文件（使用 --force 覆盖）'));
    return safe;
  }

  assertPromptable(`处理 ${conflicts.length} 个已有文件`);
  const strategy = await select({
    message: '如何处理已有文件？',
    options: [
      { label: '逐文件确认', value: 'per-file' },
      { label: '全部跳过', value: 'skip' },
      { label: '全部覆盖', value: 'overwrite' },
      { label: '取消操作', value: 'cancel' },
    ],
  });

  if (isCancel(strategy) || strategy === 'cancel') return null;
  if (strategy === 'overwrite') return files;
  if (strategy === 'skip') return safe;

  // 逐文件确认
  const resolved = [...safe];
  for (const file of conflicts) {
    const action = await select({
      message: `${pc.cyan(file.path)} 已存在`,
      options: [
        { label: '跳过', value: 'skip' },
        { label: '覆盖', value: 'overwrite' },
      ],
    });

    if (isCancel(action)) return null;
    if (action === 'overwrite') {
      resolved.push(file);
    }
  }

  return resolved;
}

// 写盘与文件树打印统一在 utils/fs.ts（GeneratedFile 是 FileEntry 的结构子集，
// 历史上这里的第二份实现既没有错误码包装、也和 fs.ts 的树渲染各自漂移）
