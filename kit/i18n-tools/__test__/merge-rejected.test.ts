import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MergeProcessor } from '../src/core/MergeProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

/**
 * merge 阶段对「LLM 翻译被 isValidTranslation 拒收」的条目的两种处理策略：
 *
 * - 'fallback-to-source'（默认）：用源语言文本回填目标语言文件，从 untranslated.json 移除。
 *   解决"运行时 t() 找不到 key 显示 key 字符串"的问题。
 * - 'warn-only'：仅 warn，保留在 untranslated.json 等待人工处理。
 *
 * 真未翻译条目（enValue 为空 / 缺失）始终保留在 untranslated.json，与策略无关。
 */
describe('MergeProcessor — 拒收翻译的处理策略', () => {
  let tmpDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-merge-rejected-'));
    warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeConfig(
    onLlmRejected: 'fallback-to-source' | 'warn-only' = 'fallback-to-source',
  ): ResolvedConfig {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
      merge: { onLlmRejected },
    };
    return resolveConfig(user);
  }

  function setupLocaleDir(untranslated: Record<string, { 'zh-CN': string; 'en-US': string }>) {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(
      path.join(localeDir, 'untranslated.json'),
      JSON.stringify(untranslated, null, 2),
    );
    fs.writeFileSync(path.join(localeDir, 'translations.json'), JSON.stringify({}, null, 2));
  }

  // ============================== fallback-to-source（默认）==============================

  it('[默认] 拒收条目用源文本回填到 en-US.json，且从 untranslated.json 移除', async () => {
    setupLocaleDir({
      'pages.foo.exclamation': { 'zh-CN': '吧！', 'en-US': '!' },
    });

    const processor = new MergeProcessor(makeConfig(), false);
    await processor.execute();

    // en-US.json 应包含源文本作为兜底值（运行时 t() 不再返回 key 字符串）
    const en = JSON.parse(fs.readFileSync(path.join(tmpDir, 'locale', 'en-US.json'), 'utf-8'));
    expect(en['pages.foo.exclamation']).toBe('吧！');

    // translations.json 也应一致写入
    const translations = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locale', 'translations.json'), 'utf-8'),
    );
    expect(translations['pages.foo.exclamation']).toEqual({
      'zh-CN': '吧！',
      'en-US': '吧！',
    });

    // untranslated.json 不再包含该条目（已处理完毕，避免下次重复 warn）
    const remaining = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locale', 'untranslated.json'), 'utf-8'),
    );
    expect(remaining['pages.foo.exclamation']).toBeUndefined();
  });

  it('[默认] 拒收 warn 文案应提示已回填且写入 RunReport', async () => {
    setupLocaleDir({
      'pages.foo.exclamation': { 'zh-CN': '吧！', 'en-US': '!' },
    });

    const processor = new MergeProcessor(makeConfig(), false);
    await processor.execute();

    const warns = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    // 文案应反映"已回填"语义，不再是单纯"未合并"
    expect(warns.some((m: string) => m.includes('已用 zh-CN 源文本回填'))).toBe(true);
    expect(warns.some((m: string) => m.includes('pages.foo.exclamation'))).toBe(true);
    expect(warns.some((m: string) => m.includes('isValidTranslation 拒收'))).toBe(true);

    // 建议项应包含"切到 warn-only 关闭回填"的逃生口
    expect(warns.some((m: string) => m.includes("'warn-only'"))).toBe(true);

    // 落盘到 RunReport
    const logsDir = path.join(tmpDir, '.i18n-tools', 'logs');
    expect(fs.existsSync(logsDir)).toBe(true);
    const logFiles = fs.readdirSync(logsDir);
    expect(logFiles.length).toBeGreaterThan(0);
    const reportRaw = fs.readFileSync(path.join(logsDir, logFiles[0]!), 'utf-8');
    expect(reportRaw).toContain('已用 zh-CN 源文本回填');
  });

  it('[默认] zh 也为空的拒收条目不回填（无源文本可兜底），仍留在 untranslated', async () => {
    setupLocaleDir({
      'pages.foo.weird': { 'zh-CN': '', 'en-US': '!' },
    });

    const processor = new MergeProcessor(makeConfig(), false);
    await processor.execute();

    const enPath = path.join(tmpDir, 'locale', 'en-US.json');
    const en = fs.existsSync(enPath) ? JSON.parse(fs.readFileSync(enPath, 'utf-8')) : {};
    expect(en['pages.foo.weird']).toBeUndefined();

    const remaining = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locale', 'untranslated.json'), 'utf-8'),
    );
    expect(remaining['pages.foo.weird']).toBeDefined();
  });

  it('[默认] 真未翻译条目（en 为空）保留在 untranslated.json，不被静默回填', async () => {
    setupLocaleDir({
      'pages.foo.pending': { 'zh-CN': '待译', 'en-US': '' },
    });

    const processor = new MergeProcessor(makeConfig(), false);
    await processor.execute();

    const remaining = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locale', 'untranslated.json'), 'utf-8'),
    );
    expect(remaining['pages.foo.pending']).toBeDefined();
    expect(remaining['pages.foo.pending']['en-US']).toBe('');

    // en-US.json 不应误把"待译"当作翻译写入
    const enPath = path.join(tmpDir, 'locale', 'en-US.json');
    const en = fs.existsSync(enPath) ? JSON.parse(fs.readFileSync(enPath, 'utf-8')) : {};
    expect(en['pages.foo.pending']).toBeUndefined();
  });

  it('[默认] 正常 LLM 翻译完成合并到 en-US，不触发回填', async () => {
    setupLocaleDir({
      'pages.foo.hello': { 'zh-CN': '你好', 'en-US': 'Hello' },
    });

    const processor = new MergeProcessor(makeConfig(), false);
    await processor.execute();

    const en = JSON.parse(fs.readFileSync(path.join(tmpDir, 'locale', 'en-US.json'), 'utf-8'));
    expect(en['pages.foo.hello']).toBe('Hello');

    const warns = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(warns.some((m: string) => m.includes('被判无效'))).toBe(false);
  });

  it('[默认] 混合场景：有效翻译合并 + 拒收回填 + 真未翻译保留', async () => {
    setupLocaleDir({
      'pages.foo.hello': { 'zh-CN': '你好', 'en-US': 'Hello' },
      'pages.foo.exclamation': { 'zh-CN': '吧！', 'en-US': '!' },
      'pages.foo.pending': { 'zh-CN': '待译', 'en-US': '' },
    });

    const processor = new MergeProcessor(makeConfig(), false);
    await processor.execute();

    const en = JSON.parse(fs.readFileSync(path.join(tmpDir, 'locale', 'en-US.json'), 'utf-8'));
    // 有效翻译用 LLM 给的英文
    expect(en['pages.foo.hello']).toBe('Hello');
    // 拒收用源文本回填
    expect(en['pages.foo.exclamation']).toBe('吧！');
    // 真未翻译不进 en-US
    expect(en['pages.foo.pending']).toBeUndefined();

    const remaining = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locale', 'untranslated.json'), 'utf-8'),
    );
    // hello 已合并、exclamation 已回填 → 都从 untranslated 移除；pending 保留
    expect(Object.keys(remaining)).toEqual(['pages.foo.pending']);
  });

  // ============================== warn-only ==============================

  it('[warn-only] 拒收条目不回填，仍保留在 untranslated.json', async () => {
    setupLocaleDir({
      'pages.foo.exclamation': { 'zh-CN': '吧！', 'en-US': '!' },
    });

    const processor = new MergeProcessor(makeConfig('warn-only'), false);
    await processor.execute();

    // en-US.json 不写入（保留旧行为：运行时 t() 仍会显示 key 字符串）
    const enPath = path.join(tmpDir, 'locale', 'en-US.json');
    const en = fs.existsSync(enPath) ? JSON.parse(fs.readFileSync(enPath, 'utf-8')) : {};
    expect(en['pages.foo.exclamation']).toBeUndefined();

    // 仍卡在 untranslated.json
    const remaining = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locale', 'untranslated.json'), 'utf-8'),
    );
    expect(remaining['pages.foo.exclamation']).toBeDefined();
  });

  it('[warn-only] warn 文案应提示"未合并"，并引导启用 fallback-to-source', async () => {
    setupLocaleDir({
      'pages.foo.exclamation': { 'zh-CN': '吧！', 'en-US': '!' },
    });

    const processor = new MergeProcessor(makeConfig('warn-only'), false);
    await processor.execute();

    const warns = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(warns.some((m: string) => m.includes('被判无效'))).toBe(true);
    expect(warns.some((m: string) => m.includes('未合并到 en-US'))).toBe(true);
    // 引导启用回填
    expect(warns.some((m: string) => m.includes("'fallback-to-source'"))).toBe(true);
  });

  it('[warn-only] 有效翻译与真未翻译条目行为不变', async () => {
    setupLocaleDir({
      'pages.foo.hello': { 'zh-CN': '你好', 'en-US': 'Hello' },
      'pages.foo.pending': { 'zh-CN': '待译', 'en-US': '' },
    });

    const processor = new MergeProcessor(makeConfig('warn-only'), false);
    await processor.execute();

    const en = JSON.parse(fs.readFileSync(path.join(tmpDir, 'locale', 'en-US.json'), 'utf-8'));
    expect(en['pages.foo.hello']).toBe('Hello');
    expect(en['pages.foo.pending']).toBeUndefined();

    const remaining = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locale', 'untranslated.json'), 'utf-8'),
    );
    expect(remaining['pages.foo.pending']).toBeDefined();
    expect(remaining['pages.foo.hello']).toBeUndefined();
  });
});

