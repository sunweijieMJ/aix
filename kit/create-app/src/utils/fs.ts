import fs from 'node:fs';
import path from 'node:path';
import type { FileList } from '../types';
import { CreateAppError } from './errors';

/**
 * 将 FileList 写入目标目录
 *
 * @param files   文件列表（path 相对于 destDir）
 * @param destDir 目标目录（必须已存在或会自动创建）
 */
export function writeFiles(files: FileList, destDir: string): void {
  for (const file of files) {
    const fullPath = path.join(destDir, file.path);
    const dir = path.dirname(fullPath);

    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, file.content, {
        mode: file.mode,
      });
    } catch (err) {
      throw new CreateAppError(
        'E_DIR_WRITE_FAILED',
        `写入文件失败: ${fullPath}\n${err instanceof Error ? err.message : String(err)}`,
        '请检查目录权限',
        err,
      );
    }
  }
}

/**
 * 清空目录内容，保留目录本身与 `.git/`
 *
 * 覆盖已有目录时必须先清空：直接写入是「合并」，上次生成的旧文件（比如这次没选的
 * 特性目录）会残留，产物成两次生成的混合态。保留 `.git` 对齐 create-vite——
 * 用户可能是在已有仓库里重新生成。
 *
 * dir 本身是符号链接时会透过链接清空真实目标——这与「覆盖该路径」的用户意图一致
 * （create-vite 同语义），调用方已通过确认问答 / --force 拿到清空授权。
 */
export function emptyDir(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    if (entry === '.git') continue;
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

/**
 * 打印文件树（带目录层级缩进和 tree 符号）
 *
 * create 与 override add 共用一份：历史上 conflict.ts 里还有一份按 GeneratedFile
 * 的实现，而 GeneratedFile 是 FileEntry 的结构子集，两份树渲染没有理由分叉。
 */
export function printFileTree(files: FileList, rootLabel: string): void {
  const tree = buildTree(files.map((f) => f.path));
  console.log(`  ${rootLabel}/`);
  printNode(tree, '');
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

function printNode(node: TreeNode, prefix: string): void {
  const entries = Object.entries(node).sort(([a], [b]) => a.localeCompare(b));
  for (let i = 0; i < entries.length; i++) {
    const [key, children] = entries[i]!;
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';
    const hasChildren = Object.keys(children).length > 0;

    console.log(`  ${prefix}${connector}${key}${hasChildren ? '/' : ''}`);
    if (hasChildren) {
      printNode(children, prefix + childPrefix);
    }
  }
}
