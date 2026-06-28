import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { PickProcessor } from '../src/core/PickProcessor';
import { TranslateProcessor } from '../src/core/TranslateProcessor';
import { RestoreProcessor } from '../src/core/RestoreProcessor';
import { MergeProcessor } from '../src/core/MergeProcessor';
import { PruneProcessor } from '../src/core/PruneProcessor';
import { ExportProcessor } from '../src/core/ExportProcessor';
import { CsvExportProcessor } from '../src/core/CsvExportProcessor';
import { CsvImportProcessor } from '../src/core/CsvImportProcessor';
import { DoctorProcessor } from '../src/core/DoctorProcessor';
import { Glossary } from '../src/utils/glossary';
import { serializeCsv } from '../src/utils/csv-utils';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 损坏文件守卫合集。
 *
 * 全仓约定：所有 processor 在「文件有内容却 JSON 解析失败」时必须 fail-fast 抛错中止，
 * 绝不把损坏当成空 {} 静默吞掉。各用例覆盖的核心回归断言类型：
 *   - 损坏时「抛错且中止」（区分「真正为空 → 合法 no-op」）
 *   - 「不覆写 / 不销毁在途数据」（损坏文件不会被 {} 静默覆写 / 清空）
 *   - 「不产生 .bak 伪成功」「不静默塌缩桶分布」
 *   - 退出码语义（--ci 据损坏如实失败；不伪报「文件为空 / 验证通过」）
 *
 * 各 processor 的临时目录 / config fixture / 构造签名不同，按 processor 分组并忠实保留各自 setup。
 */

/** 统一静默 Logger，并返回 info 的 spy（doctor 需读 info 输出做断言）。 */
function spyLoggers(): ReturnType<typeof vi.spyOn> {
  const infoSpy = vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
  vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
  vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  return infoSpy;
}

/** 共享基础 config（resolveConfig 入口一致），overrides 按顶层键整体覆盖。 */
function makeConfig(root: string, overrides: Partial<I18nToolsConfig> = {}): ResolvedConfig {
  return resolveConfig({
    root,
    framework: { type: 'vue' },
    locales: { source: 'zh-CN', targets: ['en-US'] },
    io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
    keys: { separator: '.' },
    llm: { shared: { apiKey: 'x', model: 'm' } },
    ...overrides,
  } as I18nToolsConfig);
}

// ============================================================================
// GenerateProcessor — 源 locale 损坏守卫（桶式 + 非桶式）
// ----------------------------------------------------------------------------
// 旧行为：源 locale「有内容却解析失败」时被 safeLoadJsonFile 静默当 {}，源码被改写成 $t()、
// locale 一个 key 都没落且无异常回滚、命令仍打印成功——留下「源码已改、locale 未写」的不一致态
// （桶式还连 .bak 都没有）。修复：commitToDisk 写源码前对桶式 / 非桶式都做源完整性预检，命中即抛错中止。
// ============================================================================
describe('GenerateProcessor 源 locale 损坏守卫', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const buildConfig = (bucket: boolean): ResolvedConfig =>
    makeConfig(rootDir, {
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      io: { sourceDir: srcDir, localesDir: localeDir, format: 'flat', prettify: false },
      ...(bucket
        ? {
            buckets: {
              rules: [{ name: 'misc', matchKey: (k: string) => k.startsWith('zzz.') }],
              defaultBucket: 'common',
              emitManifest: false,
              layout: 'by-locale',
            },
          }
        : {}),
    });

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-corrupt-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    spyLoggers();
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it.each([
    { title: '桶式 source 桶损坏', bucket: true, corruptRel: ['zh-CN', 'common.json'] },
    { title: '非桶式 source 单文件损坏', bucket: false, corruptRel: ['zh-CN.json'] },
  ])('$title → 中止 generate，源码与损坏文件均不被改写', async ({ bucket, corruptRel }) => {
    const srcFile = path.join(srcDir, 'A.vue');
    const original = `<template><div>提交</div></template>\n`;
    fs.writeFileSync(srcFile, original, 'utf-8');

    const corrupt = path.join(localeDir, ...corruptRel);
    fs.mkdirSync(path.dirname(corrupt), { recursive: true });
    // 半截写入 / 手改坏（缺右括号）
    fs.writeFileSync(corrupt, '{ "a.b": "存量文案"', 'utf-8');
    const corruptBefore = fs.readFileSync(corrupt, 'utf-8');

    const proc = new GenerateProcessor(buildConfig(bucket), false, false);
    await expect(proc.execute(srcFile, true)).rejects.toThrow(
      /zh-CN.*(损坏|解析失败)|(损坏|解析失败).*zh-CN/,
    );

    // 事务保证：源码未被改写为 $t()，损坏文件原样保留（未静默覆盖 / 未生成 .bak）
    expect(fs.readFileSync(srcFile, 'utf-8')).toBe(original);
    expect(fs.readFileSync(corrupt, 'utf-8')).toBe(corruptBefore);
    expect(fs.existsSync(`${corrupt}.bak`)).toBe(false);
  });
});

