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
      'Worker 模板和 wrangler.toml 已输出到 workers/ 目录，还需完成以下步骤：',
      '',
      '### 步骤一：部署 Cloudflare Worker',
      '',
      '1. 安装 Wrangler CLI: npm install -g wrangler',
      '2. 登录 Cloudflare: wrangler login',
      '3. 创建 KV namespace（若已存在可跳过，用 wrangler kv namespace list 查看）:',
      '   wrangler kv namespace create SENTRY_DEDUP',
      '4. 将 KV namespace ID 填入 workers/wrangler.toml 的 id 字段',
      '5. 进入 workers/ 目录: cd workers',
      '6. 配置 Worker Secrets（首次会提示创建 Worker，选 Yes）:',
      '   - wrangler secret put SENTRY_CLIENT_SECRET  （Sentry Integration 的 Client Secret）',
      '   - wrangler secret put SENTRY_AUTH_TOKEN      （Sentry Integration 的 Token）',
      '   - wrangler secret put GITHUB_PAT             （GitHub PAT，需 repo 权限）',
      '7. 部署 Worker: wrangler deploy',
      '   - 首次部署会提示注册 workers.dev 子域名，选 Yes 并输入子域名',
      '   - 部署完成后 Worker 地址为: https://sentry-webhook.<子域名>.workers.dev',
      '',
      '### 步骤二：创建 Sentry Internal Integration',
      '',
      '1. 进入 Sentry → Settings → Developer Settings → Create New Integration → Internal Integration',
      '2. 填写 Webhook URL: 上一步部署的 Worker 地址',
      '3. Permissions: Issue & Event → Read, Project → Read',
      '4. Webhooks: 勾选 issue',
      '5. 保存后获取 Client Secret 和 Token（对应步骤一中的 Secrets）',
      '',
      '### 步骤三：配置 Sentry Alert Rule',
      '',
      '1. 进入 Sentry 项目 → Alerts → Create Alert Rule',
      '2. 选择 Issues 类型，条件设为: A new issue is created',
      '3. Actions: Send a notification via <你的 Integration 名称>',
      '4. 保存后点击 Send Test Notification 验证',
      '5. 用 wrangler tail 实时查看 Worker 日志确认收到请求',
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
