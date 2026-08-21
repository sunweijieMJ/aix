/**
 * 共享的常量、类型和基础工具
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

// ============ 常量配置 ============

export const WORKSPACE_DIRS = ['packages', 'internal', 'kit']; // 可发布的 workspace 目录
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

// pre.json 的仓库相对路径（唯一定义处，git 命令等需要相对路径的场景直接使用）
export const PRE_JSON_REL = '.changeset/pre.json';

// pre.json 的绝对路径
export const getPreJsonPath = (projectRoot: string): string => path.join(projectRoot, PRE_JSON_REL);

// 安全解析 pre.json（文件缺失、JSON 损坏或 tag 类型不符时返回 null）
// 守卫强度必须与 changesets 对齐：其 readPreState 是裸 JSON.parse，不校验任何字段，
// 只要文件存在就按其 tag 发布（getReleaseTag 只读 tag，不看 mode），
// 因此 tag 是唯一影响发布行为的必需字段。这里若要求得比它更严（如强制 mode/changesets 存在），
// 残缺文件会让守卫静默失效（parsePreJson 返回 null，拦截逻辑放行），
// 而 changeset publish 仍按该文件的 tag 发到错误的 dist-tag
export const parsePreJson = (filePath: string): PreJsonFile | null => {
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (typeof content === 'object' && content !== null && typeof content.tag === 'string') {
      return {
        ...content,
        // mode 缺失或类型不符时兜底空串：必然 !== 'pre'，会被 publish 的 exit 残留拦截捕获而非静默放行
        mode: typeof content.mode === 'string' ? content.mode : '',
        // 规范化 changesets：缺失或元素类型不符时兜底成 string[]，保证调用方可直接遍历
        changesets: Array.isArray(content.changesets)
          ? content.changesets.filter((item: unknown) => typeof item === 'string')
          : [],
      } as PreJsonFile;
    }
    return null;
  } catch {
    return null;
  }
};

// 快照 pre.json 原始内容（不存在返回 null），用于流程中断时精确还原
export const snapshotPreJson = (projectRoot: string): string | null => {
  const filePath = getPreJsonPath(projectRoot);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
};

// 还原 pre.json 到快照状态（幂等）：snapshot 为 null 表示快照时文件不存在，需删除现存文件
export const restorePreJson = (projectRoot: string, snapshot: string | null): void => {
  const filePath = getPreJsonPath(projectRoot);
  if (snapshot === null) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }
  fs.writeFileSync(filePath, snapshot, 'utf-8');
};

// 标签规范化：交互输入的 validate、CLI 显式 -m 与最终赋值共用同一逻辑，避免多处 drift
export const normalizeTag = (input: string): string => input.trim().toLowerCase();

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
  const { cwd, maxRetries = DEFAULT_MAX_RETRIES, retryDelayMs = DEFAULT_RETRY_DELAY_MS } = options;

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
    console.log(`${message} ${chalk.dim(`[自动选择: ${defaultValue ? 'Yes' : 'No'}]`)}`);
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
export const normalizePath = (filePath: string): string => filePath.replace(/\\/g, '/');
