import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { VueAdapter } from '../src/adapters/VueAdapter';
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

  it('apply-plan happy path：回放 plan → 源码替换 + 语言文件写入（不触 LLM/AST）', async () => {
    const file = writeSource('A.vue', VUE_FILE);
    const planJson = await makePlan(buildConfig(rootDir), file);
    // dry-run 未改源码
    expect(fs.readFileSync(file, 'utf-8')).toBe(VUE_FILE);

    await new GenerateProcessor(buildConfig(rootDir), false, false).applyFromPlan(planJson);

    expect(fs.readFileSync(file, 'utf-8')).toMatch(/\$t\(/);
    expect(Object.values(readZh())).toContain('提交');
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
