/**
 * 包管理器工具函数
 *
 * 根据不同包管理器生成对应的 CI 命令和配置
 */

import fs from 'node:fs';
import path from 'node:path';

import type { PackageManager } from '../types/config.js';
import { DEFAULT_PACKAGE_MANAGER } from '../types/config.js';

/**
 * 从目标仓库的 lock 文件检测包管理器
 *
 * 优先级: pnpm-lock.yaml > yarn.lock > package-lock.json > 默认 pnpm
 */
export function detectPackageManager(target: string): PackageManager {
  if (fs.existsSync(path.join(target, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(target, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(target, 'package-lock.json'))) return 'npm';
  return DEFAULT_PACKAGE_MANAGER;
}

/**
 * 生成 GitHub Actions 中包管理器的 setup 步骤
 *
 * pnpm 需要额外的 pnpm/action-setup 步骤，npm/yarn 不需要
 */
export function buildPackageManagerSetup(pm: PackageManager): string {
  if (pm === 'pnpm') {
    return `      - uses: pnpm/action-setup@v4`;
  }
  return '';
}

/**
 * 生成依赖安装命令
 */
export function buildInstallCmd(pm: PackageManager): string {
  switch (pm) {
    case 'pnpm':
      return 'pnpm install --frozen-lockfile';
    case 'npm':
      return 'npm ci';
    case 'yarn':
      return 'yarn install --frozen-lockfile';
  }
}

/**
 * 生成脚本运行命令前缀
 */
export function buildRunCmd(pm: PackageManager): string {
  switch (pm) {
    case 'pnpm':
      return 'pnpm';
    case 'npm':
      return 'npm run';
    case 'yarn':
      return 'yarn';
  }
}

/**
 * 生成包内二进制执行命令前缀
 */
export function buildExecCmd(pm: PackageManager): string {
  switch (pm) {
    case 'pnpm':
      return 'pnpm exec';
    case 'npm':
      return 'npx';
    case 'yarn':
      return 'yarn exec';
  }
}
