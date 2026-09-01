import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  buildCloneArgs,
  gitCacheDir,
  gitCacheRoot,
  isGitSource,
  parseGitSource,
  toCloneUrl,
} from '../src/core/git-source';
import { TemplateResolver } from '../src/core/resolver';

const SSH = 'git+ssh://git@git.zhihuishu.com/weijie/vue-admin-template.git';
const SCP = 'git@git.zhihuishu.com:weijie/vue-admin-template.git';

describe('isGitSource', () => {
  it('识别 git+ssh:// 与 scp 简写（含 #ref）', () => {
    expect(isGitSource(SSH)).toBe(true);
    expect(isGitSource(`${SSH}#master`)).toBe(true);
    expect(isGitSource(SCP)).toBe(true);
    expect(isGitSource(`${SCP}#v1.2.0`)).toBe(true);
  });

  it('本地路径与托管平台简写都不是 git 源（后者在 fetch 里报不支持的源格式）', () => {
    expect(isGitSource('/abs/tpl')).toBe(false);
    expect(isGitSource('./tpl')).toBe(false);
    expect(isGitSource('~/tpl')).toBe(false);
    expect(isGitSource('file:./tpl')).toBe(false);
    expect(isGitSource('github:org/repo')).toBe(false);
    expect(isGitSource('gitlab:org/repo')).toBe(false);
  });
});

describe('parseGitSource', () => {
  it('scp 简写归一化为 git+ssh://', () => {
    expect(parseGitSource(SCP)).toEqual({ url: SSH, ref: undefined });
  });

  it('#ref 被切出，且不影响 URL', () => {
    expect(parseGitSource(`${SSH}#master`)).toEqual({ url: SSH, ref: 'master' });
    expect(parseGitSource(`${SCP}#release/1.0`)).toEqual({ url: SSH, ref: 'release/1.0' });
  });

  it('无 ref 时 ref 为 undefined；空 ref 同样视为未指定', () => {
    expect(parseGitSource(SSH).ref).toBeUndefined();
    expect(parseGitSource(`${SSH}#`).ref).toBeUndefined();
  });

  it('归一化是幂等的', () => {
    const once = parseGitSource(`${SCP}#master`);
    expect(parseGitSource(`${once.url}#${once.ref}`)).toEqual(once);
  });
});

describe('toCloneUrl', () => {
  it('剥掉 git+ 前缀（git 本身不认这个 scheme）', () => {
    expect(toCloneUrl(SSH)).toBe('ssh://git@git.zhihuishu.com/weijie/vue-admin-template.git');
  });

  it('没有 git+ 前缀时原样返回', () => {
    expect(toCloneUrl('ssh://git@h/o/r.git')).toBe('ssh://git@h/o/r.git');
  });
});

describe('gitCacheDir', () => {
  it('落在 ~/.cache/create-app 下，目录名含 repo 名便于排查', () => {
    const dir = gitCacheDir(parseGitSource(`${SSH}#master`));
    expect(path.dirname(dir)).toBe(gitCacheRoot());
    expect(path.basename(dir)).toMatch(/^git-vue-admin-template-[0-9a-f]{12}$/);
  });

  it('同 url 同 ref → 同目录（缓存可命中）', () => {
    expect(gitCacheDir(parseGitSource(`${SSH}#master`))).toBe(
      gitCacheDir(parseGitSource(`${SCP}#master`)),
    );
  });

  it('同 url 不同 ref → 不同目录（切分支不会读到上次内容）', () => {
    expect(gitCacheDir(parseGitSource(`${SSH}#master`))).not.toBe(
      gitCacheDir(parseGitSource(`${SSH}#dev`)),
    );
  });
});

