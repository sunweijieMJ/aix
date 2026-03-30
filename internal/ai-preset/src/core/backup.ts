/**
 * 备份与恢复
 *
 * upgrade 前自动备份即将修改的文件，支持 --rollback 恢复
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { LOCK_DIR, LOCK_FILENAME } from '../types.js';
import { existsSync, readFile, writeFile, ensureDir } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

const BACKUP_DIR = 'backup';

/** 获取备份目录路径 */
function getBackupDir(projectRoot: string): string {
  return path.join(projectRoot, LOCK_DIR, BACKUP_DIR);
}

/**
 * 备份指定文件列表（仅保留最近一次备份）
 *
 * @param projectRoot - 项目根目录
 * @param filePaths - 需要备份的文件相对路径列表
 * @returns 实际备份的文件数量
 */
export async function createBackup(
  projectRoot: string,
  filePaths: string[],
): Promise<number> {
  const backupDir = getBackupDir(projectRoot);

  // 清理旧备份
  if (existsSync(backupDir)) {
    await fs.rm(backupDir, { recursive: true, force: true });
  }
  await ensureDir(backupDir);

  let backedUp = 0;

  for (const relativePath of filePaths) {
    const srcPath = path.join(projectRoot, relativePath);
    if (!existsSync(srcPath)) continue;

    try {
      const content = await readFile(srcPath);
      const destPath = path.join(backupDir, relativePath);
      await writeFile(destPath, content);
      backedUp++;
    } catch {
      logger.debug(`备份失败: ${relativePath}`);
    }
  }

  // 同时备份 lock.json（用于 rollback 时同步恢复状态）
  const lockPath = path.join(projectRoot, LOCK_DIR, LOCK_FILENAME);
  if (existsSync(lockPath)) {
    try {
      const lockContent = await readFile(lockPath);
      await writeFile(path.join(backupDir, '_lock.json'), lockContent);
    } catch {
      logger.debug('备份 lock.json 失败');
    }
  }

  // 写入备份元信息
  const meta = {
    createdAt: new Date().toISOString(),
    files: filePaths.filter((p) => existsSync(path.join(projectRoot, p))),
  };
  await writeFile(
    path.join(backupDir, '_meta.json'),
    JSON.stringify(meta, null, 2) + '\n',
  );

  return backedUp;
}

/**
 * 从备份恢复文件
 *
 * @returns 恢复的文件数量
 */
export async function restoreFromBackup(projectRoot: string): Promise<number> {
  const backupDir = getBackupDir(projectRoot);

  if (!existsSync(backupDir)) {
    throw new Error('没有可用的备份（.ai-preset/backup/ 不存在）');
  }

  // 读取元信息
  const metaPath = path.join(backupDir, '_meta.json');
  if (!existsSync(metaPath)) {
    throw new Error('备份元信息缺失（_meta.json 不存在）');
  }

  const meta = JSON.parse(await readFile(metaPath)) as {
    createdAt: string;
    files: string[];
  };

  let restored = 0;

  for (const relativePath of meta.files) {
    const backupPath = path.join(backupDir, relativePath);
    if (!existsSync(backupPath)) continue;

    try {
      const content = await readFile(backupPath);
      const destPath = path.join(projectRoot, relativePath);
      await writeFile(destPath, content);
      restored++;
    } catch {
      logger.warn(`恢复失败: ${relativePath}`);
    }
  }

  // 同步恢复 lock.json
  const lockBackupPath = path.join(backupDir, '_lock.json');
  if (existsSync(lockBackupPath)) {
    try {
      const lockContent = await readFile(lockBackupPath);
      const lockDestPath = path.join(projectRoot, LOCK_DIR, LOCK_FILENAME);
      await writeFile(lockDestPath, lockContent);
    } catch {
      logger.warn('恢复 lock.json 失败');
    }
  }

  return restored;
}

/**
 * 检查是否有可用备份
 */
export function hasBackup(projectRoot: string): boolean {
  return existsSync(path.join(getBackupDir(projectRoot), '_meta.json'));
}
