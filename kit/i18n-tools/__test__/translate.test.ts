import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TranslateProcessor } from '../src/core/TranslateProcessor';
import { LLMClient } from '../src/utils/llm-client';
import { Glossary } from '../src/utils/glossary';
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
 * 回归（审计 medium：性能）：词表语言无关，N 个目标语种应共用一次加载，
 * 而非在 per-target 循环里每轮 Glossary.load() 重复读盘+解析同一词表。
 */
describe('TranslateProcessor — glossary 多目标只加载一次', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-glossary-'));
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('两个目标语种共用一份词表，Glossary.load 只调用一次（不随 target 重复读盘）', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    // 词表覆盖两个目标语种 → 两个 target 都靠词表填满，无需走 LLM
    fs.writeFileSync(
      path.join(tmpDir, 'glossary.json'),
      JSON.stringify({ 你好: { 'en-US': 'Hello', 'ja-JP': 'こんにちは' } }),
    );
    fs.writeFileSync(
      path.join(localeDir, 'untranslated.json'),
      JSON.stringify({ 'a.b': { 'zh-CN': '你好' } }),
    );

    const config = resolveConfig({
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US', 'ja-JP'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
      glossary: { file: 'glossary.json' },
    } satisfies I18nToolsConfig);

    const loadSpy = vi.spyOn(Glossary, 'load');
    const llmSpy = vi.spyOn(LLMClient.prototype, 'batchTranslate').mockResolvedValue([]);

    await new TranslateProcessor(config, false).execute();

    expect(loadSpy).toHaveBeenCalledTimes(1); // 旧实现按 target 调用 → 2 次
    expect(llmSpy).not.toHaveBeenCalled(); // 词表已填满，无需 LLM
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
 * 回归（Bug 1）：双花括号库（react-i18next）下，源文里恰好出现的字面量单花括号
 * （非插值，如「包含{大括号}的文本」）此前被 extractPlaceholderNames 按无库区分的
 * 通用规则处理——源文侧因中文不匹配 ASCII 标识符正则而判定为空占位符集，一旦译文
 * 侧把字面量花括号里的内容译成英文（ASCII 能匹配上）就被判定「占位符不匹配」丢弃，
 * 导致这类文案永远翻译不出来、只能反复重试。
 *
 * 根因是 prompt（见 getTranslationSystemPrompt）与校验器（extractPlaceholderNames）
 * 对「单花括号在双花括号库下到底算不算占位符」认知不一致。修复后二者统一：双花括号库下
 * 单花括号一律视为字面量文本，只有 `{{name}}` 才是真占位符。
 */
describe('TranslateProcessor — 双花括号库下单花括号字面量文本不应被当占位符（Bug 1）', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-brace-literal-'));
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
      framework: { type: 'react', library: 'react-i18next' },
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

  it('单花括号字面量文本正常翻译（含翻译后的英文单词）不再被误判占位符丢弃', async () => {
    const source = '包含{大括号}的文本';
    const translated = 'Text containing {braces}';
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

  it('回归保护：真双花括号占位符 {{name}} 丢失仍应被正确拦截丢弃', async () => {
    const source = '欢迎 {{name}}';
    const wrong = 'Welcome'; // 丢了 {{name}}
    writeUntranslated({ 'a.b': { 'zh-CN': source, 'en-US': '' } });

    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) =>
        batches.map((b) => {
          const out: Translations = {};
          for (const k of Object.keys(b)) out[k] = { 'en-US': wrong };
          return out;
        }),
    );

    await expect(new TranslateProcessor(makeConfig(), false).execute()).rejects.toThrow();
    expect(readUntranslated()['a.b']!['en-US']).toBe('');
  });

  it('回归保护：真双花括号占位符 {{name}} 正确保留仍应通过校验', async () => {
    const source = '欢迎 {{name}}，共 {{count}} 条';
    const translated = 'Welcome {{name}}, {{count}} items total';
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

/**
 * 回归（审计 P1）：mergeTranslations 此前只用 `newValue?.trim()` 判定 LLM 返回值，
 * 「非空但无效」（纯标点/符号）的译文被写回并计成功；MergeProcessor 的 isValidTranslation
 * 又会拒收 → warn-only 策略下该 key 永远合不进 locale，translate 统计却全绿。
 * 修复：merge 侧与 pick/merge 同口径拒收，条目留在 untranslated.json 等待续翻。
 */
describe('TranslateProcessor — 拒收 LLM 返回的无效译文', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-invalid-result-'));
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

  /** 同一批内：合法译文照常写回，垃圾译文被丢弃 */
  const mockBatch = (values: Record<string, string>): void => {
    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) =>
        batches.map((b) => {
          const out: Translations = {};
          for (const k of Object.keys(b)) out[k] = { 'en-US': values[k] ?? '' };
          return out;
        }),
    );
  };

  it('返回纯标点（...）→ 丢弃不写回，条目保持待翻状态；同批合法译文不受影响', async () => {
    writeUntranslated({
      'a.b': { 'zh-CN': '确认', 'en-US': '' },
      'a.c': { 'zh-CN': '取消', 'en-US': '' },
    });
    mockBatch({ 'a.b': '...', 'a.c': 'Cancel' });

    await expect(new TranslateProcessor(makeConfig(), false).execute()).resolves.toBeUndefined();

    const data = readUntranslated();
    expect(data['a.b']!['en-US']).toBe(''); // 垃圾译文未写回
    expect(data['a.c']!['en-US']).toBe('Cancel');
  });

  it('整批返回垃圾译文 → 0 条写入，批次计失败并非零退出（不伪报成功）', async () => {
    writeUntranslated({ 'a.b': { 'zh-CN': '确认', 'en-US': '' } });
    mockBatch({ 'a.b': '——' });

    await expect(new TranslateProcessor(makeConfig(), false).execute()).rejects.toThrow(
      /全部|失败/,
    );
    expect(readUntranslated()['a.b']!['en-US']).toBe('');
  });
});
