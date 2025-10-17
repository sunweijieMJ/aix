import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { glob } from 'glob';
import type { PackageInfo } from '../types/index';
import { log } from './logger';

/**
 * 读取并解析 package.json 文件
 */
export async function readPackageJson(
  packagePath: string,
): Promise<PackageInfo | null> {
  try {
    const content = await readFile(join(packagePath, 'package.json'), 'utf8');
    return JSON.parse(content) as PackageInfo;
  } catch (error) {
    log.warn(`Failed to read package.json from ${packagePath}:`, error);
    return null;
  }
}

/**
 * 查找指定目录下的所有包
 */
export async function findPackages(packagesDir: string): Promise<string[]> {
  try {
    const packagePaths = await glob('*/package.json', {
      cwd: packagesDir,
      absolute: true,
    });

    return packagePaths.map((path) => path.replace('/package.json', ''));
  } catch (error) {
    log.error('Failed to find packages:', error);
    return [];
  }
}

/**
 * 查找组件源文件
 */
export async function findComponentFiles(packagePath: string): Promise<{
  sourceFiles: string[];
  storyFiles: string[];
  readmeFiles: string[];
}> {
  const [sourceFiles, storyFiles, readmeFiles] = await Promise.all([
    // 源文件 (src 目录下的 .tsx, .ts 文件)
    glob('src/**/*.{ts,tsx}', { cwd: packagePath, absolute: true }),
    // Story 文件
    glob('stories/**/*.{ts,tsx,js,jsx}', { cwd: packagePath, absolute: true }),
    // README 文件
    glob('README*.{md,txt}', { cwd: packagePath, absolute: true }),
  ]);

  return {
    sourceFiles: sourceFiles.filter(
      (file) => !file.includes('.test.') && !file.includes('.spec.'),
    ),
    storyFiles,
    readmeFiles,
  };
}

/**
 * 提取文件名（不含扩展名）
 */
export function getFileNameWithoutExt(filePath: string): string {
  const ext = extname(filePath);
  return basename(filePath, ext);
}

/**
 * 判断是否为组件文件
 */
export function isComponentFile(filePath: string): boolean {
  const fileName = basename(filePath);
  const validExtensions = ['.tsx', '.jsx'];

  return (
    validExtensions.some((ext) => fileName.endsWith(ext)) &&
    !fileName.includes('.test.') &&
    !fileName.includes('.spec.') &&
    !fileName.includes('.stories.')
  );
}

/**
 * 首字母大写
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * 获取包名的显示名称
 */
export function getDisplayName(packageName: string): string {
  // 移除 scope 前缀 (如 @aix/component-name -> component-name)
  const withoutScope = packageName.replace(/^@[^/]+\//, '');

  // 转换为 PascalCase
  return withoutScope.split('-').map(capitalize).join('');
}

/**
 * 安全地解析 JSON
 */
export function safeJsonParse<T>(jsonString: string, defaultValue: T): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * 深度合并对象
 */
export function deepMerge(
  target: Record<string, any>,
  source: Record<string, any>,
): Record<string, any> {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, any>,
        sourceValue as Record<string, any>,
      );
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * 清理文档字符串
 */
export function cleanDocString(docString: string): string {
  return docString
    .replace(/\/\*\*/g, '') // 移除 /**
    .replace(/\*\//g, '') // 移除 */
    .replace(/^\s*\*/gm, '') // 移除行首的 *
    .replace(/^\s+/gm, '') // 移除行首多余空格
    .trim();
}

/**
 * 提取标签
 */
export function extractTags(text: string): string[] {
  // 使用负向先行断言排除 email 地址中的 @
  const tagRegex = /(?<!\w)@(\w+)(?!\.\w+)/g;
  const tags: string[] = [];
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    if (match[1]) {
      tags.push(match[1]);
    }
  }

  return [...new Set(tags)]; // 去重
}

/**
 * 通用组件查找函数
 * 根据组件名称或包名查找组件
 */
export function findComponentByName(
  components: any[],
  name: string,
): any | null {
  if (!name || !components || components.length === 0) {
    return null;
  }

  const normalizedName = name.toLowerCase();

  return (
    components.find(
      (c) =>
        c.name.toLowerCase() === normalizedName ||
        c.packageName.toLowerCase() === normalizedName ||
        c.packageName.toLowerCase().endsWith(`/${normalizedName}`),
    ) || null
  );
}

// 重新导出工具模块
export * from './cache';
export * from './error';
export * from './logger';
export * from './validation';
export * from './monitoring';
export * from './data-manager';
export * from './search-scoring';