/**
 * merge 写盘前的两道预检：nested 序列化的前缀冲突必须在任何写盘动作之前拦截；
 * 中间产物里形态非法（非对象）的条目告警跳过而非裸 TypeError。
 */
describe('MergeProcessor — 写盘前预检与形态非法条目', () => {
  let tmpDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-merge-precheck-'));
    warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const localeDir = (): string => path.join(tmpDir, 'locale');

  function writeJson(relPath: string, data: unknown): void {
    const full = path.join(localeDir(), relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(data, null, 2));
  }

  function readJson(relPath: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(localeDir(), relPath), 'utf-8'));
  }

  function makeConfig(overrides: Partial<I18nToolsConfig> = {}): ResolvedConfig {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'nested' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
      ...overrides,
    };
    return resolveConfig(user);
  }

  describe('nested 前缀冲突在写盘前拦截', () => {
    it('target 已有叶子 key a、本轮要合入 a.b → 抛错且中间产物未被改写', async () => {
      // a 只存在于 target 侧，generate 的写源码前预检看不到，冲突只能在 merge 拦
      writeJson('en-US.json', { a: '已有叶子' });
      const untranslated = { 'a.b': { 'zh-CN': '文案', 'en-US': 'text' } };
      writeJson('untranslated.json', untranslated);
      writeJson('translations.json', {});

      await expect(new MergeProcessor(makeConfig(), false).execute()).rejects.toThrow(/前缀冲突/);

      // 「变更前中止」：中间产物与语言包都保持原样
      expect(readJson('untranslated.json')).toEqual(untranslated);
      expect(readJson('translations.json')).toEqual({});
      expect(readJson('en-US.json')).toEqual({ a: '已有叶子' });
    });

    it('错误信息指明是哪个 target、哪对 key', async () => {
      writeJson('en-US.json', { a: '已有叶子' });
      writeJson('untranslated.json', { 'a.b': { 'zh-CN': '文案', 'en-US': 'text' } });
      writeJson('translations.json', {});

      await expect(new MergeProcessor(makeConfig(), false).execute()).rejects.toThrow(
        /en-US[\s\S]*'a'[\s\S]*'a\.b'/,
      );
    });

    it('多 target 时第二个 target 冲突 → 第一个 target 的语言包也不会被先写', async () => {
      writeJson('en-US.json', { x: 'v' });
      writeJson('ja-JP.json', { a: '既存の葉' });
      writeJson('untranslated.json', {
        'a.b': { 'zh-CN': '文案', 'en-US': 'text', 'ja-JP': 'テキスト' },
      });
      writeJson('translations.json', {});

      const config = makeConfig({ locales: { source: 'zh-CN', targets: ['en-US', 'ja-JP'] } });
      await expect(new MergeProcessor(config, false).execute()).rejects.toThrow(/前缀冲突/);

      expect(readJson('en-US.json')).toEqual({ x: 'v' });
    });

    it('[反向] 无冲突时 merge 行为不变：语言包 / translations / untranslated 三者照常更新', async () => {
      writeJson('en-US.json', { x: 'v' });
      writeJson('untranslated.json', { 'a.b': { 'zh-CN': '文案', 'en-US': 'text' } });
      writeJson('translations.json', {});

      await new MergeProcessor(makeConfig(), false).execute();

      expect(readJson('en-US.json')).toEqual({ x: 'v', a: { b: 'text' } });
      expect(readJson('translations.json')).toEqual({
        'a.b': { 'zh-CN': '文案', 'en-US': 'text' },
      });
      expect(readJson('untranslated.json')).toEqual({});
    });

    it('[反向] format=flat 不做 unflatten，a 与 a.b 共存照常合并', async () => {
      writeJson('en-US.json', { a: '已有叶子' });
      writeJson('untranslated.json', { 'a.b': { 'zh-CN': '文案', 'en-US': 'text' } });
      writeJson('translations.json', {});

      await new MergeProcessor(
        makeConfig({ io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' } }),
        false,
      ).execute();

      expect(readJson('en-US.json')).toEqual({ a: '已有叶子', 'a.b': 'text' });
    });

    it('[反向] 桶式：a 与 a.b 分属不同桶时不误报（各桶独立序列化）', async () => {
      const config = makeConfig({
        buckets: {
          rules: [
            { name: 'alpha', matchKey: (k: string) => k === 'a' },
            { name: 'beta', matchKey: (k: string) => k.startsWith('a.') },
          ],
          defaultBucket: 'common',
          emitManifest: false,
          layout: 'by-locale',
        },
      });
      // source 驱动分桶：两个 key 都要在 source 里，才能让共享分桶表覆盖它们
      writeJson(path.join('zh-CN', 'alpha.json'), { a: '叶子' });
      writeJson(path.join('zh-CN', 'beta.json'), { a: { b: '子树' } });
      writeJson(path.join('en-US', 'alpha.json'), { a: 'leaf' });
      writeJson('untranslated.json', { 'a.b': { 'zh-CN': '子树', 'en-US': 'sub' } });
      writeJson('translations.json', {});

      await new MergeProcessor(config, false).execute();

      expect(readJson(path.join('en-US', 'alpha.json'))).toEqual({ a: 'leaf' });
      expect(readJson(path.join('en-US', 'beta.json'))).toEqual({ a: { b: 'sub' } });
    });
  });

  describe('untranslated.json 形态非法条目告警跳过', () => {
    it('值为 null 的条目 → warn 带 key 名并原样保留', async () => {
      writeJson('untranslated.json', {
        bad: null,
        good: { 'zh-CN': '文案', 'en-US': 'text' },
      });
      writeJson('translations.json', {});
      writeJson('en-US.json', {});

      await new MergeProcessor(makeConfig(), false).execute();

      expect(warnSpy.mock.calls.flat().join('\n')).toMatch(/值不是对象[^\n]*bad/);
      // 正常条目照常合并，非法条目原样留在 untranslated.json（不因跳过而丢用户数据）
      expect(readJson('translations.json')).toEqual({ good: { 'zh-CN': '文案', 'en-US': 'text' } });
      expect(readJson('untranslated.json')).toEqual({ bad: null });
      expect(readJson('en-US.json')).toEqual({ good: 'text' });
    });

    it('[反向] 全部条目形态合法时无告警，合并结果不变', async () => {
      writeJson('untranslated.json', { good: { 'zh-CN': '文案', 'en-US': 'text' } });
      writeJson('translations.json', {});
      writeJson('en-US.json', {});

      await new MergeProcessor(makeConfig(), false).execute();

      expect(warnSpy.mock.calls.flat().join('\n')).not.toMatch(/值不是对象/);
      expect(readJson('translations.json')).toEqual({ good: { 'zh-CN': '文案', 'en-US': 'text' } });
      expect(readJson('untranslated.json')).toEqual({});
    });
  });

  describe('translations.json 形态非法条目告警跳过', () => {
    it('null 条目不抛 TypeError，合法条目照常同步', async () => {
      writeJson('zh-CN.json', { good: '你好' });
      writeJson('untranslated.json', {});
      writeJson('en-US.json', {});
      writeJson('translations.json', {
        bad: null,
        good: { 'zh-CN': '你好', 'en-US': 'Hello' },
      });

      await new MergeProcessor(makeConfig(), false).execute();

      expect(readJson('en-US.json')).toEqual({ good: 'Hello' });
      const warns = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(warns.some((w: string) => w.includes('形态非法') && w.includes('bad'))).toBe(true);
    });
  });
});

