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

/** 打印简单的文件树（仅显示路径列表） */
export function printFileTree(files: FileList, rootLabel: string): void {
  console.log(rootLabel);
  for (const file of files) {
    console.log(`  ${file.path}`);
  }
}