// ============================================================================
// PickProcessor — source + target locale 损坏守卫
// ----------------------------------------------------------------------------
// 旧实现走 getMessages → safeLoadJsonFile(silent) → 损坏当 {} → sourceMessages/target 为空
// → 无条件写出空字典 / 全判未翻译 → 销毁 untranslated.json 里 translate 写入、尚未 merge 的在途译文，
// 且打印「✅ 成功」掩盖损坏。守卫须覆盖 [source, ...targets]，与 MergeProcessor.assertLocalesNotCorrupt 对齐。
// ============================================================================
describe('PickProcessor — 源/目标 locale 损坏保护（Bug B5 / 审计 Med / #6）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-pick-corrupt-'));
    spyLoggers();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const pickConfig = (buckets = false): ResolvedConfig =>
    makeConfig(
      tmpDir,
      buckets
        ? {
            buckets: {
              rules: [{ name: 'order', matchKey: (key: string) => key.startsWith('order.') }],
            },
          }
        : {},
    );

  it.each([
    {
      title: '扁平 source 损坏',
      buckets: false,
      throwRe: /解析失败|JSON/,
      inFlight: { 'a.b': { 'zh-CN': '你好', 'en-US': 'Hello(in-flight)' } },
      // 损坏的 source（尾逗号）+ 合法空 target
      write: (localeDir: string): string | null => {
        fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), '{ "a.b": "你好",, }');
        fs.writeFileSync(path.join(localeDir, 'en-US.json'), '{}');
        return null;
      },
    },
    {
      title: '[桶式] source 某 bucket 损坏',
      buckets: true,
      throwRe: /解析失败|JSON|损坏/,
      inFlight: { 'order.foo': { 'zh-CN': '你好', 'en-US': 'Hello(in-flight)' } },
      // by-locale 布局：<localeDir>/<locale>/<bucket>.json，写一个损坏的 source(zh-CN) bucket
      write: (localeDir: string): string | null => {
        const zhDir = path.join(localeDir, 'zh-CN');
        fs.mkdirSync(zhDir, { recursive: true });
        fs.writeFileSync(path.join(zhDir, 'order.json'), '{ "order.foo": "你好",, }');
        return null;
      },
    },
    {
      title: '[桶式] 尚未迁移的遗留单文件损坏（#6）',
      buckets: true,
      throwRe: /解析失败|JSON|损坏/,
      inFlight: { 'order.foo': { 'zh-CN': '你好', 'en-US': 'Hello(in-flight)' } },
      // 桶目录尚不存在（首次启用 buckets），仅有损坏的遗留单文件 zh-CN.json：
      // 旧行为 → migrateToBuckets silent 读 → 当 {} → rename .bak → 清空在途译文。
      write: (localeDir: string): string | null => {
        const legacy = path.join(localeDir, 'zh-CN.json');
        fs.writeFileSync(legacy, '{ "order.foo": "你好",, }', 'utf-8');
        return legacy; // 返回需校验「不产生 .bak」的路径
      },
    },
  ])(
    'source 损坏时抛错中止，且不覆写 untranslated.json 在途数据：$title',
    async ({ buckets, throwRe, inFlight, write }) => {
      const localeDir = path.join(tmpDir, 'locale');
      fs.mkdirSync(localeDir, { recursive: true });
      const legacyPath = write(localeDir);

      const inFlightStr = JSON.stringify(inFlight, null, 2);
      const untPath = path.join(localeDir, 'untranslated.json');
      fs.writeFileSync(untPath, inFlightStr);

      const processor = new PickProcessor(pickConfig(buckets), false);
      await expect(processor.execute()).rejects.toThrow(throwRe);

      // 关键断言：在途数据原样保留，未被覆写成 {}；不伪报成功
      expect(fs.readFileSync(untPath, 'utf-8')).toBe(inFlightStr);
      if (legacyPath) expect(fs.existsSync(`${legacyPath}.bak`)).toBe(false);
      expect(LoggerUtils.success).not.toHaveBeenCalled();
    },
  );

  it('target locale 损坏时抛错中止，且不覆写 untranslated.json 在途数据 / 不伪报成功', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });

    // source 有效，target（en-US）损坏（尾逗号）
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ 'a.b': '你好' }));
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), '{ "a.b": "Hi",, }');

    const inFlight = JSON.stringify(
      { 'a.b': { 'zh-CN': '你好', 'en-US': 'Hello(in-flight)' } },
      null,
      2,
    );
    const untPath = path.join(localeDir, 'untranslated.json');
    fs.writeFileSync(untPath, inFlight);

    const processor = new PickProcessor(pickConfig(), false);
    await expect(processor.execute()).rejects.toThrow(/解析失败|JSON/);

    expect(fs.readFileSync(untPath, 'utf-8')).toBe(inFlight);
    expect(LoggerUtils.success).not.toHaveBeenCalled();
  });

  it('source locale 不存在（空目录 / 空内容）时按空处理，不抛错', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), '{}');
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), '{}');

    const processor = new PickProcessor(pickConfig(), false);
    await expect(processor.execute()).resolves.toBeUndefined();
  });

  it('source 与所有 target 均有效时正常完成', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ 'a.b': '你好' }));
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), JSON.stringify({ 'a.b': 'Hi' }));

    const processor = new PickProcessor(pickConfig(), false);
    await expect(processor.execute()).resolves.toBeUndefined();
  });
});

