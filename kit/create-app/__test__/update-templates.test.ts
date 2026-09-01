/**
 * `create-app update-templates`
 *
 * 这条命令的价值全在「部分失败不能拖垮整体」：注册表里一个模板拉不动（换了地址、
 * 没有 ssh 权限）不该让剩下的模板也刷不了缓存，但也不能一声不吭地当成功。
 *
 * 注册表通过 XDG_CONFIG_HOME 注入（用户级条目按 id 覆盖内置条目），模板源用本地
 * git 仓库 + `git+file://` 走完整 clone 链路，全程不联网。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitCacheDir } from '../src/core/git-source';

const clack = vi.hoisted(() => ({
  starts: [] as string[],
  stops: [] as string[],
  outros: [] as string[],
  warns: [] as string[],
  errors: [] as string[],
}));

vi.mock('@clack/prompts', () => {
  const noop = (): void => {};
  return {
    intro: noop,
    outro: (msg?: string): void => {
      clack.outros.push(msg ?? '');
    },
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
    log: {
      message: noop,
      info: noop,
      success: noop,
      step: noop,
      warn: (msg: string): void => {
        clack.warns.push(msg);
      },
      warning: noop,
      error: (msg: string): void => {
        clack.errors.push(msg);
      },
    },
  };
});

const { updateTemplates } = await import('../src/commands/update-templates');

const originalXdg = process.env['XDG_CONFIG_HOME'];
let configHome: string;
const cleanup: string[] = [];

/** 造一个带 .template/config.ts 的本地 git 仓库（同 git-source.test.ts 的做法） */
function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-ut-repo-'));
  cleanup.push(dir);
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  };
  git('init', '-q', '-b', 'master');
  git('config', 'user.email', 't@t.t');
  git('config', 'user.name', 't');
  fs.mkdirSync(path.join(dir, '.template'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.template/config.ts'),
    'export default { id: "t", platform: "web", compatibleCliVersions: "*", variables: {}, features: {} };\n',
  );
  git('add', '-A');
  git('commit', '-qm', 'init');
  return dir;
}

/** 覆盖内置的 admin / h5 两条，让注册表里只剩本用例可控的源 */
function writeRegistry(sources: { admin: string; h5: string }): void {
  const dir = path.join(configHome, 'create-app');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'templates.json'),
    JSON.stringify([
      { id: 'admin', label: '后台管理系统', platform: 'web', source: sources.admin },
      { id: 'h5', label: '移动端 H5', platform: 'mobile', source: sources.h5 },
    ]),
  );
}

/** 记住这个 git 源对应的缓存目录，测完删掉 */
function trackCache(source: string): string {
  const [url, ref] = source.split('#');
  const dir = gitCacheDir({ url: url!, ref });
  cleanup.push(dir);
  return dir;
}

beforeEach(() => {
  configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-ut-xdg-'));
  process.env['XDG_CONFIG_HOME'] = configHome;
  clack.starts.length = 0;
  clack.stops.length = 0;
  clack.outros.length = 0;
  clack.warns.length = 0;
  clack.errors.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(configHome, { recursive: true, force: true });
  if (originalXdg === undefined) delete process.env['XDG_CONFIG_HOME'];
  else process.env['XDG_CONFIG_HOME'] = originalXdg;
  for (const dir of cleanup.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('updateTemplates - 正常刷新', () => {
  it('远端源被重新拉取，本地路径源跳过（不走缓存，没得刷）', async () => {
    const repo = makeRepo();
    const source = `git+file://${repo}#master`;
    const cacheDir = trackCache(source);
    writeRegistry({ admin: source, h5: repo });

    await updateTemplates();

    // 只有 admin 那条起过 spinner，h5（本地路径）连提示都不该出现
    expect(clack.starts).toEqual(['拉取 后台管理系统 模板...']);
    expect(clack.stops).toEqual(['后台管理系统 模板已更新']);
    expect(clack.warns).toEqual([]);
    expect(clack.outros).toEqual(['模板缓存刷新完成']);
    expect(fs.existsSync(path.join(cacheDir, '.template/config.ts'))).toBe(true);
  });

  it('refresh 语义：已有缓存被整个丢弃重建，不是增量合并', async () => {
    const repo = makeRepo();
    const source = `git+file://${repo}#master`;
    const cacheDir = trackCache(source);
    writeRegistry({ admin: source, h5: repo });

    await updateTemplates();
    fs.writeFileSync(path.join(cacheDir, 'STALE'), 'x');
    await updateTemplates();

    expect(fs.existsSync(path.join(cacheDir, 'STALE'))).toBe(false);
  });
});

describe('updateTemplates - 失败路径', () => {
  it('单个模板拉取失败只记 warn 并继续，整体仍然收尾成功', async () => {
    const repo = makeRepo();
    const ok = `git+file://${repo}#master`;
    const broken = `git+file://${path.join(os.tmpdir(), 'create-app-no-such-repo-xyz')}#master`;
    trackCache(ok);
    trackCache(broken);
    // 坏的那条排在前面（注册表顺序 admin → h5），确认它不会终止后面的刷新
    writeRegistry({ admin: broken, h5: ok });

    await expect(updateTemplates()).resolves.toBeUndefined();

    expect(clack.starts).toHaveLength(2);
    expect(clack.stops).toEqual(['后台管理系统 模板更新失败', '移动端 H5 模板已更新']);
    expect(clack.warns).toHaveLength(1);
    expect(clack.warns[0]).toContain('克隆模板仓库失败');
    expect(clack.outros).toEqual(['模板缓存刷新完成']);
  });

  it('注册表本身不可读时走统一错误出口（带错误码 + 非零退出），不是裸崩', async () => {
    fs.mkdirSync(path.join(configHome, 'create-app'), { recursive: true });
    fs.writeFileSync(path.join(configHome, 'create-app/templates.json'), '{ 这不是 json');

    const exit = vi.spyOn(process, 'exit').mockImplementation(((): never => {
      throw new Error('process.exit called');
    }) as never);

    await expect(updateTemplates()).rejects.toThrow('process.exit called');

    expect(exit).toHaveBeenCalledWith(1);
    expect(clack.errors.join('\n')).toContain('E_INVALID_USER_CONFIG');
    // 失败时不能打出「刷新完成」
    expect(clack.outros).toEqual([]);
  });
});
