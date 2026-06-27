import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MergeProcessor } from '../src/core/MergeProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

/**
 * 回归：merge 阶段对「损坏的字典/语言文件」必须中止/跳过，绝不在内容未知时覆写。
 *
 * - #1 untranslated.json 损坏 → 抛错中止，原文件原样保留（旧实现走 safeLoadJsonFile
 *   返回 {}，被当空文件，随后 createOrEmptyFile('{}') 静默清空在途译文）。
 * - #3 桶式 source/target 语言包某 bucket 损坏 → 在写回前 fail-fast 抛错中止（M1：损坏检测
 *   前移到 performMerge 之前的 assertLocalesNotCorrupt，避免「先清空 untranslated/写
 *   translations、再静默跳过 target 写回」造成的 CI 伪成功 + 运行时漏译）。损坏文件原样保留。
 */
describe('MergeProcessor — 损坏文件保护', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-merge-corrupt-'));
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeConfig(buckets = false): ResolvedConfig {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
      ...(buckets
        ? {
            buckets: {
              rules: [{ name: 'order', matchKey: (key: string) => key.startsWith('order.') }],
            },
          }
        : {}),
    };
    return resolveConfig(user);
  }

  // ============================== #1 扁平：损坏 untranslated.json ==============================

  it('[#1] untranslated.json 损坏时抛错中止，且原文件不被覆写成 {}', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    // 尾逗号 + 未闭合括号 → 合法 JSON 解析失败
    const corrupt = '{ "order.foo": { "zh-CN": "你好", "en-US": "Hello", }';
    const untPath = path.join(localeDir, 'untranslated.json');
    fs.writeFileSync(untPath, corrupt);
    fs.writeFileSync(path.join(localeDir, 'translations.json'), '{}');

    const processor = new MergeProcessor(makeConfig(), false);
    await expect(processor.execute()).rejects.toThrow(/解析失败|JSON/);

    // 关键断言：损坏文件内容原样保留，未被 createOrEmptyFile('{}') 销毁
    expect(fs.readFileSync(untPath, 'utf-8')).toBe(corrupt);
  });

  it('[#1] untranslated.json 为空文件时按空处理，不抛错', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), '   ');
    fs.writeFileSync(path.join(localeDir, 'translations.json'), '{}');

    const processor = new MergeProcessor(makeConfig(), false);
    await expect(processor.execute()).resolves.toBeUndefined();
  });

  // ============================== #3 桶式：损坏 target bucket ==============================

  it('[#3] 桶式 target 某 bucket 损坏时写回前抛错中止，损坏文件原样保留', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });

    // 一条「全部 target 已翻译」的条目 → 进入 newlyTranslated，触发 updateLanguagePackage
    fs.writeFileSync(
      path.join(localeDir, 'untranslated.json'),
      JSON.stringify({ 'order.foo': { 'zh-CN': '你好', 'en-US': 'Hello' } }, null, 2),
    );
    fs.writeFileSync(path.join(localeDir, 'translations.json'), '{}');

    // by-locale 布局：<localeDir>/<locale>/<bucket>.json。写一个损坏的 en-US bucket。
    const enDir = path.join(localeDir, 'en-US');
    fs.mkdirSync(enDir, { recursive: true });
    const corruptBucket = path.join(enDir, 'order.json');
    const corruptContent = '{ "order.bar": "Bar",,, }';
    fs.writeFileSync(corruptBucket, corruptContent);

    const processor = new MergeProcessor(makeConfig(true), false);
    // 写回前 fail-fast 抛错（M1：避免 CI 伪成功 + 运行时漏译）
    await expect(processor.execute()).rejects.toThrow(/桶文件解析失败/);

    // 关键断言：损坏 bucket 未被重写（抛错发生在任何写回前）
    expect(fs.readFileSync(corruptBucket, 'utf-8')).toBe(corruptContent);
  });

  it('[#3b] 桶式 source 某 bucket 损坏时写回前抛错中止，避免桶分布塌缩', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });

    fs.writeFileSync(
      path.join(localeDir, 'untranslated.json'),
      JSON.stringify({ 'order.foo': { 'zh-CN': '你好', 'en-US': 'Hello' } }, null, 2),
    );
    fs.writeFileSync(path.join(localeDir, 'translations.json'), '{}');

    // 健康的 en-US target bucket → target 守卫通过，逼出 source 守卫这条路径
    const enDir = path.join(localeDir, 'en-US');
    fs.mkdirSync(enDir, { recursive: true });
    const enBucket = path.join(enDir, 'order.json');
    const enContent = JSON.stringify({ 'order.bar': 'Bar' });
    fs.writeFileSync(enBucket, enContent);

    // 损坏的 zh-CN source bucket（source 文本本应驱动 keyBucketMap 分桶）
    const zhDir = path.join(localeDir, 'zh-CN');
    fs.mkdirSync(zhDir, { recursive: true });
    const corruptSource = path.join(zhDir, 'order.json');
    const corruptContent = '{ "order.bar": "你好",,, }';
    fs.writeFileSync(corruptSource, corruptContent);

    const processor = new MergeProcessor(makeConfig(true), false);
    // 写回前 fail-fast 抛错：source（zh-CN）在 [source, ...targets] 中先被检出损坏
    await expect(processor.execute()).rejects.toThrow(/zh-CN.*桶文件解析失败/);

    // 关键断言：source 损坏文件原样保留
    expect(fs.readFileSync(corruptSource, 'utf-8')).toBe(corruptContent);
    // en-US target 未被以空 bucketMap 重写（order.foo 不会被塌缩写入）
    expect(fs.readFileSync(enBucket, 'utf-8')).toBe(enContent);
  });

  it('[#3] 桶式 target 无损坏时正常写回翻译', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(
      path.join(localeDir, 'untranslated.json'),
      JSON.stringify({ 'order.foo': { 'zh-CN': '你好', 'en-US': 'Hello' } }, null, 2),
    );
    fs.writeFileSync(path.join(localeDir, 'translations.json'), '{}');

    const processor = new MergeProcessor(makeConfig(true), false);
    await expect(processor.execute()).resolves.toBeUndefined();

    // en-US 桶目录下应写出包含该翻译的文件
    const enDir = path.join(localeDir, 'en-US');
    const files = fs.existsSync(enDir)
      ? fs.readdirSync(enDir).filter((f) => f.endsWith('.json'))
      : [];
    const merged = files.reduce<Record<string, unknown>>((acc, f) => {
      return { ...acc, ...JSON.parse(fs.readFileSync(path.join(enDir, f), 'utf-8')) };
    }, {});
    expect(JSON.stringify(merged)).toContain('Hello');
  });
});
