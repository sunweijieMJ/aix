import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DoctorProcessor } from '../src/core/DoctorProcessor';
import { LoggerUtils } from '../src/utils/logger';
import type { ResolvedConfig } from '../src/config';

/**
 * DoctorProcessor 集成测试。
 *
 * 用真实 fs 而不是 mock：doctor 的核心价值就是扫文件系统做对账，
 * 用 mock 验证不了它实际能否正确识别 missing/orphan/untranslated。
 */
const buildConfig = (rootDir: string, sourceDir: string, localeDir: string): ResolvedConfig => ({
  rootDir,
  framework: 'vue',
  vue: { library: 'vue-i18n', namespace: '' },
  react: { library: 'react-i18next', namespace: '', includeDefaultMessage: false },
  locale: { source: 'zh-CN', target: 'en-US' },
  paths: { locale: localeDir, source: sourceDir, tImport: '@/locale' },
  llm: {
    idGeneration: {
      apiKey: 'x',
      model: 'm',
      baseURL: undefined,
      timeout: 0,
      maxRetries: 0,
      temperature: 0,
    },
    translation: {
      apiKey: 'x',
      model: 'm',
      baseURL: undefined,
      timeout: 0,
      maxRetries: 0,
      temperature: 0,
    },
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
  concurrency: { idGeneration: 1, translation: 1 },
  batchSize: 10,
  batchDelay: 0,
  format: false,
  include: [],
  exclude: [],
  extraction: { rejectPatterns: [] },
  output: { format: 'flat' },
  merge: { rejectedStrategy: 'fallback-to-source' },
});

describe('DoctorProcessor', () => {
  let rootDir: string;
  let sourceDir: string;
  let localeDir: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let successSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-test-'));
    sourceDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });

    infoSpy = vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    // 屏蔽 warn / error / success 输出避免污染测试报告；不需要断言
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    successSpy = vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const writeSourceFile = (rel: string, content: string): void => {
    const abs = path.join(sourceDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  const writeLocale = (locale: string, data: Record<string, string>): void => {
    fs.writeFileSync(path.join(localeDir, `${locale}.json`), JSON.stringify(data));
  };
  const collectMessages = (spy: ReturnType<typeof vi.spyOn>): string =>
    spy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');

  it('完全干净：source 与 target 完整对齐 → 检查通过', async () => {
    writeSourceFile('Login.vue', `<template><div>{{ t('greeting') }}</div></template>`);
    writeLocale('zh-CN', { greeting: '你好' });
    writeLocale('en-US', { greeting: 'Hello' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    const successMessages = collectMessages(successSpy);
    expect(successMessages).toContain('Doctor 检查通过');
  });

  it('missing-key：源码 t() 引用了不存在的 key', async () => {
    writeSourceFile('Foo.vue', `<template><span>{{ t('not.exist') }}</span></template>`);
    writeLocale('zh-CN', { greeting: '你好' });
    writeLocale('en-US', { greeting: 'Hello' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    const all = collectMessages(infoSpy);
    expect(all).toContain('[missing-key]');
    expect(all).toContain('not.exist');
  });

  it('orphan-key：locale 中的 key 源码无引用', async () => {
    writeSourceFile('Bar.vue', `<template><div>{{ t('greeting') }}</div></template>`);
    writeLocale('zh-CN', { greeting: '你好', unused: '没人用' });
    writeLocale('en-US', { greeting: 'Hello', unused: 'Nobody uses' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    const all = collectMessages(infoSpy);
    expect(all).toContain('[orphan-key]');
    expect(all).toContain('unused');
  });

  it('untranslated：target value 与 source value 完全相同（含中文）', async () => {
    writeSourceFile('Z.vue', `<template>{{ t('a') }}{{ t('b') }}</template>`);
    writeLocale('zh-CN', { a: '完成', b: 'TCP/IP' });
    // a 漏译（中文 = 中文），b 不算（无中文）
    writeLocale('en-US', { a: '完成', b: 'TCP/IP' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    const all = collectMessages(infoSpy);
    expect(all).toContain('[untranslated]');
    expect(all).toContain('a (en-US 与 zh-CN 完全相同)');
    // b 不应报：源 value 无中文，符合 "纯英文/符号不参与判定" 设计
    expect(all).not.toContain('b (en-US 与 zh-CN 完全相同)');
  });

  it('注释中的 t() 调用不计入引用（不报 missing-key）', async () => {
    // 行注释、块注释、HTML 注释中的 t('xxx') 都属于"被注释掉的示例代码"，
    // 不应被当成真实引用。否则会引发 missing-key false-positive。
    writeSourceFile(
      'Commented.js',
      [
        `// const a = t('comment.line');`,
        `/* const b = t('comment.block'); */`,
        `const c = t('greeting');`,
      ].join('\n'),
    );
    writeSourceFile(
      'CommentedTpl.vue',
      [
        `<template>`,
        `  <!-- {{ t('comment.html') }} -->`,
        `  <div>{{ t('greeting') }}</div>`,
        `</template>`,
      ].join('\n'),
    );
    writeLocale('zh-CN', { greeting: '你好' });
    writeLocale('en-US', { greeting: 'Hello' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    const all = collectMessages(infoSpy);
    expect(all).not.toContain('comment.line');
    expect(all).not.toContain('comment.block');
    expect(all).not.toContain('comment.html');
    expect(all).not.toContain('[missing-key]');
  });

  it('CI 模式 + missing-key 存在 → 抛错', async () => {
    writeSourceFile('Q.vue', `<template>{{ t('absent') }}</template>`);
    writeLocale('zh-CN', {});
    writeLocale('en-US', {});

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      ci: true,
    });
    await expect(proc.execute()).rejects.toThrow(/Doctor CI check failed/);
  });

  it('CI 模式 + 仅 warning 级问题 → 不抛错（仅 error 才阻塞 CI）', async () => {
    writeSourceFile('R.vue', `<template>{{ t('greeting') }}</template>`);
    writeLocale('zh-CN', { greeting: '你好', orphan: '没人用' });
    writeLocale('en-US', { greeting: 'Hello', orphan: 'unused' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      ci: true,
    });
    // orphan-key 仅 warning，CI 模式应正常通过
    await expect(proc.execute()).resolves.toBeUndefined();
    // 确认 warn 级问题被识别
    const all = collectMessages(infoSpy);
    expect(all).toContain('[orphan-key]');
  });
});