describe('buildCloneArgs', () => {
  it('浅克隆；指定 ref 时带 -b', () => {
    expect(buildCloneArgs(parseGitSource(`${SSH}#master`), '/tmp/x')).toEqual([
      'clone',
      '--depth',
      '1',
      '-b',
      'master',
      toCloneUrl(SSH),
      '/tmp/x',
    ]);
  });

  it('未指定 ref 时不带 -b（用远端默认分支）', () => {
    expect(buildCloneArgs(parseGitSource(SSH), '/tmp/x')).toEqual([
      'clone',
      '--depth',
      '1',
      toCloneUrl(SSH),
      '/tmp/x',
    ]);
  });
});

// ---------------------------------------------------------------- clone 通路（本地 repo，不联网）

/** 造一个带 .template/config.ts 的本地 git 仓库，用 file:// 验证 clone 链路 */
function makeLocalRepo(withConfig: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-repo-'));
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  };
  git('init', '-q', '-b', 'master');
  git('config', 'user.email', 't@t.t');
  git('config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}\n');
  if (withConfig) {
    fs.mkdirSync(path.join(dir, '.template'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.template/config.ts'),
      'export default { id: "t", platform: "web", compatibleCliVersions: "*", variables: {}, features: {} };\n',
    );
  }
  git('add', '-A');
  git('commit', '-qm', 'init');
  return dir;
}

/** 缓存根下属于 dir 的 `.tmp-*` 残留（只看本模板的前缀，别的模板不关本用例的事） */
function tmpSiblings(dir: string): string[] {
  const parent = path.dirname(dir);
  if (!fs.existsSync(parent)) return [];
  return fs.readdirSync(parent).filter((name) => name.startsWith(`${path.basename(dir)}.tmp-`));
}

