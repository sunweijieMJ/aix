import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { ResolvedConfig } from '../src/config';

/**
 * 回归（critical）：apply-plan 不得二次 finalize 已定稿的 locale 值。
 *
 * 根因（修复前）：writePlan 阶段 plan.localeDelta 已是 finalizeLocaleMessage 跑完的最终值
 * （如 vue-i18n 占位符 `共 {count} 个`、字面量花括号 `包含{'{'}大括号{'}'}的文本`）。
 * apply 阶段把它们包成不带 isTemplateString/templateVariables 的 syntheticString，
 * commitToDisk → updateLanguageFiles 又用空 placeholderMap 重新 finalize，把真占位符 {x}
 * 当字面量二次转义（单花括号库写成 {'{'}x{'}'}，字面量花括号双重转义）。
 * 结果：apply 落盘 ≠ dry-run 预览 ≠ 直接 commit，运行时插值全失效。
 *
 * 修复：commitToDisk(preFinalizedLocale=true) → updateLanguageFiles(preFinalized) 原样写入。
 * 不变式：apply-plan 写出的 source locale 必须逐字节等于直接 commit 写出的。
 */
describe('apply-plan finalize 幂等（不二次转义占位符 / 字面量花括号）', () => {
  let dirs: string[] = [];

  beforeEach(() => {
    dirs = [];
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const setup = (source: string): { root: string; file: string; config: ResolvedConfig } => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-finalize-'));
    dirs.push(root);
    const srcDir = path.join(root, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(path.join(root, 'locale'), { recursive: true });
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, source, 'utf-8');
    const config = resolveConfig({
      root,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/locale' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: {
        sourceDir: srcDir,
        localesDir: path.join(root, 'locale'),
        format: 'flat',
        prettify: false,
      },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    });
    return { root, file, config };
  };

  const readZh = (root: string): Record<string, string> =>
    JSON.parse(fs.readFileSync(path.join(root, 'locale', 'zh-CN.json'), 'utf-8'));

  /** 直接 commit，返回写出的 source locale。 */
  const runCommit = async (source: string): Promise<Record<string, string>> => {
    const { root, file, config } = setup(source);
    await new GenerateProcessor(config, false, false).execute(file, true);
    return readZh(root);
  };

  /** dry-run → apply-plan，返回写出的 source locale。 */
  const runApplyPlan = async (source: string): Promise<Record<string, string>> => {
    const { root, file, config } = setup(source);
    const planRoot = path.join(root, 'plans');
    fs.mkdirSync(planRoot, { recursive: true });
    await new GenerateProcessor(config, false, false).execute(file, true, {
      dryRun: true,
      planOutputDir: planRoot,
    });
    const planDir = fs.readdirSync(planRoot).find((d) => d.startsWith('generate-'));
    expect(planDir, 'dry-run 应产出 plan 目录').toBeTruthy();
    const planJson = path.join(planRoot, planDir!, 'plan.json');
    await new GenerateProcessor(config, false, false).applyFromPlan(planJson);
    return readZh(root);
  };

  it('字面量花括号文本：apply-plan 与 commit 写出完全一致，且不双重转义', async () => {
    const source = `<template><div>包含{大括号}的文本</div></template>\n`;
    const commit = await runCommit(source);
    const apply = await runApplyPlan(source);

    // 自验：确实走到了花括号转义路径（否则测不到 bug）
    const commitVal = Object.values(commit)[0]!;
    expect(commitVal, 'commit 值应已转义字面量花括号').toBe("包含{'{'}大括号{'}'}的文本");

    // 核心不变式：apply == commit
    expect(apply).toEqual(commit);
    // 决不能二次转义（修复前会变成 {'{'}'{'{'}'{'}'}... 的乱码）
    expect(Object.values(apply)[0]).not.toMatch(/\{'\{'\}'\{/);
  });

  it('占位符插值：apply-plan 保留 {count}，不被当字面量转义', async () => {
    const source =
      `<template><div>{{ \`共 \${count} 个\` }}</div></template>\n` +
      `<script setup>\nconst count = 1;\n</script>\n`;
    const commit = await runCommit(source);
    const apply = await runApplyPlan(source);

    // 自验：commit 产出了带 {count} 占位符的值
    const commitVal = Object.values(commit).find((v) => v.includes('count'));
    expect(commitVal, `commit 应产出含 count 占位符的值，实际：${JSON.stringify(commit)}`).toMatch(
      /\{count\}/,
    );

    // apply == commit，且占位符未被转义成 {'{'}count{'}'}
    expect(apply).toEqual(commit);
    expect(Object.values(apply).find((v) => v.includes('count'))).not.toContain("{'{'}");
  });

  it('纯文本（无花括号）：apply 与 commit 一致（控制组）', async () => {
    const source = `<template><div>提交</div></template>\n`;
    const commit = await runCommit(source);
    const apply = await runApplyPlan(source);
    expect(Object.values(commit)).toContain('提交');
    expect(apply).toEqual(commit);
  });
});
