/**
 * 生成后处理（git init / 安装依赖 / 「接下来」提示）
 *
 * 这一段全程靠 spawnSync 打外部命令，真跑 git/pnpm 既慢又依赖环境，所以整条
 * child_process 通路走 mock：本文件要回归的是**决策**（哪条失败要中断、哪条要吞掉、
 * 提示里该打什么命令），而不是 git 本身能不能跑。
 *
 * @clack/prompts 同样 mock 掉：spinner/outro 的文案就是用户唯一能看到的东西，
 * 收集起来断言比抓 stdout 稳。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectConfig } from '../src/types';

const cp = vi.hoisted(() => ({
  /** 每条 spawnSync 调用记为 `cmd arg arg`，用于断言执行了哪些命令 */
  calls: [] as string[],
  /** 命令 → 退出状态；未登记的命令默认成功 */
  status: new Map<string, { status: number | null; error?: Error }>(),
}));

const clack = vi.hoisted(() => ({
  starts: [] as string[],
  stops: [] as string[],
  outros: [] as string[],
}));

vi.mock('node:child_process', () => ({
  spawnSync: ((cmd: string, args: string[]) => {
    const key = `${cmd} ${args.join(' ')}`;
    cp.calls.push(key);
    return cp.status.get(cmd) ?? { status: 0 };
  }) as unknown as typeof import('node:child_process').spawnSync,
}));

vi.mock('@clack/prompts', () => {
  const noop = (): void => {};
  return {
    spinner: () => ({
      start: (msg?: string): void => {
        clack.starts.push(msg ?? '');
      },
      stop: (msg?: string): void => {
        clack.stops.push(msg ?? '');
      },
      cancel: noop,
      error: noop,
      message: noop,
      clear: noop,
      isCancelled: false,
    }),
    outro: (msg?: string): void => {
      clack.outros.push(msg ?? '');
    },
    intro: noop,
    log: {
      message: noop,
      info: noop,
      success: noop,
      step: noop,
      warn: noop,
      warning: noop,
      error: noop,
    },
  };
});

const { runPostProcess } = await import('../src/core/post-processor');

let tmpRoot: string;
const originalCwd = process.cwd();

/** 匹配 SGR 颜色序列（picocolors 的 `pc.cyan` 等只产出这一类）。 */
const ANSI_SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/**
 * 只有 outro 的那段文案是用户真正照着敲的，单独取出来断言。
 *
 * 剥掉颜色再断言：产品侧把命令名染色（`${pc.cyan(pm)} run dev`），而 picocolors 是否真的
 * 输出颜色取决于运行环境——本地非 TTY 下不输出，GitHub Actions 下（CI + GITHUB_ACTIONS）
 * 输出。带色时 `pnpm run dev` 会被 `[39m` 从中间劈开，`cd plain-app` 同理，用例便
 * 只在 CI 里失败。断言的是文案本身，与终端颜色能力无关，故统一剥色。
 */
function nextSteps(): string {
  return clack.outros.join('\n').replace(ANSI_SGR, '');
}

function makeConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: 'my-app',
    description: '',
    platform: 'web',
    features: [],
    params: {},
    outputDir: tmpRoot,
    packageManager: 'pnpm',
    initGit: false,
    installDeps: false,
    ...overrides,
  };
}

/** 造一个产物目录；scripts 为 undefined 表示不写 package.json */
function makeDest(name: string, scripts?: Record<string, string>): string {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  if (scripts) {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts }));
  }
  return dir;
}

