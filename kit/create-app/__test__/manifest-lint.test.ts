import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lintManifest } from '../src/core/manifest-lint';
import { CreateAppError } from '../src/utils/errors';
import type { TemplateConfig } from '../src/types';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** 造一个临时模板目录，files 为 `相对路径 → 内容` */
function makeTemplate(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-lint-'));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

function manifest(features: TemplateConfig['features'], extra?: Partial<TemplateConfig>) {
  return {
    id: 'template-test',
    platform: 'web',
    compatibleCliVersions: '>=0.2.0',
    variables: {},
    features,
    ...extra,
  } as TemplateConfig;
}

describe('lintManifest - 路径腐化硬失败', () => {
  it('dirs 指向不存在的目录时抛 E_STALE_MANIFEST_PATH', () => {
    const dir = makeTemplate({ 'src/main.ts': '' });
    try {
      lintManifest(dir, manifest({ i18n: { label: 'i18n', dirs: ['src/locale'] } }));
      expect.unreachable('应当抛错');
    } catch (err) {
      expect(err).toBeInstanceOf(CreateAppError);
      expect((err as CreateAppError).code).toBe('E_STALE_MANIFEST_PATH');
      expect((err as CreateAppError).message).toContain('src/locale');
    }
  });

  it('files 指向不存在的文件时同样抛错', () => {
    const dir = makeTemplate({ 'src/main.ts': '' });
    expect(() =>
      lintManifest(dir, manifest({ i18n: { label: 'i18n', files: ['i18n.config.ts'] } })),
    ).toThrow(/i18n.config.ts/);
  });

  it('声明写了尾部斜杠也能正确判定存在', () => {
    const dir = makeTemplate({ 'src/locale/zh-CN.json': '{}' });
    expect(() =>
      lintManifest(dir, manifest({ i18n: { label: 'i18n', dirs: ['src/locale/'] } })),
    ).not.toThrow();
  });

  it('声明写了 ./ 前缀也按模板根相对判定（与 composer 的裁剪同一套归一化）', () => {
    // schema 已经拒了这种写法，这里验的是绕过 schema 直调时两侧口径不劈叉：
    // 体检说存在、裁剪也确实命中，而不是「体检放行 + 裁剪静默失效」
    const dir = makeTemplate({ 'src/locale/zh-CN.json': '{}' });
    expect(() =>
      lintManifest(dir, manifest({ i18n: { label: 'i18n', dirs: ['./src/locale'] } })),
    ).not.toThrow();
  });

  it('大小写与真源不一致时硬失败（大小写不敏感文件系统上 existsSync 会误放行）', () => {
    // macOS/Windows 上 existsSync('src/Locale') 对 src/locale 返回 true，体检绿灯；
    // 而 composer 的前缀比对是精确串比对，`src/Locale` 永不命中 —— 裁剪静默失效
    const dir = makeTemplate({ 'src/locale/zh-CN.json': '{}' });
    expect(() =>
      lintManifest(dir, manifest({ i18n: { label: 'i18n', dirs: ['src/Locale'] } })),
    ).toThrow(/src\/Locale/);
  });

  it('中间段的大小写失配同样拦住', () => {
    const dir = makeTemplate({ 'src/locale/zh-CN.json': '{}' });
    expect(() =>
      lintManifest(dir, manifest({ i18n: { label: 'i18n', files: ['SRC/locale/zh-CN.json'] } })),
    ).toThrow(/SRC\/locale/);
  });

  it('exclude 指向不存在的路径不报错（防御性声明是合法用法）', () => {
    const dir = makeTemplate({ 'src/main.ts': '' });
    const warnings = lintManifest(dir, manifest({}, { exclude: ['.env', '.env.local', 'dist'] }));
    expect(warnings).toEqual([]);
  });
});

describe('lintManifest - package.json 引用警告', () => {
  it('deps / devDeps / scripts 在 package.json 里不存在时给出警告', () => {
    const dir = makeTemplate({
      'package.json': JSON.stringify({
        dependencies: { qiankun: '^2.0.0' },
        devDependencies: {},
        scripts: { build: 'vite build' },
      }),
      'src/micro/index.ts': '',
    });
    const warnings = lintManifest(
      dir,
      manifest({
        qiankun: {
          label: 'qiankun',
          dirs: ['src/micro'],
          deps: ['qiankun', 'vite-plugin-qiankun'],
          devDeps: ['@kit/i18n-tools'],
          scripts: ['micro:dev'],
        },
      }),
    );
    expect(warnings).toHaveLength(3);
    expect(warnings.join('\n')).toContain('vite-plugin-qiankun');
    expect(warnings.join('\n')).toContain('@kit/i18n-tools');
    expect(warnings.join('\n')).toContain('micro:dev');
    // 真实存在的 qiankun 不该出现在警告里
    expect(warnings.some((w) => w.includes('"qiankun"'))).toBe(false);
  });

  it('removeScripts 指向不存在的脚本时警告', () => {
    const dir = makeTemplate({
      'package.json': JSON.stringify({ scripts: { build: 'vite build' } }),
    });
    const warnings = lintManifest(dir, manifest({}, { removeScripts: ['check:template'] }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('check:template');
  });

  it('模板没有 package.json 时跳过该项检查', () => {
    const dir = makeTemplate({ 'src/main.ts': '' });
    expect(lintManifest(dir, manifest({}, { removeScripts: ['whatever'] }))).toEqual([]);
  });
});

describe('lintManifest - git 跟踪警告', () => {
  /** 造一个真 git 仓库，tracked 的文件会被 commit，untracked 的只留在工作区 */
  function makeGitTemplate(tracked: string[], untracked: string[]): string {
    const dir = makeTemplate(
      Object.fromEntries([...tracked, ...untracked].map((f) => [f, 'x'])) as Record<string, string>,
    );
    const git = (...args: string[]): void => {
      const r = spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} 失败: ${r.stderr}`);
    };
    git('init', '-q');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 'test');
    for (const f of tracked) git('add', '--', f);
    git('commit', '-q', '-m', 'init');
    return dir;
  }

  it('工作区有、git 里没有的声明路径给出警告', () => {
    const dir = makeGitTemplate(['src/locale/zh-CN.json'], ['.i18n-tools/.gitignore']);
    const warnings = lintManifest(
      dir,
      manifest({ i18n: { label: 'i18n', dirs: ['src/locale', '.i18n-tools'] } }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('.i18n-tools');
    expect(warnings[0]).toContain('git 源');
  });

  it('全部被跟踪时无警告', () => {
    const dir = makeGitTemplate(['src/locale/zh-CN.json'], []);
    expect(lintManifest(dir, manifest({ i18n: { label: 'i18n', dirs: ['src/locale'] } }))).toEqual(
      [],
    );
  });

  it('git 仓库里大小写失配同样是硬失败（ls-files 精确比对不中，再退到逐段精确匹配）', () => {
    const dir = makeGitTemplate(['src/locale/zh-CN.json'], []);
    expect(() =>
      lintManifest(dir, manifest({ i18n: { label: 'i18n', dirs: ['src/Locale'] } })),
    ).toThrow(/src\/Locale/);
  });

  it('模板目录不是 git 仓库（git 源克隆后已删 .git）时跳过检查', () => {
    const dir = makeTemplate({ 'src/locale/zh-CN.json': '{}' });
    expect(lintManifest(dir, manifest({ i18n: { label: 'i18n', dirs: ['src/locale'] } }))).toEqual(
      [],
    );
  });
});
