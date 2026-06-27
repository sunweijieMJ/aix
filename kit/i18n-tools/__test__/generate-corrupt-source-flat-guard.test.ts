import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归（审查 #1）：generate 非桶式路径缺损坏 source locale 守卫。
 *
 * 旧行为：source locale「有内容却解析失败」时 readLocaleFile 返回 null，阶段 3 的
 * updateLanguageFiles 对 null 静默 return（不写、不抛）。于是源码被改写成 $t() 调用、
 * locale 一个新 key 都没落、且无异常触发回滚、命令仍打印成功——留下「源码已改、locale
 * 未写」的不一致态。桶式与 PickProcessor 早有对称守卫，唯独非桶 generate 没有。
 *
 * 修复：commitToDisk 写源码前对非桶式也做 source locale 完整性预检，命中即抛错中止。
 */
describe('GenerateProcessor 非桶式损坏 source locale 守卫（#1）', () => {
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
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-corrupt-flat-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    // source 单文件损坏（半截写入 / 手改坏）
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), '{ "a.b": "存量文案"', 'utf-8');

    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('source locale 损坏 → 中止 generate，源码与损坏文件均不被改写', async () => {
    const srcFile = path.join(srcDir, 'A.vue');
    const original = `<template><div>提交</div></template>\n`;
    fs.writeFileSync(srcFile, original, 'utf-8');
    const corrupt = path.join(localeDir, 'zh-CN.json');
    const corruptBefore = fs.readFileSync(corrupt, 'utf-8');

    const proc = new GenerateProcessor(buildConfig(), false, false);
    await expect(proc.execute(srcFile, true)).rejects.toThrow(
      /zh-CN.*(损坏|解析失败)|(损坏|解析失败).*zh-CN/,
    );

    // 事务保证：源码未被改写为 $t()，损坏文件原样保留（未静默覆盖 / 未生成 .bak）
    expect(fs.readFileSync(srcFile, 'utf-8')).toBe(original);
    expect(fs.readFileSync(corrupt, 'utf-8')).toBe(corruptBefore);
    expect(fs.existsSync(`${corrupt}.bak`)).toBe(false);
  });
});
