import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：含占位符的模板串跨运行不幂等。
 *
 * 复用查找（resolveSemanticId）用的是「原文 ${var} 形态」，而 locale 落盘 / loadFromLocaleFile
 * 反查表用的是「{var} 占位符形态」（createMessageWithOptions 转换后）。两者对不上，导致 locale
 * 已有相同占位符条目时仍判为「未命中」→ 新建一个 _N 后缀 key：旧 key（带译文）变孤儿，源码改指
 * 向无译文的新 key。纯文本字符串不受影响（原文 == locale 值）。
 *
 * 修复：复用查找键须与 locale 落盘值采用同一 canonical 形态。
 */
describe('GenerateProcessor 占位符串跨运行幂等', () => {
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

  const readZh = (): Record<string, string> =>
    JSON.parse(fs.readFileSync(path.join(localeDir, 'zh-CN.json'), 'utf-8')) as Record<
      string,
      string
    >;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-ph-reuse-'));
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

  it('locale 已有占位符条目时，源码相同占位符串应复用既有 key，不新建 _N', async () => {
    // 预置 locale：模拟上一次 generate 已落盘的占位符条目（{name} 形态）
    fs.writeFileSync(
      path.join(localeDir, 'zh-CN.json'),
      JSON.stringify({ 'demo.existing': '{name}不能为空' }, null, 2),
      'utf-8',
    );

    // 新源码里含相同的「裸中文占位符串」（${name} 形态）
    write(
      'demo/A.vue',
      `<template><div>x</div></template>\n` +
        `<script setup lang="ts">\n` +
        `const name = 'x';\n` +
        `const msg = \`\${name}不能为空\`;\n` +
        `void msg;\n` +
        `</script>\n`,
    );

    await new GenerateProcessor(buildConfig(), false, false).execute(srcDir, true);

    const zh = readZh();
    const keysForValue = Object.keys(zh).filter((k) => zh[k] === '{name}不能为空');
    // 修复前：新建 demo.t_xxxx，与 demo.existing 并存 → 长度 2（旧 key 成孤儿）
    expect(keysForValue).toEqual(['demo.existing']);

    // 源码应引用既有 key，而非新建 key
    const src = fs.readFileSync(path.join(srcDir, 'demo/A.vue'), 'utf-8');
    expect(src).toContain("'demo.existing'");
  });
});
