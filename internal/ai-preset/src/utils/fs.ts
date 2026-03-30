/**
 * 文件操作工具
 *
 * 基于 Node.js 原生 fs/promises，不依赖 fs-extra
 */

import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { existsSync };

/** 读取文件内容 */
export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

/** 写入文件内容，自动创建目录 */
export async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/** 确保目录存在 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

let _packageRoot: string | undefined;

/**
 * 从 import.meta.url 向上查找 @kit/ai-preset 的包根目录
 *
 * 通过校验 package.json 的 name 字段确保定位正确
 */
export function findPackageRoot(): string {
  if (_packageRoot) return _packageRoot;

  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
          name?: string;
        };
        if (pkg.name === '@kit/ai-preset') {
          _packageRoot = dir;
          return dir;
        }
      } catch {
        // JSON 解析失败，跳过继续向上查找
      }
    }
    dir = path.dirname(dir);
  }

  throw new Error('无法定位 @kit/ai-preset 包根目录，presets/ 不可达');
}

/** 获取 presets/ 目录绝对路径 */
export function getPresetsDir(): string {
  return path.join(findPackageRoot(), 'presets');
}

/** 读取预设文件 */
export async function readPresetFile(relativePath: string): Promise<string> {
  const presetsDir = getPresetsDir();
  return fs.readFile(path.join(presetsDir, relativePath), 'utf-8');
}

/** 从 package.json 读取项目名称 */
export function readProjectName(projectRoot: string): string {
  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string };
    return pkg.name || 'my-project';
  } catch {
    return 'my-project';
  }
}
