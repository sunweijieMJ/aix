import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LLMClient } from '../src/utils/llm-client';
import { LoggerUtils } from '../src/utils/logger';
import { CommonASTUtils } from '../src/utils/common-ast-utils';
import { RunReport, type ManualCategory } from '../src/utils/run-report';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * generate 杂项单点回归合集（场景以 describe 分组）。
 */

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

/**
 * 回归：apply（落盘）路径下，applyTransformations 先于 recordAndRenderCoverage 执行，
 * 而前者链路里健康度 lint（LocaleValueLinter.analyze）已把
 * CommonASTUtils.drainSkippedComparisonOperands() 这个进程级 collector drain 空。
 * 于是 recordAndRenderCoverage 拿到空数组：
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

/**
 * 回归 #3：LLM 返回的 id 数量与文本数不匹配时（最常见 LLM 故障：丢/多一条），
 * 旧逻辑仅打印「将使用本地ID生成进行回退」却仍 strings.forEach 按位取 ids[index]——
 * 导致错位的有效 id 被当语义 ID 写成 key，「回退」承诺并未兑现。
 *
 * 期望（忠实回退）：长度不匹配时整文件强制走本地 ID 回退，LLM 返回的错位 id 不得出现在任何 key 中。
 */
describe('GenerateProcessor：LLM id 数量不匹配时整文件本地回退（回归 #3）', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const buildConfig = (root: string): ResolvedConfig =>
    resolveConfig({
      root,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/locale' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: {
        sourceDir: path.join(root, 'src'),
        localesDir: path.join(root, 'locale'),
        format: 'flat',
        prettify: false,
      },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-llm-mismatch-'));
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

  it('LLM 返回的 id 比文本少一条 → 错位 id 不写入任何 key，全部本地回退', async () => {
    // 两个文本节点 → 2 条待生成 ID；LLM 只返回 1 条 → 长度不匹配
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(
      file,
      `<template>\n  <div>提交</div>\n  <div>取消</div>\n</template>\n`,
      'utf-8',
    );

    vi.spyOn(LLMClient.prototype, 'generateSemanticIdsForFiles').mockImplementation(
      async (groups: Record<string, string[]>) => {
        const out: Record<string, string[]> = {};
        for (const fp of Object.keys(groups)) out[fp] = ['wrongllmid']; // 长度=1，强制不匹配
        return out;
      },
    );

    const proc = new GenerateProcessor(buildConfig(rootDir), false, false);
    await proc.execute(file, false); // skipLLM=false → 走 LLM 路径

    const zh = JSON.parse(fs.readFileSync(path.join(localeDir, 'zh-CN.json'), 'utf-8')) as Record<
      string,
      string
    >;

    // 两条原文都已落地（提取/写入正常）
    expect(Object.values(zh)).toContain('提交');
    expect(Object.values(zh)).toContain('取消');
    // 关键：LLM 返回的错位 id 不得污染任何 key（长度不匹配 → 整文件本地回退）
    expect(Object.keys(zh).some((k) => k.includes('wrongllmid'))).toBe(false);
  });
});

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

/**
 * 回归（B1）：transformToMemory 把 filePath 规范化后传给 transformer，而 transformer 用
 * `s.filePath === filePath` 严格比较；ExtractedString.filePath 原样透传用户输入路径。
 * 单文件模式下若输入路径含 `./`（或 Windows 反斜杠），规范化后两者不等 → 命中 0 条、
 * 源码原样返回，却仍写了 locale —— 静默的「源码改了 locale，源码却没改」不一致。
 * 修复：transformer 两侧都 path.normalize 后再比较。
 */
describe('GenerateProcessor 单文件 — 规范化路径不一致不致源码漏改', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const VUE_FILE = `<template><div>提交</div></template>\n`;

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
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-pathnorm-'));
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

  it('输入路径含冗余 `.` 段时源码仍被改写（修复前源码原样、仅 locale 被写）', async () => {
    const realFile = path.join(srcDir, 'A.vue');
    fs.writeFileSync(realFile, VUE_FILE, 'utf-8');

    // 构造一个 path.normalize 会改变的等价路径（跨平台：插入冗余的 `.` 段）
    const weirdPath = srcDir + path.sep + '.' + path.sep + 'A.vue';
    expect(path.normalize(weirdPath)).not.toBe(weirdPath);

    const proc = new GenerateProcessor(buildConfig(), false, false);
    await proc.execute(weirdPath, true);

    const transformed = fs.readFileSync(realFile, 'utf-8');
    expect(transformed).toContain('$t(');
    expect(transformed).not.toContain('>提交<');
  });
});

describe('GenerateProcessor.cleanForLLM — 剥列表序号但不吞小数', () => {
  // private static，运行时可经类对象访问
  const clean = (s: string): string =>
    (GenerateProcessor as unknown as { cleanForLLM(t: string): string }).cleanForLLM(s);

  it('剥离前导列表序号（既有行为不回归）', () => {
    expect(clean('9. 消息提示')).toBe('消息提示');
    expect(clean('10、消息提示')).toBe('消息提示');
    expect(clean('3) 确认')).toBe('确认');
    expect(clean('  2.  设置')).toBe('设置');
  });

  it('不吞以小数开头的文案（回归：3.14元 → 14元）', () => {
    expect(clean('3.14元')).toBe('3.14元');
    expect(clean('3.14 元')).toBe('3.14 元');
    expect(clean('1.5倍速')).toBe('1.5倍速');
  });
});
