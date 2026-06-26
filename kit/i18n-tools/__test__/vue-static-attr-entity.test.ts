import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：静态属性提取只取 @vue/compiler-dom 解码后的 attr.value.content（&amp; → &），无
 * rawSource 兜底。当属性值含 HTML 实体时，Transformer 用解码后的 original 拼正则去匹配仍含
 * &amp; 的源码 → 失配 → 属性不被替换；但提取阶段已为其生成 key 写入 locale → 源码残留中文
 * 属性 + 孤儿 key。文本节点路径已修（B1），属性路径漏修。
 * 修复：属性路径与文本节点对称——original 用去引号的原始源码，processedMessage 用解码文本。
 */
describe('Vue 静态属性含 HTML 实体的提取/还原对称', () => {
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
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-attr-entity-'));
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

  it('含 &amp; 的静态属性 → 被替换为 $t()，locale 落解码后文本，不残留中文/孤儿', async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, `<template><div title="点击 &amp; 确认">x</div></template>\n`, 'utf-8');

    await new GenerateProcessor(buildConfig(), false, false).execute(file, true);

    const out = fs.readFileSync(file, 'utf-8');
    expect(out).toContain('$t('); // 属性被国际化
    expect(out).not.toContain('点击'); // 源码不再残留中文属性（修复前会残留）

    const zh = JSON.parse(fs.readFileSync(path.join(localeDir, 'zh-CN.json'), 'utf-8')) as Record<
      string,
      string
    >;
    // locale 落解码后的文本（& 而非 &amp;），且不存在「源码未替换却写了 key」的孤儿
    expect(Object.values(zh)).toContain('点击 & 确认');
    expect(Object.values(zh)).not.toContain('点击 &amp; 确认');
  });
});
