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
 * 回归（审计二轮 #1）：空提取分支（extractedStrings.length === 0）此前以
 * reuseResolver=null 调用 recordAndRenderCoverage，于是 alreadyI18n 恒为 0。
 * 当文件「已全量国际化（满是 $t 调用）+ 仅剩比较运算符跳过项」时，skipped>0、
 * alreadyI18n=0 → coverageRate=(0+0)/skipped=0，把一个其实 100% 国际化的文件
 * 误报成 0% 覆盖率，稳态 CI 跑 --coverage-threshold 会被持续误判为失败（exit 2）。
 * 修复：空提取分支也扫描已有 t()/$t() 调用点，让 alreadyI18n 反映真实已国际化量。
 */
describe('GenerateProcessor 覆盖率 — 空提取分支仍计入已国际化调用点（审计 #1）', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  // 无可提取中文：{{ $t('home.title') }} 已国际化 + status === '进行中' 比较运算符跳过项
  const VUE_FILE =
    `<template><div>{{ $t('home.title') }}</div></template>\n` +
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
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-cov-empty-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    CommonASTUtils.drainSkippedComparisonOperands();
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('单文件空提取：已有 $t 调用计入 alreadyI18n，coverageRate 不被比较运算符拉到 0', async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, VUE_FILE, 'utf-8');

    const proc = new GenerateProcessor(buildConfig(), false, false);
    await proc.execute(file, true); // skipLLM=true

    const cov = proc.getCoverage();
    expect(cov?.newlyGenerated).toBe(0); // 无新中文可提取
    expect(cov?.skipped).toBe(1); // 进行中（比较运算符跳过）
    expect(cov?.alreadyI18n).toBe(1); // $t('home.title') —— 修复前为 0
    expect(cov?.coverageRate).toBeCloseTo(0.5); // (1+0)/(1+0+1)，修复前被算成 0
  });

  it('目录空提取：同样把已有调用点计入分子', async () => {
    fs.writeFileSync(path.join(srcDir, 'B.vue'), VUE_FILE, 'utf-8');

    const proc = new GenerateProcessor(buildConfig(), false, false);
    await proc.execute(srcDir, true);

    const cov = proc.getCoverage();
    expect(cov?.newlyGenerated).toBe(0);
    expect(cov?.skipped).toBe(1);
    expect(cov?.alreadyI18n).toBe(1);
    expect(cov?.coverageRate).toBeCloseTo(0.5);
  });
});
