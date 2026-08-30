import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AutomaticProcessor } from '../src/core/AutomaticProcessor';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { PickProcessor } from '../src/core/PickProcessor';
import { TranslateProcessor } from '../src/core/TranslateProcessor';
import { MergeProcessor } from '../src/core/MergeProcessor';
import { ExportProcessor } from '../src/core/ExportProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { CoverageMetric } from '../src/utils/run-report';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * AutomaticProcessor 编排逻辑测试（此前零覆盖）。
 *
 * 只验证 AutomaticProcessor 自身的编排职责，把 5 个子处理器的 execute 全部 stub 成
 * 空操作——子处理器各自有独立测试，这里不重复跑真实流程（也避免 translate 触网）：
 *  - 步骤顺序 generate→pick→translate→merge（→export）
 *  - export 仅在配置了 io.exportDir 时执行（AutomaticProcessor.ts:72）
 *  - 某步骤失败 → 包装成「在 <step> 步骤中断」并携带 cause（:91）
 *  - generate 的覆盖率透传到 automatic 自身 report（:51-52）
 */
describe('AutomaticProcessor 编排', () => {
  let rootDir: string;
  let calls: string[];

  const buildConfig = (root: string, exportDir?: string, apiKey: string = 'x'): ResolvedConfig =>
    resolveConfig({
      root,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/locale' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: {
        sourceDir: path.join(root, 'src'),
        localesDir: path.join(root, 'locale'),
        ...(exportDir ? { exportDir } : {}),
        format: 'flat',
        prettify: false,
      },
      keys: { separator: '.' },
      llm: { shared: { apiKey, model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-proc-'));
    fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'locale'), { recursive: true });
    calls = [];
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});

    vi.spyOn(GenerateProcessor.prototype, 'execute').mockImplementation(async () => {
      calls.push('generate');
    });
    vi.spyOn(PickProcessor.prototype, 'execute').mockImplementation(async () => {
      calls.push('pick');
    });
    vi.spyOn(TranslateProcessor.prototype, 'execute').mockImplementation(async () => {
      calls.push('translate');
    });
    vi.spyOn(MergeProcessor.prototype, 'execute').mockImplementation(async () => {
      calls.push('merge');
    });
    vi.spyOn(ExportProcessor.prototype, 'execute').mockImplementation(async () => {
      calls.push('export');
    });
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('未配置 exportDir：按序跑 generate→pick→translate→merge，跳过 export', async () => {
    await new AutomaticProcessor(buildConfig(rootDir), false).execute('src');
    expect(calls).toEqual(['generate', 'pick', 'translate', 'merge']);
  });

  it('配置 exportDir：export 步骤执行', async () => {
    const cfg = buildConfig(rootDir, path.join(rootDir, 'public', 'locale'));
    await new AutomaticProcessor(cfg, false).execute('src');
    expect(calls).toEqual(['generate', 'pick', 'translate', 'merge', 'export']);
  });

  // 回归（--skip-llm 语义对齐）：该选项自述「不调 LLM API」，此前却只作用于 ID 生成，
  // translate 照跑 → 没配 apiKey 时整条 automatic 硬失败在 translate。
  // 现在 skipLLM=true 直接跳过 translate 步骤，其余步骤照常。
  it('skipLLM=true：跳过 translate 步骤，其余步骤照常（空 apiKey 也能跑完）', async () => {
    await new AutomaticProcessor(buildConfig(rootDir, undefined, ''), false).execute('src', true);

    expect(calls).toEqual(['generate', 'pick', 'merge']);
    expect(LoggerUtils.info).toHaveBeenCalledWith(expect.stringContaining('跳过 translate'));
    expect(LoggerUtils.info).toHaveBeenCalledWith(expect.stringContaining('--skip-llm'));
  });

  it('某步骤失败 → 包装成「在 <step> 步骤中断」并保留 cause', async () => {
    const boom = new Error('merge 原始错误');
    vi.spyOn(MergeProcessor.prototype, 'execute').mockRejectedValue(boom);

    const run = new AutomaticProcessor(buildConfig(rootDir), false).execute('src');
    await expect(run).rejects.toThrow(/merge 步骤中断/);
    // 失败前的步骤已执行，export 未到达
    expect(calls).toEqual(['generate', 'pick', 'translate']);
    // cause 透传原始错误，便于上层定位
    await run.catch((e: unknown) => {
      expect((e as Error).cause).toBe(boom);
    });
  });

  it('generate 覆盖率透传到 automatic 自身 getCoverage()', async () => {
    const metric: CoverageMetric = {
      scannedFiles: 3,
      totalChineseSegments: 10,
      alreadyI18n: 7,
      newlyGenerated: 3,
      skipped: 0,
      coverageRate: 1,
    };
    // 让 generate 步骤把覆盖率写进它自己的 report，再由 automatic 拷贝过来
    vi.spyOn(GenerateProcessor.prototype, 'execute').mockImplementation(async function (this: {
      report: { setCoverage: (m: CoverageMetric) => void };
    }) {
      calls.push('generate');
      this.report.setCoverage(metric);
    });

    const auto = new AutomaticProcessor(buildConfig(rootDir), false);
    await auto.execute('src');
    expect(auto.getCoverage()).toEqual(metric);
  });
});

/**
 * 回归（--skip-llm 语义对齐）：automatic 跳过 translate 后，pick 的词表预填必须照常
 * 生效并被 merge 写回 locale——否则「不调 LLM」会被误解成「这一轮什么都没翻」。
 * 只 stub generate（AST 重活与本用例无关），pick / merge 跑真实实现。
 */
describe('AutomaticProcessor — skipLLM 下词表命中仍写回 locale', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-glossary-'));
    fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'locale'), { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(GenerateProcessor.prototype, 'execute').mockImplementation(async () => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('skipLLM=true：translate 跳过，词表命中的条目仍经 pick→merge 落到目标 locale', async () => {
    fs.writeFileSync(
      path.join(rootDir, 'glossary.json'),
      JSON.stringify({ 保存: 'Save' }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(rootDir, 'locale', 'zh-CN.json'),
      JSON.stringify({ 'btn.save': '保存' }),
      'utf-8',
    );

    const cfg = resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/locale' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: {
        sourceDir: path.join(rootDir, 'src'),
        localesDir: path.join(rootDir, 'locale'),
        format: 'flat',
        prettify: false,
      },
      keys: { separator: '.' },
      glossary: { file: 'glossary.json' },
      // 空 apiKey：skipLLM 下整条流程都不该碰 LLM
      llm: { shared: { apiKey: '', model: 'm' } },
    } satisfies I18nToolsConfig);

    await expect(new AutomaticProcessor(cfg, false).execute('src', true)).resolves.toBeUndefined();

    const en = JSON.parse(fs.readFileSync(path.join(rootDir, 'locale', 'en-US.json'), 'utf-8'));
    expect(en['btn.save']).toBe('Save');
  });
});
