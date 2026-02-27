/**
 * 环境预检验证
 *
 * 在安装前检查目标仓库环境是否满足要求
 */

import type { InstallConfig } from '../types/index.js';
import type { PlatformAdapter } from '../platform/index.js';
import { isGitRepo } from '../utils/git.js';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 预检验证目标环境
 *
 * 检查项：
 * 1. 目标目录是否为 Git 仓库
 * 2. 平台 CLI 是否已安装
 */
export async function validateEnvironment(
  config: InstallConfig,
  adapter: PlatformAdapter,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const { target } = config;

  // 检查是否为 Git 仓库
  if (!isGitRepo(target)) {
    errors.push(
      `目标目录不是 Git 仓库: ${target}\n  请在 Git 仓库根目录执行，或使用 --target 指定目标路径`,
    );
  }

  // 检查平台 CLI
  if (!adapter.isCliInstalled()) {
    errors.push(adapter.getCliInstallHint());
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
