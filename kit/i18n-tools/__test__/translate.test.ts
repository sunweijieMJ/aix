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
 * 回归（Bug B6）：translate「全部批次失败」时必须以抛错（非零退出）结束，
 * 与 restore（failedFiles>0 抛错）/ doctor（CI error>0 抛错）口径对齐，
 * 否则 CI 会把「所有翻译都失败」误判为成功。
 *
 * 同时保留「断点续翻」设计：部分批次失败（仍有成功）不抛错，留待重跑续翻。
 */
describe('TranslateProcessor — 全失败应非零退出（Bug B6）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-translate-'));
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeConfig(batchSize = 30): ResolvedConfig {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' }, translation: { batchSize } },
    };
    return resolveConfig(user);
  }

  /** 写出 untranslated.json，返回路径。 */
  function writeUntranslated(entries: Translations): string {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    const p = path.join(localeDir, 'untranslated.json');
    fs.writeFileSync(p, JSON.stringify(entries, null, 2));
    return p;
  }

  it('全部批次失败（LLM 全返回 null）→ 抛错中止', async () => {
    writeUntranslated({
      'a.b': { 'zh-CN': '你好', 'en-US': '' },
      'a.c': { 'zh-CN': '世界', 'en-US': '' },
    });
    // 所有批次返回 undefined → 全失败（performBatchTranslation 用 !translatedBatch 判失败）
    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) => batches.map(() => undefined),
    );

    const processor = new TranslateProcessor(makeConfig(), false);
    await expect(processor.execute()).rejects.toThrow(/全部|失败/);
  });

  it('全部批次成功 → 正常完成不抛错', async () => {
    writeUntranslated({ 'a.b': { 'zh-CN': '你好', 'en-US': '' } });
    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) =>
        batches.map((b) => {
          const out: Translations = {};
          for (const key of Object.keys(b)) out[key] = { 'en-US': 'Hello' };
          return out;
        }),
    );

    const processor = new TranslateProcessor(makeConfig(), false);
    await expect(processor.execute()).resolves.toBeUndefined();
  });

  it('部分批次失败（仍有成功）→ 不抛错，保留断点续翻设计', async () => {
    writeUntranslated({
      'a.b': { 'zh-CN': '你好', 'en-US': '' },
      'a.c': { 'zh-CN': '世界', 'en-US': '' },
    });
    // batchSize=1 → 2 个批次：第一个成功，第二个失败
    let n = 0;
    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) =>
        batches.map((b): Translations | undefined => {
          if (n++ === 0) {
            const out: Translations = {};
            for (const key of Object.keys(b)) out[key] = { 'en-US': 'OK' };
            return out;
          }
          return undefined;
        }),
    );

    const processor = new TranslateProcessor(makeConfig(1), false);
    await expect(processor.execute()).resolves.toBeUndefined();
  });
});

/**
 * 回归（#11）：LLM 返回结构合法、但所有条目因占位符不一致被丢弃（0 条写入）的批次，
 * 必须计为失败并进入退出守卫——否则全批/全 target 如此时进程会 exit 0 却什么都没写，
 * CI 把「翻译跑了一条没落」误判为成功。
 */
describe('TranslateProcessor — 占位符全丢批次计为失败（#11）', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-drop-'));
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const makeConfig = (batchSize = 30): ResolvedConfig =>
    resolveConfig({
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' }, translation: { batchSize } },
    } as I18nToolsConfig);

  const writeUntranslated = (entries: Translations): void => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), JSON.stringify(entries, null, 2));
  };

  it('占位符不一致致整批丢弃（0 条写入）→ 抛错，不静默 exit 0', async () => {
    writeUntranslated({ 'a.b': { 'zh-CN': '共 {count} 个', 'en-US': '' } });
    // 译文把 {count} 写成 {counts} → mergeTranslations 占位符校验丢弃 → translated===0
    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) =>
        batches.map((b) => {
          const out: Translations = {};
          for (const k of Object.keys(b)) out[k] = { 'en-US': 'Total {counts} items' };
          return out;
        }),
    );

    const processor = new TranslateProcessor(makeConfig(), false);
    await expect(processor.execute()).rejects.toThrow(/失败|未产出/);
  });

  it('同批内部分丢弃但仍有成功 → 不抛错（保留断点续翻）', async () => {
    writeUntranslated({
      'a.b': { 'zh-CN': '共 {count} 个', 'en-US': '' }, // 将被丢弃
      'a.c': { 'zh-CN': '你好', 'en-US': '' }, // 正常翻译
    });
    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) =>
        batches.map((b) => {
          const out: Translations = {};
          for (const k of Object.keys(b)) {
            out[k] = k === 'a.b' ? { 'en-US': 'X {counts}' } : { 'en-US': 'Hello' };
          }
          return out;
        }),
    );

    const processor = new TranslateProcessor(makeConfig(), false); // 单批：translated===1>0 → 成功
    await expect(processor.execute()).resolves.toBeUndefined();
  });
});

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

/**
 * 回归：translate 原用 `item[target]?.trim()` 判定是否已译，与 pick/merge 的 isValidTranslation
 * 口径不一致。当目标值是「非空但无效」（纯标点/符号，如 '——'）时，trim() 为真 → translate 误当
 * 已译跳过，该条目永远不会被翻译。修复：translate 侧统一改用 isValidTranslation。
 */
describe('TranslateProcessor — 无效占位译文应被重新翻译', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-invalid-existing-'));
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
      framework: { type: 'vue' },
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

  it('目标值为纯标点（——）→ 仍进入翻译并写回译文', async () => {
    writeUntranslated({ 'a.b': { 'zh-CN': '确认', 'en-US': '——' } });

    const spy = vi
      .spyOn(LLMClient.prototype, 'batchTranslate')
      .mockImplementation(async (batches: Translations[]) =>
        batches.map((b) => {
          const out: Translations = {};
          for (const k of Object.keys(b)) out[k] = { 'en-US': 'Confirm' };
          return out;
        }),
      );

    await expect(new TranslateProcessor(makeConfig(), false).execute()).resolves.toBeUndefined();
    // 关键：无效占位值被识别为未翻译，进入 LLM 并写回真实译文
    expect(spy).toHaveBeenCalled();
    expect(readUntranslated()['a.b']!['en-US']).toBe('Confirm');
  });

  it('目标值为有效译文 → 跳过翻译（无回归）', async () => {
    writeUntranslated({ 'a.b': { 'zh-CN': '确认', 'en-US': 'Confirm' } });

    const spy = vi
      .spyOn(LLMClient.prototype, 'batchTranslate')
      .mockImplementation(async (batches: Translations[]) => batches.map(() => ({})));

    await new TranslateProcessor(makeConfig(), false).execute();
    expect(spy).not.toHaveBeenCalled();
    expect(readUntranslated()['a.b']!['en-US']).toBe('Confirm');
  });
});
