import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：resolveSemanticId 优先级 1 的 textToIdMap 缓存只按 normalizeKey(原文) 命中，不含
 * 目录维度。于是同一原文先在目录 A 生成带 A 前缀的 key，随后目录 B 的同原文直接命中缓存返回
 * A 的 key——把 A 模块的 key 种进 B 模块，绕过 pickReusableKey 在 acrossDirectories=false 下
 * 的目录隔离。修复：缓存键在 acrossDirectories=false 时带上目录前缀。
 */
describe('GenerateProcessor 同批跨目录复用隔离', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { sourceDir: srcDir, localesDir: localeDir, format: 'flat', prettify: false },
      keys: { separator: '.', prefix: { strategy: 'path', anchor: 'src' } },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  const write = (rel: string, content: string): void => {
    const abs = path.join(srcDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  };

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-xdir-'));
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

  it('同原文在两个目录 → 各自生成带本目录前缀的 key，不跨目录串号', async () => {
    write('order/A.vue', `<template><div>保存</div></template>\n`);
    write('user/B.vue', `<template><div>保存</div></template>\n`);

    await new GenerateProcessor(buildConfig(), false, false).execute(srcDir, true);

    const zh = JSON.parse(fs.readFileSync(path.join(localeDir, 'zh-CN.json'), 'utf-8')) as Record<
      string,
      string
    >;
    const keysForSave = Object.keys(zh).filter((k) => zh[k] === '保存');
    // 修复前：两文件共用一个 key（order.* 被种到 user 文件）→ 长度 1
    expect(keysForSave).toHaveLength(2);
    // 两个 key 分属不同目录前缀
    expect(keysForSave.some((k) => k.startsWith('order.'))).toBe(true);
    expect(keysForSave.some((k) => k.startsWith('user.'))).toBe(true);
  });
});