// ============================================================================
// TranslateProcessor — 损坏 untranslated.json 守卫（#5）
// ----------------------------------------------------------------------------
// 旧实现用 safeLoadJsonFile 读 untranslated.json，解析失败回退 {} → totalCount===0 →
// 打印「文件为空，无需处理」→ exit 0 伪报成功。CI 会把损坏待翻译文件误判「已全部翻译」绿灯通过。
// ============================================================================
describe('TranslateProcessor — 损坏 untranslated.json 守卫（#5）', () => {
  let rootDir: string;
  let localeDir: string;

  const buildConfig = (): ResolvedConfig =>
    makeConfig(rootDir, {
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      io: { sourceDir: path.join(rootDir, 'src'), localesDir: localeDir, format: 'flat' },
    });

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-corrupt-'));
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    spyLoggers();
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('损坏 untranslated.json → 抛错中止，不伪报「文件为空」', async () => {
    const untPath = path.join(localeDir, 'untranslated.json');
    const corrupt = '{ "a.b": { "zh-CN": "你好", "en-US": "" },, }';
    fs.writeFileSync(untPath, corrupt, 'utf-8');

    await expect(new TranslateProcessor(buildConfig()).execute()).rejects.toThrow(/解析失败|JSON/);

    // 关键：不把损坏当空文件 → 不应打印「文件为空」式伪成功，损坏文件原样保留
    expect(LoggerUtils.warn).not.toHaveBeenCalledWith(expect.stringContaining('文件为空'));
    expect(fs.readFileSync(untPath, 'utf-8')).toBe(corrupt);
  });

  it('空 untranslated.json → 仍按空处理，不抛错', async () => {
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), '', 'utf-8');
    await expect(new TranslateProcessor(buildConfig()).execute()).resolves.toBeUndefined();
  });
});

