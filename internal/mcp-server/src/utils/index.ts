import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { glob } from 'glob';
import type { ComponentInfo, PackageInfo } from '../types/index';
import { log } from './logger';
import { toSubComponentName } from './sub-component';

/**
 * 读取并解析 package.json 文件
 */
export async function readPackageJson(packagePath: string): Promise<PackageInfo | null> {
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

    // 使用 path.dirname 确保跨平台兼容（Windows 和 Unix）
    return packagePaths.map((p) => dirname(p));
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
    sourceFiles: sourceFiles.filter((file) => !file.includes('.test.') && !file.includes('.spec.')),
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
 * 组件查询结果
 *
 * subComponent 非空表示命中的是包内的某个子组件（如 @aix/popper 里的 Tooltip）。
 * 调用方必须据此把 props / emits / slots 收窄到该子组件：同一个包里
 * placement 有 4 份、teleportTo 有 5 份，默认值各不相同，
 * 不收窄就等于把一堆自相矛盾的条目一起丢给调用方。
 */
export interface ResolvedComponent {
  component: ComponentInfo;
  /** 命中的子组件名；按包名/包显示名查询时为 null，表示要整包的 API */
  subComponent: string | null;
}

/**
 * 按组件名、包名或同包内的子组件名定位组件
 */
export function resolveComponent(
  components: ComponentInfo[],
  name: string,
): ResolvedComponent | null {
  if (!name || !components || components.length === 0) {
    return null;
  }

  const normalizedName = name.toLowerCase();

  const matched = components.find(
    (c) =>
      c.name.toLowerCase() === normalizedName ||
      c.packageName.toLowerCase() === normalizedName ||
      c.packageName.toLowerCase().endsWith(`/${normalizedName}`),
  );
  if (matched) {
    // 显示名同时也是子组件名时按子组件收窄——@aix/popper 的 "Popper" 就是这种情况。
    // 问 Popper 要的是这个组件自己的 API，而不是同包 6 个子组件的并集
    // （那里 placement 有 4 份、默认值互相打架）。要整包请用包名 @aix/popper
    const sub = matched.subComponents?.find((s) => s.toLowerCase() === normalizedName) ?? null;
    return { component: matched, subComponent: sub };
  }

  // 退而查子组件：@aix/popper 里的 Tooltip 不是顶层条目，
  // 但按名字问它是很自然的用法
  for (const component of components) {
    const sub = component.subComponents?.find((s) => s.toLowerCase() === normalizedName);
    if (sub) return { component, subComponent: sub };
  }

  return null;
}

/**
 * 通用组件查找函数
 * 根据组件名称或包名查找组件
 */
export function findComponentByName(
  components: ComponentInfo[],
  name: string,
): ComponentInfo | null {
  return resolveComponent(components, name)?.component ?? null;
}

/**
 * 把带 group 的 API 条目收窄到指定子组件
 *
 * subComponent 为 null（按包名查询）时原样返回整包的条目。
 */
export function filterBySubComponent<T extends { group?: string }>(
  items: T[] | undefined,
  subComponent: string | null,
): T[] {
  const list = items ?? [];
  if (!subComponent) return list;
  return list.filter((item) => toSubComponentName(item.group) === subComponent);
}

// 重新导出工具模块
export * from './sub-component';
export * from './logger';
export * from './validation';
export * from './monitoring';
export * from './data-manager';
export * from './search-scoring';
