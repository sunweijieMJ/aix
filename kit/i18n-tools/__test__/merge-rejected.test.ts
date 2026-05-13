import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MergeProcessor } from '../src/core/MergeProcessor';
import { LoggerUtils } from '../src/utils/logger';
import type { ResolvedConfig } from '../src/config/types';

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
    rejectedStrategy: 'fallback-to-source' | 'warn-only' = 'fallback-to-source',
  ): ResolvedConfig {
    return {
      rootDir: tmpDir,
      framework: 'vue',
      vue: { library: 'vue-i18n', namespace: '' },
      react: { library: 'react-i18next', namespace: '', includeDefaultMessage: false },
      locale: { source: 'zh-CN', target: 'en-US' },
      paths: {
        locale: path.join(tmpDir, 'locale'),
        source: path.join(tmpDir, 'src'),
        tImport: '@/plugins/locale',
      },
      llm: {
        idGeneration: { apiKey: 'x', model: 'm', timeout: 60000, maxRetries: 2, temperature: 0.1 },
        translation: { apiKey: 'x', model: 'm', timeout: 60000, maxRetries: 2, temperature: 0.1 },
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
      },
      glossary: { override: 'always', normalize: true },
      concurrency: { idGeneration: 5, translation: 3 },
      batchSize: 10,
      batchDelay: 500,
      format: false,
      include: ['**/*.vue'],
      exclude: [],
      extraction: { rejectPatterns: [] },
      output: { format: 'flat' },
      merge: { rejectedStrategy },
    } as ResolvedConfig;
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
