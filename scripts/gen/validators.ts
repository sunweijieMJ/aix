/**
 * 输入验证器
 */

import {
  getComponentDir,
  directoryExists,
  getExistingPackages,
} from './utils.js';

/** 组件名称格式验证 */
export function validateComponentName(name: string): true | string {
  if (!name.trim()) {
    return '组件名称不能为空';
  }

  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    return '组件名称必须是 kebab-case 格式 (如: my-component)';
  }

  // 保留字检查
  const reserved = [
    'node_modules',
    'dist',
    'src',
    'test',
    'tests',
    'lib',
    'es',
  ];
  if (reserved.includes(name)) {
    return `"${name}" 是保留名称，不能使用`;
  }

  return true;
}

/** 检查组件是否已存在 */
export async function checkComponentExists(name: string): Promise<boolean> {
  const componentDir = getComponentDir(name);
  return directoryExists(componentDir);
}

/** 验证组件名称（包含存在性检查） */
export async function validateComponentNameWithExistence(
  name: string,
): Promise<true | string> {
  const formatResult = validateComponentName(name);
  if (formatResult !== true) {
    return formatResult;
  }

  const exists = await checkComponentExists(name);
  if (exists) {
    return `组件 "${name}" 已存在，请选择其他名称`;
  }

  return true;
}

/** 获取已存在组件的提示信息 */
export async function getExistingPackagesHint(): Promise<string> {
  const packages = await getExistingPackages();
  if (packages.length === 0) {
    return '当前没有已存在的组件包';
  }
  return `已存在的组件包: ${packages.join(', ')}`;
}

/** 验证描述 */
export function validateDescription(desc: string): true | string {
  if (!desc.trim()) {
    return '组件描述不能为空';
  }
  if (desc.length > 200) {
    return '组件描述不能超过 200 个字符';
  }
  return true;
}
