import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LanguageFileManager } from '../src/utils/language-file-manager';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';
import type { ExtractedString } from '../src/utils/types';

/**
 * #8 generate 事务加固：
 *  (a) 写源码前预检 assertSerializableUpdate —— 把 nested 前缀冲突这类确定性错误
 *      前移到「源码尚未改写」时暴露（此前是写完源码、阶段3 才在 serialize 时抛错，
 *      留下源码已改 / locale 未写的不一致态）。
 *  (b) 阶段2 源码原子写 —— 单文件写失败立即停止并回滚已写文件，确保「要么全改、
 *      要么全不改」（此前遇错继续写其余文件且无回滚）。
 */
describe('GenerateProcessor 事务加固（#8）', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const VUE_FILE = `<template><div>提交</div></template>\n`;

  const buildConfig = (root: string, extra: Partial<I18nToolsConfig> = {}): ResolvedConfig =>
    resolveConfig({
      root,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/locale' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: {
        sourceDir: path.join(root, 'src'),
        localesDir: path.join(root, 'locale'),
        format: 'flat',
        prettify: false,
      },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
      ...extra,
    });

  const writeSource = (rel: string, content: string): string => {
    const abs = path.join(srcDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
    return abs;
  };
  const zhPath = (): string => path.join(localeDir, 'zh-CN.json');
  const ext = (semanticId: string): ExtractedString =>
    ({ semanticId }) as unknown as ExtractedString;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-txn-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // ---------- (a) 预检逻辑单测 ----------
  describe('assertSerializableUpdate', () => {
    it('nested：新 key 与现有 key 构成前缀冲突 → 抛错', () => {
      fs.writeFileSync(zhPath(), JSON.stringify({ user: { name: { first: 'x' } } }), 'utf-8');
      const config = buildConfig(rootDir, {
        io: { sourceDir: srcDir, localesDir: localeDir, format: 'nested', prettify: false },
      });
      // 现有 flat key: user.name.first；新增 user.name → user.name 同时是叶子与祖先
      expect(() =>
        LanguageFileManager.assertSerializableUpdate(config, false, [ext('user.name')]),
      ).toThrow(/前缀冲突/);
    });

    it('flat 格式：不做前缀冲突校验 → 不抛错', () => {
      fs.writeFileSync(zhPath(), JSON.stringify({ 'user.name.first': 'x' }), 'utf-8');
      const config = buildConfig(rootDir); // format flat
      expect(() =>
        LanguageFileManager.assertSerializableUpdate(config, false, [ext('user.name')]),
      ).not.toThrow();
    });

    it('nested：无祖先/子树冲突 → 不抛错', () => {
      fs.writeFileSync(zhPath(), JSON.stringify({ a: { b: 'x' } }), 'utf-8');
      const config = buildConfig(rootDir, {
        io: { sourceDir: srcDir, localesDir: localeDir, format: 'nested', prettify: false },
      });
      expect(() =>
        LanguageFileManager.assertSerializableUpdate(config, false, [ext('a.c')]),
      ).not.toThrow();
    });

    it('桶式：冲突键分属不同桶 → 逐桶校验通过（整张校验会误报）', () => {
      const config = buildConfig(rootDir, {
        io: { sourceDir: srcDir, localesDir: localeDir, format: 'nested', prettify: false },
        buckets: {
          rules: [{ name: 'one', matchKey: (k: string) => k === 'user.name' }],
          defaultBucket: 'common',
          layout: 'by-locale',
        },
      });
      // user.name 与 user.name.first 会冲突，但 caller 把它们分到不同桶
      const keyBucketMap = { 'user.name': 'one', 'user.name.first': 'common' };
      expect(() =>
        LanguageFileManager.assertSerializableUpdate(
          config,
          false,
          [ext('user.name'), ext('user.name.first')],
          keyBucketMap,
        ),
      ).not.toThrow();
    });

    it('桶式：message 判据规则按真实 message 反推分桶（不因空串 seed 误报）', () => {
      // 现有 locale（桶式 nested）：user.name 在 x 桶、user.name.first 在 common 桶——
      // 二者本会前缀冲突，但靠 message 判据规则分属不同桶。预检若用空串 seed 反推，
      // 两者都落 common → 误报冲突、错误中止合法 generate。
      fs.mkdirSync(path.join(localeDir, 'zh-CN'), { recursive: true });
      fs.writeFileSync(
        path.join(localeDir, 'zh-CN', 'x.json'),
        JSON.stringify({ user: { name: 'Xval' } }),
        'utf-8',
      );
      fs.writeFileSync(
        path.join(localeDir, 'zh-CN', 'common.json'),
        JSON.stringify({ user: { name: { first: 'Yval' } } }),
        'utf-8',
      );
      const config = buildConfig(rootDir, {
        io: { sourceDir: srcDir, localesDir: localeDir, format: 'nested', prettify: false },
        buckets: {
          rules: [
            {
              name: 'x',
              matchKey: (_k: string, message?: string) =>
                typeof message === 'string' && message.startsWith('X'),
            },
          ],
          defaultBucket: 'common',
          layout: 'by-locale',
        },
      });
      // callerMap 缺省 → 全部走虚拟反推；带一个 benign 新 key 触发非空早退
      expect(() =>
        LanguageFileManager.assertSerializableUpdate(config, false, [ext('zzz.k')]),
      ).not.toThrow();
    });

    it('桶式：冲突键同桶 → 抛错', () => {
      const config = buildConfig(rootDir, {
        io: { sourceDir: srcDir, localesDir: localeDir, format: 'nested', prettify: false },
        buckets: {
          rules: [{ name: 'misc', matchKey: (k: string) => k.startsWith('zzz.') }],
          defaultBucket: 'common',
          layout: 'by-locale',
        },
      });
      const keyBucketMap = { 'user.name': 'common', 'user.name.first': 'common' };
      expect(() =>
        LanguageFileManager.assertSerializableUpdate(
          config,
          false,
          [ext('user.name'), ext('user.name.first')],
          keyBucketMap,
        ),
      ).toThrow(/前缀冲突/);
    });
  });

  // ---------- (a) 相位前移：预检失败 → 源码未改写 ----------
  it('预检失败 → 源码未被改写、语言文件未生成（错误前移到写源码前）', async () => {
    const file = writeSource('A.vue', VUE_FILE);
    vi.spyOn(LanguageFileManager, 'assertSerializableUpdate').mockImplementation(() => {
      throw new Error('嵌套输出存在前缀冲突');
    });

    await expect(
      new GenerateProcessor(buildConfig(rootDir), false, false).execute(file, true),
    ).rejects.toThrow(/前缀冲突/);

    const src = fs.readFileSync(file, 'utf-8');
    expect(src).toContain('提交'); // 仍是原始中文
    expect(src).not.toContain('$t('); // 未被替换
    expect(fs.existsSync(zhPath())).toBe(false); // 语言文件未生成
  });

  // ---------- (b) 阶段2 原子写：写失败 → 已写文件回滚 ----------
  it('多文件写盘：某文件写失败 → 已成功写入的文件回滚至原文（要么全改要么全不改）', async () => {
    const a = writeSource('A.vue', `<template><div>提交</div></template>\n`);
    writeSource('B.vue', `<template><div>取消</div></template>\n`);
    fs.writeFileSync(zhPath(), JSON.stringify({ 'existing.key': '旧值' }), 'utf-8');

    const realWrite = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(((
      p: fs.PathOrFileDescriptor,
      data: any,
      enc?: any,
    ) => {
      if (String(p).endsWith('B.vue')) throw new Error('disk full');
      return realWrite(p as any, data, enc);
    }) as typeof fs.writeFileSync);

    await expect(
      new GenerateProcessor(buildConfig(rootDir), false, false).execute(srcDir, true),
    ).rejects.toThrow();

    // 关键：A.vue 即便先被写入，失败后也已回滚为原始中文，不残留 $t()
    const srcA = fs.readFileSync(a, 'utf-8');
    expect(srcA).toContain('提交');
    expect(srcA).not.toContain('$t(');
    // 语言文件未更新
    expect(JSON.parse(fs.readFileSync(zhPath(), 'utf-8'))).toEqual({ 'existing.key': '旧值' });
  });
});
