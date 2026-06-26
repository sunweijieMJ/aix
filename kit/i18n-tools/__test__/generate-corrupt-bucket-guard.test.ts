import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：generate 桶式路径缺损坏文件守卫。updateLanguageFiles 桶式分支走
 * readBucketedLocaleWithBucketMap（不传 onCorrupt → safeLoadJsonFile silent），
 * 损坏 bucket 被静默当 {}，重写时存量 key 凭空消失（连 .bak 都没有）；而单文件分支
 * 有 `if (read === null) return` 守卫。Merge/Pick/Prune 都用 findCorruptBucketFile
 * 「损坏即中止」，唯独 generate 没有。
 * 修复：commitToDisk 写源码前先做桶式损坏守卫，命中即抛错中止，源码与 locale 均不动。
 */
describe('GenerateProcessor 桶式损坏守卫', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { sourceDir: srcDir, localesDir: localeDir, format: 'flat', prettify: false },
      keys: { separator: '.' },
      buckets: {
        rules: [{ name: 'misc', matchKey: (k: string) => k.startsWith('zzz.') }],
        defaultBucket: 'common',
        emitManifest: false,
        layout: 'by-locale',
      },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-corrupt-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    // source locale 的 common 桶损坏（半截写入 / 手改坏）
    fs.mkdirSync(path.join(localeDir, 'zh-CN'), { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh-CN', 'common.json'), '{ "a.b": "存量文案"', 'utf-8');

    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('source 桶损坏 → 中止 generate，源码与损坏桶均不被改写', async () => {
    const srcFile = path.join(srcDir, 'A.vue');
    const original = `<template><div>提交</div></template>\n`;
    fs.writeFileSync(srcFile, original, 'utf-8');
    const corrupt = path.join(localeDir, 'zh-CN', 'common.json');
    const corruptBefore = fs.readFileSync(corrupt, 'utf-8');

    const proc = new GenerateProcessor(buildConfig(), false, false);
    await expect(proc.execute(srcFile, true)).rejects.toThrow(
      /zh-CN.*(损坏|解析失败)|(损坏|解析失败).*zh-CN/,
    );

    // 事务保证：源码未被改写为 $t()，损坏桶原样保留（未静默覆盖 / 未生成 .bak）
    expect(fs.readFileSync(srcFile, 'utf-8')).toBe(original);
    expect(fs.readFileSync(corrupt, 'utf-8')).toBe(corruptBefore);
    expect(fs.existsSync(`${corrupt}.bak`)).toBe(false);
  });
});
