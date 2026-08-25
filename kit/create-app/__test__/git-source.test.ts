import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
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

  it('本地路径与 giget 源不归本模块处理', () => {
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

    const got = await resolver.fetch(`git+file://${repo}#master`, { force: true });
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

    await resolver.fetch(`git+file://${repo}#master`, { force: true });
    fs.writeFileSync(path.join(dir, 'CACHE_MARKER'), 'x');
    await resolver.fetch(`git+file://${repo}#master`);
    expect(fs.existsSync(path.join(dir, 'CACHE_MARKER'))).toBe(true);
  });

  it('force 时删缓存重新 clone', async () => {
    const repo = makeLocalRepo(true);
    cleanup.push(repo);
    const dir = gitCacheDir({ url: `git+file://${repo}`, ref: 'master' });
    cleanup.push(dir);

    await resolver.fetch(`git+file://${repo}#master`, { force: true });
    fs.writeFileSync(path.join(dir, 'CACHE_MARKER'), 'x');
    await resolver.fetch(`git+file://${repo}#master`, { force: true });
    expect(fs.existsSync(path.join(dir, 'CACHE_MARKER'))).toBe(false);
  });

  it('仓库没有 .template/config.ts 时抛 E_NO_TEMPLATE_CONFIG', async () => {
    const repo = makeLocalRepo(false);
    cleanup.push(repo);
    cleanup.push(gitCacheDir({ url: `git+file://${repo}`, ref: 'master' }));
    await expect(
      resolver.fetch(`git+file://${repo}#master`, { force: true }),
    ).rejects.toMatchObject({ code: 'E_NO_TEMPLATE_CONFIG' });
  });

  it('clone 失败抛 E_TEMPLATE_FETCH_FAILED，且不留下半成品缓存', async () => {
    const missing = path.join(os.tmpdir(), 'create-app-no-such-repo-xyz');
    const dir = gitCacheDir({ url: `git+file://${missing}`, ref: 'master' });
    await expect(
      resolver.fetch(`git+file://${missing}#master`, { force: true }),
    ).rejects.toMatchObject({ code: 'E_TEMPLATE_FETCH_FAILED' });
    expect(fs.existsSync(dir)).toBe(false);
  });
});
