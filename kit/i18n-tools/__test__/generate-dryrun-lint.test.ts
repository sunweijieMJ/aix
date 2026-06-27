import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { CommonASTUtils } from '../src/utils/common-ast-utils';
import { RunReport, type ManualCategory } from '../src/utils/run-report';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：generate --dry-run 评审路径必须与 commit 路径一样跑 LocaleValueLinter。
 *
 * Why: dry-run 只走 writePlan、不进 commitToDisk，而健康度 lint（LocaleValueLinter
 * analyze + emit）原本只在 commitToDisk → updateLanguageFiles 里被调用。于是 dry-run
 * 产出的 plan/RunReport 缺失
 * 所有 lint 类发现（nested-interpolation-chinese / html-tag-in-value / semantic-duplicate…），
 * reviewer 看 plan 决策是否 apply 时看不到这些告警，要等真正 apply 后才暴露——与
 * GenerateProcessor.writePlan 注释「lint 应该在 dry-run 阶段就跑完」的设计意图相悖。
 *
 * 典型受影响项是「插值表达式内嵌套中文」：`${cond ? '内部错误' : '网络异常'}` 整段被
 * 占位符化，中文分支作为运行时参数泄漏未翻译原文。commit 路径会报，dry-run 路径漏报。
 */
describe('GenerateProcessor dry-run — 评审阶段就跑 lint（nested-interpolation-chinese 不漏报）', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  // 一处可提取文本（提交）+ 一处插值嵌套中文（三元分支会被占位符吞掉并记诊断）
  const VUE_FILE =
    `<template><div>提交</div></template>\n` +
    `<script setup lang="ts">\n` +
    `const ok = false;\n` +
    `const handle = () => {\n` +
    `  emit('error', \`操作失败：\${ok ? '内部错误' : '网络异常'}\`);\n` +
    `};\n` +
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
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-dryrun-lint-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    // 清掉跨测试可能残留的进程级 collector（drain 是消耗性操作）
    CommonASTUtils.drainSkippedNestedChinese();
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

  it('dry-run 把 nested-interpolation-chinese 记入 RunReport（与 commit 路径对称）', async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, VUE_FILE, 'utf-8');

    const manualSpy = vi.spyOn(RunReport.prototype, 'addManualEntry');

    const proc = new GenerateProcessor(buildConfig(), false, false);
    await proc.execute(file, true, { dryRun: true }); // skipLLM=true 走本地 ID

    const categories = manualSpy.mock.calls.map(
      (c) => (c[0] as { category: ManualCategory }).category,
    );
    expect(categories).toContain('nested-interpolation-chinese');

    // dry-run 不得改动源文件
    expect(fs.readFileSync(file, 'utf-8')).toBe(VUE_FILE);
  });

  it('dry-run 与 commit 上报的 nested 条数一致（评审≈落盘，无信息差）', async () => {
    const file = path.join(srcDir, 'B.vue');
    fs.writeFileSync(file, VUE_FILE, 'utf-8');

    const countNested = (spy: ReturnType<typeof vi.spyOn>): number =>
      spy.mock.calls.filter(
        (c: unknown[]) =>
          (c[0] as { category: ManualCategory }).category === 'nested-interpolation-chinese',
      ).length;

    // dry-run
    const drySpy = vi.spyOn(RunReport.prototype, 'addManualEntry');
    await new GenerateProcessor(buildConfig(), false, false).execute(file, true, { dryRun: true });
    const dryCount = countNested(drySpy);
    drySpy.mockRestore();

    // commit（重置源文件，避免被 dry-run？dry-run 不改源码，但稳妥起见重写）
    fs.writeFileSync(file, VUE_FILE, 'utf-8');
    CommonASTUtils.drainSkippedNestedChinese();
    CommonASTUtils.drainSkippedComparisonOperands();
    const commitSpy = vi.spyOn(RunReport.prototype, 'addManualEntry');
    await new GenerateProcessor(buildConfig(), false, false).execute(file, true);
    const commitCount = countNested(commitSpy);

    expect(dryCount).toBe(commitCount);
    expect(dryCount).toBe(2); // '内部错误' + '网络异常'
  });
});
