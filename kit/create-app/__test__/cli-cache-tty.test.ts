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

  it(
    "`--template ''`（未赋值 shell 变量插值的典型形态）按缺失处理，不落进模板选择问答",
    () => {
      const r = runCreate('empty-tpl', '', workDir);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NON_INTERACTIVE');
      expect(r.output).toContain('--template');
      expect(fs.existsSync(path.join(workDir, 'empty-tpl'))).toBe(false);
    },
    TIMEOUT,
  );
});

describe('覆盖已有目录：写入前清空，不做合并写入', () => {
  it(
    '--force 覆盖后旧文件不残留，但 .git/ 保留',
    () => {
      const repo = makeTemplateRepo();
      const source = `git+file://${repo}#master`;
      tempDirs.push(gitCacheDir({ url: `git+file://${repo}`, ref: 'master' }));
      const workDir = tempDir('create-app-overwrite-');

      // 预置一个「上次生成」的目录：残留文件 + 已有 git 仓库
      const target = path.join(workDir, 'reborn');
      fs.mkdirSync(path.join(target, '.git'), { recursive: true });
      fs.writeFileSync(path.join(target, '.git/KEEP'), 'x');
      fs.writeFileSync(path.join(target, 'STALE.txt'), '上次生成的残留');

      const r = runCreate('reborn', source, workDir, ['--force']);
      expect(r.status, r.output).toBe(0);
      expect(fs.existsSync(path.join(target, 'package.json'))).toBe(true);
      // 不清空的话这两条会失败：产物成两次生成的混合态
      expect(fs.existsSync(path.join(target, 'STALE.txt'))).toBe(false);
      expect(fs.existsSync(path.join(target, '.git/KEEP'))).toBe(true);
    },
    TIMEOUT,
  );
});

describe('override add 非 TTY 快速失败', () => {
  let projDir: string;

  beforeAll(() => {
    projDir = tempDir('create-app-ov-tty-');
    fs.writeFileSync(path.join(projDir, 'package.json'), '{"name":"host-app"}\n');
  });

  it(
    '缺参数时非零退出并列出缺失 flag（历史行为是 runPrompts 取消分支的 exit 0）',
    () => {
      const r = runCli(['override', 'add'], projDir);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NON_INTERACTIVE');
      expect(r.output).toContain('-l, --lang');
      expect(r.output).toContain('-m, --modules');
    },
    TIMEOUT,
  );

  it(
    "空串参数（`-l '' -m ''`，未赋值 shell 变量插值的典型形态）同样按缺失处理",
    () => {
      const r = runCli(['override', 'add', 'sysu', '-l', '', '-m', '', '-y'], projDir);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NON_INTERACTIVE');
      expect(r.output).toContain('-l, --lang');
      expect(r.output).toContain('-m, --modules');
    },
    TIMEOUT,
  );

  it(
    '参数齐全时非 TTY 照常生成',
    () => {
      const r = runCli(['override', 'add', 'sysu', '-l', 'ts', '-m', 'router', '-y'], projDir);
      expect(r.status, r.output).toBe(0);
      expect(fs.existsSync(path.join(projDir, 'src/overrides/sysu/router/index.ts'))).toBe(true);
      expect(fs.existsSync(path.join(projDir, 'src/overrides/registry.ts'))).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '实际撞到冲突且没给 -y / --force 时，在问答现场非零退出',
    () => {
      // 上一个用例已生成 src/overrides，gzdx 会与其中的 registry.ts 等基础设施文件冲突
      const r = runCli(['override', 'add', 'gzdx', '-l', 'ts', '-m', 'router'], projDir);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NON_INTERACTIVE');
      expect(r.output).toContain('-y');
    },
    TIMEOUT,
  );

  it(
    '输出目录存在但无冲突时，全参数运行不被误拦（目录存在 ≠ 会弹问答）',
    () => {
      fs.mkdirSync(path.join(projDir, 'src/overrides-b'), { recursive: true });
      const r = runCli(
        ['override', 'add', 'nk', '-l', 'ts', '-m', 'router', '-o', 'src/overrides-b'],
        projDir,
      );
      expect(r.status, r.output).toBe(0);
      expect(fs.existsSync(path.join(projDir, 'src/overrides-b/nk/router/index.ts'))).toBe(true);
    },
    TIMEOUT,
  );
});

afterAll(() => {
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });
});