describe('MergeProcessor — 合入时占位符失配告警', () => {
  let tmpDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-ph-warn-'));
    warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writeJson(relPath: string, data: unknown): void {
    const full = path.join(tmpDir, 'locale', relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(data, null, 2));
  }

  function readJson(relPath: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(tmpDir, 'locale', relPath), 'utf-8'));
  }

  function makeConfig(): ResolvedConfig {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    return resolveConfig(user);
  }

  it('译文缺占位符 → 仍合入但输出告警（含两侧占位符集）', async () => {
    writeJson('zh-CN.json', { k1: '共{value}件商品' });
    writeJson('en-US.json', {});
    writeJson('translations.json', {});
    writeJson('untranslated.json', {
      k1: { 'zh-CN': '共{value}件商品', 'en-US': 'Items pending' },
    });

    await new MergeProcessor(makeConfig(), false).execute();

    expect(readJson('en-US.json')).toEqual({ k1: 'Items pending' });
    const warns = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(warns).toContain('占位符不匹配');
    expect(warns).toContain('k1');
    expect(warns).toContain('{value}');
  });

  it('占位符一致时不告警', async () => {
    writeJson('zh-CN.json', { k1: '共{value}件商品' });
    writeJson('en-US.json', {});
    writeJson('translations.json', {});
    writeJson('untranslated.json', {
      k1: { 'zh-CN': '共{value}件商品', 'en-US': '{value} items pending' },
    });

    await new MergeProcessor(makeConfig(), false).execute();

    expect(readJson('en-US.json')).toEqual({ k1: '{value} items pending' });
    const warns = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(warns).not.toContain('占位符不匹配');
  });
});
