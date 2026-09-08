/**
 * 配置加载与校验。
 *
 * 重点是「写错要报错、且说清实际是什么」：静默兜底成空值再落到内置默认 latest，
 * 症状和「没写配置」一模一样，写配置的人会以为声明生效了，包却发到了默认通道。
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIG_FILE_NAMES,
  DEFAULT_MAINLINE_TAGS,
  DEFAULT_REGISTRY,
  findConfigFile,
  loadConfig,
  resolveConfig,
  resolveConfiguredTag,
} from '../src/config/loader';

const CONFIG_PATH = '/repo/publish.config.ts';
const silent = () => {};

const resolve = (raw: unknown, logWarn: (message: string) => void = silent) =>
  resolveConfig(raw, { configPath: CONFIG_PATH, logWarn });

const minimal = { build: { command: ['vite', 'build'] } };

// ============ 默认值 ============

describe('默认值', () => {
  it('只给 build.command 时其余字段都有默认值', () => {
    const config = resolve(minimal);

    expect(config.registry).toBe(DEFAULT_REGISTRY);
    expect(config.distDir).toBe('dist');
    expect(config.build.command).toEqual(['vite', 'build']);
    expect(config.tags.default).toBe('latest');
    expect(config.tags.defaultDeclared).toBe(false);
    expect(config.tags.byBranch).toEqual({});
    expect(config.tags.mainline).toEqual(DEFAULT_MAINLINE_TAGS);
    expect(config.manifest.rootEntry).toBeUndefined();
    expect(config.manifest.peerDependencies).toEqual([]);
    expect(config.manifest.exports).toBeUndefined();
    expect(config.manifest.extra).toEqual({});
    expect(config.manifest.copy).toEqual(['README.md']);
    expect(config.hooks).toEqual({});
  });

  it('projectRoot 是配置文件所在目录', () => {
    const config = resolve(minimal);
    expect(config.projectRoot).toBe(path.dirname(CONFIG_PATH));
    expect(config.configFile).toBe('publish.config.ts');
  });

  it('显式声明的值覆盖默认值', () => {
    const config = resolve({
      ...minimal,
      registry: 'http://example.test/ ',
      distDir: 'build',
      tags: { default: 'oem', mainline: ['alpha'] },
      manifest: { rootEntry: 'build', peerDependencies: ['vue'], copy: [] },
    });

    expect(config.registry).toBe('http://example.test/');
    expect(config.distDir).toBe('build');
    expect(config.tags.default).toBe('oem');
    expect(config.tags.defaultDeclared).toBe(true);
    expect(config.tags.mainline).toEqual(['alpha']);
    expect(config.manifest.rootEntry).toBe('build');
    expect(config.manifest.peerDependencies).toEqual(['vue']);
    expect(config.manifest.copy).toEqual([]);
  });
});

// ============ 类型报错 ============

describe('类型不对时报错，并说清实际是什么', () => {
  it('顶层不是对象', () => {
    expect(() => resolve('oem')).toThrow(/必须默认导出一个对象.*string "oem"/s);
  });

  it('缺 build', () => {
    expect(() => resolve({})).toThrow(/build 必须是对象且含 command/);
  });

  it('build.command 不是字符串数组', () => {
    expect(() => resolve({ build: { command: 'vite build' } })).toThrow(
      /build\.command 必须是非空字符串数组，实际是 string "vite build"/,
    );
  });

  it('build.command 是空数组', () => {
    expect(() => resolve({ build: { command: [] } })).toThrow(/build\.command 不能是空数组/);
  });

  it('tags.default 不是非空字符串', () => {
    expect(() => resolve({ ...minimal, tags: { default: 123 } })).toThrow(
      /tags\.default 必须是非空字符串，实际是 number 123/,
    );
  });

  it('tags.byBranch 不是对象', () => {
    expect(() => resolve({ ...minimal, tags: { byBranch: 'oem' } })).toThrow(
      /tags\.byBranch 必须是「分支名 → 标签」的对象，实际是 string "oem"/,
    );
  });

  it('tags.byBranch 里某个分支的标签不是非空字符串', () => {
    expect(() =>
      resolve({ ...minimal, tags: { byBranch: { 'feature-oem': 1, master: 'latest' } } }),
    ).toThrow(/feature-oem = number 1/);
  });

  it('manifest.exports 不是函数', () => {
    expect(() => resolve({ ...minimal, manifest: { exports: { '.': './index.js' } } })).toThrow(
      /manifest\.exports 必须是函数.*实际是 对象/s,
    );
  });

  it('manifest.peerDependencies 不是字符串数组', () => {
    expect(() => resolve({ ...minimal, manifest: { peerDependencies: 'vue' } })).toThrow(
      /manifest\.peerDependencies 必须是非空字符串数组/,
    );
  });

  it('hooks.afterBuild 不是函数', () => {
    expect(() => resolve({ ...minimal, hooks: { afterBuild: true } })).toThrow(
      /hooks\.afterBuild 必须是函数，实际是 boolean true/,
    );
  });

  it('未知字段只告警、不报错', () => {
    const warnings: string[] = [];
    const config = resolve({ ...minimal, defualtTag: 'oem' }, (m) => warnings.push(m));

    expect(config.tags.default).toBe('latest');
    expect(warnings.join('\n')).toMatch(/无法识别的字段.*defualtTag/);
  });
});

// ============ 按分支解析标签 ============

const withTags = (tags: Partial<Record<string, unknown>>) => resolve({ ...minimal, tags });

describe('resolveConfiguredTag', () => {
  it('精确匹配分支', () => {
    const config = withTags({ byBranch: { 'feature-oem': 'oem' } });
    const result = resolveConfiguredTag({ config, branch: 'feature-oem', env: {} });

    expect(result.tag).toBe('oem');
    expect(result.isDefault).toBe(false);
    expect(result.source).toContain('tags.byBranch["feature-oem"]');
  });

  it('通配匹配，最长模式优先', () => {
    const config = withTags({ byBranch: { 'feature-*': 'dev', 'feature-oem-*': 'oem' } });
    expect(resolveConfiguredTag({ config, branch: 'feature-oem-a', env: {} }).tag).toBe('oem');
    expect(resolveConfiguredTag({ config, branch: 'feature-x', env: {} }).tag).toBe('dev');
  });

  it('* 只当通配符，其余字符按字面量转义', () => {
    const config = withTags({ byBranch: { 'release.*': 'rc' } });
    expect(resolveConfiguredTag({ config, branch: 'release.1', env: {} }).tag).toBe('rc');
    // 点号不该被当成「任意字符」而匹配上 releaseX1
    expect(resolveConfiguredTag({ config, branch: 'releaseX1', env: {} }).isDefault).toBe(true);
  });

  it('环境变量 PUBLISH_TAG 优先于配置', () => {
    const config = withTags({ byBranch: { 'feature-oem': 'oem' } });
    const result = resolveConfiguredTag({
      config,
      branch: 'feature-oem',
      env: { PUBLISH_TAG: 'beta' },
    });

    expect(result.tag).toBe('beta');
    expect(result.source).toBe('环境变量 PUBLISH_TAG');
  });

  it('匹配不上时落到 tags.default', () => {
    const config = withTags({ default: 'oem', byBranch: { master: 'latest' } });
    const result = resolveConfiguredTag({ config, branch: 'feature-x', env: {} });

    expect(result.tag).toBe('oem');
    expect(result.isDefault).toBe(false);
  });

  it('什么都没声明时落到内置默认，并标记 isDefault', () => {
    const result = resolveConfiguredTag({ config: resolve(minimal), branch: 'master', env: {} });

    expect(result.tag).toBe('latest');
    expect(result.isDefault).toBe(true);
    expect(result.branchUnknown).toBe(false);
  });

  it('显式声明 tags.default = latest 不算「没人声明过」', () => {
    const config = withTags({ default: 'latest' });
    expect(resolveConfiguredTag({ config, branch: 'master', env: {} }).isDefault).toBe(false);
  });

  it('声明了 byBranch 却读不到分支名时打上 branchUnknown', () => {
    const config = withTags({ byBranch: { 'feature-oem': 'oem' } });
    const result = resolveConfiguredTag({ config, branch: '', env: {} });

    expect(result.isDefault).toBe(true);
    expect(result.branchUnknown).toBe(true);
  });

  it('压根没写 byBranch 时读不到分支名不算 branchUnknown', () => {
    const result = resolveConfiguredTag({ config: resolve(minimal), branch: '', env: {} });
    expect(result.branchUnknown).toBe(false);
  });

  /**
   * byBranch 与 default 同时写着、又读不到分支名时，落到 default 仍然意味着
   * byBranch 那些声明一条都没被求值 —— 和只写了 byBranch 是同一件事，必须一样拦下来。
   */
  it('byBranch 与 default 同时声明时，读不到分支名照样是 branchUnknown', () => {
    const config = withTags({ byBranch: { 'feature-oem': 'oem' }, default: 'latest' });
    const result = resolveConfiguredTag({ config, branch: '', env: {} });

    expect(result.tag).toBe('latest');
    expect(result.source).toContain('tags.default');
    expect(result.isDefault).toBe(false);
    expect(result.branchUnknown).toBe(true);
  });

  it('只写 tags.default、没写 byBranch 时读不到分支名不算 branchUnknown', () => {
    const config = withTags({ default: 'oem' });
    const result = resolveConfiguredTag({ config, branch: '', env: {} });

    expect(result.tag).toBe('oem');
    expect(result.source).toContain('tags.default');
    expect(result.branchUnknown).toBe(false);
  });

  // PUBLISH_TAG 是不依赖分支名的显式入口，正是 branchUnknown 抛错时给出的逃生口之一
  it('读不到分支名但给了 PUBLISH_TAG 时不算 branchUnknown', () => {
    const config = withTags({ byBranch: { 'feature-oem': 'oem' }, default: 'latest' });
    const result = resolveConfiguredTag({ config, branch: '', env: { PUBLISH_TAG: 'beta' } });

    expect(result.tag).toBe('beta');
    expect(result.branchUnknown).toBe(false);
  });
});

