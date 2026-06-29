import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * CLI 入口层（cli.ts main）守卫的黑盒 e2e。
 *
 * main() 不导出（模块加载即执行），故无法在进程内单测；改用子进程跑 `tsx src/cli.ts <args>`，
 * 断言这些「参数路由 / UX 守卫」如实以非零状态码拦截误用——它们都在进入具体 processor 的
 * 重活（LLM / AST）之前提前退出，故无需真实源码、网络或 locale 数据。
 *
 * 覆盖的守卫：缺配置、--coverage-threshold 非法（NaN / 越界）、--dry-run 与 --apply-plan
 * 互斥、未配置 io.customDir 时 --custom 报错；并用 --help 作为「成功路径仍返回 0」的对照。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '../src/cli.ts');

/** 定位本包自带的 tsx 可执行文件（直跑二进制不受子进程 cwd 影响，自带 TS loader）。 */
function resolveTsx(): string {
  const base = path.resolve(__dirname, '../node_modules/.bin/tsx');
  if (process.platform === 'win32') {
    for (const ext of ['.CMD', '.cmd', '.exe']) {
      if (fs.existsSync(base + ext)) return base + ext;
    }
  }
  return fs.existsSync(base) ? base : 'tsx';
}
const TSX = resolveTsx();

function runCli(args: string[], cwd: string): { code: number; out: string } {
  const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
  const res =
    process.platform === 'win32'
      ? spawnSync([TSX, CLI, ...args].map((s) => `"${s}"`).join(' '), {
          cwd,
          shell: true,
          encoding: 'utf-8',
          env,
        })
      : spawnSync(TSX, [CLI, ...args], { cwd, encoding: 'utf-8', env });
  return { code: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

const VALID_CONFIG = `export default {
  root: process.cwd(),
  framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
  locales: { source: 'zh', targets: ['en'] },
  io: { localesDir: 'i18n', sourceDir: 'src' },
  llm: { shared: { apiKey: 'test-key', model: 'gpt-4o' } },
};
`;

// tsx 冷启动 + 子进程，给足超时
const T = 30_000;

describe('CLI 入口守卫（cli.ts main）', () => {
  let emptyDir: string; // 无配置
  let cfgDir: string; // 有合法配置（无 io.customDir）

  beforeAll(() => {
    emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-cli-empty-'));
    cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-cli-cfg-'));
    fs.writeFileSync(path.join(cfgDir, 'i18n.config.mjs'), VALID_CONFIG, 'utf-8');
  });

  afterAll(() => {
    fs.rmSync(emptyDir, { recursive: true, force: true });
    fs.rmSync(cfgDir, { recursive: true, force: true });
  });

  it(
    '缺配置文件 → 非零退出并提示创建 i18n.config',
    () => {
      const { code, out } = runCli(['--mode', 'generate', '--path', 'x'], emptyDir);
      expect(code).toBe(1);
      expect(out).toMatch(/无法加载配置文件/);
    },
    T,
  );

  it(
    '--coverage-threshold 非数字（拼错）→ 非零退出，不静默关闭门禁',
    () => {
      const { code, out } = runCli(['--mode', 'generate', '--coverage-threshold', 'abc'], cfgDir);
      expect(code).toBe(1);
      expect(out).toMatch(/coverage-threshold 必须是 \[0, 100\]/);
    },
    T,
  );

  it(
    '--coverage-threshold 越界（>100）→ 非零退出',
    () => {
      const { code, out } = runCli(['--mode', 'generate', '--coverage-threshold', '150'], cfgDir);
      expect(code).toBe(1);
      expect(out).toMatch(/\[0, 100\]/);
    },
    T,
  );

  it(
    '--dry-run 与 --apply-plan 同传 → 非零退出（互斥）',
    () => {
      const { code, out } = runCli(
        ['--mode', 'generate', '--dry-run', '--apply-plan', 'latest'],
        cfgDir,
      );
      expect(code).toBe(1);
      expect(out).toMatch(/--dry-run 与 --apply-plan 互斥/);
    },
    T,
  );

  it(
    '未配置 io.customDir 时 --custom → 非零退出',
    () => {
      const { code, out } = runCli(['--mode', 'generate', '--custom'], cfgDir);
      expect(code).toBe(1);
      expect(out).toMatch(/未配置 io.customDir/);
    },
    T,
  );

  it(
    '--path 指向不存在的路径 → 非零退出（resolveTargetPath 路径校验守卫）',
    () => {
      const { code, out } = runCli(['--mode', 'generate', '--path', 'no/such/path/x.vue'], cfgDir);
      expect(code).toBe(1);
      expect(out).toMatch(/--path 无效/);
    },
    T,
  );

  it(
    '非交互模式（--mode）未传 --path → 非零退出并提示需用 --path',
    () => {
      const { code, out } = runCli(['--mode', 'generate'], cfgDir);
      expect(code).toBe(1);
      expect(out).toMatch(/需用 --path/);
    },
    T,
  );

  it(
    'csv-import 非交互且未传 --output → 非零退出',
    () => {
      const { code, out } = runCli(['--mode', 'csv-import'], cfgDir);
      expect(code).toBe(1);
      expect(out).toMatch(/csv-import 需要 --output/);
    },
    T,
  );

  it(
    '--help → 成功退出（确认守卫不是恒返回非零）',
    () => {
      const { code, out } = runCli(['--help'], cfgDir);
      expect(code).toBe(0);
      expect(out).toMatch(/国际化工具集|--mode/);
    },
    T,
  );
});
