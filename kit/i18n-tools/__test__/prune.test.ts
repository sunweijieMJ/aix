import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PruneProcessor } from '../src/core/PruneProcessor';
import { InteractiveUtils } from '../src/utils/interactive-utils';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

const buildConfig = (
  rootDir: string,
  sourceDir: string,
  localeDir: string,
  extra: Partial<I18nToolsConfig> = {},
): ResolvedConfig => {
  const user: I18nToolsConfig = {
    root: rootDir,
    framework: { type: 'vue', tImport: '@/locale' },
    locales: { source: 'zh-CN', targets: ['en-US'] },
    io: { localesDir: localeDir, sourceDir, format: 'flat' },
    keys: { separator: '.' },
    llm: { shared: { apiKey: 'x', model: 'm' } },
    ...extra,
  };
  return resolveConfig(user);
};

describe('PruneProcessor', () => {
  let rootDir: string;
  let sourceDir: string;
  let localeDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-test-'));
    sourceDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const writeSource = (rel: string, content: string): void => {
    const abs = path.join(sourceDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  const writeLocale = (locale: string, data: Record<string, string>): void => {
    fs.writeFileSync(path.join(localeDir, `${locale}.json`), JSON.stringify(data));
  };
  const readLocale = (locale: string): Record<string, string> =>
    JSON.parse(fs.readFileSync(path.join(localeDir, `${locale}.json`), 'utf8'));

  it('删除孤儿 key（source + 所有 target）', async () => {
    writeSource('A.vue', `<template>{{ t('used') }}</template>`);
    writeLocale('zh-CN', { used: '用', orphan: '没人用' });
    writeLocale('en-US', { used: 'used', orphan: 'unused' });

    await new PruneProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      dryRun: false,
      ci: true,
    }).execute();

    expect(readLocale('zh-CN')).toEqual({ used: '用' });
    expect(readLocale('en-US')).toEqual({ used: 'used' });
  });

  it('仅被 <i18n-t keypath> 组件引用的 key 不删（防 keypath 误报）', async () => {
    writeSource('A.vue', `<template><i18n-t keypath="byKeypath" tag="span"></i18n-t></template>`);
    writeLocale('zh-CN', { byKeypath: '组件引用', orphan: '没人用' });
    writeLocale('en-US', { byKeypath: 'via keypath', orphan: 'unused' });

    await new PruneProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      dryRun: false,
      ci: true,
    }).execute();

    // byKeypath 经 <i18n-t keypath> 引用 → 不应被当孤儿删除；只删真正没人用的 orphan
    expect(readLocale('zh-CN')).toEqual({ byKeypath: '组件引用' });
    expect(readLocale('en-US')).toEqual({ byKeypath: 'via keypath' });
  });

  it('清理时 translations.json / untranslated.json 里的孤儿也一并删除', async () => {
    writeSource('A.vue', `<template>{{ t('used') }}</template>`);
    writeLocale('zh-CN', { used: '用', orphan: '没人用' });
    writeLocale('en-US', { used: 'used', orphan: 'unused' });
    // 中间字典文件含孤儿（{key: {locale: value}} 结构）
    fs.writeFileSync(
      path.join(localeDir, 'translations.json'),
      JSON.stringify({
        used: { 'zh-CN': '用', 'en-US': 'used' },
        orphan: { 'zh-CN': '没人用', 'en-US': 'unused' },
      }),
    );
    fs.writeFileSync(
      path.join(localeDir, 'untranslated.json'),
      JSON.stringify({ orphan: { 'zh-CN': '没人用', 'en-US': '' } }),
    );

    await new PruneProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      dryRun: false,
      ci: true,
    }).execute();

    const trans = JSON.parse(fs.readFileSync(path.join(localeDir, 'translations.json'), 'utf8'));
    const untrans = JSON.parse(fs.readFileSync(path.join(localeDir, 'untranslated.json'), 'utf8'));
    expect(trans).toEqual({ used: { 'zh-CN': '用', 'en-US': 'used' } }); // orphan 删了
    expect(untrans).toEqual({}); // orphan 删了
  });

  it('--dry-run 只预览不删', async () => {
    writeSource('A.vue', `<template>{{ t('used') }}</template>`);
    writeLocale('zh-CN', { used: '用', orphan: '没人用' });
    writeLocale('en-US', { used: 'used', orphan: 'unused' });

    await new PruneProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      dryRun: true,
      ci: true,
    }).execute();

    expect(readLocale('zh-CN')).toEqual({ used: '用', orphan: '没人用' }); // 未变
  });

  it('命中 dynamicKeyAllowlist 的 key 不删', async () => {
    writeSource('A.vue', `<template>{{ t('used') }}</template>`);
    writeLocale('zh-CN', { used: '用', 'dyn.a': '动态' });
    writeLocale('en-US', { used: 'used', 'dyn.a': 'dynamic' });

    const config = buildConfig(rootDir, sourceDir, localeDir, {
      keys: { separator: '.', dynamicKeyAllowlist: ['dyn.'] },
    });
    await new PruneProcessor(config, false, undefined, { dryRun: false, ci: true }).execute();

    expect(readLocale('zh-CN')).toEqual({ used: '用', 'dyn.a': '动态' }); // dyn.a 保留
  });

  it('非 --ci：确认 false 时不删', async () => {
    writeSource('A.vue', `<template>{{ t('used') }}</template>`);
    writeLocale('zh-CN', { used: '用', orphan: '没人用' });
    writeLocale('en-US', { used: 'used', orphan: 'unused' });
    vi.spyOn(InteractiveUtils, 'promptForGenericConfirmation').mockResolvedValue(false);

    await new PruneProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      dryRun: false,
      ci: false,
    }).execute();

    expect(readLocale('zh-CN')).toEqual({ used: '用', orphan: '没人用' }); // 取消 → 未删
  });

  it('桶式：源 locale 桶文件损坏时中止，且不把损坏桶改名 .bak（Bug #2）', async () => {
    writeSource('A.vue', `<template>{{ t('b1.used') }}</template>`);
    const config = buildConfig(rootDir, sourceDir, localeDir, {
      buckets: { rules: [{ name: 'b1', matchKey: (k: string) => k.startsWith('b1.') }] },
    });
    // 桶式 by-locale 布局：localeDir/<locale>/<bucket>.json
    const zhDir = path.join(localeDir, 'zh-CN');
    fs.mkdirSync(zhDir, { recursive: true });
    const corruptBucket = path.join(zhDir, 'b1.json');
    fs.writeFileSync(corruptBucket, '{ "b1.used": "用",, }'); // 损坏（尾逗号）
    const enDir = path.join(localeDir, 'en-US');
    fs.mkdirSync(enDir, { recursive: true });
    fs.writeFileSync(path.join(enDir, 'b1.json'), JSON.stringify({ 'b1.used': 'used' }));

    // 桶式下 readLocaleFile 会把损坏桶静默降级为 {} 永不返回 null，必须靠 findCorruptBucketFile
    // 守卫中止，否则会误判孤儿并把损坏桶静默改名 .bak（源 key 从活跃 locale 消失）。
    await expect(
      new PruneProcessor(config, false, undefined, { dryRun: false, ci: true }).execute(),
    ).rejects.toThrow(/桶文件解析失败|解析失败/);

    // 关键断言：损坏桶原样保留，未被改名 .bak
    expect(fs.existsSync(corruptBucket + '.bak')).toBe(false);
    expect(fs.existsSync(corruptBucket)).toBe(true);
  });

  it('源目录无框架文件（usedKeys 为空）时中止，绝不清空 locale', async () => {
    // 误配场景：sourceDir 存在但不含任何框架文件（只有 README.md），
    // collectUsedKeys 扫描到 0 个 key。此时若不设安全闸，所有 key 会被判为孤儿，
    // --ci 下静默清空全部 locale + 字典文件（破坏性最强、CI 可触发）。
    writeSource('README.md', '# 文档\n这里写了 t("looksLikeKey") 但不是框架文件');
    writeLocale('zh-CN', { a: '甲', b: '乙' });
    writeLocale('en-US', { a: 'A', b: 'B' });

    await expect(
      new PruneProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
        dryRun: false,
        ci: true,
      }).execute(),
    ).rejects.toThrow(/未扫描到任何|已中止 prune|防误删/);

    // 关键断言：locale 原样保留，未被清空
    expect(readLocale('zh-CN')).toEqual({ a: '甲', b: '乙' });
    expect(readLocale('en-US')).toEqual({ a: 'A', b: 'B' });
  });
});
