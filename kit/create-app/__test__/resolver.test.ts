import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { Composer } from '../src/core/composer';
import { gitCacheDir } from '../src/core/git-source';
import {
  TemplateResolver,
  describeRemoteAdvance,
  isLocalSource,
  resolveLocalSource,
} from '../src/core/resolver';
import type { ProjectConfig } from '../src/types';
import { CreateAppError } from '../src/utils/errors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'template-pc');
const MINI_DIR = path.join(__dirname, 'fixtures', 'template-mini');

// 缓存根指向本文件独占的临时目录，不写用户的 ~/.cache/create-app
const ORIGINAL_CACHE_HOME = process.env['XDG_CACHE_HOME'];
const CACHE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-cachehome-'));
process.env['XDG_CACHE_HOME'] = CACHE_HOME;

afterAll(() => {
  if (ORIGINAL_CACHE_HOME === undefined) delete process.env['XDG_CACHE_HOME'];
  else process.env['XDG_CACHE_HOME'] = ORIGINAL_CACHE_HOME;
  fs.rmSync(CACHE_HOME, { recursive: true, force: true });
});

describe('isLocalSource', () => {
  it('识别绝对路径 / 相对路径 / home / file: 前缀', () => {
    expect(isLocalSource('/abs/tpl')).toBe(true);
    expect(isLocalSource('./tpl')).toBe(true);
    expect(isLocalSource('../tpl')).toBe(true);
    expect(isLocalSource('~/tpl')).toBe(true);
    expect(isLocalSource('file:./tpl')).toBe(true);
  });

  it('识别 Windows 形态：盘符路径与反斜杠相对路径', () => {
    expect(isLocalSource('C:\\tpl')).toBe(true);
    expect(isLocalSource('c:/tpl')).toBe(true);
    expect(isLocalSource('.\\tpl')).toBe(true);
    expect(isLocalSource('..\\tpl')).toBe(true);
  });

  it('scp 简写不被盘符规则误判为本地路径（冒号前是主机名，不是单字母盘符）', () => {
    expect(isLocalSource('git@git.example.com:owner/repo.git')).toBe(false);
    expect(isLocalSource('h:host/repo.git')).toBe(false);
  });

  it('远端源与托管平台简写都不算本地路径', () => {
    expect(isLocalSource('git+ssh://git@host/org/repo.git')).toBe(false);
    expect(isLocalSource('github:org/repo/sub')).toBe(false);
    expect(isLocalSource('gh:org/repo')).toBe(false);
  });
});

describe('resolveLocalSource', () => {
  it('绝对路径原样返回', () => {
    expect(resolveLocalSource('/abs/tpl')).toBe('/abs/tpl');
  });

  it('相对路径基于 cwd 展开', () => {
    expect(resolveLocalSource('./tpl')).toBe(path.resolve(process.cwd(), 'tpl'));
  });

  it('~/ 展开为 home 目录', () => {
    expect(resolveLocalSource('~/tpl')).toBe(path.join(os.homedir(), 'tpl'));
  });

  it('file: 前缀的三种写法都能展开', () => {
    expect(resolveLocalSource('file:/abs/tpl')).toBe('/abs/tpl');
    expect(resolveLocalSource('file:///abs/tpl')).toBe('/abs/tpl');
    expect(resolveLocalSource('file:./tpl')).toBe(path.resolve(process.cwd(), 'tpl'));
  });
});

const cleanup: string[] = [];