// ============================================================================
// RestoreProcessor — 源 locale 损坏保护（回归 #5）
// ----------------------------------------------------------------------------
// 旧实现 loadLocaleMap 做 `readLocaleFile(...) ?? {}`，把「解析失败(null)」与「真正为空」混为一谈
// → length===0 分支 warn+return → 源码原封未动却伪报成功（exit 0）。须与 pick/merge/prune 对齐。
// ============================================================================
describe('RestoreProcessor — 源 locale 损坏保护（回归 #5）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-restore-corrupt-'));
    spyLoggers();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const restoreConfig = (buckets = false): ResolvedConfig =>
    makeConfig(
      tmpDir,
      buckets
        ? {
            buckets: {
              rules: [{ name: 'order', matchKey: (key: string) => key.startsWith('order.') }],
            },
          }
        : {},
    );

  it('单文件 source 损坏 → 抛错中止，不伪报成功', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), '{ "a.b": "你好",, }');

    const processor = new RestoreProcessor(restoreConfig(), false);
    await expect(processor.execute()).rejects.toThrow(/解析失败|JSON/);
    expect(LoggerUtils.success).not.toHaveBeenCalled();
  });

  it('[桶式] source bucket 损坏 → 抛错中止', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    const zhDir = path.join(localeDir, 'zh-CN');
    fs.mkdirSync(zhDir, { recursive: true });
    fs.writeFileSync(path.join(zhDir, 'order.json'), '{ "order.foo": "你好",, }');

    const processor = new RestoreProcessor(restoreConfig(true), false);
    await expect(processor.execute()).rejects.toThrow(/解析失败|JSON|损坏/);
    expect(LoggerUtils.success).not.toHaveBeenCalled();
  });

  it('source 真正为空 → 不抛错（warn 后 no-op，空属合法成功）', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), '{}');

    const processor = new RestoreProcessor(restoreConfig(), false);
    // 空 source 是合法 no-op（与「损坏」区分）：不抛错；lifecycle 打印成功属正常。
    await expect(processor.execute()).resolves.toBeUndefined();
    expect(LoggerUtils.warn).toHaveBeenCalledWith('语言文件为空，无可还原条目');
  });
});

// ============================================================================
// MergeProcessor — 损坏文件保护（扁平 untranslated / 扁平 target / 桶式 source+target）
// ----------------------------------------------------------------------------
// merge 阶段对「损坏的字典 / 语言文件」必须在写回前 fail-fast 抛错，绝不在内容未知时覆写：
//   - untranslated.json 损坏被 safeLoadJsonFile 当 {} → createOrEmptyFile('{}') 静默清空在途译文
//   - 扁平/桶式 target、桶式 source 损坏 → 先清空 untranslated/写 translations、再静默跳过写回
//     造成 CI 伪成功 + 运行时漏译 / 桶分布塌缩。
// 修复（M1）：损坏检测前移到 performMerge 之前的 assertLocalesNotCorrupt。
// ============================================================================
describe('MergeProcessor — 损坏文件保护', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-merge-corrupt-'));
    spyLoggers();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const mergeConfig = (buckets = false): ResolvedConfig =>
    makeConfig(
      tmpDir,
      buckets
        ? {
            buckets: {
              rules: [{ name: 'order', matchKey: (key: string) => key.startsWith('order.') }],
            },
          }
        : {},
    );

  // ----------------------------- #1 扁平：损坏 untranslated.json -----------------------------

  it('[#1] untranslated.json 损坏时抛错中止，且原文件不被覆写成 {}', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    // 尾逗号 + 未闭合括号 → 合法 JSON 解析失败
    const corrupt = '{ "order.foo": { "zh-CN": "你好", "en-US": "Hello", }';
    const untPath = path.join(localeDir, 'untranslated.json');
    fs.writeFileSync(untPath, corrupt);
    fs.writeFileSync(path.join(localeDir, 'translations.json'), '{}');

    const processor = new MergeProcessor(mergeConfig(), false);
    await expect(processor.execute()).rejects.toThrow(/解析失败|JSON/);

    // 关键断言：损坏文件内容原样保留，未被 createOrEmptyFile('{}') 销毁
    expect(fs.readFileSync(untPath, 'utf-8')).toBe(corrupt);
  });

  it('[#1] untranslated.json 为空文件时按空处理，不抛错', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), '   ');
    fs.writeFileSync(path.join(localeDir, 'translations.json'), '{}');

    const processor = new MergeProcessor(mergeConfig(), false);
    await expect(processor.execute()).resolves.toBeUndefined();
  });

  // ----------------------------- 扁平：损坏 target locale（审计 ②）-----------------------------

  it('[扁平] 损坏 en-US.json → 写回前抛错，且 untranslated.json 未被清空', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });

    // 一条「全部 target 已翻译」的条目 → 正常会触发 performMerge 清空 untranslated
    const untPath = path.join(localeDir, 'untranslated.json');
    const untContent = JSON.stringify({ 'a.foo': { 'zh-CN': '你好', 'en-US': 'Hello' } }, null, 2);
    fs.writeFileSync(untPath, untContent);
    fs.writeFileSync(path.join(localeDir, 'translations.json'), '{}');

    // 损坏的扁平 target locale
    const enPath = path.join(localeDir, 'en-US.json');
    const corrupt = '{ "x.y": "Z",,, }';
    fs.writeFileSync(enPath, corrupt);

    await expect(new MergeProcessor(mergeConfig(), false).execute()).rejects.toThrow(/解析失败/);

    // 关键断言：写回前抛错 → untranslated.json 未被清空、损坏文件原样保留
    expect(fs.readFileSync(untPath, 'utf-8')).toBe(untContent);
    expect(fs.readFileSync(enPath, 'utf-8')).toBe(corrupt);
  });

  // ----------------------------- #3 桶式：损坏 target / source bucket -----------------------------

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

    const processor = new MergeProcessor(mergeConfig(true), false);
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

    const processor = new MergeProcessor(mergeConfig(true), false);
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

    const processor = new MergeProcessor(mergeConfig(true), false);
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

