/**
 * Lock 文件管理
 *
 * 负责 .ai-preset/lock.json 的读写和文件状态追踪
 */

import path from 'node:path';
import type {
  FileStatus,
  InitConfig,
  LockFile,
  LockFileEntry,
  PlatformOutputFile,
} from '../types.js';
import { LOCK_DIR, LOCK_FILENAME } from '../types.js';
import { existsSync, readFile, writeFile } from '../utils/fs.js';
import { sha256 } from '../utils/hash.js';
import type { WriteResult } from './writer.js';

/**
 * 读取 .ai-preset/lock.json，不存在返回 null
 */
export async function readLockFile(projectRoot: string): Promise<LockFile | null> {
  const lockPath = path.join(projectRoot, LOCK_DIR, LOCK_FILENAME);
  if (!existsSync(lockPath)) {
    return null;
  }

  try {
    const raw = await readFile(lockPath);
    return JSON.parse(raw) as LockFile;
  } catch {
    return null;
  }
}

/**
 * 写入 .ai-preset/lock.json
 */
export async function writeLockFile(projectRoot: string, lockFile: LockFile): Promise<void> {
  const lockPath = path.join(projectRoot, LOCK_DIR, LOCK_FILENAME);
  await writeFile(lockPath, JSON.stringify(lockFile, null, 2) + '\n');
}

/**
 * 根据写入结果构建 lock 文件
 */
export function buildLockFile(
  files: PlatformOutputFile[],
  writeResult: WriteResult,
  config: InitConfig,
  cliVersion: string,
  existingLock?: LockFile | null,
): LockFile {
  const now = new Date().toISOString();
  const fileEntries: Record<string, LockFileEntry> = {};
  const newFilePaths = new Set(files.map((f) => f.relativePath));

  // 保留现有 lock 中需要延续的条目
  if (existingLock) {
    for (const [filePath, entry] of Object.entries(existingLock.files)) {
      if (entry.status === 'ejected') {
        // ejected 文件始终保留
        fileEntries[filePath] = entry;
      } else if (newFilePaths.has(filePath) && !writeResult.writtenFiles.includes(filePath)) {
        // 新预设仍生成此文件，但本次未写入（如 upgrade 时用户选择 keep）→ 保留旧条目
        fileEntries[filePath] = entry;
      }
      // 否则：文件已从预设移除（不在 newFilePaths）或将被新版本覆盖 → 不保留旧条目
    }
  }

  // 本次写入成功的文件
  for (const file of files) {
    if (writeResult.writtenFiles.includes(file.relativePath)) {
      fileEntries[file.relativePath] = {
        hash: sha256(file.content),
        sourceRules: file.sourceRuleIds ?? [],
        generatedAt: now,
        status: 'managed',
      };
    }
  }

  return {
    version: 1,
    generatedAt: now,
    cliVersion,
    config,
    files: fileEntries,
  };
}

/**
 * 检查文件修改状态：对比磁盘文件 hash 与 lock 中记录
 */
export async function checkFileStatus(
  projectRoot: string,
  lockFile: LockFile,
): Promise<Map<string, FileStatus>> {
  const statusMap = new Map<string, FileStatus>();

  for (const [relativePath, entry] of Object.entries(lockFile.files)) {
    const absPath = path.join(projectRoot, relativePath);

    if (entry.status === 'ejected') {
      statusMap.set(relativePath, 'ejected');
      continue;
    }

    if (!existsSync(absPath)) {
      statusMap.set(relativePath, 'modified');
      continue;
    }

    try {
      const content = await readFile(absPath);
      const currentHash = sha256(content);
      statusMap.set(relativePath, currentHash === entry.hash ? 'managed' : 'modified');
    } catch {
      statusMap.set(relativePath, 'modified');
    }
  }

  return statusMap;
}
