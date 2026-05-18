import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { IdReuseResolver } from '../src/core/IdReuseResolver';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

const buildConfig = (
  overrides: Partial<{
    promoteToCommon: { threshold: number; namespace: string };
    acrossDirectories: boolean;
  }> = {},
  localesDir = '',
): ResolvedConfig => {
  const user: I18nToolsConfig = {
    root: '/tmp/proj',
    framework: { type: 'vue' },
    locales: { source: 'zh-CN', targets: ['en-US'] },
    io: { localesDir, format: 'flat' },
    keys: {
      separator: '.',
      reuse: {
        acrossDirectories: overrides.acrossDirectories ?? false,
        promoteToCommon: overrides.promoteToCommon,
      },
    },
    llm: { shared: { apiKey: 'x', model: 'm' } },
  };
  return resolveConfig(user);
};

describe('IdReuseResolver — promoteToCommon', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-common-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const writeLocale = (entries: Record<string, string>): string => {
    const dir = path.join(tmpDir, 'locale');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'zh-CN.json'), JSON.stringify(entries));
    return dir;
  };

  it('未配置 promoteToCommon → 永不提升', () => {
    const config = buildConfig(
      {},
      writeLocale({
        'pages.foo.save': '保存',
        'pages.bar.save': '保存',
      }),
    );

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.shouldPromoteToCommon('保存', '/tmp/proj/src/pages/baz/file.vue')).toBe(false);
  });

  it('threshold < 2 → 视为禁用', () => {
    const config = buildConfig(
      { promoteToCommon: { threshold: 1, namespace: 'common' } },
      writeLocale({ 'pages.foo.save': '保存' }),
    );

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.shouldPromoteToCommon('保存', '/tmp/proj/src/pages/bar/file.vue')).toBe(false);
  });

  it('已有 2 个前缀 + 阈值 3 + 第 3 个新前缀 → 触发提升', () => {
    const config = buildConfig(
      { promoteToCommon: { threshold: 3, namespace: 'common' } },
      writeLocale({
        'pages.foo.save': '保存',
        'pages.bar.save': '保存',
      }),
    );

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.shouldPromoteToCommon('保存', '/tmp/proj/src/pages/baz/file.vue')).toBe(true);
  });

  it('当前文件前缀已存在于集合中 → 不提升（同模块重复使用）', () => {
    const config = buildConfig(
      { promoteToCommon: { threshold: 3, namespace: 'common' } },
      writeLocale({
        'pages.foo.save': '保存',
        'pages.bar.save': '保存',
        'pages.baz.save': '保存',
      }),
    );

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.shouldPromoteToCommon('保存', '/tmp/proj/src/pages/foo/another.vue')).toBe(
      false,
    );
  });

  it('getCommonNamespace 返回配置值', () => {
    const config = buildConfig(
      { promoteToCommon: { threshold: 2, namespace: 'shared' } },
      writeLocale({}),
    );
    const resolver = new IdReuseResolver(config, false);
    expect(resolver.getCommonNamespace()).toBe('shared');
  });

  it('已提升到 common 的 key 跨目录可复用，避免后续生成 common.X_1/_2', () => {
    const config = buildConfig(
      { promoteToCommon: { threshold: 3, namespace: 'common' } },
      writeLocale({
        'pages.foo.save': '保存',
        'pages.bar.save': '保存',
        'common.save': '保存',
      }),
    );

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.pickReusableKey('保存', '/tmp/proj/src/pages/qux/file.vue')).toBe(
      'common.save',
    );
  });

  it('未启用 promoteToCommon 时 common-namespace 命中规则不触发', () => {
    const config = buildConfig(
      {},
      writeLocale({
        'pages.foo.save': '保存',
        'common.save': '保存',
      }),
    );

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.pickReusableKey('保存', '/tmp/proj/src/pages/qux/file.vue')).toBeUndefined();
  });
});
