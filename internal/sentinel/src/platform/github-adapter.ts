/**
 * GitHub Actions 平台适配器
 *
 * 从 utils/github.ts 提取逻辑，实现 PlatformAdapter 接口
 */

import path from 'node:path';
import { execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';

import type { PlatformAdapter } from './types.js';
import { PHASE_CONFIGS } from '../types/index.js';

const execFileAsync = promisify(execFile);

type ExecFileAsync = typeof execFileAsync;

export class GitHubAdapter implements PlatformAdapter {
  readonly platform = 'github' as const;

  getPipelineDir(target: string): string {
    return path.join(target, '.github', 'workflows');
  }

  getTemplatePath(baseName: string): string {
    return `github/${baseName}`;
  }

  getDestFileName(baseName: string): string {
    return baseName;
  }

  isCliInstalled(): boolean {
    try {
      execSync('gh --version', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return true;
    } catch {
      return false;
    }
  }

  getCliInstallHint(): string {
    return '未检测到 GitHub CLI (gh)\n  请先安装: https://cli.github.com/';
  }

  getExistingPipelineFiles(): string[] {
    return [
      ...new Set(
        Object.values(PHASE_CONFIGS).flatMap((pc) =>
          pc.workflows.map((w) => this.getDestFileName(w)),
        ),
      ),
    ];
  }

  async createLabel(
    name: string,
    color: string,
    description: string,
    cwd: string,
  ): Promise<void> {
    await execFileAsync(
      'gh',
      [
        'label',
        'create',
        name,
        '--color',
        color,
        '--description',
        description,
        '--force',
      ],
      { cwd, encoding: 'utf-8' },
    );
  }

  async listSecrets(cwd: string): Promise<string[]> {
    return execGhListAsync('secret', cwd, execFileAsync);
  }

  async listVariables(cwd: string): Promise<string[]> {
    return execGhListAsync('variable', cwd, execFileAsync);
  }

  getPostInstallInstructions(files: string[]): string | null {
    const hasSentry = files.some((f) => f.includes('sentry'));
    if (!hasSentry) return null;

    return [
      '## Sentry Webhook Worker 部署',
      '',
      'Sentry 自动修复需要部署 Cloudflare Worker 来接收 Sentry webhook:',
      '',
      '1. 复制 Worker 模板到项目: templates/worker/sentry-webhook.ts',
      '2. 替换模板中的 __OWNER__ 和 __REPO__ 为实际的 GitHub 用户名和仓库名',
      '3. 安装 Wrangler CLI: npm install -g wrangler',
      '4. 创建 KV namespace: wrangler kv namespace create SENTRY_DEDUP',
      '5. 配置 Worker Secrets:',
      '   - wrangler secret put SENTRY_CLIENT_SECRET',
      '   - wrangler secret put SENTRY_AUTH_TOKEN',
      '   - wrangler secret put GITHUB_PAT',
      '6. 部署 Worker: wrangler deploy',
      '7. 在 Sentry 项目设置中配置 Webhook URL 指向部署后的 Worker 地址',
    ].join('\n');
  }
}

/**
 * 异步执行 gh list 命令，区分认证/权限错误与空结果
 *
 * 认证失败时抛出错误（由调用方决定处理策略）；
 * 命令成功但无结果时返回空数组。
 */
async function execGhListAsync(
  subcommand: string,
  cwd: string,
  exec: ExecFileAsync,
): Promise<string[]> {
  try {
    const { stdout } = await exec('gh', [subcommand, 'list'], {
      cwd,
      encoding: 'utf-8',
    });
    return parseFirstColumn(stdout);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // gh CLI 认证/权限类错误向上抛出，让调用方感知
    if (/auth|login|permission|forbidden|401|403/i.test(message)) {
      throw new Error(
        `GitHub CLI 认证或权限不足，请先运行 gh auth login\n  原始错误: ${message}`,
        { cause: err },
      );
    }

    // 其他错误（如仓库无 secrets）静默返回空
    return [];
  }
}

function parseFirstColumn(output: string): string[] {
  return output
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split('\t')[0]?.trim() ?? '')
    .filter(Boolean);
}
