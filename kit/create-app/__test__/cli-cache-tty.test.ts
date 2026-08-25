/**
 * 以「真实 CLI 调用」为入口的回归：缓存/--offline 三态 + 非 TTY 快速失败
 *
 * 为什么不直接调 API：审查发现的系统性盲区就是「测试只走 API 直调」——直调时
 * options 是手写的（`{ force: true }`），而 CLI 真正传下去的是 commander 的产物
 * （没传 = undefined，历史上是默认 false）。默认值的 bug 在直调测试里天然看不见。
 * 所以这里一律 spawn `tsx src/cli.ts`，断言用户真正会遇到的行为。
 *
 * 用本地裸仓库（git+file://）做模板源：走完整 clone/缓存链路，不需要联网。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gitCacheDir } from '../src/core/git-source';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(PKG_ROOT, 'src/cli.ts');
const TSX = path.join(PKG_ROOT, 'node_modules/.bin/tsx');
const MINI_DIR = path.join(__dirname, 'fixtures', 'template-mini');

/** 每个 tsx 冷启动约 1s，整组用例给足预算 */
const TIMEOUT = 120_000;

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/**
 * 把 template-mini fixture 提交进一个本地 git 仓库，返回仓库路径
 *
 * `.template/config.ts` 用相对路径 import 了源码里的 types，克隆到缓存目录后那条
 * 相对路径就断了，所以这里改写成不依赖外部类型的自包含版本。
 */
function makeTemplateRepo(): string {
  const dir = tempDir('create-app-tplrepo-');
  fs.cpSync(MINI_DIR, dir, { recursive: true });
  const configText = fs
    .readFileSync(path.join(MINI_DIR, '.template/config.ts'), 'utf-8')
    .replace("import type { TemplateConfig } from '../../../../src/types';\n", '')
    .replace('const config: TemplateConfig = {', 'const config = {');
  fs.writeFileSync(path.join(dir, '.template/config.ts'), configText);

  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  };
  git('init', '-q', '-b', 'master');
  git('config', 'user.email', 't@t.t');
  git('config', 'user.name', 't');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return dir;
}

interface CliResult {
  status: number | null;
  output: string;
}

/** spawn 真实 CLI；stdin 是管道（非 TTY），与 CI / `< /dev/null` 同形 */
function runCli(args: string[], cwd: string): CliResult {
  const r = spawnSync(TSX, [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    input: '',
    maxBuffer: 16 * 1024 * 1024,
  });
  return { status: r.status, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** 一次「参数齐全」的生成（非 TTY 下也必须能跑完） */
function runCreate(name: string, source: string, cwd: string, extra: string[] = []): CliResult {
  return runCli(
    [
      name,
      '--template',
      source,
      '--features=i18n',
      '-d',
      'cli cache regression',
      '-y',
      '--no-git',
      '--no-install',
      ...extra,
    ],
    cwd,
  );
}

describe('CLI 缓存语义（--offline / --force 三态）', () => {
  let repo: string;
  let source: string;
  let cacheDir: string;
  let workDir: string;

  beforeAll(() => {
    repo = makeTemplateRepo();
    source = `git+file://${repo}#master`;
    cacheDir = gitCacheDir({ url: `git+file://${repo}`, ref: 'master' });
    tempDirs.push(cacheDir);
    workDir = tempDir('create-app-work-');
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  const marker = (): string => path.join(cacheDir, 'CACHE_MARKER');

  it(
    '默认（两个 flag 都没传）：缓存命中即复用，不重新 clone',
    () => {
      // 第一次：缓存为空 → 真正 clone
      const first = runCreate('app-1', source, workDir);
      expect(first.status, first.output).toBe(0);
      expect(fs.existsSync(cacheDir)).toBe(true);

      // 打标记：只要第二次没重 clone，标记就还在
      fs.writeFileSync(marker(), 'x');
      const second = runCreate('app-2', source, workDir);
      expect(second.status, second.output).toBe(0);
      expect(fs.existsSync(marker())).toBe(true);
      expect(fs.existsSync(path.join(workDir, 'app-2/package.json'))).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '--force：删缓存重新 clone',
    () => {
      fs.writeFileSync(marker(), 'x');
      const r = runCreate('app-3', source, workDir, ['--force']);
      expect(r.status, r.output).toBe(0);
      expect(fs.existsSync(marker())).toBe(false);
      expect(fs.existsSync(cacheDir)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '--offline：缓存命中时照常生成（且仍然复用缓存）',
    () => {
      fs.writeFileSync(marker(), 'x');
      const r = runCreate('app-4', source, workDir, ['--offline']);
      expect(r.status, r.output).toBe(0);
      expect(fs.existsSync(marker())).toBe(true);
      expect(fs.existsSync(path.join(workDir, 'app-4/package.json'))).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '--offline 且缓存缺失：报 E_TEMPLATE_FETCH_FAILED 并非零退出（不得偷偷联网）',
    () => {
      const fresh = makeTemplateRepo();
      const freshSource = `git+file://${fresh}#master`;
      const freshCache = gitCacheDir({ url: `git+file://${fresh}`, ref: 'master' });
      tempDirs.push(freshCache);
      fs.rmSync(freshCache, { recursive: true, force: true });

      const r = runCreate('app-5', freshSource, workDir, ['--offline']);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_TEMPLATE_FETCH_FAILED');
      expect(r.output).toContain('--offline');
      // 失败即失败，不许留下半个产物目录
      expect(fs.existsSync(path.join(workDir, 'app-5/package.json'))).toBe(false);
    },
    TIMEOUT,
  );
});

describe('非 TTY 快速失败', () => {
  let repo: string;
  let source: string;
  let workDir: string;

  beforeAll(() => {
    repo = makeTemplateRepo();
    source = `git+file://${repo}#master`;
    tempDirs.push(gitCacheDir({ url: `git+file://${repo}`, ref: 'master' }));
    workDir = tempDir('create-app-tty-');
  });

  it(
    '缺参数时非零退出并列出缺失 flag（历史行为是 onCancel 的 exit 0，CI 看不出失败）',
    () => {
      const r = runCli([], workDir);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NON_INTERACTIVE');
      expect(r.output).toContain('--template');
      expect(r.output).toContain('-y, --yes');
    },
    TIMEOUT,
  );

  it(
    '只给项目名、其余靠问答时同样非零退出',
    () => {
      const r = runCli(['half-baked', '--template', source], workDir);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NON_INTERACTIVE');
      expect(r.output).toContain('-d, --description');
      expect(fs.existsSync(path.join(workDir, 'half-baked'))).toBe(false);
    },
    TIMEOUT,
  );

  it(
    '参数齐全时非 TTY 照常跑完',
    () => {
      const r = runCreate('tty-ok', source, workDir);
      expect(r.status, r.output).toBe(0);
      expect(fs.existsSync(path.join(workDir, 'tty-ok/package.json'))).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '目标目录已存在且没给 --force 时非零退出（否则会卡在覆盖确认上）',
    () => {
      fs.mkdirSync(path.join(workDir, 'occupied'), { recursive: true });
      const r = runCreate('occupied', source, workDir);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NON_INTERACTIVE');
      expect(r.output).toContain('--force');
    },
    TIMEOUT,
  );
});

afterAll(() => {
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });
});
