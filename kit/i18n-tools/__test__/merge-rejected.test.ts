import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MergeProcessor } from '../src/core/MergeProcessor';
import { LoggerUtils } from '../src/utils/logger';
import type { ResolvedConfig } from '../src/config/types';

/**
 * 回归：merge 阶段对「LLM 翻译被 isValidTranslation 拒收」的条目输出 warn，
 * 同步落进 RunReport。修复前：用户只看到"仍需翻译 N 个"，不知 LLM 已翻但被
 * 工具判无效，导致条目永久卡死在 untranslated.json。
 */
describe('MergeProcessor — 拒收翻译的 warn 行为', () => {
  let tmpDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-merge-rejected-'));
    warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    // 静音其他日志层，保持测试输出干净
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeConfig(): ResolvedConfig {
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
    // target locale 不存在也不会阻塞 merge（会创建）
  }

  it('LLM 翻译为纯标点时 warn 并写入 RunReport', async () => {
    setupLocaleDir({
      'pages.foo.exclamation': { 'zh-CN': '吧！', 'en-US': '!' },
    });

    const processor = new MergeProcessor(makeConfig(), false);
    await processor.execute();

    const warns = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(warns.some((m: string) => m.includes('被判无效'))).toBe(true);
    expect(warns.some((m: string) => m.includes('pages.foo.exclamation'))).toBe(true);
    expect(warns.some((m: string) => m.includes('"吧！"'))).toBe(true);
    expect(warns.some((m: string) => m.includes('"!"'))).toBe(true);
    expect(warns.some((m: string) => m.includes('isValidTranslation 拒收'))).toBe(true);
    expect(warns.some((m: string) => m.includes('处理建议'))).toBe(true);

    // 落盘到 .i18n-tools/logs/，存档可回查
    const logsDir = path.join(tmpDir, '.i18n-tools', 'logs');
    expect(fs.existsSync(logsDir)).toBe(true);
    const logFiles = fs.readdirSync(logsDir);
    expect(logFiles.length).toBeGreaterThan(0);
    const reportRaw = fs.readFileSync(path.join(logsDir, logFiles[0]!), 'utf-8');
    expect(reportRaw).toContain('被判无效');
    expect(reportRaw).toContain('pages.foo.exclamation');
  });

  it('en-US 为空 / 缺失（LLM 还没翻）不触发拒收 warn', async () => {
    setupLocaleDir({
      'pages.foo.bar': { 'zh-CN': '你好', 'en-US': '' },
      'pages.foo.baz': { 'zh-CN': '世界', 'en-US': '   ' },
    });

    const processor = new MergeProcessor(makeConfig(), false);
    await processor.execute();

    const warns = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    // 不应包含"被判无效"——空值是正常的 pending 状态，不是拒收
    expect(warns.some((m: string) => m.includes('被判无效'))).toBe(false);
  });

  it('正常 LLM 翻译完成合并到 en-US，不触发 warn', async () => {
    setupLocaleDir({
      'pages.foo.hello': { 'zh-CN': '你好', 'en-US': 'Hello' },
    });

    const processor = new MergeProcessor(makeConfig(), false);
    await processor.execute();

    const warns = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(warns.some((m: string) => m.includes('被判无效'))).toBe(false);

    // 实际 merge 是否成功：en-US.json 该有 Hello
    const enPath = path.join(tmpDir, 'locale', 'en-US.json');
    expect(fs.existsSync(enPath)).toBe(true);
    const en = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
    expect(en['pages.foo.hello']).toBe('Hello');
  });

  it('混合场景：部分合并 + 部分拒收，分别处理', async () => {
    setupLocaleDir({
      'pages.foo.hello': { 'zh-CN': '你好', 'en-US': 'Hello' },
      'pages.foo.exclamation': { 'zh-CN': '吧！', 'en-US': '!' },
      'pages.foo.pending': { 'zh-CN': '待译', 'en-US': '' },
    });

    const processor = new MergeProcessor(makeConfig(), false);
    await processor.execute();

    const warns = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    // 应该只有 exclamation 被列入拒收 warn，不应包含 hello 或 pending
    const rejectedSection = warns.filter(
      (m: string) => m.includes('被判无效') || m.includes('exclamation'),
    );
    expect(rejectedSection.length).toBeGreaterThan(0);
    expect(warns.every((m: string) => !m.includes('pages.foo.hello') || !m.includes('拒收'))).toBe(
      true,
    );
    expect(
      warns.every((m: string) => !m.includes('pages.foo.pending') || !m.includes('拒收')),
    ).toBe(true);

    // merge 行为正常：hello 进 en-US，其它两个留 untranslated
    const en = JSON.parse(fs.readFileSync(path.join(tmpDir, 'locale', 'en-US.json'), 'utf-8'));
    expect(en['pages.foo.hello']).toBe('Hello');
    expect(en['pages.foo.exclamation']).toBeUndefined();

    const remaining = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locale', 'untranslated.json'), 'utf-8'),
    );
    expect(Object.keys(remaining).sort()).toEqual(['pages.foo.exclamation', 'pages.foo.pending']);
  });
});
