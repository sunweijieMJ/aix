/**
 * 共享的常量、类型和基础工具
 */

import { execSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';

// ============ 常量配置 ============

export const WORKSPACE_DIRS = ['packages', 'internal']; // 可发布的 workspace 目录
export const BUILD_OUTPUTS = ['es', 'lib', 'dist']; // 构建产物目录
export const DEFAULT_REGISTRY = 'http://npm-registry.zhihuishu.com:4873/'; // 默认私有 npm 仓库地址

// 重试配置
export const DEFAULT_MAX_RETRIES = 3; // 网络操作默认最大重试次数
export const DEFAULT_RETRY_DELAY_MS = 3000; // 网络操作默认重试延迟（毫秒）

// npm 包管理限制
export const NPM_UNPUBLISH_TIME_LIMIT_HOURS = 72; // npm unpublish 时间限制（小时）

// ============ 类型定义 ============

// pre.json 文件结构类型
export interface PreJsonFile {
  mode: string;
  tag: string;
  initialVersions: Record<string, string>;
  changesets: string[];
}

// Workspace 包信息接口
export interface WorkspacePackage {
  name: string;
  version: string;
  dir: string;
  pkgJsonPath: string;
  private: boolean;
}

// 命令行参数类型
export interface CliArgs {
  mode: string;
  action: string;
  skipPrompts: boolean;
  dryRun: boolean;
  help: boolean;
}

// ============ 基础工具函数 ============

// 延迟函数
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// 执行命令的通用函数
export const execCommand = (
  command: string,
  options: { cwd?: string; silent?: boolean } = {},
): string => {
  const { cwd, silent = false } = options;
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit',
      ...(cwd ? { cwd } : {}),
    });
  } catch (error) {
    const exitCode = (error as { status?: number }).status;
    const detail = error instanceof Error ? error.message : String(error);
    const errorMessage = `命令执行失败: ${command}${exitCode != null ? ` (exit code: ${exitCode})` : ''}\n${detail}`;

    throw new Error(errorMessage, { cause: error });
  }
};

// 执行命令并捕获输出（静默模式）
export const exec = (command: string, cwd?: string): string =>
  execCommand(command, { cwd, silent: true });

// 执行命令并显示输出（交互模式）
export const run = (command: string, cwd?: string): void => {
  execCommand(command, { cwd, silent: false });
};

// 带重试的命令执行（用于网络相关操作，交互模式）
export const runWithRetry = async (
  command: string,
  options: {
    cwd?: string;
    maxRetries?: number;
    retryDelayMs?: number;
  } = {},
): Promise<void> => {
  const {
    cwd,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      run(command, cwd);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const waitTime = retryDelayMs * attempt;
        console.log(
          chalk.yellow(
            `⚠️ 命令执行失败，${waitTime / 1000} 秒后进行第 ${attempt + 1}/${maxRetries} 次重试...`,
          ),
        );
        await sleep(waitTime);
      }
    }
  }

  throw lastError;
};

// 封装确认函数
export const confirm = async (
  message: string,
  defaultValue = true,
  skipPrompt = false,
): Promise<boolean> => {
  if (skipPrompt) {
    console.log(
      `${message} ${chalk.dim(`[自动选择: ${defaultValue ? 'Yes' : 'No'}]`)}`,
    );
    return defaultValue;
  }

  const { answer } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'answer',
      message,
      default: defaultValue,
    },
  ]);

  return answer as boolean;
};

// 规范化路径分隔符（Windows 兼容）
export const normalizePath = (filePath: string): string =>
  filePath.replace(/\\/g, '/');
