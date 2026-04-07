import fs from 'node:fs';
import path from 'node:path';
import prompts from 'prompts';
import pc from 'picocolors';
import type { GeneratedFile } from './types';

export type ConflictStrategy = 'skip' | 'overwrite' | 'cancel';

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

  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: `项目 "${project}" 的定制目录已存在，如何处理？`,
    choices: [
      { title: '继续（逐文件处理冲突）', value: 'continue' },
      { title: '取消操作', value: 'cancel' },
    ],
  });

  return action === 'continue';
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

  const { strategy } = await prompts({
    type: 'select',
    name: 'strategy',
    message: '如何处理已有文件？',
    choices: [
      { title: '逐文件确认', value: 'per-file' },
      { title: '全部跳过', value: 'skip' },
      { title: '全部覆盖', value: 'overwrite' },
      { title: '取消操作', value: 'cancel' },
    ],
  });

  if (strategy === 'cancel' || strategy === undefined) return null;
  if (strategy === 'overwrite') return files;
  if (strategy === 'skip') return safe;

  // 逐文件确认
  const resolved = [...safe];
  for (const file of conflicts) {
    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: `${pc.cyan(file.path)} 已存在`,
      choices: [
        { title: '跳过', value: 'skip' },
        { title: '覆盖', value: 'overwrite' },
      ],
    });

    if (action === undefined) return null; // Ctrl+C
    if (action === 'overwrite') {
      resolved.push(file);
    }
  }

  return resolved;
}

/**
 * 将文件写入磁盘
 */
export function writeFiles(files: GeneratedFile[], outputDir: string): void {
  for (const file of files) {
    const fullPath = path.join(outputDir, file.path);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, file.content, 'utf-8');
  }
}

/**
 * 打印文件树（带目录层级缩进和 tree 符号）
 */
export function printFileTree(files: GeneratedFile[], outputDir: string): void {
  console.log(pc.green('\n✅ 已生成以下文件：\n'));

  // 构建目录树
  const tree = buildTree(files.map((f) => f.path));
  printNode(tree, outputDir, '', true);
}

interface TreeNode {
  [key: string]: TreeNode;
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = {};
  for (const p of paths) {
    const parts = p.split('/');
    let node = root;
    for (const part of parts) {
      node[part] ??= {};
      node = node[part];
    }
  }
  return root;
}

function printNode(node: TreeNode, name: string, prefix: string, isRoot: boolean): void {
  if (isRoot) {
    console.log(`  ${name}/`);
  }

  const entries = Object.entries(node).sort(([a], [b]) => a.localeCompare(b));
  for (let i = 0; i < entries.length; i++) {
    const [key, children] = entries[i]!;
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';
    const hasChildren = Object.keys(children).length > 0;

    console.log(`  ${prefix}${connector}${key}${hasChildren ? '/' : ''}`);
    if (hasChildren) {
      printNode(children, key, prefix + childPrefix, false);
    }
  }
}
