/**
 * 工具函数
 */

import fs from 'fs/promises';
import path from 'path';

/** kebab-case 转 PascalCase */
export function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** kebab-case 转 camelCase */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** 获取 packages 目录路径 */
export function getPackagesDir(): string {
  return path.resolve(process.cwd(), 'packages');
}

/** 获取组件目录路径 */
export function getComponentDir(componentName: string): string {
  return path.join(getPackagesDir(), componentName);
}

/** 检查目录是否存在 */
export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/** 检查文件是否存在 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/** 递归创建目录 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/** 写入文件 */
export async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.writeFile(filePath, content, 'utf-8');
}

/** 获取已存在的组件包列表 */
export async function getExistingPackages(): Promise<string[]> {
  const packagesDir = getPackagesDir();
  try {
    const entries = await fs.readdir(packagesDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** 格式化文件大小 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 延迟执行 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 获取脚本目录 */
export function getScriptDir(): string {
  return path
    .dirname(new URL(import.meta.url).pathname)
    .replace(/^\/([A-Z]:)/, '$1');
}

/** 获取模板目录 */
export function getTemplatesDir(): string {
  return path.join(getScriptDir(), 'templates');
}