describe('TemplateResolver.fetch - git 源 clone 通路', () => {
  const resolver = new TemplateResolver();
  const cleanup: string[] = [];

  afterAll(() => {
    for (const d of cleanup) fs.rmSync(d, { recursive: true, force: true });
  });

  it('clone 成功后返回缓存目录，且不残留 .git/', async () => {
    // 用 git+file:// 走完整 clone 链路：与 git+ssh:// 只差 scheme，不需要联网
    const repo = makeLocalRepo(true);
    cleanup.push(repo);
    const dir = gitCacheDir({ url: `git+file://${repo}`, ref: 'master' });
    cleanup.push(dir);
    fs.rmSync(dir, { recursive: true, force: true });

    const got = await resolver.fetch(`git+file://${repo}#master`, { refresh: true });
    expect(got).toBe(dir);
    expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(true);
    // .git 必须删掉，否则会被 composer 当普通文件拷进新项目
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(false);
  });

  it('缓存已存在时默认复用，不重新 clone', async () => {
    const repo = makeLocalRepo(true);
    cleanup.push(repo);
    const dir = gitCacheDir({ url: `git+file://${repo}`, ref: 'master' });
    cleanup.push(dir);

    await resolver.fetch(`git+file://${repo}#master`, { refresh: true });
    fs.writeFileSync(path.join(dir, 'CACHE_MARKER'), 'x');
    await resolver.fetch(`git+file://${repo}#master`);
    expect(fs.existsSync(path.join(dir, 'CACHE_MARKER'))).toBe(true);
  });

  it('refresh 时删缓存重新 clone', async () => {
    const repo = makeLocalRepo(true);
    cleanup.push(repo);
    const dir = gitCacheDir({ url: `git+file://${repo}`, ref: 'master' });
    cleanup.push(dir);

    await resolver.fetch(`git+file://${repo}#master`, { refresh: true });
    fs.writeFileSync(path.join(dir, 'CACHE_MARKER'), 'x');
    await resolver.fetch(`git+file://${repo}#master`, { refresh: true });
    expect(fs.existsSync(path.join(dir, 'CACHE_MARKER'))).toBe(false);
  });

  it('仓库没有 .template/config.ts 时抛 E_NO_TEMPLATE_CONFIG', async () => {
    const repo = makeLocalRepo(false);
    cleanup.push(repo);
    cleanup.push(gitCacheDir({ url: `git+file://${repo}`, ref: 'master' }));
    await expect(
      resolver.fetch(`git+file://${repo}#master`, { refresh: true }),
    ).rejects.toMatchObject({ code: 'E_NO_TEMPLATE_CONFIG' });
  });

  it('clone 失败抛 E_TEMPLATE_FETCH_FAILED，且不留下半成品缓存与 .tmp-* 残留', async () => {
    const missing = path.join(os.tmpdir(), 'create-app-no-such-repo-xyz');
    const dir = gitCacheDir({ url: `git+file://${missing}`, ref: 'master' });
    await expect(
      resolver.fetch(`git+file://${missing}#master`, { refresh: true }),
    ).rejects.toMatchObject({ code: 'E_TEMPLATE_FETCH_FAILED' });
    expect(fs.existsSync(dir)).toBe(false);
    expect(tmpSiblings(dir)).toEqual([]);
  });

  it('中断留下的 .tmp-* 孤儿不会被当成缓存，且会被下次克隆清掉', async () => {
    // 现实场景：Ctrl-C / 断电杀在 clone 中途。原子化之后半成品只可能落在 .tmp-* 上，
    // dir 位置要么不存在、要么是完整模板——缓存命中只看 .template/config.ts 存在，
    // 半成品一旦占住 dir 就会被当有效缓存，产出内容残缺的项目
    const repo = makeLocalRepo(true);
    cleanup.push(repo);
    const dir = gitCacheDir({ url: `git+file://${repo}`, ref: 'master' });
    cleanup.push(dir);
    fs.rmSync(dir, { recursive: true, force: true });

    // 半成品：只有 .template/config.ts（足以骗过 assertTemplateDir），没有仓库其余内容
    const orphan = `${dir}.tmp-999999`;
    cleanup.push(orphan);
    fs.mkdirSync(path.join(orphan, '.template'), { recursive: true });
    fs.writeFileSync(path.join(orphan, '.template/config.ts'), 'export default {};\n');
    // 打成陈旧的：清理只收拾「不可能属于在跑的并发进程」的孤儿
    const stale = new Date(Date.now() - 24 * 60 * 60 * 1000);
    fs.utimesSync(orphan, stale, stale);

    const got = await resolver.fetch(`git+file://${repo}#master`);
    expect(got).toBe(dir);
    // dir 的内容来自真仓库，而不是那份残留
    expect(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).toContain('"name":"x"');
    expect(fs.existsSync(orphan)).toBe(false);
  });

  it('克隆成功后不残留 .tmp-*（rename 走掉，孤儿目录不进缓存根）', async () => {
    const repo = makeLocalRepo(true);
    cleanup.push(repo);
    const dir = gitCacheDir({ url: `git+file://${repo}`, ref: 'master' });
    cleanup.push(dir);

    await resolver.fetch(`git+file://${repo}#master`, { refresh: true });
    expect(tmpSiblings(dir)).toEqual([]);
  });

  it('rename 撞上被并发进程占住的 dir：视为可用缓存，不报错也不留 tmp', async () => {
    const repo = makeLocalRepo(true);
    cleanup.push(repo);
    const dir = gitCacheDir({ url: `git+file://${repo}`, ref: 'master' });
    cleanup.push(dir);
    fs.rmSync(dir, { recursive: true, force: true });

    // 起不了两个真进程，就在 rename 的那一瞬间模拟「另一个进程刚好先完成」：
    // 目标被别人先占住（内容完整），本次 rename 因目标非空失败
    vi.spyOn(fs, 'renameSync').mockImplementationOnce((from, to) => {
      fs.cpSync(from as string, to as string, { recursive: true });
      throw Object.assign(new Error('EEXIST: directory not empty'), { code: 'EEXIST' });
    });

    const got = await resolver.fetch(`git+file://${repo}#master`);
    expect(got).toBe(dir);
    expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(true);
    expect(tmpSiblings(dir)).toEqual([]);
    vi.restoreAllMocks();
  });
});