// ============ 查找与加载 ============

const tmpDirs: string[] = [];
const makeRepo = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-publish-'));
  tmpDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe('findConfigFile', () => {
  it('从子目录逐级向上找', () => {
    const root = makeRepo();
    const nested = path.join(root, 'a', 'b');
    fs.mkdirSync(nested, { recursive: true });
    const configPath = path.join(root, 'publish.config.ts');
    fs.writeFileSync(configPath, 'export default {}');

    expect(findConfigFile(nested)).toBe(configPath);
  });

  it('找不到返回 null', () => {
    expect(findConfigFile(path.join(makeRepo(), 'nope'))).toBeNull();
  });

  it('同目录多份时按候选顺序取首个', () => {
    const root = makeRepo();
    fs.writeFileSync(path.join(root, 'publish.config.js'), 'export default {}');
    fs.writeFileSync(path.join(root, 'publish.config.ts'), 'export default {}');

    expect(path.basename(findConfigFile(root)!)).toBe(CONFIG_FILE_NAMES[0]);
  });
});

describe('loadConfig', () => {
  it('加载 ts 配置（走 jiti）并填默认值', async () => {
    const root = makeRepo();
    fs.writeFileSync(
      path.join(root, 'publish.config.ts'),
      [
        'interface Cfg { build: { command: string[] } }',
        'const config: Cfg = { build: { command: ["vite", "build"] } }',
        'export default config',
      ].join('\n'),
    );

    const config = await loadConfig({ cwd: root, logWarn: silent });
    expect(config.build.command).toEqual(['vite', 'build']);
    expect(config.projectRoot).toBe(root);
    expect(config.registry).toBe(DEFAULT_REGISTRY);
  });

  it('加载 mjs 配置（走原生 import）', async () => {
    const root = makeRepo();
    fs.writeFileSync(
      path.join(root, 'publish.config.mjs'),
      'export default { build: { command: ["rollup", "-c"] }, tags: { byBranch: { main: "latest" } } }',
    );

    const config = await loadConfig({ cwd: root, logWarn: silent });
    expect(config.build.command).toEqual(['rollup', '-c']);
    expect(config.tags.byBranch).toEqual({ main: 'latest' });
  });

  it('找不到配置文件时报错并说明要建哪个', async () => {
    const root = path.join(makeRepo(), 'nope');
    await expect(loadConfig({ cwd: root, logWarn: silent })).rejects.toThrow(
      /未找到发布配置文件[\s\S]*publish\.config\.ts/,
    );
  });

  it('配置文件本身坏掉时抛错而不是当作「没配置」', async () => {
    const root = makeRepo();
    fs.writeFileSync(path.join(root, 'publish.config.mjs'), 'export default {');

    await expect(loadConfig({ cwd: root, logWarn: silent })).rejects.toThrow(/加载配置文件失败/);
  });
});
