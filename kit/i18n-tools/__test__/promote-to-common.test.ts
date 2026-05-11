import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { IdReuseResolver } from '../src/core/IdReuseResolver';
import type { ResolvedConfig } from '../src/config';

const buildConfig = (overrides: Partial<ResolvedConfig['idPrefix']> = {}): ResolvedConfig => {
  const base: ResolvedConfig = {
    rootDir: '',
    framework: 'vue',
    vue: { library: 'vue-i18n', namespace: '' },
    react: { library: 'react-i18next', namespace: '', includeDefaultMessage: false },
    locale: { source: 'zh-CN', target: 'en-US' },
    paths: { locale: '', source: '', tImport: '' },
    llm: {
      idGeneration: {
        apiKey: 'x',
        model: 'm',
        baseURL: undefined,
        timeout: 0,
        maxRetries: 0,
        temperature: 0,
      },
      translation: {
        apiKey: 'x',
        model: 'm',
        baseURL: undefined,
        timeout: 0,
        maxRetries: 0,
        temperature: 0,
      },
    },
    prompts: { idGeneration: {}, translation: {} },
    idPrefix: {
      anchor: 'src',
      value: '',
      separator: '.',
      chineseMappings: {},
      reuseAcrossDirectories: false,
      maxDepth: 0,
      promoteToCommon: { threshold: 0, namespace: 'common' },
      ...overrides,
    },
    glossary: { override: 'always', normalize: true },
    concurrency: { idGeneration: 1, translation: 1 },
    batchSize: 10,
    batchDelay: 0,
    format: false,
    include: [],
    exclude: [],
    extraction: { rejectPatterns: [] },
    output: { format: 'flat' },
  };
  return base;
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
    const config = buildConfig();
    config.paths.locale = writeLocale({
      'pages.foo.save': '保存',
      'pages.bar.save': '保存',
    });

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.shouldPromoteToCommon('保存', '/src/pages/baz/file.vue')).toBe(false);
  });

  it('threshold < 2 → 视为禁用', () => {
    const config = buildConfig({ promoteToCommon: { threshold: 1, namespace: 'common' } });
    config.paths.locale = writeLocale({ 'pages.foo.save': '保存' });

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.shouldPromoteToCommon('保存', '/src/pages/bar/file.vue')).toBe(false);
  });

  it('已有 2 个前缀 + 阈值 3 + 第 3 个新前缀 → 触发提升', () => {
    const config = buildConfig({ promoteToCommon: { threshold: 3, namespace: 'common' } });
    config.paths.locale = writeLocale({
      'pages.foo.save': '保存',
      'pages.bar.save': '保存',
    });

    const resolver = new IdReuseResolver(config, false);
    // 文件落在 pages.baz —— 不同于已有的两个前缀
    expect(resolver.shouldPromoteToCommon('保存', '/src/pages/baz/file.vue')).toBe(true);
  });

  it('当前文件前缀已存在于集合中 → 不提升（同模块重复使用）', () => {
    const config = buildConfig({ promoteToCommon: { threshold: 3, namespace: 'common' } });
    config.paths.locale = writeLocale({
      'pages.foo.save': '保存',
      'pages.bar.save': '保存',
      'pages.baz.save': '保存',
    });

    const resolver = new IdReuseResolver(config, false);
    // pages.foo 已在集合 → 不再触发提升
    expect(resolver.shouldPromoteToCommon('保存', '/src/pages/foo/another.vue')).toBe(false);
  });

  it('getCommonNamespace 返回配置值', () => {
    const config = buildConfig({ promoteToCommon: { threshold: 2, namespace: 'shared' } });
    config.paths.locale = writeLocale({});
    const resolver = new IdReuseResolver(config, false);
    expect(resolver.getCommonNamespace()).toBe('shared');
  });

  it('已提升到 common 的 key 跨目录可复用，避免后续生成 common.X_1/_2', () => {
    const config = buildConfig({ promoteToCommon: { threshold: 3, namespace: 'common' } });
    // 模拟"前 3 个使用点已分配，第 3 个走 common"
    config.paths.locale = writeLocale({
      'pages.foo.save': '保存',
      'pages.bar.save': '保存',
      'common.save': '保存',
    });

    const resolver = new IdReuseResolver(config, false);
    // 第 4 个使用点（pages.qux）：pickReusableKey 应返回 common.save 而非 undefined
    // —— 这是修复 promoteToCommon 提升后 `common.save_1/_2` 后缀堆积的关键
    expect(resolver.pickReusableKey('保存', '/src/pages/qux/file.vue')).toBe('common.save');
  });

  it('未启用 promoteToCommon 时 common-namespace 命中规则不触发', () => {
    const config = buildConfig(); // promoteToCommon.threshold = 0
    config.paths.locale = writeLocale({
      'pages.foo.save': '保存',
      'common.save': '保存',
    });

    const resolver = new IdReuseResolver(config, false);
    // 未启用 promote 时不应将 common.save 视为可跨模块复用候选
    expect(resolver.pickReusableKey('保存', '/src/pages/qux/file.vue')).toBeUndefined();
  });
});
