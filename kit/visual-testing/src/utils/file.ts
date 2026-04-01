/**
 * 文件操作工具
 *
 * 基于 fs-extra 封装常用文件系统操作
 */

import fse from 'fs-extra';
import path from 'node:path';

/**
 * 确保目录存在，不存在则递归创建
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fse.ensureDir(dirPath);
}

/**
 * 复制文件，自动创建目标目录
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  await fse.ensureDir(path.dirname(dest));
  await fse.copy(src, dest);
}

/**
 * 删除文件或目录
 */
export async function removeFile(filePath: string): Promise<void> {
  await fse.remove(filePath);
}

/**
 * 检查路径是否存在
 */
export async function pathExists(filePath: string): Promise<boolean> {
  return fse.pathExists(filePath);
}

/**
 * 写入 JSON 文件，自动创建目录
 */
export async function writeJSON(
  filePath: string,
  data: unknown,
): Promise<void> {
  await fse.ensureDir(path.dirname(filePath));
  await fse.writeJSON(filePath, data, { spaces: 2 });
}