// ============================================================================
// PruneProcessor — 桶式损坏守卫覆盖 target
// ----------------------------------------------------------------------------
// 旧守卫只覆盖 source；target 桶损坏被 safeLoadJsonFile 静默降级为 {} → 命中孤儿后整体重写、
// 损坏桶被改名 .bak → key 从活跃 locale 消失。修复后守卫覆盖 source + 所有 target，任一损坏即中止。
// ============================================================================
describe('PruneProcessor 桶式损坏守卫覆盖 target', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const buildConfig = (): ResolvedConfig =>
    makeConfig(rootDir, {
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      io: { sourceDir: srcDir, localesDir: localeDir, format: 'flat', prettify: false },
      buckets: {
        rules: [{ name: 'misc', matchKey: (k: string) => k.startsWith('zzz.') }],
        defaultBucket: 'common',
        emitManifest: false,
        layout: 'by-locale',
      },
    });

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-corrupt-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true }); // 空源码目录：usedKeys 为空，全部判孤儿
    // 桶式：source 有效，target 桶损坏
    fs.mkdirSync(path.join(localeDir, 'zh-CN'), { recursive: true });
    fs.mkdirSync(path.join(localeDir, 'en-US'), { recursive: true });
    fs.writeFileSync(
      path.join(localeDir, 'zh-CN', 'common.json'),
      JSON.stringify({ 'a.b': '文案' }),
      'utf-8',
    );
    fs.writeFileSync(path.join(localeDir, 'en-US', 'common.json'), '{ not valid json', 'utf-8');
    spyLoggers();
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('target 桶损坏 → 中止 prune 并报出该 locale，不静默改名 .bak', async () => {
    const corrupt = path.join(localeDir, 'en-US', 'common.json');
    const proc = new PruneProcessor(buildConfig(), false, undefined, { dryRun: false, ci: true });

    await expect(proc.execute()).rejects.toThrow(/en-US.*解析失败|解析失败.*en-US/);

    // 损坏文件未被改名为 .bak（仍在原处）
    expect(fs.existsSync(corrupt)).toBe(true);
    expect(fs.existsSync(`${corrupt}.bak`)).toBe(false);
  });
});