afterAll(() => {
  for (const dir of cleanup.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** 造一个带 .template/config.ts 的本地 git 仓库，用 git+file:// 走完整 clone 链路 */
function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-rs-repo-'));
  cleanup.push(dir);
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  };
  // 显式指定分支名：本机 git 的 init.defaultBranch 可能是 main，用例不能跟着机器走
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

/** 在仓库上再压一个提交，返回新的 HEAD */
function commitMore(repo: string, marker: string): string {
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf-8' });
  fs.writeFileSync(path.join(repo, marker), 'x');
  git('add', '-A');
  git('commit', '-qm', marker);
  return headOf(repo);
}

/** 源仓库当前 HEAD */
function headOf(repo: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf-8' }).trim();
}

describe('TemplateResolver.fetch - git 缓存刷新', () => {
  it('--refresh 克隆失败时旧缓存原样保留（先删后拉会让紧接着的 --offline 也失败）', async () => {
    const resolver = new TemplateResolver();
    const repo = makeRepo();
    const source = `git+file://${repo}#master`;
    const cacheDir = gitCacheDir({ url: `git+file://${repo}`, ref: 'master' });
    cleanup.push(cacheDir);

    await expect(resolver.fetch(source)).resolves.toBe(cacheDir);
    expect(fs.existsSync(path.join(cacheDir, '.template/config.ts'))).toBe(true);

    // 源仓库移走 = 远端不可达
    const moved = `${repo}-moved`;
    cleanup.push(moved);
    fs.renameSync(repo, moved);

    await expect(resolver.fetch(source, { refresh: true })).rejects.toMatchObject({
      code: 'E_TEMPLATE_FETCH_FAILED',
    });

    // 缓存还在，且仍是一份可用模板：--offline 兜底能继续跑
    expect(fs.existsSync(path.join(cacheDir, '.template/config.ts'))).toBe(true);
    await expect(resolver.fetch(source, { offline: true })).resolves.toBe(cacheDir);
    // 失败路径不留 .tmp-* 孤儿（只看本仓库前缀，同文件其他仓库也在这个缓存根下）
    const tmpPrefix = `${path.basename(cacheDir)}.tmp-`;
    expect(fs.readdirSync(path.dirname(cacheDir)).filter((n) => n.startsWith(tmpPrefix))).toEqual(
      [],
    );
  });

  it('--refresh 成功时旧缓存被整份顶掉，不是增量合并', async () => {
    const resolver = new TemplateResolver();
    const repo = makeRepo();
    const source = `git+file://${repo}#master`;
    const cacheDir = gitCacheDir({ url: `git+file://${repo}`, ref: 'master' });
    cleanup.push(cacheDir);

    await resolver.fetch(source);
    fs.writeFileSync(path.join(cacheDir, 'STALE'), 'x');

    await expect(resolver.fetch(source, { refresh: true })).resolves.toBe(cacheDir);
    expect(fs.existsSync(path.join(cacheDir, 'STALE'))).toBe(false);
  });
});

describe('describeRemoteAdvance - 复用缓存时感知远端已前进', () => {
  const resolver = new TemplateResolver();

  /** 造仓库 + 拉一次缓存，返回 source / cacheDir / metaPath 三件套 */
  async function seed(): Promise<{
    repo: string;
    source: string;
    cacheDir: string;
    metaPath: string;
  }> {
    const repo = makeRepo();
    const source = `git+file://${repo}#master`;
    const cacheDir = gitCacheDir({ url: `git+file://${repo}`, ref: 'master' });
    cleanup.push(cacheDir, `${cacheDir}.meta.json`);
    await resolver.fetch(source);
    return { repo, source, cacheDir, metaPath: `${cacheDir}.meta.json` };
  }

  it('克隆后把 commit 写进缓存目录的兄弟文件，而不是目录内部', async () => {
    const { repo, cacheDir, metaPath } = await seed();

    expect(fs.existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>;
    expect(meta['commit']).toBe(headOf(repo));
    expect(meta['ref']).toBe('master');
    expect(meta['url']).toBe(`git+file://${repo}`);
    expect(typeof meta['fetchedAt']).toBe('string');

    // 元数据必须在 dir 外面，否则会被 composer 拷进产物
    expect(path.dirname(metaPath)).toBe(path.dirname(cacheDir));
    expect(fs.readdirSync(cacheDir)).not.toContain('.meta.json');
    expect(fs.readdirSync(cacheDir).some((n) => n.endsWith('.meta.json'))).toBe(false);
  });

  it('远端前进后报出本地与远端短 hash，未前进时返回 undefined', async () => {
    const { repo, source } = await seed();
    const before = headOf(repo);

    // 刚克隆完，本地与远端一致
    expect(describeRemoteAdvance(source)).toBeUndefined();

    const after = commitMore(repo, 'NEW');
    const msg = describeRemoteAdvance(source);
    expect(msg).toContain('模板远端已有新提交');
    expect(msg).toContain(before.slice(0, 7));
    expect(msg).toContain(after.slice(0, 7));
  });

  it('远端不可达时静默返回 undefined，不抛', async () => {
    const { repo, source } = await seed();
    commitMore(repo, 'NEW');

    const moved = `${repo}-gone`;
    cleanup.push(moved);
    fs.renameSync(repo, moved);

    expect(() => describeRemoteAdvance(source)).not.toThrow();
    expect(describeRemoteAdvance(source)).toBeUndefined();
  });

  it('本地路径源不联网探测，直接 undefined', () => {
    expect(describeRemoteAdvance(MINI_DIR)).toBeUndefined();
    expect(describeRemoteAdvance('github:org/repo')).toBeUndefined();
  });

  it('缓存目录存在但没有元数据（本特性之前建的缓存）时返回 undefined', async () => {
    const { source, metaPath } = await seed();
    fs.rmSync(metaPath, { force: true });
    expect(describeRemoteAdvance(source)).toBeUndefined();
  });

  it('--refresh 后元数据的 commit 跟到新 HEAD，提示随之消失', async () => {
    const { repo, source, metaPath } = await seed();
    const after = commitMore(repo, 'NEW');
    expect(describeRemoteAdvance(source)).toBeDefined();

    await resolver.fetch(source, { refresh: true });

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>;
    expect(meta['commit']).toBe(after);
    expect(describeRemoteAdvance(source)).toBeUndefined();
  });

  it('compose 出的文件列表里没有元数据文件（防有人把 meta 挪进缓存目录）', async () => {
    const { cacheDir } = await seed();

    const manifest = await resolver.readConfig(cacheDir);
    const config: ProjectConfig = {
      name: 'my-app',
      description: 'd',
      platform: 'web',
      features: [],
      params: {},
      outputDir: './my-app',
      packageManager: 'pnpm',
      initGit: false,
      installDeps: false,
    };
    const files = await new Composer().compose(cacheDir, manifest, config);

    expect(files.some((f) => f.path.endsWith('.meta.json'))).toBe(false);
  });
});

describe('TemplateResolver.fetch - 本地路径', () => {
  const resolver = new TemplateResolver();
  const emptyDir = path.join(os.tmpdir(), `create-app-empty-${process.pid}`);
  fs.mkdirSync(emptyDir, { recursive: true });

  afterAll(() => {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it('绝对路径直接返回模板目录，不经过缓存', async () => {
    await expect(resolver.fetch(MINI_DIR)).resolves.toBe(MINI_DIR);
  });

  it('file: 前缀同样命中本地分支', async () => {
    await expect(resolver.fetch(`file:${MINI_DIR}`)).resolves.toBe(MINI_DIR);
  });

  it('目录不存在时抛 E_TEMPLATE_FETCH_FAILED', async () => {
    await expect(resolver.fetch('/tmp/create-app-not-exist-xyz')).rejects.toMatchObject({
      code: 'E_TEMPLATE_FETCH_FAILED',
    });
  });

  it('目录存在但缺 .template/config.ts 时抛 E_NO_TEMPLATE_CONFIG', async () => {
    await expect(resolver.fetch(emptyDir)).rejects.toMatchObject({
      code: 'E_NO_TEMPLATE_CONFIG',
    });
  });

  it('--refresh 与 --offline 的互斥校验对本地路径源同样生效', async () => {
    // 本地源虽不涉及缓存，但同一对自相矛盾的 flag 不能换个源类型就从硬报变静默忽略
    await expect(resolver.fetch(MINI_DIR, { refresh: true, offline: true })).rejects.toMatchObject({
      code: 'E_INVALID_OPTION',
    });
  });
});

describe('TemplateResolver.fetch - 不支持的源格式', () => {
  const resolver = new TemplateResolver();

  // 模板源只有「本地路径」和「git 源」两条通路：托管平台简写（github:/gitlab:/gh:）
  // 走的是 tarball API，对只开 ssh 的内网 GitLab 根本不成立，协议内不承认这种写法。
  // 关键是报错要说破形态问题，而不是退化成一句网络错误把人支去查网
  it.each(['github:org/repo/packages/tpl', 'gitlab:org/repo', 'gh:org/repo', 'https://x/y.git'])(
    '%s 报 E_INVALID_OPTION 并列出支持的形态',
    async (source) => {
      await expect(resolver.fetch(source)).rejects.toMatchObject({
        code: 'E_INVALID_OPTION',
        message: expect.stringContaining('不支持的模板源格式') as unknown as string,
      });
      const err = await resolver.fetch(source).catch((e: CreateAppError) => e);
      expect((err as CreateAppError).suggestion).toContain('git+ssh://');
      expect((err as CreateAppError).suggestion).toContain('本地路径');
    },
  );

  it('--refresh / --offline 的互斥校验先于源格式判定', async () => {
    await expect(
      resolver.fetch('github:org/repo', { refresh: true, offline: true }),
    ).rejects.toMatchObject({
      code: 'E_INVALID_OPTION',
      message: expect.stringContaining('--refresh') as unknown as string,
    });
  });
});

describe('TemplateResolver.readConfig', () => {
  const resolver = new TemplateResolver();

  it('成功读取 fixture 模板配置', async () => {
    const config = await resolver.readConfig(FIXTURE_DIR);
    expect(config.id).toBe('template-pc');
    expect(config.platform).toBe('web');
    expect(config.features).toHaveProperty('i18n');
    expect(config.features).toHaveProperty('override');
  });

  it('读取协议 v0.2 模板的 hint / default / scripts 字段', async () => {
    const config = await resolver.readConfig(MINI_DIR);
    expect(config.features['i18n']?.default).toBe(true);
    expect(config.features['i18n']?.hint).toBe('recommended');
    expect(config.features['i18n']?.scripts).toEqual(['i18n', 'i18n:dry']);
    expect(config.features['demoPages']?.default).toBeUndefined();
  });

  it('缺少 .template/config.ts 时抛出 E_NO_TEMPLATE_CONFIG', async () => {
    await expect(resolver.readConfig('/tmp/nonexistent-template')).rejects.toMatchObject({
      code: 'E_NO_TEMPLATE_CONFIG',
    });
  });

  it('返回的对象符合 TemplateConfig 类型结构', async () => {
    const config = await resolver.readConfig(FIXTURE_DIR);
    expect(typeof config.compatibleCliVersions).toBe('string');
    expect(typeof config.variables).toBe('object');
    expect(Array.isArray(config.features)).toBe(false); // features 是 Record，非数组
  });
});

describe('TemplateResolver.checkCompat', () => {
  const resolver = new TemplateResolver();

  const mockConfig = {
    id: 'test',
    platform: 'web' as const,
    compatibleCliVersions: '>=0.1.0',
    variables: {},
    features: {},
  };

  it('版本满足时不抛错', () => {
    expect(() => resolver.checkCompat(mockConfig, '0.1.0')).not.toThrow();
    expect(() => resolver.checkCompat(mockConfig, '1.0.0')).not.toThrow();
  });

  it('版本不满足时抛出 E_VERSION_INCOMPATIBLE', () => {
    const strictConfig = { ...mockConfig, compatibleCliVersions: '>=1.0.0' };
    expect(() => resolver.checkCompat(strictConfig, '0.1.0')).toThrowError(
      expect.objectContaining({ code: 'E_VERSION_INCOMPATIBLE' }) as unknown as CreateAppError,
    );
  });

  it('模板要求 v0.2 协议时，旧版本 CLI 被拒绝', () => {
    const v02 = { ...mockConfig, compatibleCliVersions: '>=0.2.0 <0.3.0' };
    expect(() => resolver.checkCompat(v02, '0.2.0')).not.toThrow();
    expect(() => resolver.checkCompat(v02, '0.1.1')).toThrowError(
      expect.objectContaining({ code: 'E_VERSION_INCOMPATIBLE' }) as unknown as CreateAppError,
    );
  });

  it('预发布 CLI 版本按对应正式版判定（changesets pre 模式发的是 0.2.0-alpha.x）', () => {
    const v02 = { ...mockConfig, compatibleCliVersions: '>=0.1.1 <0.3.0' };
    expect(() => resolver.checkCompat(v02, '0.2.0-alpha.1')).not.toThrow();
    // 上界同样生效：0.3.0 的预发布已带下一代协议，必须被 '<0.3.0' 挡住
    // （semver 原生 includePrerelease 会因 0.3.0-alpha.0 < 0.3.0 放行，故用 coerce）
    expect(() => resolver.checkCompat(v02, '0.3.0-alpha.0')).toThrowError(
      expect.objectContaining({ code: 'E_VERSION_INCOMPATIBLE' }) as unknown as CreateAppError,
    );
    expect(() => resolver.checkCompat(v02, '0.3.1-alpha.0')).toThrowError(
      expect.objectContaining({ code: 'E_VERSION_INCOMPATIBLE' }) as unknown as CreateAppError,
    );
  });
});
