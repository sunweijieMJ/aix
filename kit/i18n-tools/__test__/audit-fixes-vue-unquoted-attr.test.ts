import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归（审计 Vue/low）：HTML/Vue 合法允许无引号属性值（`<el-button title=确认>`）。
 * @vue/compiler-dom 照常提取并写入 locale，但旧 buildStaticAttrPattern 强制引号无法匹配 →
 * 转换阶段静默漏替换 → 孤儿 key + 源码残留中文。修复：正则兼容无引号分支。
 */
describe('Vue 无引号静态属性值的提取/替换对称（审计 Vue）', () => {
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
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-unquoted-attr-'));
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

  it('无引号属性 title=确认 → 被替换为 :title="$t()"，不残留中文/孤儿', async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, `<template><el-button title=确认>x</el-button></template>\n`, 'utf-8');

    await new GenerateProcessor(buildConfig(), false, false).execute(file, true);

    const out = fs.readFileSync(file, 'utf-8');
    // 属性被国际化为动态绑定
    expect(out).toContain('$t(');
    expect(out).toContain(':title=');
    // 无引号中文不再残留
    expect(out).not.toContain('title=确认');

    // 生成的 key 在 locale 中存在（非孤儿）：locale value 应含「确认」
    const localeRaw = fs.readFileSync(path.join(localeDir, 'zh-CN.json'), 'utf-8');
    expect(localeRaw).toContain('确认');
  });
});