// ============================================================================
// ExportProcessor — 损坏守卫（单文件 source / 桶式 target / 遗留单文件 #6）
// ----------------------------------------------------------------------------
// export 是发布最后一步，旧实现损坏 locale 被 safeLoadJsonFile 当 {} → 导出空语言包覆盖上次产物；
// 末尾「验证」拿刚写出的空 merged 跟自己回读对账必然相等 → 打印「✅ 导出文件验证通过」伪报成功。
// 修复：export 前对 source + 全部 targets 做损坏守卫，命中即中止（与 Pick/Merge/Prune 一致）。
// ============================================================================
describe('ExportProcessor 损坏守卫', () => {
  let rootDir: string;
  let localeDir: string;
  let exportDir: string;

  const buildConfig = (extra: Partial<I18nToolsConfig> = {}): ResolvedConfig =>
    makeConfig(rootDir, {
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      io: {
        sourceDir: path.join(rootDir, 'src'),
        localesDir: localeDir,
        exportDir,
        format: 'flat',
        prettify: false,
      },
      ...extra,
    });

  const bucketsExtra: Partial<I18nToolsConfig> = {
    buckets: {
      rules: [{ name: 'misc', matchKey: (k: string) => k.startsWith('zzz.') }],
      defaultBucket: 'common',
      emitManifest: false,
      layout: 'by-locale',
    },
  };

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-corrupt-'));
    localeDir = path.join(rootDir, 'locale');
    exportDir = path.join(rootDir, 'dist-locale');
    fs.mkdirSync(localeDir, { recursive: true });
    spyLoggers();
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('单文件：source locale 损坏 → 中止 export，不导出空包', async () => {
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), '{ "a.b": "存量"', 'utf-8'); // 损坏
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), JSON.stringify({ 'a.b': 'val' }), 'utf-8');

    await expect(new ExportProcessor(buildConfig()).execute()).rejects.toThrow(
      /zh-CN.*(损坏|解析失败)|(损坏|解析失败).*zh-CN/,
    );

    // 没有把空包写到 exportDir（更没有伪报「验证通过」）
    expect(fs.existsSync(path.join(exportDir, 'zh-CN.json'))).toBe(false);
  });

  it('桶式：target 桶损坏 → 中止 export', async () => {
    const config = buildConfig(bucketsExtra);
    fs.mkdirSync(path.join(localeDir, 'zh-CN'), { recursive: true });
    fs.mkdirSync(path.join(localeDir, 'en-US'), { recursive: true });
    fs.writeFileSync(
      path.join(localeDir, 'zh-CN', 'common.json'),
      JSON.stringify({ 'a.b': '存量' }),
      'utf-8',
    );
    fs.writeFileSync(path.join(localeDir, 'en-US', 'common.json'), '{ not json', 'utf-8'); // 损坏

    await expect(new ExportProcessor(config).execute()).rejects.toThrow(
      /en-US.*(损坏|解析失败)|(损坏|解析失败).*en-US/,
    );
  });

  it('桶式：尚未迁移的遗留单文件损坏 → 中止 export，不静默迁移成空包（#6）', async () => {
    const config = buildConfig(bucketsExtra);
    // 桶目录尚不存在（首次启用 buckets），仅有遗留单文件，且 source 损坏：
    // 旧行为 → migrateToBuckets silent 读 → 当 {} → rename .bak → 导出空包覆盖产物。
    const legacy = path.join(localeDir, 'zh-CN.json');
    fs.writeFileSync(legacy, '{ "a.b": "存量"', 'utf-8'); // 损坏
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), JSON.stringify({ 'a.b': 'val' }), 'utf-8');

    await expect(new ExportProcessor(config).execute()).rejects.toThrow(
      /zh-CN.*(损坏|解析失败)|(损坏|解析失败).*zh-CN/,
    );

    // 守卫先于迁移触发：损坏遗留文件未被 rename 成 .bak，也没有导出空包
    expect(fs.existsSync(`${legacy}.bak`)).toBe(false);
    expect(fs.existsSync(path.join(exportDir, 'zh-CN'))).toBe(false);
  });
});

