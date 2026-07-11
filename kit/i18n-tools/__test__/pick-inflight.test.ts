import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PickProcessor } from '../src/core/PickProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * Pick 的「在途译文保护」回归（审计 P2 #1）。
 *
 * 流程背景：pick 产出 untranslated.json → translate 把 LLM 译文写回该文件 →
 * merge 才把译文合入 locale。在 translate 之后、merge 之前重跑 pick（人工重跑 /
 * automatic 流程 merge 失败后整体重来）时，旧实现只从 locale 读状态、无条件覆写
 * untranslated.json —— translate 已产出、尚未 merge 的译文被静默清空（丢 LLM 成本）。
 *
 * 保护语义：
 *  - locale 无有效值、词表未命中，但旧 untranslated.json 已有该 key 该 target 的
 *    有效译文，且源文案未变 → 原样保留（条目仍留在 untranslated.json 等 merge）
 *  - 源文案已变 → 旧译文视为陈旧，不保留（回到待翻状态）
 *  - 词表命中优先于在途译文（词表是权威口径）
 *  - untranslated.json 损坏 → 中止不覆写（与 merge/translate 的 loadJsonDictOrThrow 口径一致）
 */

function spyLoggers(): void {
  vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
  vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
  vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
}

describe('PickProcessor — 在途译文保护（translate 已翻、未 merge 时重跑 pick）', () => {
  let tmpDir: string;
  let localeDir: string;

  const makeConfig = (overrides: Partial<I18nToolsConfig> = {}): ResolvedConfig =>
    resolveConfig({
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
      ...overrides,
    } as I18nToolsConfig);

  const writeLocale = (locale: string, data: Record<string, string>): void => {
    fs.writeFileSync(path.join(localeDir, `${locale}.json`), JSON.stringify(data));
  };
  const writeUntranslated = (data: Record<string, Record<string, string>>): string => {
    const p = path.join(localeDir, 'untranslated.json');
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
    return p;
  };
  const readJson = (p: string): Record<string, Record<string, string>> =>
    JSON.parse(fs.readFileSync(p, 'utf-8'));

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-pick-inflight-'));
    localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    spyLoggers();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('保留在途译文：locale 缺 target 值但旧 untranslated.json 已有有效译文', async () => {
    writeLocale('zh-CN', { 'a.b': '你好', 'c.d': '再见' });
    writeLocale('en-US', {});
    const untPath = writeUntranslated({
      'a.b': { 'zh-CN': '你好', 'en-US': 'Hello(LLM)' }, // translate 已翻、未 merge
    });

    await new PickProcessor(makeConfig(), false).execute();

    const result = readJson(untPath);
    // 核心断言：在途译文原样保留，未被清空
    expect(result['a.b']).toEqual({ 'zh-CN': '你好', 'en-US': 'Hello(LLM)' });
    // 真正未翻的条目照常进入待翻状态
    expect(result['c.d']).toEqual({ 'zh-CN': '再见', 'en-US': '' });
  });

  it('源文案已变时不保留旧译文（陈旧译文回到待翻状态）', async () => {
    writeLocale('zh-CN', { 'a.b': '新文案' });
    writeLocale('en-US', {});
    const untPath = writeUntranslated({
      'a.b': { 'zh-CN': '旧文案', 'en-US': 'Stale translation' },
    });

    await new PickProcessor(makeConfig(), false).execute();

    const result = readJson(untPath);
    expect(result['a.b']).toEqual({ 'zh-CN': '新文案', 'en-US': '' });
  });

  it('词表命中优先于在途译文', async () => {
    writeLocale('zh-CN', { 'a.b': '你好' });
    writeLocale('en-US', {});
    fs.writeFileSync(
      path.join(localeDir, 'glossary.json'),
      JSON.stringify({ 你好: 'Hi(glossary)' }),
    );
    const untPath = writeUntranslated({
      'a.b': { 'zh-CN': '你好', 'en-US': 'Hello(LLM)' },
    });

    const config = makeConfig({
      glossary: { file: 'locale/glossary.json', override: 'always', normalize: true },
    });
    await new PickProcessor(config, false).execute();

    // 词表命中后该条目所有 target 已齐 → 毕业进 translations.json（词表值胜出，
    // 在途 LLM 译文被词表覆盖——词表是权威口径），untranslated.json 不再保留该 key。
    expect(readJson(untPath)['a.b']).toBeUndefined();
    const translations = readJson(path.join(localeDir, 'translations.json'));
    expect(translations['a.b']!['en-US']).toBe('Hi(glossary)');
  });

  it('多 target：仅保留已翻的 target，未翻的 target 照常置空', async () => {
    writeLocale('zh-CN', { 'a.b': '你好' });
    writeLocale('en-US', {});
    writeLocale('ja-JP', {});
    const untPath = writeUntranslated({
      'a.b': { 'zh-CN': '你好', 'en-US': 'Hello(LLM)' }, // en 已翻、ja 未翻
    });

    const config = makeConfig({ locales: { source: 'zh-CN', targets: ['en-US', 'ja-JP'] } });
    await new PickProcessor(config, false).execute();

    const result = readJson(untPath);
    expect(result['a.b']).toEqual({ 'zh-CN': '你好', 'en-US': 'Hello(LLM)', 'ja-JP': '' });
  });

  it('untranslated.json 损坏时中止且不覆写（防销毁不可读的在途译文）', async () => {
    writeLocale('zh-CN', { 'a.b': '你好' });
    writeLocale('en-US', {});
    const untPath = path.join(localeDir, 'untranslated.json');
    const corrupt = '{ "a.b": { "zh-CN": "你好",, }';
    fs.writeFileSync(untPath, corrupt);

    const proc = new PickProcessor(makeConfig(), false);
    await expect(proc.execute()).rejects.toThrow(/解析失败|JSON/);
    expect(fs.readFileSync(untPath, 'utf-8')).toBe(corrupt);
    expect(LoggerUtils.success).not.toHaveBeenCalled();
  });

  it('回归：locale 已有有效译文的条目照常进 translations.json，不受保护逻辑影响', async () => {
    writeLocale('zh-CN', { 'a.b': '你好' });
    writeLocale('en-US', { 'a.b': 'Hello' });
    const untPath = writeUntranslated({});

    await new PickProcessor(makeConfig(), false).execute();

    expect(readJson(untPath)).toEqual({});
    const translations = readJson(path.join(localeDir, 'translations.json'));
    expect(translations['a.b']).toEqual({ 'zh-CN': '你好', 'en-US': 'Hello' });
  });
});
