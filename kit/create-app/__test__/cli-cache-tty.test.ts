/**
 * 以「真实 CLI 调用」为入口的回归：缓存/--offline 三态 + 非 TTY 快速失败
 *
 * 为什么不直接调 API：审查发现的系统性盲区就是「测试只走 API 直调」——直调时
 * options 是手写的（`{ refresh: true }`），而 CLI 真正传下去的是 commander 的产物
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
function makeTemplateRepo(mutateConfig?: (text: string) => string): string {
  const dir = tempDir('create-app-tplrepo-');
  fs.cpSync(MINI_DIR, dir, { recursive: true });
  let configText = fs
    .readFileSync(path.join(MINI_DIR, '.template/config.ts'), 'utf-8')
    .replace("import type { TemplateConfig } from '../../../../src/types';\n", '')
    .replace('const config: TemplateConfig = {', 'const config = {');
  if (mutateConfig) configText = mutateConfig(configText);
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

describe('CLI 缓存语义（--offline / --refresh 三态）', () => {
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
    '--refresh：删缓存重新 clone',
    () => {
      fs.writeFileSync(marker(), 'x');
      const r = runCreate('app-3', source, workDir, ['--refresh']);
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

describe('--force 与 --refresh 拆分后的语义', () => {
  let repo: string;
  let source: string;
  let cacheDir: string;
  let workDir: string;

  beforeAll(() => {
    repo = makeTemplateRepo();
    source = `git+file://${repo}#master`;
    cacheDir = gitCacheDir({ url: `git+file://${repo}`, ref: 'master' });
    tempDirs.push(cacheDir);
    workDir = tempDir('create-app-split-');
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it(
    '--force 只清空目标目录，不再刷缓存（拆分前它同时干这两件事）',
    () => {
      // 先填充缓存并打标记
      expect(runCreate('split-1', source, workDir).status).toBe(0);
      const marker = path.join(cacheDir, 'CACHE_MARKER');
      fs.writeFileSync(marker, 'x');

      // 目标目录已存在 → 需要 --force；标记应当还在（说明没重新 clone）
      const r = runCreate('split-1', source, workDir, ['--force']);
      expect(r.status, r.output).toBe(0);
      expect(fs.existsSync(marker)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '--force --offline 现在是合法组合（拆分前 --force 会压掉 --offline 去联网）',
    () => {
      fs.mkdirSync(path.join(workDir, 'split-2'), { recursive: true });
      fs.writeFileSync(path.join(workDir, 'split-2/stale.txt'), 'old');

      const r = runCreate('split-2', source, workDir, ['--force', '--offline']);
      expect(r.status, r.output).toBe(0);
      // 目录被清空后重新写入，且全程只用缓存
      expect(fs.existsSync(path.join(workDir, 'split-2/stale.txt'))).toBe(false);
      expect(fs.existsSync(path.join(workDir, 'split-2/package.json'))).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '--refresh --offline 自相矛盾，直接报 E_INVALID_OPTION',
    () => {
      const r = runCreate('split-3', source, workDir, ['--refresh', '--offline']);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_INVALID_OPTION');
      expect(fs.existsSync(path.join(workDir, 'split-3'))).toBe(false);
    },
    TIMEOUT,
  );

  it(
    '缓存有年龄时提示，刚克隆出来的不提示（否则首次生成会看到「复用缓存（刚刚拉取）」）',
    () => {
      // 首次克隆：缓存目录 mtime 就是刚刚，不该冒出「复用缓存」
      fs.rmSync(cacheDir, { recursive: true, force: true });
      const fresh = runCreate('split-4', source, workDir);
      expect(fresh.status, fresh.output).toBe(0);
      expect(fresh.output).not.toContain('复用模板缓存');

      // 把缓存目录 mtime 往前拨 3 天，再生成一次就该提示了
      const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      fs.utimesSync(cacheDir, past, past);
      const stale = runCreate('split-5', source, workDir);
      expect(stale.status, stale.output).toBe(0);
      expect(stale.output).toContain('复用模板缓存');
      expect(stale.output).toContain('3 天前拉取');
      expect(stale.output).toContain('--refresh');
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
    '`.` 前缀的项目名被拒（`.git` 会命中「清空后写入」，把当前仓库的 .git 清掉）',
    () => {
      // 把 workDir 做成一个真仓库，确保这条断言覆盖的是真实后果
      execFileSync('git', ['init', '-q'], { cwd: workDir });
      const head = path.join(workDir, '.git/HEAD');
      expect(fs.existsSync(head)).toBe(true);

      const r = runCreate('.git', source, workDir, ['--force']);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_INVALID_PROJECT_NAME');
      // .git 仍然完好
      expect(fs.existsSync(head)).toBe(true);
      fs.rmSync(path.join(workDir, '.git'), { recursive: true, force: true });
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

describe('非 TTY 的 git / install / dry-run 语义', () => {
  let repo: string;
  let source: string;
  let workDir: string;

  beforeAll(() => {
    repo = makeTemplateRepo();
    source = `git+file://${repo}#master`;
    tempDirs.push(gitCacheDir({ url: `git+file://${repo}`, ref: 'master' }));
    workDir = tempDir('create-app-post-');
  });

  /** 除 git/install 之外参数齐全（这两项交由用例自己表态） */
  const runBare = (name: string, extra: string[]): CliResult =>
    runCli(
      [name, '--template', source, '--features=i18n', '-d', 'post options', '-y', ...extra],
      workDir,
    );

  it(
    'git / install 没表态时非零退出，且提示两种表态方式',
    () => {
      const r = runBare('post-none', []);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NON_INTERACTIVE');
      expect(r.output).toContain('--git 或 --no-git');
      expect(r.output).toContain('--install 或 --no-install');
    },
    TIMEOUT,
  );

  it(
    '`--git` 在非 TTY 下真的会 git init（旧实现只有 --no-git，CI 里没法初始化仓库）',
    () => {
      const r = runBare('post-git', ['--git', '--no-install']);
      expect(r.status, r.output).toBe(0);
      expect(fs.existsSync(path.join(workDir, 'post-git/.git'))).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '`--install` 缺 `--pm` 时非零退出（否则会卡在「包管理器」那一问）',
    () => {
      const r = runBare('post-install', ['--no-git', '--install']);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('--pm');
      expect(fs.existsSync(path.join(workDir, 'post-install'))).toBe(false);
    },
    TIMEOUT,
  );

  it(
    '`--pm` 取值不合法时早失败（在问答与 clone 之前）',
    () => {
      const r = runBare('post-badpm', ['--no-git', '--install', '--pm', 'bun']);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('--pm 取值不合法');
      expect(r.output).toContain('pnpm | npm | yarn');
    },
    TIMEOUT,
  );

  it(
    '`--dry-run` 不因目标目录已存在而要求 --force（只读预览不该被逼传危险 flag）',
    () => {
      fs.mkdirSync(path.join(workDir, 'dry-occupied'), { recursive: true });
      fs.writeFileSync(path.join(workDir, 'dry-occupied/keep.txt'), 'keep');

      const r = runCli(
        ['dry-occupied', '--template', source, '--features=i18n', '-d', 'dry', '--dry-run'],
        workDir,
      );
      expect(r.status, r.output).toBe(0);
      expect(r.output).toContain('Dry-run');
      // 既不写盘也不清空已有内容
      expect(fs.readFileSync(path.join(workDir, 'dry-occupied/keep.txt'), 'utf-8')).toBe('keep');
      expect(fs.existsSync(path.join(workDir, 'dry-occupied/package.json'))).toBe(false);
    },
    TIMEOUT,
  );

  it(
    '`--dry-run` 也不要求 git / install 表态',
    () => {
      const r = runCli(
        ['dry-fresh', '--template', source, '--features=i18n', '-d', 'dry', '--dry-run'],
        workDir,
      );
      expect(r.status, r.output).toBe(0);
      expect(fs.existsSync(path.join(workDir, 'dry-fresh'))).toBe(false);
    },
    TIMEOUT,
  );

  it(
    '同名的普通文件（非目录）直接报 E_DIR_WRITE_FAILED，而不是裸 ENOTDIR',
    () => {
      fs.writeFileSync(path.join(workDir, 'filey'), 'x');
      const r = runCreate('filey', source, workDir, ['--force']);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_DIR_WRITE_FAILED');
      expect(r.output).not.toContain('ENOTDIR');
      expect(fs.readFileSync(path.join(workDir, 'filey'), 'utf-8')).toBe('x');
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

  /** 摆上 override 内核与基础设施：它们由模板的 overrides 特性提供，本包只生成按租户的骨架 */
  const seedKernel = (root: string, output: string): void => {
    fs.mkdirSync(path.join(root, 'src/plugins/override'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/plugins/override/index.ts'), 'export {};\n');
    fs.mkdirSync(path.join(root, output), { recursive: true });
    for (const rel of ['types.ts', 'index.ts', 'registry.ts', 'deployment.ts']) {
      fs.writeFileSync(path.join(root, output, rel), `// 模板提供：${rel}\nexport {};\n`);
    }
  };

  beforeAll(() => {
    projDir = tempDir('create-app-ov-tty-');
    fs.writeFileSync(path.join(projDir, 'package.json'), '{"name":"host-app"}\n');
    seedKernel(projDir, 'src/overrides');
  });

  it(
    '缺参数时非零退出并列出缺失 flag（历史行为是 runPrompts 取消分支的 exit 0）',
    () => {
      const r = runCli(['override', 'add'], projDir);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NON_INTERACTIVE');
      expect(r.output).toContain('-m, --modules');
    },
    TIMEOUT,
  );

  it(
    "空串参数（`-m ''`，未赋值 shell 变量插值的典型形态）同样按缺失处理",
    () => {
      const r = runCli(['override', 'add', 'sysu', '-m', '', '-y'], projDir);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NON_INTERACTIVE');
      expect(r.output).toContain('-m, --modules');
    },
    TIMEOUT,
  );

  it(
    '参数齐全时非 TTY 照常生成',
    () => {
      const r = runCli(['override', 'add', 'sysu', '-m', 'router', '-y'], projDir);
      expect(r.status, r.output).toBe(0);
      expect(fs.existsSync(path.join(projDir, 'src/overrides/sysu/router/index.ts'))).toBe(true);
      // 基础设施是前置文件，本包不生成也不改写
      expect(fs.readFileSync(path.join(projDir, 'src/overrides/registry.ts'), 'utf-8')).toContain(
        '模板提供',
      );
    },
    TIMEOUT,
  );

  it(
    '实际撞到冲突且没给 -y / --force 时，在问答现场非零退出',
    () => {
      // 预先占住 gzdx 骨架里的一个文件，制造真冲突
      //（基础设施不再由本包生成，第二个租户本身不会撞到任何已有文件）
      fs.mkdirSync(path.join(projDir, 'src/overrides/gzdx/router'), { recursive: true });
      fs.writeFileSync(path.join(projDir, 'src/overrides/gzdx/router/index.ts'), '// 手写内容\n');

      const r = runCli(['override', 'add', 'gzdx', '-m', 'router'], projDir);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NON_INTERACTIVE');
      expect(r.output).toContain('-y');
    },
    TIMEOUT,
  );

  it(
    '输出目录存在但无冲突时，全参数运行不被误拦（目录存在 ≠ 会弹问答）',
    () => {
      seedKernel(projDir, 'src/overrides-b');
      const r = runCli(['override', 'add', 'nk', '-m', 'router', '-o', 'src/overrides-b'], projDir);
      expect(r.status, r.output).toBe(0);
      expect(fs.existsSync(path.join(projDir, 'src/overrides-b/nk/router/index.ts'))).toBe(true);
    },
    TIMEOUT,
  );
});

describe('模板参数（params 声明区）', () => {
  /** 把 mini 的固定 variables 改写为 params 声明 */
  const withParams = (defaultValue?: string) => (text: string) =>
    text.replace(
      "variables: { '{{project-title}}': 'Mini App' },",
      defaultValue === undefined
        ? "variables: {},\n  params: { 'project-title': { label: '项目标题' } },"
        : `variables: {},\n  params: { 'project-title': { label: '项目标题', default: '${defaultValue}' } },`,
    );

  let workDir: string;
  let source: string;

  beforeAll(() => {
    workDir = tempDir('create-app-params-');
    const repo = makeTemplateRepo(withParams('Mini App'));
    source = `git+file://${repo}#master`;
    tempDirs.push(gitCacheDir({ url: `git+file://${repo}`, ref: 'master' }));
  });

  it(
    '非 TTY 未传 --param 时采用声明的 default',
    () => {
      const r = runCreate('p-default', source, workDir);
      expect(r.status, r.output).toBe(0);
      const readme = fs.readFileSync(path.join(workDir, 'p-default/README.md'), 'utf-8');
      expect(readme).toContain('Mini App');
      expect(readme).not.toContain('{{project-title}}');
    },
    TIMEOUT,
  );

  it(
    '--param 的取值优先于 default',
    () => {
      const r = runCreate('p-custom', source, workDir, ['--param', 'project-title=定制标题']);
      expect(r.status, r.output).toBe(0);
      const readme = fs.readFileSync(path.join(workDir, 'p-custom/README.md'), 'utf-8');
      expect(readme).toContain('定制标题');
      expect(readme).not.toContain('Mini App');
    },
    TIMEOUT,
  );

  it(
    '未知参数名报 E_INVALID_PARAM 并列出可用参数',
    () => {
      const r = runCreate('p-unknown', source, workDir, ['--param', 'nope=1']);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_INVALID_PARAM');
      expect(r.output).toContain('project-title');
      expect(fs.existsSync(path.join(workDir, 'p-unknown'))).toBe(false);
    },
    TIMEOUT,
  );

  it(
    '无 default 的参数在非 TTY 下未传 --param 时快速失败',
    () => {
      const repo = makeTemplateRepo(withParams(undefined));
      const noDefaultSource = `git+file://${repo}#master`;
      tempDirs.push(gitCacheDir({ url: `git+file://${repo}`, ref: 'master' }));

      const r = runCreate('p-missing', noDefaultSource, workDir);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NON_INTERACTIVE');
      expect(r.output).toContain('--param project-title=');
      expect(fs.existsSync(path.join(workDir, 'p-missing'))).toBe(false);
    },
    TIMEOUT,
  );
});

afterAll(() => {
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });
});
