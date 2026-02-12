/**
 * Workspace 包管理模块
 */

import * as fs from 'fs';
import * as path from 'path';
import { WORKSPACE_DIRS, type WorkspacePackage } from './shared.js';

// Workspace 包缓存
let workspacePackagesCache: WorkspacePackage[] | null = null;

// 清除 workspace 包缓存（版本更新后需要调用）
export const clearWorkspaceCache = (): void => {
  workspacePackagesCache = null;
};

// 遍历所有 workspace 包（带缓存，避免重复遍历）
export const getWorkspacePackages = (
  projectRoot: string,
): WorkspacePackage[] => {
  if (workspacePackagesCache) {
    return workspacePackagesCache;
  }

  const packages: WorkspacePackage[] = [];

  for (const workspaceDir of WORKSPACE_DIRS) {
    const dirPath = path.join(projectRoot, workspaceDir);
    if (!fs.existsSync(dirPath)) continue;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pkgJsonPath = path.join(dirPath, entry.name, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) continue;

      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      packages.push({
        name: pkgJson.name as string,
        version: pkgJson.version as string,
        dir: path.join(dirPath, entry.name),
        pkgJsonPath,
        private: Boolean(pkgJson.private),
      });
    }
  }

  workspacePackagesCache = packages;
  return packages;
};

// 获取可发布的包（排除 private）
export const getPublishablePackages = (
  projectRoot: string,
): WorkspacePackage[] =>
  getWorkspacePackages(projectRoot).filter((pkg) => !pkg.private);

// 根据包名获取包目录路径
export const getPackageDir = (
  projectRoot: string,
  pkgName: string,
): string | null => {
  const pkg = getWorkspacePackages(projectRoot).find((p) => p.name === pkgName);
  return pkg?.dir ?? null;
};
