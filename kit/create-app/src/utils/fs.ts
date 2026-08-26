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

/** 打印简单的文件树（仅显示路径列表） */
export function printFileTree(files: FileList, rootLabel: string): void {
  console.log(rootLabel);
  for (const file of files) {
    console.log(`  ${file.path}`);
  }
}