// ============================================================================
// CsvExportProcessor — 损坏数据源守卫
// ----------------------------------------------------------------------------
// 旧实现用 safeLoadJsonFile 读数据源（解析失败回退 {}），损坏的 untranslated.json 会被当 0 条目
// 导出仅含表头的空 CSV 并伪报成功。修复：readFileSync + safeParseJson===null → throw，区分空/损坏。
// ============================================================================
describe('CsvExportProcessor — 损坏数据源守卫', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-export-corrupt-'));
    localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    spyLoggers();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const run = (): Promise<void> =>
    new CsvExportProcessor(makeConfig(tmpDir), false, {
      source: 'untranslated',
      filter: 'all',
    }).execute();

  it('损坏 JSON → 抛错中止，不产出空 CSV', async () => {
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), '{ "a": broken');
    await expect(run()).rejects.toThrow(/解析失败/);
    expect(fs.existsSync(path.join(localeDir, 'i18n.csv'))).toBe(false);
  });

  it('数据源文件不存在 → 抛错中止', async () => {
    await expect(run()).rejects.toThrow(/不存在/);
  });

  it('空文件 → 视为 0 条目正常导出（仅表头），不抛错', async () => {
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), '');
    await expect(run()).resolves.toBeUndefined();
    expect(fs.existsSync(path.join(localeDir, 'i18n.csv'))).toBe(true);
  });
});

// ============================================================================
// CsvImportProcessor — 损坏字典即中止（不静默丢弃回流译文）
// ----------------------------------------------------------------------------
// 旧实现用 safeLoadJsonFile 读 untranslated.json（解析失败回退 {}），损坏字典被当 0 条目 →
// CSV 里本应命中的 key 全部落入 missingKeys、审核员译文被静默丢弃却退出成功。修复：损坏即抛错中止。
// ============================================================================
describe('CsvImportProcessor — 损坏字典即中止（不静默丢弃回流译文）', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-csv-corrupt-'));
    localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    spyLoggers();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writeCsv(): string {
    const input = path.join(tmpDir, 'in.csv');
    fs.writeFileSync(
      input,
      serializeCsv([
        ['key', 'zh-CN', 'en-US', 'reason'],
        ['a', '甲', 'Jia', ''],
      ]),
    );
    return input;
  }

  it('untranslated.json 内容损坏（非空不可解析）时抛错中止', async () => {
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), '{ this is not json');
    const input = writeCsv();

    await expect(
      new CsvImportProcessor(makeConfig(tmpDir), false, {
        input,
        dryRun: false,
        ci: true,
      }).execute(),
    ).rejects.toThrow(/JSON 格式损坏/);
  });

  it('untranslated.json 为空文件时按空字典处理，不抛错', async () => {
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), '   ');
    const input = writeCsv();

    // 空字典 → key 不命中，按 missing 跳过即可，不应抛错
    await expect(
      new CsvImportProcessor(makeConfig(tmpDir), false, {
        input,
        dryRun: false,
        ci: true,
      }).execute(),
    ).resolves.toBeUndefined();
  });
});

