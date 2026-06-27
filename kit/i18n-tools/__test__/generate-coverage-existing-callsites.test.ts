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
 * 回归（B4）：覆盖率分子（已国际化调用点）此前只扫描「还含新中文」的文件
 * （Object.keys(fileGroups)）。已 100% 国际化的文件被算进扫描分母却不计其 t()/$t()
 * 调用点 → 覆盖率被系统性低估，会误触 --coverage-threshold CI 卡点。
 * 修复：scanExistingCallsInSources 覆盖全部被扫描文件。
 */
describe('GenerateProcessor 覆盖率 — 已国际化文件的调用点计入分子', () => {
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
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-cov-existing-'));
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

  it('目录中已全部国际化的文件，其 $t 调用点计入 alreadyI18n', async () => {
    // done.vue：无中文、已有一个 $t 调用点（应计入分子）
    fs.writeFileSync(
      path.join(srcDir, 'done.vue'),
      `<template><div>{{ $t('home.title') }}</div></template>\n`,
      'utf-8',
    );
    // new.vue：含一处新中文（本轮新生成）
    fs.writeFileSync(
      path.join(srcDir, 'new.vue'),
      `<template><div>提交</div></template>\n`,
      'utf-8',
    );

    const proc = new GenerateProcessor(buildConfig(), false, false);
    await proc.execute(srcDir, true);

    const cov = proc.getCoverage();
    expect(cov?.newlyGenerated).toBe(1); // 提交
    expect(cov?.alreadyI18n).toBe(1); // done.vue 的 $t('home.title') —— 修复前为 0
    expect(cov?.coverageRate).toBeCloseTo(1); // (1+1)/(1+1+0)
  });
});
