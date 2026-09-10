import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * CLI 集成测试
 *
 * 直接拉起真实的 CLI 进程断言行为。此前这个文件在测试内部 new 了一个
 * commander 程序、自己声明选项再断言解析结果——测的是 commander，
 * 跟 src/cli.ts 毫无关系，所以像「-d 被顶层同名选项吃掉」这种
 * 真实缺陷一直测不出来。
 */

const execFileAsync = promisify(execFile);

const packageRoot = join(import.meta.dirname, '..');
const tsx = join(packageRoot, 'node_modules/.bin/tsx');
const cli = join(packageRoot, 'src/cli.ts');

/** 运行 CLI，返回输出和退出码（CLI 大量使用 process.exit，非 0 属正常路径） */
async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(tsx, [cli, ...args], { timeout: 60_000 });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}

describe('CLI', () => {
  let emptyDataDir: string;

  beforeAll(async () => {
    emptyDataDir = await mkdtemp(join(tmpdir(), 'aix-mcp-cli-'));
  });

  afterAll(async () => {
    await rm(emptyDataDir, { recursive: true, force: true });
  });

  it('--help 应该列出全部命令', async () => {
    const { stdout, code } = await runCli(['--help']);

    expect(code).toBe(0);
    for (const command of ['serve', 'extract', 'validate', 'stats', 'health', 'sync-version']) {
      expect(stdout).toContain(command);
    }
    // 已移除的命令不应再出现
    expect(stdout).not.toContain('serve-ws');
    expect(stdout).not.toContain('clean');
  });

  it('--version 应该输出 package.json 里的真实版本', async () => {
    const { stdout, code } = await runCli(['--version']);
    const { version } = (await import('../package.json', { with: { type: 'json' } })).default as {
      version: string;
    };

    expect(code).toBe(0);
    expect(stdout.trim()).toBe(version);
  });

  it('health 应该报告默认数据目录健康', async () => {
    const { stderr, code } = await runCli(['health']);

    expect(code).toBe(0);
    expect(stderr).toContain('组件索引');
  });

  it('health -d 指向空目录时应该判定为失败', async () => {
    // 回归用例：-d 曾同时声明在 program 和子命令上，
    // commander 把它判给顶层，子命令 action 里根本收不到值
    const { stderr, code } = await runCli(['health', '-d', emptyDataDir]);

    expect(stderr).toContain(emptyDataDir);
    expect(stderr).toContain('请先运行 extract');
    expect(code).toBe(1);
  });

  it('MCP_DATA_DIR 应该生效', async () => {
    // 回归用例：McpServer 构造时会给 dataDir 补默认值，
    // 而显式值优先级高于环境变量，导致 MCP_DATA_DIR 永远被盖掉
    const { stdout, stderr } = await execFileAsync(tsx, [cli, 'health'], {
      env: { ...process.env, MCP_DATA_DIR: emptyDataDir },
      timeout: 60_000,
    }).catch((e: { stdout?: string; stderr?: string }) => ({
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    }));

    expect(stdout + stderr).toContain(emptyDataDir);
  });

  it('validate 应该校验指定目录的数据', async () => {
    await writeFile(
      join(emptyDataDir, 'components-index.json'),
      JSON.stringify({ components: [{ packageName: '@aix/x', version: '1.0.0' }] }),
      'utf8',
    );

    const { stderr, code } = await runCli(['validate', '-d', emptyDataDir]);

    expect(stderr).toContain('缺少 name');
    expect(code).toBe(1);
  });
});