// ============================================================================
// DoctorProcessor — 损坏 locale 守卫
// ----------------------------------------------------------------------------
// 旧实现用 `readLocaleFile(...) ?? {}` 吞掉损坏文件：源损坏 → 全部 key 误报 missing-key(error)，
// CI 因错误原因失败；目标损坏 → 刷一堆假 missing-target-key(warning)，CI 仍 exit 0 掩盖损坏。
// 修复：探测到损坏即报 corrupt-locale(error) 并跳过依赖该 locale 的对账，--ci 据此非零退出。
// ============================================================================
describe('DoctorProcessor — 损坏 locale 守卫', () => {
  let rootDir: string;
  let sourceDir: string;
  let localeDir: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  const buildConfig = (): ResolvedConfig =>
    makeConfig(rootDir, {
      framework: { type: 'vue', tImport: '@/locale' },
      io: { localesDir: localeDir, sourceDir, format: 'flat' },
    });

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-corrupt-'));
    sourceDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    infoSpy = spyLoggers();
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const writeSource = (rel: string, content: string): void =>
    fs.writeFileSync(path.join(sourceDir, rel), content);
  const writeRawLocale = (locale: string, raw: string): void =>
    fs.writeFileSync(path.join(localeDir, `${locale}.json`), raw);
  const writeLocale = (locale: string, data: Record<string, string>): void =>
    fs.writeFileSync(path.join(localeDir, `${locale}.json`), JSON.stringify(data));
  const collect = (spy: ReturnType<typeof vi.spyOn>): string =>
    spy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');

  it('源 locale 损坏 → 报 corrupt-locale，不把所有 key 误报为 missing-key', async () => {
    writeSource('A.vue', `<template>{{ t('greeting') }}</template>`);
    writeRawLocale('zh-CN', '{ "greeting": "你好"'); // 损坏 JSON（缺右括号）
    writeLocale('en-US', { greeting: 'Hello' });

    const proc = new DoctorProcessor(buildConfig());
    await proc.execute();

    const all = collect(infoSpy);
    expect(all).toContain('[corrupt-locale]');
    // 源不可信 → 跳过对账，不应出现 missing-key 噪声
    expect(all).not.toContain('[missing-key]');
  });

  it('源 locale 损坏 + --ci → 抛错（error 级，CI 如实失败）', async () => {
    writeSource('A.vue', `<template>{{ t('greeting') }}</template>`);
    writeRawLocale('zh-CN', '{ broken');
    writeLocale('en-US', { greeting: 'Hello' });

    const proc = new DoctorProcessor(buildConfig(), false, undefined, { ci: true });
    await expect(proc.execute()).rejects.toThrow(/Doctor CI check failed/);
  });

  it('目标 locale 损坏 + --ci → 抛错（修复前是假 warning + exit 0 掩盖损坏）', async () => {
    writeSource('A.vue', `<template>{{ t('greeting') }}</template>`);
    writeLocale('zh-CN', { greeting: '你好' });
    writeRawLocale('en-US', '{ "greeting": '); // 损坏 JSON

    const proc = new DoctorProcessor(buildConfig(), false, undefined, { ci: true });
    await expect(proc.execute()).rejects.toThrow(/Doctor CI check failed/);

    const all = collect(infoSpy);
    expect(all).toContain('[corrupt-locale]');
    // 不应把损坏目标的每个 key 刷成 missing-target-key
    expect(all).not.toContain('[missing-target-key]');
  });

  it('locale 全部正常 → 不报 corrupt-locale（不误伤）', async () => {
    writeSource('A.vue', `<template>{{ t('greeting') }}</template>`);
    writeLocale('zh-CN', { greeting: '你好' });
    writeLocale('en-US', { greeting: 'Hello' });

    const proc = new DoctorProcessor(buildConfig());
    await proc.execute();

    expect(collect(infoSpy)).not.toContain('[corrupt-locale]');
  });
});

// ============================================================================
// Glossary.load — 损坏守卫
// ----------------------------------------------------------------------------
// Glossary.load 文档承诺「JSON 解析失败 → 抛错」，但实际依赖 safeLoadJsonFile 静默吞成 {} →
// 返回空词表打印「(0 条)」→ 所有 lookup 静默 miss、术语全部回退 LLM 而无从察觉，违反 fail-fast。
// 修复：文件存在但 JSON 损坏时抛错；文件不存在仍返回 null（显式启用语义不变）。
// ============================================================================
describe('Glossary.load 损坏守卫', () => {
  let rootDir: string;
  let glossaryFile: string;

  const buildConfig = (): ResolvedConfig =>
    makeConfig(rootDir, {
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      io: { sourceDir: path.join(rootDir, 'src'), localesDir: path.join(rootDir, 'locale') },
      glossary: { file: glossaryFile },
    });

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glossary-corrupt-'));
    glossaryFile = path.join(rootDir, 'glossary.json');
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('文件存在但 JSON 损坏 → 抛错', () => {
    fs.writeFileSync(glossaryFile, '{ "确认": "Confirm"', 'utf-8'); // 缺右括号
    expect(() => Glossary.load(buildConfig())).toThrow(/词表.*解析失败|解析失败|损坏/);
  });

  it('文件不存在 → 返回 null（显式启用语义不变）', () => {
    fs.rmSync(glossaryFile, { force: true });
    expect(Glossary.load(buildConfig())).toBeNull();
  });

  it('合法词表正常加载', () => {
    fs.writeFileSync(glossaryFile, JSON.stringify({ 确认: 'Confirm' }), 'utf-8');
    const map = Glossary.load(buildConfig());
    expect(map?.get('确认')).toEqual({ 'en-US': 'Confirm' });
  });
});
