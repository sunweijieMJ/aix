import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { VueAdapter } from '../src/adapters/VueAdapter';
import { InteractiveUtils } from '../src/utils/interactive-utils';
import { LanguageFileManager } from '../src/utils/language-file-manager';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * GenerateProcessor 编排层测试（此前零覆盖：无任何测试实例化 GenerateProcessor）。
 *
 * 聚焦 README 重点承诺、却只在「策略层」被间接验证的数据完整性契约：
 *  - 事务式写入：transform 阶段失败 → 源码与语言文件均不变更（GenerateProcessor.ts:435）
 *  - dry-run：不碰任何源码 / 语言文件，只产出 plan（:524）
 *  - apply-plan：happy path 回放 + 三道拒绝守卫（指纹 / 框架 / custom，:702-719）
 *  - 覆盖率指标：recordAndRenderCoverage 计数与 getCoverage 透出（:780）
 *
 * 全程 skipLLM=true，走本地 ID 生成，不触网；interactive=false 跳过确认提示。
 */
describe('GenerateProcessor 编排层', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;
  let planRoot: string;

  const VUE_FILE = `<template><div>提交</div></template>\n`;

  const buildConfig = (root: string, extra: Partial<I18nToolsConfig> = {}): ResolvedConfig =>
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
      ...extra,
    });

  const writeSource = (rel: string, content: string): string => {
    const abs = path.join(srcDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
    return abs;
  };
  const zhPath = (): string => path.join(localeDir, 'zh-CN.json');
  const readZh = (): Record<string, string> => JSON.parse(fs.readFileSync(zhPath(), 'utf-8'));

  /** 跑一次 dry-run，返回生成的 plan.json 绝对路径 */
  const makePlan = async (config: ResolvedConfig, file: string): Promise<string> => {
    await new GenerateProcessor(config, false, false).execute(file, true, {
      dryRun: true,
      planOutputDir: planRoot,
    });
    const dir = fs.readdirSync(planRoot).find((d) => d.startsWith('generate-'));
    expect(dir).toBeTruthy();
    return path.join(planRoot, dir!, 'plan.json');
  };

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-proc-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    planRoot = path.join(rootDir, 'plans');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    fs.mkdirSync(planRoot, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('commit happy path：源码被替换为 $t()，源语言文件写入原文，覆盖率透出', async () => {
    const file = writeSource('A.vue', VUE_FILE);
    const proc = new GenerateProcessor(buildConfig(rootDir), false, false);
    await proc.execute(file, true);

    const out = fs.readFileSync(file, 'utf-8');
    expect(out).toMatch(/\$t\(/); // 已国际化
    expect(out).not.toContain('>提交<'); // 原始文本节点已被替换
    expect(Object.values(readZh())).toContain('提交'); // locale 落原文

    const cov = proc.getCoverage();
    expect(cov?.newlyGenerated).toBe(1);
    expect(cov?.skipped).toBe(0);
    expect(cov?.coverageRate).toBe(1);
  });

  it('仅含需人工处理的 HTML 中文模板时覆盖率不是 100%', async () => {
    const file = writeSource(
      'Html.vue',
      '<script setup>\nconst html = `<div><span>提示</span></div>`;\n</script>\n',
    );
    const proc = new GenerateProcessor(buildConfig(rootDir), false, false);

    await proc.execute(file, true);

    expect(proc.getCoverage()).toMatchObject({
      totalChineseSegments: 1,
      newlyGenerated: 0,
      skipped: 1,
      coverageRate: 0,
    });
  });

  it('覆盖率待人工数量与落盘报告明细严格一致', async () => {
    const file = writeSource(
      'ManualReport.vue',
      '<script setup>\nconst html = `<div><span>提示</span></div>`;\n</script>\n',
    );
    const proc = new GenerateProcessor(buildConfig(rootDir), false, false);

    await proc.execute(file, true);

    const logsDir = path.join(rootDir, '.i18n-tools', 'logs');
    const reportName = fs.readdirSync(logsDir).find((name) => name.endsWith('.json'));
    expect(reportName).toBeTruthy();
    const report = JSON.parse(fs.readFileSync(path.join(logsDir, reportName!), 'utf-8'));
    expect(report.needsManual).toHaveLength(proc.getCoverage()!.skipped);
    expect(report.summary.needsManual).toBe(proc.getCoverage()!.skipped);
  });

  it('覆盖率摘要不把 locale 健康度发现混入 skipped 待人工数量', async () => {
    const file = writeSource(
      'CoverageManual.vue',
      "<script setup>\nconst label = '提交';\nconst html = `<div>提示</div>`;\n</script>\n",
    );
    fs.writeFileSync(zhPath(), JSON.stringify({ existingHtml: '<b>已有提示</b>' }), 'utf-8');
    const proc = new GenerateProcessor(buildConfig(rootDir), false, false);

    await proc.execute(file, true);

    expect(proc.getCoverage()?.skipped).toBe(1);
    expect(LoggerUtils.warn).toHaveBeenCalledWith(expect.stringContaining('覆盖率待人工 1 条'));
  });

  it('同一行的两个 HTML 中文模板分别计入人工跳过覆盖率', async () => {
    const file = writeSource(
      'TwoHtml.vue',
      '<script setup>\nconst a = `<div>提示一</div>`; const b = `<span>提示二</span>`;\n</script>\n',
    );
    const proc = new GenerateProcessor(buildConfig(rootDir), false, false);

    await proc.execute(file, true);

    expect(proc.getCoverage()).toMatchObject({
      totalChineseSegments: 2,
      newlyGenerated: 0,
      skipped: 2,
      coverageRate: 0,
    });
  });

  it('模板插值分支中的嵌套中文计入人工跳过覆盖率', async () => {
    const file = writeSource(
      'Nested.vue',
      "<script setup>\nconst ok = true;\nconst msg = `操作失败：${ok ? '内部错误' : '网络异常'}`;\n</script>\n",
    );
    const proc = new GenerateProcessor(buildConfig(rootDir), false, false);

    await proc.execute(file, true);

    expect(proc.getCoverage()).toMatchObject({
      totalChineseSegments: 3,
      newlyGenerated: 1,
      skipped: 2,
    });
    expect(proc.getCoverage()?.coverageRate).toBeCloseTo(1 / 3);
  });

  it('重复 generate 后嵌套中文仍计入待人工，覆盖率口径保持不变', async () => {
    const file = writeSource(
      'NestedRerun.vue',
      "<script setup>\nconst ok = true;\nconst msg = `操作失败：${ok ? '内部错误' : '网络异常'}`;\n</script>\n",
    );
    const first = new GenerateProcessor(buildConfig(rootDir), false, false);
    await first.execute(file, true);

    const second = new GenerateProcessor(buildConfig(rootDir), false, false);
    await second.execute(file, true);

    expect(second.getCoverage()).toMatchObject({
      totalChineseSegments: first.getCoverage()!.totalChineseSegments,
      alreadyI18n: 1,
      newlyGenerated: 0,
      skipped: first.getCoverage()!.skipped,
      coverageRate: first.getCoverage()!.coverageRate,
    });
  });

  it('同一模板中内容相同的两个嵌套中文调用点分别计数', async () => {
    const file = writeSource(
      'DuplicateNested.vue',
      "<script setup>\nconst ok = true;\nconst msg = `操作失败：${ok ? '错误' : '错误'}`;\n</script>\n",
    );
    const proc = new GenerateProcessor(buildConfig(rootDir), false, false);

    await proc.execute(file, true);

    expect(proc.getCoverage()).toMatchObject({
      totalChineseSegments: 3,
      newlyGenerated: 1,
      skipped: 2,
    });
  });

  it('skipLLM=true 时无需 apiKey，仍可完成本地 ID 生成', async () => {
    const file = writeSource('NoKey.vue', VUE_FILE);
    const config = buildConfig(rootDir, {
      llm: { shared: { apiKey: '', model: 'm' } },
    });

    await new GenerateProcessor(config, false, false).execute(file, true);

    expect(fs.readFileSync(file, 'utf-8')).toMatch(/\$t\(/);
    expect(Object.values(readZh())).toContain('提交');
  });

  it('显式目标路径不存在时抛错，避免命令以成功状态结束', async () => {
    const missingPath = path.join(rootDir, 'src', 'Missing.vue');

    await expect(
      new GenerateProcessor(buildConfig(rootDir), false, false).execute(missingPath, true),
    ).rejects.toThrow(/路径不存在|不存在/);
  });

  it('阶段3 语言文件写入失败 → 已落盘的多个源文件全部回滚（覆盖 rollbackWritten）', async () => {
    // 此前「事务回滚」测试 mock transform 抛错，发生在写盘之前（written 为空），
    // 回滚循环从未被真正执行。这里 mock updateLanguageFiles 在源码已写盘后（阶段3）抛错，
    // 真正驱动 written[] 的逐文件回滚——作为 rollbackWritten 抽取重构的特征护栏。
    writeSource('A.vue', `<template><div>提交</div></template>\n`);
    writeSource('B.vue', `<template><div>取消</div></template>\n`);
    vi.spyOn(LanguageFileManager.prototype, 'updateLanguageFiles').mockImplementation(() => {
      throw new Error('disk boom');
    });

    const proc = new GenerateProcessor(buildConfig(rootDir), false, false);
    await expect(proc.execute(srcDir, true)).rejects.toThrow(/语言文件写入阶段失败/);

    // 两个源文件都已回滚到原始中文，且不含 $t()
    const a = fs.readFileSync(path.join(srcDir, 'A.vue'), 'utf-8');
    const b = fs.readFileSync(path.join(srcDir, 'B.vue'), 'utf-8');
    expect(a).toContain('提交');
    expect(a).not.toContain('$t(');
    expect(b).toContain('取消');
    expect(b).not.toContain('$t(');
  });

  it('事务回滚：transform 阶段抛错 → 抛出且源码与语言文件均不变更', async () => {
    const file = writeSource('A.vue', VUE_FILE);
    // 预置一份既有源语言文件，验证失败后它原封不动
    fs.writeFileSync(zhPath(), JSON.stringify({ 'existing.key': '旧值' }), 'utf-8');

    const adapter = new VueAdapter('@/locale', 'vue-i18n');
    vi.spyOn(adapter.getTransformer(), 'transform').mockImplementation(() => {
      throw new Error('AST boom');
    });
    const proc = new GenerateProcessor(buildConfig(rootDir), false, false, adapter);

    await expect(proc.execute(file, true)).rejects.toThrow();

    // 语言文件未被触碰（事务"准备阶段"失败，updateLanguageFiles 从未执行）
    expect(readZh()).toEqual({ 'existing.key': '旧值' });
    // 源码未被改写（仍是原始中文，没有 $t()）
    const src = fs.readFileSync(file, 'utf-8');
    expect(src).toContain('提交');
    expect(src).not.toContain('$t(');
  });

  it('dry-run：不改任何源码 / 语言文件，只产出 plan', async () => {
    const file = writeSource('A.vue', VUE_FILE);
    const planJson = await makePlan(buildConfig(rootDir), file);

    // 源码与语言文件零变更
    expect(fs.readFileSync(file, 'utf-8')).toBe(VUE_FILE);
    expect(fs.existsSync(zhPath())).toBe(false);

    // plan 落盘且 localeDelta 含原文
    expect(fs.existsSync(planJson)).toBe(true);
    const plan = JSON.parse(fs.readFileSync(planJson, 'utf-8'));
    expect(plan.framework).toBe('vue');
    expect(Object.values(plan.localeDelta)).toContain('提交');
  });

  it('dry-run plan 的 newKeys 只统计 locale 中尚不存在的 key', async () => {
    const file = writeSource('ExistingPlan.vue', VUE_FILE);
    const firstPlanJson = await makePlan(buildConfig(rootDir), file);
    const firstPlan = JSON.parse(fs.readFileSync(firstPlanJson, 'utf-8'));
    fs.writeFileSync(zhPath(), JSON.stringify(firstPlan.localeDelta), 'utf-8');
    fs.rmSync(planRoot, { recursive: true, force: true });
    fs.mkdirSync(planRoot, { recursive: true });

    const secondPlanJson = await makePlan(buildConfig(rootDir), file);
    const secondPlan = JSON.parse(fs.readFileSync(secondPlanJson, 'utf-8'));

    expect(secondPlan.summary.newKeys).toBe(0);
    expect(Object.keys(secondPlan.localeDelta)).toHaveLength(1);
  });

  it('dry-run 遇到损坏的 source locale 时拒绝生成不可回放 plan', async () => {
    const file = writeSource('CorruptLocale.vue', VUE_FILE);
    fs.writeFileSync(zhPath(), '{ broken json', 'utf-8');

    await expect(
      new GenerateProcessor(buildConfig(rootDir), false, false).execute(file, true, {
        dryRun: true,
        planOutputDir: planRoot,
      }),
    ).rejects.toThrow(/语言文件损坏/);

    expect(fs.readdirSync(planRoot).some((name) => name.startsWith('generate-'))).toBe(false);
  });

  it('apply-plan happy path：回放 plan → 源码替换 + 语言文件写入（不触 LLM/AST）', async () => {
    const file = writeSource('A.vue', VUE_FILE);
    const planJson = await makePlan(buildConfig(rootDir), file);
    // dry-run 未改源码
    expect(fs.readFileSync(file, 'utf-8')).toBe(VUE_FILE);

    await new GenerateProcessor(buildConfig(rootDir), false, false).applyFromPlan(planJson);

    expect(fs.readFileSync(file, 'utf-8')).toMatch(/\$t\(/);
    expect(Object.values(readZh())).toContain('提交');
  });

  it('apply-plan 按实际 locale 差集报告新增 key 数', async () => {
    const file = writeSource('ExistingLocale.vue', VUE_FILE);
    const planJson = await makePlan(buildConfig(rootDir), file);
    const plan = JSON.parse(fs.readFileSync(planJson, 'utf-8'));
    // 模拟 dry-run 后由其他分支/流程先写入了 plan 中的全部 key。
    fs.writeFileSync(zhPath(), JSON.stringify(plan.localeDelta), 'utf-8');

    await new GenerateProcessor(buildConfig(rootDir), false, false).applyFromPlan(planJson);

    expect(LoggerUtils.success).toHaveBeenCalledWith(
      expect.stringContaining('Plan 回放完成：1 个文件、0 个新 key'),
    );
  });

  it('apply-plan 指纹守卫：plan 生成后源文件被改 → 拒绝 apply，不覆盖改动', async () => {
    const file = writeSource('A.vue', VUE_FILE);
    const planJson = await makePlan(buildConfig(rootDir), file);

    // 外部修改源文件（plan 之后）
    const edited = VUE_FILE + '<!-- manual edit -->\n';
    fs.writeFileSync(file, edited, 'utf-8');

    await expect(
      new GenerateProcessor(buildConfig(rootDir), false, false).applyFromPlan(planJson),
    ).rejects.toThrow(/指纹/);

    // 关键：用户的手动改动原样保留，未被 plan 的旧 transform 结果静默覆盖
    const after = fs.readFileSync(file, 'utf-8');
    expect(after).toContain('manual edit');
    expect(after).not.toContain('$t(');
  });

  it('apply-plan 框架守卫：plan(vue) 用 react 配置 apply → 拒绝', async () => {
    const file = writeSource('A.vue', VUE_FILE);
    const planJson = await makePlan(buildConfig(rootDir), file);

    const reactCfg = buildConfig(rootDir, {
      framework: { type: 'react', library: 'react-i18next', tImport: '@/locale' },
    });
    await expect(
      new GenerateProcessor(reactCfg, false, false).applyFromPlan(planJson),
    ).rejects.toThrow(/框架/);
  });

  it('apply-plan custom 守卫：plan(main) 用 --custom apply → 拒绝', async () => {
    const file = writeSource('A.vue', VUE_FILE);
    const planJson = await makePlan(buildConfig(rootDir), file);

    const customCfg = buildConfig(rootDir, {
      io: {
        sourceDir: path.join(rootDir, 'src'),
        localesDir: path.join(rootDir, 'locale'),
        customDir: path.join(rootDir, 'custom'),
        format: 'flat',
        prettify: false,
      },
    });
    await expect(
      new GenerateProcessor(customCfg, true, false).applyFromPlan(planJson),
    ).rejects.toThrow(/配置不一致/);
  });

  it('apply-plan 根目录守卫：plan.root 与当前 config.root 不一致时拒绝', async () => {
    const file = writeSource('A.vue', VUE_FILE);
    const planJson = await makePlan(buildConfig(rootDir), file);
    const otherRoot = path.join(rootDir, 'other-project');
    fs.mkdirSync(path.join(otherRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(otherRoot, 'locale'), { recursive: true });

    await expect(
      new GenerateProcessor(buildConfig(otherRoot), false, false).applyFromPlan(planJson, {
        keepPlan: true,
      }),
    ).rejects.toThrow(/根目录/);

    expect(fs.readFileSync(file, 'utf-8')).toBe(VUE_FILE);
  });

  /**
   * localeDelta 漂移守卫（审计 P2）：指纹只盖源码文件，dry-run 与 apply 之间若有人改了
   * 将被 delta 覆盖的 key 值，apply 会静默把旧值写回去。plan 新增 localeBaseline 快照
   * （只记「将被覆盖的既有 key」），apply 时比对当前 locale。
   */
  describe('apply-plan locale 漂移守卫', () => {
    /** 产一份「localeDelta 会覆盖既有 key」的 plan，返回 plan.json 路径与该 key */
    const makePlanOverExistingKey = async (
      file: string,
    ): Promise<{ planJson: string; key: string }> => {
      // 首轮 dry-run 只为拿到本轮生成的 key（本地 ID 生成确定性）
      const first = await makePlan(buildConfig(rootDir), file);
      const key = Object.keys(JSON.parse(fs.readFileSync(first, 'utf-8')).localeDelta)[0]!;
      fs.rmSync(planRoot, { recursive: true, force: true });
      fs.mkdirSync(planRoot, { recursive: true });
      // 模拟「该 key 已由别的分支写进 locale」——第二轮 plan 的 localeBaseline 会记下它
      fs.writeFileSync(zhPath(), JSON.stringify({ [key]: '提交' }), 'utf-8');
      return { planJson: await makePlan(buildConfig(rootDir), file), key };
    };

    it('plan 记录 localeBaseline：只含将被覆盖的既有 key，新 key 不记', async () => {
      const file = writeSource('Baseline.vue', VUE_FILE);
      const { planJson, key } = await makePlanOverExistingKey(file);

      const plan = JSON.parse(fs.readFileSync(planJson, 'utf-8'));
      expect(plan.localeBaseline).toEqual({ [key]: '提交' });
      expect(plan.summary.newKeys).toBe(0);
    });

    it('新 key 不进 localeBaseline（控制体积）', async () => {
      const file = writeSource('NewKeyOnly.vue', VUE_FILE);
      const planJson = await makePlan(buildConfig(rootDir), file);

      expect(JSON.parse(fs.readFileSync(planJson, 'utf-8')).localeBaseline).toEqual({});
    });

    it('值漂移 + 非交互 → 拒绝 apply，源码与 locale 均不变', async () => {
      const file = writeSource('Drift.vue', VUE_FILE);
      const { planJson, key } = await makePlanOverExistingKey(file);
      // dry-run 之后有人改了该 key 的文案
      fs.writeFileSync(zhPath(), JSON.stringify({ [key]: '提交订单' }), 'utf-8');

      await expect(
        new GenerateProcessor(buildConfig(rootDir), false, false).applyFromPlan(planJson, {
          keepPlan: true,
        }),
      ).rejects.toThrow(/拒绝 apply/);

      expect(fs.readFileSync(file, 'utf-8')).toBe(VUE_FILE);
      expect(readZh()).toEqual({ [key]: '提交订单' });
    });

    it('key 被删除同样算漂移 → 拒绝 apply', async () => {
      const file = writeSource('DriftDeleted.vue', VUE_FILE);
      const { planJson } = await makePlanOverExistingKey(file);
      fs.writeFileSync(zhPath(), JSON.stringify({}), 'utf-8');

      await expect(
        new GenerateProcessor(buildConfig(rootDir), false, false).applyFromPlan(planJson, {
          keepPlan: true,
        }),
      ).rejects.toThrow(/拒绝 apply/);
      expect(fs.readFileSync(file, 'utf-8')).toBe(VUE_FILE);
    });

    it('无漂移 → 正常 apply', async () => {
      const file = writeSource('NoDrift.vue', VUE_FILE);
      const { planJson, key } = await makePlanOverExistingKey(file);

      await new GenerateProcessor(buildConfig(rootDir), false, false).applyFromPlan(planJson);

      expect(fs.readFileSync(file, 'utf-8')).toMatch(/\$t\(/);
      expect(readZh()[key]).toBe('提交');
    });

    it('旧 plan 无 localeBaseline → 跳过检查照常 apply（向后兼容）', async () => {
      const file = writeSource('LegacyPlan.vue', VUE_FILE);
      const { planJson, key } = await makePlanOverExistingKey(file);
      const plan = JSON.parse(fs.readFileSync(planJson, 'utf-8'));
      delete plan.localeBaseline;
      fs.writeFileSync(planJson, JSON.stringify(plan), 'utf-8');
      // 即便此时 locale 已漂移，旧 plan 也只提示、不拦
      fs.writeFileSync(zhPath(), JSON.stringify({ [key]: '提交订单' }), 'utf-8');

      await new GenerateProcessor(buildConfig(rootDir), false, false).applyFromPlan(planJson);

      expect(fs.readFileSync(file, 'utf-8')).toMatch(/\$t\(/);
      expect(readZh()[key]).toBe('提交');
      expect(LoggerUtils.info).toHaveBeenCalledWith(
        expect.stringContaining('跳过 locale 漂移检查'),
      );
    });

    it('交互模式：确认后继续覆盖', async () => {
      const file = writeSource('DriftConfirm.vue', VUE_FILE);
      const { planJson, key } = await makePlanOverExistingKey(file);
      fs.writeFileSync(zhPath(), JSON.stringify({ [key]: '提交订单' }), 'utf-8');
      vi.spyOn(InteractiveUtils, 'promptForGenericConfirmation').mockResolvedValue(true);

      await new GenerateProcessor(buildConfig(rootDir), false, true).applyFromPlan(planJson);

      expect(readZh()[key]).toBe('提交');
      expect(fs.readFileSync(file, 'utf-8')).toMatch(/\$t\(/);
    });

    /**
     * 回归（四轮审计 A2）：baseline 只快照「dry-run 当时已存在的 key」，dry-run 之后才被
     * 别人新建的同名 key 不在 baseline 里，只比对 baseline 会让 apply 静默覆盖它。
     */
    it('dry-run 后才出现的同名 key（不在 baseline）值不同 → 同样算漂移并拒绝 apply', async () => {
      const file = writeSource('DriftNewKey.vue', VUE_FILE);
      const planJson = await makePlan(buildConfig(rootDir), file);
      const plan = JSON.parse(fs.readFileSync(planJson, 'utf-8'));
      const key = Object.keys(plan.localeDelta)[0]!;
      expect(plan.localeBaseline).toEqual({}); // 生成 plan 时该 key 尚不存在
      // dry-run 之后别的分支用不同文案建了同一个 key
      fs.writeFileSync(zhPath(), JSON.stringify({ [key]: '提交订单（已改文案）' }), 'utf-8');

      await expect(
        new GenerateProcessor(buildConfig(rootDir), false, false).applyFromPlan(planJson, {
          keepPlan: true,
        }),
      ).rejects.toThrow(/拒绝 apply/);

      expect(fs.readFileSync(file, 'utf-8')).toBe(VUE_FILE);
      expect(readZh()).toEqual({ [key]: '提交订单（已改文案）' });
    });

    it('dry-run 后出现的同名 key 值与 plan 一致 → 不算漂移，正常 apply', async () => {
      const file = writeSource('SameValueNewKey.vue', VUE_FILE);
      const planJson = await makePlan(buildConfig(rootDir), file);
      const plan = JSON.parse(fs.readFileSync(planJson, 'utf-8'));
      const key = Object.keys(plan.localeDelta)[0]!;
      fs.writeFileSync(zhPath(), JSON.stringify({ [key]: plan.localeDelta[key] }), 'utf-8');

      await new GenerateProcessor(buildConfig(rootDir), false, false).applyFromPlan(planJson);

      expect(fs.readFileSync(file, 'utf-8')).toMatch(/\$t\(/);
    });

    it('交互模式：选否 → 取消，零改动且收尾不打成功', async () => {
      const file = writeSource('DriftCancel.vue', VUE_FILE);
      const { planJson, key } = await makePlanOverExistingKey(file);
      fs.writeFileSync(zhPath(), JSON.stringify({ [key]: '提交订单' }), 'utf-8');
      vi.spyOn(InteractiveUtils, 'promptForGenericConfirmation').mockResolvedValue(false);
      // 只看本次 apply 的收尾日志：上面两轮 dry-run 也会打「代码生成完成」
      vi.clearAllMocks();

      await new GenerateProcessor(buildConfig(rootDir), false, true).applyFromPlan(planJson);

      expect(fs.readFileSync(file, 'utf-8')).toBe(VUE_FILE);
      expect(readZh()).toEqual({ [key]: '提交订单' });
      // plan 目录保留，供用户重新决策
      expect(fs.existsSync(planJson)).toBe(true);
      expect(LoggerUtils.success).not.toHaveBeenCalledWith(expect.stringContaining('代码生成完成'));
      expect(LoggerUtils.warn).toHaveBeenCalledWith(expect.stringContaining('已取消'));
    });
  });

  /**
   * 取消分支必须置 cancelled 位（FileProcessor 契约）：否则 executeWithLifecycle
   * 收尾照打「✅ 代码生成完成」，取消的运行被人与 CI 误判为已改写源码。
   */
  describe('交互取消收尾', () => {
    it('目录模式「是否继续分析这些文件？」选否 → 打已取消、零改动', async () => {
      const file = writeSource('CancelDir.vue', VUE_FILE);
      vi.spyOn(InteractiveUtils, 'promptForGenericConfirmation').mockResolvedValue(false);

      await new GenerateProcessor(buildConfig(rootDir), false, true).execute(srcDir, true);

      expect(fs.readFileSync(file, 'utf-8')).toBe(VUE_FILE);
      expect(fs.existsSync(zhPath())).toBe(false);
      expect(LoggerUtils.success).not.toHaveBeenCalledWith(expect.stringContaining('代码生成完成'));
      expect(LoggerUtils.warn).toHaveBeenCalledWith(expect.stringContaining('代码生成已取消'));
    });

    it('「是否应用这些转换？」选否 → 打已取消、零改动', async () => {
      const file = writeSource('CancelApply.vue', VUE_FILE);
      vi.spyOn(InteractiveUtils, 'promptForGenericConfirmation').mockResolvedValue(false);

      await new GenerateProcessor(buildConfig(rootDir), false, true).execute(file, true);

      expect(fs.readFileSync(file, 'utf-8')).toBe(VUE_FILE);
      expect(fs.existsSync(zhPath())).toBe(false);
      expect(LoggerUtils.success).not.toHaveBeenCalledWith(expect.stringContaining('代码生成完成'));
      expect(LoggerUtils.warn).toHaveBeenCalledWith(expect.stringContaining('代码生成已取消'));
    });
  });

  it('覆盖率：源码已存在 $t() 调用点计入 alreadyI18n', async () => {
    // 同文件含一处既有 $t('x.y') + 一处新中文，coverage 应分别计入两侧
    const file = writeSource(
      'B.vue',
      `<template>\n  <div>{{ $t('x.y') }}</div>\n  <div>提交</div>\n</template>\n`,
    );
    const proc = new GenerateProcessor(buildConfig(rootDir), false, false);
    await proc.execute(file, true);

    const cov = proc.getCoverage();
    expect(cov?.alreadyI18n).toBe(1);
    expect(cov?.newlyGenerated).toBe(1);
  });

  it('多文件事务：一个文件 transform 失败 → 其余文件源码与所有语言文件均不落盘', async () => {
    const a = writeSource('A.vue', `<template><div>提交</div></template>\n`);
    const b = writeSource('B.vue', `<template><div>取消</div></template>\n`);
    fs.writeFileSync(zhPath(), JSON.stringify({ 'existing.key': '旧值' }), 'utf-8');

    // transform 对 B.vue 抛错、A.vue 正常——验证"全有或全无"：A 成功也不得落盘
    const adapter = new VueAdapter('@/locale', 'vue-i18n');
    vi.spyOn(adapter.getTransformer(), 'transform').mockImplementation((fp, _strings, src) => {
      if (fp.includes('B.vue')) throw new Error('AST boom on B');
      return src ?? '';
    });
    const proc = new GenerateProcessor(buildConfig(rootDir), false, false, adapter);

    await expect(proc.execute(srcDir, true)).rejects.toThrow();

    expect(fs.readFileSync(a, 'utf-8')).toContain('提交');
    expect(fs.readFileSync(a, 'utf-8')).not.toContain('$t(');
    expect(fs.readFileSync(b, 'utf-8')).toContain('取消');
    expect(readZh()).toEqual({ 'existing.key': '旧值' });
  });

  it('写盘失败守卫：写源码阶段(阶段2)失败 → 抛出且语言文件不更新', async () => {
    const file = writeSource('A.vue', VUE_FILE);
    fs.writeFileSync(zhPath(), JSON.stringify({ 'existing.key': '旧值' }), 'utf-8');

    // 让写 .vue 源码抛错（磁盘满之类）；其余写入（失败报告 flush）静默放过
    vi.spyOn(fs, 'writeFileSync').mockImplementation((p) => {
      if (String(p).endsWith('.vue')) throw new Error('disk full');
    });

    await expect(
      new GenerateProcessor(buildConfig(rootDir), false, false).execute(file, true),
    ).rejects.toThrow();

    // 阶段 2 失败 → updateLanguageFiles（阶段 3）从未执行，语言文件保持原状
    expect(readZh()).toEqual({ 'existing.key': '旧值' });
  });
});
