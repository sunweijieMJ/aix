import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { CommonASTUtils } from '../src/utils/common-ast-utils';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：apply（落盘）路径下，applyTransformations 先于 recordAndRenderCoverage 执行，
 * 而前者链路里 LocaleValueLinter.lint 已把 CommonASTUtils.drainSkippedComparisonOperands()
 * 这个进程级 collector drain 空。于是 recordAndRenderCoverage 拿到空数组：
 *   - coverage.skipped 恒为 0；
 *   - total 分母缺 skipped → coverageRate 被系统性高估（CI --coverage-threshold 被架空）；
 *   - comparison-operand 待人工条目全部丢失。
 * 修复：generate 在写盘前把跳过项 drain 进实例快照，coverage 与 linter 共享同一份。
 */
describe('GenerateProcessor 覆盖率 — 比较运算符跳过项不被 linter 提前 drain', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  // 一处可提取文本（提交）+ 一处比较运算符里的中文（进行中，会被主动跳过并记账）
  const VUE_FILE =
    `<template><div>提交</div></template>\n` +
    `<script setup lang="ts">\n` +
    `const status = 'x';\n` +
    `const active = status === '进行中';\n` +
    `</script>\n`;

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
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-cov-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    CommonASTUtils.drainSkippedComparisonOperands(); // 清掉跨测试可能的残留
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('apply 路径下 coverage.skipped 计入比较运算符跳过项，coverageRate 不被高估', async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, VUE_FILE, 'utf-8');

    const proc = new GenerateProcessor(buildConfig(), false, false);
    await proc.execute(file, true); // skipLLM=true 走本地 ID

    const cov = proc.getCoverage();
    expect(cov?.newlyGenerated).toBe(1); // 提交
    expect(cov?.skipped).toBe(1); // 进行中（比较运算符跳过）—— 修复前恒为 0
    expect(cov?.coverageRate).toBeCloseTo(0.5); // 1/(1+1)，修复前被高估为 1.0
  });
});
