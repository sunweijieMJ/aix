/**
 * `override list` 的真实 CLI 回归
 *
 * 这条命令原先把「不在项目根」写成 `console.error + process.exit(1)`，绕开了 handleError
 * 这个唯一错误出口——日志里既没有错误码也没有 suggestion。与 override-add.test.ts 同策略：
 * spawn `tsx src/cli.ts`，断言用户真正会遇到的输出与退出码。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(PKG_ROOT, 'src/cli.ts');
const TSX = path.join(PKG_ROOT, 'node_modules/.bin/tsx');

/** 每个 tsx 冷启动约 1s */
const TIMEOUT = 60_000;

const tempDirs: string[] = [];

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-ovl-'));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'host' }));
  return dir;
}

function runList(args: string[], cwd: string): { status: number | null; output: string } {
  const r = spawnSync(TSX, [CLI, 'override', 'list', ...args], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: r.status, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('override list - 错误出口', () => {
  it(
    '不在项目根目录时报 E_NOT_PROJECT_ROOT 并非零退出',
    () => {
      const cwd = makeProject();
      const r = runList([], path.join(cwd, 'nested'));

      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NOT_PROJECT_ROOT');
      expect(r.output).toContain('未检测到 package.json');
    },
    TIMEOUT,
  );
});

describe('override list - 正常路径', () => {
  it(
    'output 目录不存在时给出引导且退出码为 0（不是错误）',
    () => {
      const cwd = makeProject();
      const r = runList([], cwd);

      expect(r.status).toBe(0);
      expect(r.output).toContain('Override 目录不存在');
      expect(r.output).not.toContain('E_');
    },
    TIMEOUT,
  );

  it(
    '列出各覆盖层项目及其模块目录',
    () => {
      const cwd = makeProject();
      fs.mkdirSync(path.join(cwd, 'src/overrides/sysu/router'), { recursive: true });
      fs.mkdirSync(path.join(cwd, 'src/overrides/sysu/views'), { recursive: true });

      const r = runList([], cwd);
      expect(r.status).toBe(0);
      expect(r.output).toContain('sysu');
      expect(r.output).toContain('router, views');
    },
    TIMEOUT,
  );
});