beforeEach(() => {
  // realpath：macOS 的 os.tmpdir() 是 /var 软链，而 printNextSteps 拿 process.cwd()
  // 去裁前缀，不归一化的话相对路径裁不掉
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-pp-')));
  process.chdir(tmpRoot);
  cp.calls.length = 0;
  cp.status.clear();
  clack.starts.length = 0;
  clack.stops.length = 0;
  clack.outros.length = 0;
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('runPostProcess - git init', () => {
  it('initGit 时依次执行 init / add -A / commit', async () => {
    const dest = makeDest('ok', { dev: 'vite' });
    await runPostProcess(makeConfig({ initGit: true }), dest);

    expect(cp.calls).toEqual(['git init', 'git add -A', 'git commit -m chore: 初始化项目']);
    expect(clack.stops).toContain('Git 仓库初始化完成');
  });

  it('git 命令失败时只提示跳过，不中断生成', async () => {
    cp.status.set('git', { status: 1 });
    const dest = makeDest('gitfail', { dev: 'vite' });

    await expect(runPostProcess(makeConfig({ initGit: true }), dest)).resolves.toBeUndefined();

    expect(clack.stops).toContain('Git 初始化失败（跳过）');
    // 关键：失败被吞掉之后必须继续走到「接下来」提示，项目本身已经生成好了
    expect(nextSteps()).toContain('项目创建成功');
  });

  it('机器上没装 git（spawn 报错、status 为 null）同样按跳过处理', async () => {
    cp.status.set('git', { status: null, error: Object.assign(new Error('ENOENT'), {}) });
    const dest = makeDest('nogit', { dev: 'vite' });

    await expect(runPostProcess(makeConfig({ initGit: true }), dest)).resolves.toBeUndefined();
    expect(clack.stops).toContain('Git 初始化失败（跳过）');
    expect(nextSteps()).toContain('项目创建成功');
  });

  it('initGit 为 false 时一条 git 命令都不发', async () => {
    const dest = makeDest('nogitflag', { dev: 'vite' });
    await runPostProcess(makeConfig({ initGit: false }), dest);
    expect(cp.calls).toEqual([]);
  });
});

describe('runPostProcess - 安装依赖', () => {
  it('installDeps 时用所选包管理器执行 install', async () => {
    const dest = makeDest('install', { dev: 'vite' });
    await runPostProcess(makeConfig({ installDeps: true, packageManager: 'yarn' }), dest);

    expect(cp.calls).toEqual(['yarn install']);
    expect(clack.stops).toContain('依赖安装完成');
  });

  it('安装失败抛 E_INSTALL_FAILED，带可操作的 suggestion', async () => {
    cp.status.set('pnpm', { status: 1 });
    const dest = makeDest('installfail', { dev: 'vite' });

    await expect(runPostProcess(makeConfig({ installDeps: true }), dest)).rejects.toMatchObject({
      code: 'E_INSTALL_FAILED',
      message: expect.stringContaining('pnpm install') as unknown as string,
      suggestion: expect.stringContaining('手动') as unknown as string,
    });
    expect(clack.stops).toContain('依赖安装失败');
    // 与 git 失败相反：安装失败是硬错，不能再打「项目创建成功」
    expect(clack.outros).toEqual([]);
  });

  it('git 失败被吞、安装失败仍然抛（两条分支的处置不能串味）', async () => {
    cp.status.set('git', { status: 1 });
    cp.status.set('npm', { status: 1 });
    const dest = makeDest('both', { dev: 'vite' });

    await expect(
      runPostProcess(makeConfig({ initGit: true, installDeps: true, packageManager: 'npm' }), dest),
    ).rejects.toMatchObject({ code: 'E_INSTALL_FAILED' });
    expect(clack.stops).toContain('Git 初始化失败（跳过）');
  });
});

describe('printNextSteps - 启动脚本回退', () => {
  // 写死 `dev` 会让 admin 模板（脚本名叫 start）的用户照着提示敲出 "Missing script: dev"
  it.each([
    [{ dev: 'vite', start: 'vite', serve: 'vite' }, 'dev'],
    [{ start: 'vite', serve: 'vite' }, 'start'],
    [{ serve: 'vite' }, 'serve'],
    [{ build: 'vite build' }, 'dev'],
    [{}, 'dev'],
  ])('scripts=%j → 提示 run %s', async (scripts, expected) => {
    const dest = makeDest(`s-${expected}-${Object.keys(scripts).join('')}`, scripts);
    await runPostProcess(makeConfig(), dest);
    expect(nextSteps()).toContain(`pnpm run ${expected}`);
  });

  it('package.json 缺失或不是合法 JSON 时退回 dev（不能把异常抛给用户）', async () => {
    const missing = makeDest('no-pkg');
    await runPostProcess(makeConfig(), missing);
    expect(nextSteps()).toContain('pnpm run dev');

    clack.outros.length = 0;
    const broken = makeDest('broken-pkg');
    fs.writeFileSync(path.join(broken, 'package.json'), '{ not json');
    await runPostProcess(makeConfig(), broken);
    expect(nextSteps()).toContain('pnpm run dev');
  });
});

describe('printNextSteps - cd 路径转义', () => {
  it('普通目录名不加引号', async () => {
    const dest = makeDest('plain-app', { dev: 'vite' });
    await runPostProcess(makeConfig(), dest);
    expect(nextSteps()).toContain('cd plain-app\n');
  });

  it('含空格的目录名加单引号（照原样打印出来是一条跑不通的命令）', async () => {
    const dest = makeDest('my app', { dev: 'vite' });
    await runPostProcess(makeConfig(), dest);
    expect(nextSteps()).toContain("cd 'my app'");
  });

  it('目录名里的单引号被正确转义', async () => {
    const dest = makeDest("tom's app", { dev: 'vite' });
    await runPostProcess(makeConfig(), dest);
    expect(nextSteps()).toContain("cd 'tom'\\''s app'");
  });

  it('中文目录名同样加引号（不在 shell 安全字符集里）', async () => {
    const dest = makeDest('我的项目', { dev: 'vite' });
    await runPostProcess(makeConfig(), dest);
    expect(nextSteps()).toContain("cd '我的项目'");
  });
});

describe('printNextSteps - install 提示', () => {
  it('未安装依赖时提示里带 install 那一行', async () => {
    const dest = makeDest('need-install', { dev: 'vite' });
    await runPostProcess(makeConfig({ installDeps: false, packageManager: 'yarn' }), dest);
    expect(nextSteps()).toContain('yarn install');
  });

  it('已安装依赖时不再提示 install', async () => {
    const dest = makeDest('installed', { dev: 'vite' });
    await runPostProcess(makeConfig({ installDeps: true, packageManager: 'yarn' }), dest);
    expect(nextSteps()).not.toContain('yarn install');
    expect(nextSteps()).toContain('yarn run dev');
  });
});
