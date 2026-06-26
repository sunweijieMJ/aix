import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TranslateProcessor } from '../src/core/TranslateProcessor';
import { LLMClient } from '../src/utils/llm-client';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';
import type { Translations } from '../src/utils/types';

/**
 * 回归（#6）：ICU plural/select 文案的占位符校验此前用朴素正则 /\{([^{}]+)\}/，
 * 采到的是子消息字面量（# item / # items）而非顶层参数名 count；译文子消息随语言改变后
 * 名集不一致 → 每条 ICU 文案被永久丢弃、无法翻译。改用深度感知 extractPlaceholderNames
 * （与 doctor 同一套）只比对顶层参数名后，子消息文本变化不再触发误丢。
 */
describe('TranslateProcessor — ICU 占位符校验（#6）', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-icu-'));
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const makeConfig = (): ResolvedConfig =>
    resolveConfig({
      root: tmpDir,
      framework: { type: 'react', library: 'react-intl' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } as I18nToolsConfig);

  const writeUntranslated = (entries: Translations): void => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), JSON.stringify(entries, null, 2));
  };
  const readUntranslated = (): Translations =>
    JSON.parse(fs.readFileSync(path.join(tmpDir, 'locale', 'untranslated.json'), 'utf-8'));

  it('plural 子消息文本随语言改变 → 顶层参数名一致 → 译文被保留写回', async () => {
    const source = '{count, plural, one {# 项} other {# 项目}}';
    const translated = '{count, plural, one {# item} other {# items}}';
    writeUntranslated({ 'a.b': { 'zh-CN': source, 'en-US': '' } });

    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) =>
        batches.map((b) => {
          const out: Translations = {};
          for (const k of Object.keys(b)) out[k] = { 'en-US': translated };
          return out;
        }),
    );

    await expect(new TranslateProcessor(makeConfig(), false).execute()).resolves.toBeUndefined();
    expect(readUntranslated()['a.b']!['en-US']).toBe(translated);
  });

  it('顶层参数名真不一致（count → qty）仍被丢弃', async () => {
    const source = '{count, plural, one {# 项} other {# 项目}}';
    const wrong = '{qty, plural, one {# item} other {# items}}';
    writeUntranslated({ 'a.b': { 'zh-CN': source, 'en-US': '' } });

    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) =>
        batches.map((b) => {
          const out: Translations = {};
          for (const k of Object.keys(b)) out[k] = { 'en-US': wrong };
          return out;
        }),
    );

    // 单条且被丢弃 → 0 写入 → 抛错（沿用既有失败守卫语义）
    await expect(new TranslateProcessor(makeConfig(), false).execute()).rejects.toThrow();
    expect(readUntranslated()['a.b']!['en-US']).toBe('');
  });
});
