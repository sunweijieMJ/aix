/**
 * 核心编排器 - 视觉测试系统的调度中心
 *
 * 整合所有核心模块，按顺序执行完整的视觉测试流程：
 * 1. 解析测试目标
 * 2. 准备基准图（并发控制）
 * 3. 截取实际页面截图
 * 4. 像素比对
 * 5. LLM 智能分析（成本控制）
 * 6. 生成报告
 */

import path from 'node:path';
import pLimit from 'p-limit';

import { logger } from '../utils/logger';
import { ensureDir, pathExists, copyFile } from '../utils/file';
import type { VisualTestConfig, VisualTestUserConfig } from './config/schema';
import type { CompareResult } from '../types/comparison';
import type { AnalyzeResult, FixSuggestion } from '../types/llm';
import { loadConfig, loadConfigFromFile, validateConfig } from './config';

// Core modules
import {
  createBaselineProvider,
  type BaselineProvider,
  type BaselineResult,
  type BaselineSource,
} from './baseline';
import { PlaywrightScreenshotEngine } from './screenshot/playwright-engine';
import { PixelComparisonEngine } from './comparison/pixel-engine';
import { LLMAnalyzer } from './llm';
import {
  JsonReporter,
  HtmlReporter,
  ConclusionReporter,
  type TestResult,
} from './report';
import { DevServer } from './server/dev-server';

const log = logger.child('Orchestrator');

/**
 * 单个测试任务（内部使用，解析 target+variant 后的扁平结构）
 */
interface TestTask {
  target: string;
  targetType: 'component' | 'page' | 'element';
  variant: string;
  url: string;
  baseline: string | { type: string; source: string; fileKey?: string };
  selector?: string;
  waitFor?: string;
  threshold?: number;
  viewport?: { width: number; height: number };
  browser?: 'chromium' | 'firefox' | 'webkit';
}

/**
 * runTests 运行选项
 */
interface RunOptions {
  /** 首次运行或接受变更：基准图不存在时截图并保存为基准图 */
  update?: boolean;
}

/**
 * 测试运行的时序数据
 */
interface Timing {
  baseline: number;
  screenshot: number;
  comparison: number;
  analysis?: number;
  total: number;
}

export class VisualTestOrchestrator {
  private config: VisualTestConfig;
  private baselineProvider: BaselineProvider;
  private screenshotEngine: PlaywrightScreenshotEngine;
  private comparisonEngine: PixelComparisonEngine;
  private llmAnalyzer: LLMAnalyzer;
  private devServer: DevServer | null = null;
  private cleanupDone = false;

  constructor(config: VisualTestConfig) {
    this.config = config;
    this.baselineProvider = createBaselineProvider(config);
    this.screenshotEngine = new PlaywrightScreenshotEngine(config);
    this.comparisonEngine = new PixelComparisonEngine();
    this.llmAnalyzer = new LLMAnalyzer(config.llm, {
      cacheDir: path.join(config.directories.baselines, '..', 'cache'),
    });
  }

  /**
   * 静态工厂方法 - 从配置文件路径或配置对象创建实例
   *
   * @example
   * ```ts
   * const tester = await VisualTestOrchestrator.create();                   // 自动搜索配置
   * const tester = await VisualTestOrchestrator.create('./config.ts');      // 指定配置文件
   * const tester = await VisualTestOrchestrator.create({ targets: [...] }); // 传入配置对象
   * ```
   */
  static async create(
    configOrPath?: string | VisualTestUserConfig,
  ): Promise<VisualTestOrchestrator> {
    let config: VisualTestConfig;

    if (typeof configOrPath === 'string') {
      config = await loadConfigFromFile(configOrPath);
    } else if (configOrPath && typeof configOrPath === 'object') {
      config = validateConfig(configOrPath);
    } else {
      config = await loadConfig();
    }

    return new VisualTestOrchestrator(config);
  }

  /**
   * 运行视觉测试
   *
   * @param targetNames - 可选，指定运行的目标名称。不传则运行所有。
   * @returns 测试结果数组
   */
  async runTests(
    targetNames?: string[],
    options?: RunOptions,
  ): Promise<TestResult[]> {
    const totalStart = Date.now();

    log.info('Starting visual tests...');
    this.cleanupDone = false;

    // 注册信号处理器，设置标志让 finally 块处理退出
    let signalReceived = false;
    const signalHandler = () => {
      log.warn('Received termination signal, will exit after cleanup...');
      signalReceived = true;
    };
    process.on('SIGINT', signalHandler);
    process.on('SIGTERM', signalHandler);

    const results: TestResult[] = [];

    try {
      // 1. 启动开发服务器（如果配置了 autoStart）
      if (this.config.server.autoStart) {
        this.devServer = new DevServer(this.config.server);
        await this.devServer.start();
      }

      // 1.5 Storybook 自动发现（使用局部变量，避免修改 this.config）
      let allTargets = this.config.targets;
      if (this.config.storybook.enabled) {
        const { discoverStories } = await import('./storybook');
        const discoveredTargets = await discoverStories(this.config);
        log.info(`Discovered ${discoveredTargets.length} Storybook target(s)`);
        allTargets = [...discoveredTargets, ...allTargets];
      }

      // 2. 解析测试目标
      const tasks = this.resolveTargets(targetNames, allTargets);
      if (tasks.length === 0) {
        log.warn('No test targets found');
        return [];
      }
      log.info(`Resolved ${tasks.length} test task(s)`);

      // 3. 确保输出目录存在
      await this.ensureOutputDirs();

      // 4. 初始化截图引擎
      await this.screenshotEngine.initialize();

      // 5. 重置 LLM 分析器（每次 run 重新计数）
      this.llmAnalyzer.reset();

      const concurrency = this.config.performance.concurrent.maxTargets;
      const limit = pLimit(concurrency);

      // 6. 并发执行每个测试任务
      const taskPromises = tasks.map((task) =>
        limit(() => this.runSingleTest(task, options)),
      );
      const settledResults = await Promise.allSettled(taskPromises);

      for (let i = 0; i < settledResults.length; i++) {
        const settled = settledResults[i]!;
        const task = tasks[i]!;
        if (settled.status === 'fulfilled') {
          results.push(settled.value);
        } else {
          log.error(
            `Unexpected error in task ${task.target}/${task.variant}`,
            settled.reason,
          );
          results.push(this.createErrorResult(task, settled.reason));
        }
      }

      // 7. 生成报告
      await this.generateReports(results);
    } finally {
      // 8. 清理资源（分别 try-catch，确保每一步都执行）
      await this.cleanup();

      // 9. 停止开发服务器
      if (this.devServer) {
        try {
          await this.devServer.stop();
        } catch (error) {
          log.warn('Failed to stop dev server', error);
        }
        this.devServer = null;
      }

      // 10. 移除信号处理器（无论前面哪步失败都确保移除）
      process.removeListener('SIGINT', signalHandler);
      process.removeListener('SIGTERM', signalHandler);

      // 11. 如果收到了终止信号，在清理完成后退出
      if (signalReceived) {
        process.exit(1);
      }
    }

    const elapsed = Date.now() - totalStart;
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    log.info(
      `Visual tests completed in ${(elapsed / 1000).toFixed(1)}s: ${passed} passed, ${failed} failed`,
    );

    return results;
  }

  /**
   * 执行单个测试任务（带超时控制）
   */
  private async runSingleTest(
    task: TestTask,
    options?: RunOptions,
  ): Promise<TestResult> {
    const timeout = this.config.performance.timeout;
    const taskId = `${task.target}/${task.variant}`;

    try {
      return await this.runSingleTestWithTimeout(task, timeout, options);
    } catch (error) {
      // 超时或其他未捕获的错误
      if (error instanceof Error && error.message.includes('timeout')) {
        log.error(`[${taskId}] Task timeout after ${timeout}ms`);
      } else {
        log.error(`[${taskId}] Unexpected error`, error as Error);
      }
      return this.createErrorResult(task, error);
    }
  }

  /**
   * 执行单个测试任务（完整流程，内部实现）
   */
  private async runSingleTestWithTimeout(
    task: TestTask,
    timeout: number,
    options?: RunOptions,
  ): Promise<TestResult> {
    const taskId = `${task.target}/${task.variant}`;
    log.info(`[${taskId}] Starting test...`);

    const timing: Timing = {
      baseline: 0,
      screenshot: 0,
      comparison: 0,
      total: 0,
    };
    const taskStart = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeout);

    try {
      return await Promise.race([
        this.executeTestSteps(
          task,
          taskId,
          timing,
          taskStart,
          controller.signal,
          options,
        ),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error(`Task timeout after ${timeout}ms`));
          });
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 执行测试步骤
   */
  private async executeTestSteps(
    task: TestTask,
    taskId: string,
    timing: Timing,
    taskStart: number,
    signal?: AbortSignal,
    options?: RunOptions,
  ): Promise<TestResult> {
    // 文件路径
    const baselinePath = this.getBaselinePath(task);
    const actualPath = this.getActualPath(task);
    const diffPath = this.getDiffPath(task);

    // 超时检查辅助函数
    const checkAborted = () => {
      if (signal?.aborted) throw new Error('Task aborted due to timeout');
    };

    // ---- Step 1: 准备基准图 ----
    checkAborted();
    let baselineResult: BaselineResult;
    // 首次运行标记：--update 模式下基准图不存在时，截图后直接保存为基准图
    let isFirstRun = false;
    try {
      const start = Date.now();
      baselineResult = await this.baselineProvider.fetch({
        source: task.baseline as string | BaselineSource,
        outputPath: baselinePath,
      });
      timing.baseline = Date.now() - start;

      if (!baselineResult.success) {
        // 仅当错误明确是"文件未找到"时才视为首次运行，
        // 其他错误（如文件损坏、网络超时）应正常报错，避免静默覆盖已有基准图
        const isNotFound =
          baselineResult.error?.message?.toLowerCase().includes('not found') ??
          false;
        if (options?.update && isNotFound) {
          // --update 模式：基准图不存在，跳过此步骤，截图后保存为初始基准图
          isFirstRun = true;
          log.info(
            `[${taskId}] No baseline found, capturing initial baseline...`,
          );
        } else {
          throw baselineResult.error ?? new Error('Baseline fetch failed');
        }
      } else {
        log.debug(`[${taskId}] Baseline ready (${timing.baseline}ms)`);
      }
    } catch (error) {
      log.error(`[${taskId}] Baseline fetch failed`, error as Error);
      return this.createErrorResult(task, error, 'baseline');
    }

    // ---- Step 2: 截取实际页面 ----
    checkAborted();
    try {
      const start = Date.now();
      await this.screenshotEngine.capture({
        url: task.url,
        outputPath: actualPath,
        selector: task.selector,
        viewport: task.viewport,
        browser: task.browser,
        waitStrategies: task.waitFor
          ? [{ type: 'selector', selector: task.waitFor, state: 'visible' }]
          : undefined,
      });
      timing.screenshot = Date.now() - start;
      log.debug(`[${taskId}] Screenshot captured (${timing.screenshot}ms)`);
    } catch (error) {
      log.error(`[${taskId}] Screenshot failed`, error as Error);
      return this.createErrorResult(task, error, 'screenshot');
    }

    // ---- 首次运行：将截图保存为初始基准图，直接返回通过 ----
    if (isFirstRun) {
      try {
        await ensureDir(path.dirname(baselinePath));
        await copyFile(actualPath, baselinePath);
        log.info(`[${taskId}] INITIALIZED baseline: ${baselinePath}`);
      } catch (error) {
        log.error(
          `[${taskId}] Failed to save initial baseline`,
          error as Error,
        );
        return this.createErrorResult(task, error, 'baseline');
      }

      timing.total = Date.now() - taskStart;

      return {
        target: task.target,
        variant: task.variant,
        passed: true,
        mismatchPercentage: 0,
        screenshots: {
          baseline: baselinePath,
          actual: actualPath,
          diff: null,
        },
        comparison: {
          match: true,
          mismatchPercentage: 0,
          mismatchPixels: 0,
          totalPixels: 0,
          diffPath: null,
          sizeDiff: null,
          diffRegions: [],
        },
      };
    }

    // ---- Step 3: 像素比对 ----
    checkAborted();
    let comparison: CompareResult;
    try {
      const start = Date.now();
      comparison = await this.comparisonEngine.compare({
        baselinePath,
        actualPath,
        diffPath,
        threshold: task.threshold ?? this.config.comparison.threshold,
        antialiasing: this.config.comparison.antialiasing,
      });
      timing.comparison = Date.now() - start;
      log.debug(
        `[${taskId}] Comparison done: ${comparison.mismatchPercentage.toFixed(2)}% (${timing.comparison}ms)`,
      );
    } catch (error) {
      log.error(`[${taskId}] Comparison failed`, error as Error);
      return this.createErrorResult(task, error, 'comparison');
    }

    // ---- Step 4: LLM 分析（仅有差异时） ----
    let analysis: AnalyzeResult | undefined;
    let suggestions: FixSuggestion[] | undefined;

    checkAborted();
    if (!comparison.match && this.config.llm.enabled) {
      try {
        const start = Date.now();
        analysis = await this.llmAnalyzer.analyze(
          {
            baselinePath,
            actualPath,
            diffPath: comparison.diffPath ?? diffPath,
            comparisonResult: comparison,
            context: {
              name: taskId,
              type: task.targetType === 'page' ? 'page' : 'component',
            },
          },
          signal,
        );

        if (analysis.differences.length > 0) {
          suggestions = await this.llmAnalyzer.suggestFix(
            {
              differences: analysis.differences,
              context: {
                name: taskId,
                type: task.targetType === 'page' ? 'page' : 'component',
              },
            },
            signal,
          );
        }

        timing.analysis = Date.now() - start;
        log.debug(`[${taskId}] LLM analysis done (${timing.analysis}ms)`);
      } catch (error) {
        log.warn(
          `[${taskId}] LLM analysis failed, continuing without it`,
          error,
        );
      }
    }

    timing.total = Date.now() - taskStart;

    const passed = comparison.match;
    log.info(
      `[${taskId}] ${passed ? 'PASSED' : 'FAILED'} (${comparison.mismatchPercentage.toFixed(2)}%, ${timing.total}ms)`,
    );

    return {
      target: task.target,
      variant: task.variant,
      passed,
      mismatchPercentage: comparison.mismatchPercentage,
      screenshots: {
        baseline: baselinePath,
        actual: actualPath,
        diff: comparison.diffPath,
      },
      comparison,
      analysis,
      suggestions,
    };
  }

  /**
   * 解析配置中的测试目标为扁平任务列表
   */
  private resolveTargets(
    targetNames?: string[],
    allTargets?: VisualTestConfig['targets'],
  ): TestTask[] {
    let targets = allTargets ?? this.config.targets;

    if (targetNames && targetNames.length > 0) {
      targets = targets.filter((t) => targetNames.includes(t.name));
    }

    const tasks: TestTask[] = [];

    // 获取全局 viewports 配置
    const globalViewports = this.config.screenshot.viewports || [];

    // 获取浏览器配置（多浏览器时为每个浏览器创建独立任务）
    const browsers = this.config.screenshot.browsers;
    const multipleBrowsers = browsers.length > 1;

    for (const target of targets) {
      for (const variant of target.variants) {
        // 构建基础任务列表（按 viewport 展开）
        const baseTasks: Omit<TestTask, 'browser'>[] = [];

        if (globalViewports.length > 0) {
          for (const viewport of globalViewports) {
            baseTasks.push({
              target: target.name,
              targetType: target.type,
              variant: `${variant.name}@${viewport.name}`,
              url: variant.url,
              baseline: this.deriveViewportBaseline(
                variant.baseline,
                viewport.name,
              ),
              selector: variant.selector,
              waitFor: variant.waitFor,
              threshold: variant.threshold,
              viewport: { width: viewport.width, height: viewport.height },
            });
          }
        } else {
          baseTasks.push({
            target: target.name,
            targetType: target.type,
            variant: variant.name,
            url: variant.url,
            baseline: variant.baseline,
            selector: variant.selector,
            waitFor: variant.waitFor,
            threshold: variant.threshold,
            viewport: variant.viewport,
          });
        }

        // 按浏览器展开（单浏览器时不加后缀）
        if (multipleBrowsers) {
          for (const browserConfig of browsers) {
            for (const baseTask of baseTasks) {
              tasks.push({
                ...baseTask,
                variant: `${baseTask.variant}@${browserConfig.type}`,
                baseline: this.deriveBrowserBaseline(
                  baseTask.baseline,
                  browserConfig.type,
                ),
                browser: browserConfig.type,
              });
            }
          }
        } else {
          for (const baseTask of baseTasks) {
            tasks.push({
              ...baseTask,
              browser: browsers[0]?.type,
            });
          }
        }
      }
    }

    return tasks;
  }

  /**
   * 生成报告
   */
  private async generateReports(results: TestResult[]): Promise<void> {
    const outputDir = this.config.directories.reports;
    const formats = this.config.report.formats;

    log.info(`Generating reports: ${formats.join(', ')}`);

    // 获取 LLM 统计数据
    const llmStats = this.llmAnalyzer.getStats();
    const reportContext: import('./report').ReportContext = {
      llmStats: llmStats.callCount > 0 ? llmStats : undefined,
    };

    // 统一构建结论数据，供所有 reporter 共享（避免重复计算）
    const conclusionReporter = new ConclusionReporter(this.config);
    reportContext.conclusion = conclusionReporter.buildReport(
      results,
      reportContext,
    );

    const reporters: Array<{
      reporter: JsonReporter | HtmlReporter | ConclusionReporter;
      name: string;
    }> = [];

    if (formats.includes('json')) {
      reporters.push({ reporter: new JsonReporter(), name: 'JSON' });
    }
    if (formats.includes('html')) {
      reporters.push({
        reporter: new HtmlReporter(),
        name: 'HTML',
      });
    }
    if (this.config.report.conclusion) {
      reporters.push({ reporter: conclusionReporter, name: 'Conclusion' });
    }

    for (const { reporter, name } of reporters) {
      try {
        const outputPath = await reporter.generate(
          results,
          outputDir,
          reportContext,
        );
        log.info(`${name} report: ${outputPath}`);
      } catch (error) {
        log.error(`Failed to generate ${name} report`, error as Error);
      }
    }
  }

  /**
   * 确保输出目录存在
   */
  private async ensureOutputDirs(): Promise<void> {
    const dirs = this.config.directories;
    await Promise.all([
      ensureDir(dirs.baselines),
      ensureDir(dirs.actuals),
      ensureDir(dirs.diffs),
      ensureDir(dirs.reports),
    ]);
  }

  /**
   * 清理资源（幂等，多次调用安全）
   */
  private async cleanup(): Promise<void> {
    if (this.cleanupDone) return;
    this.cleanupDone = true;

    try {
      await this.screenshotEngine.close();
    } catch (error) {
      log.warn('Failed to close screenshot engine', error);
    }

    try {
      await this.baselineProvider.dispose?.();
    } catch (error) {
      log.warn('Failed to dispose baseline provider', error);
    }
  }

  // ---- 路径工具 ----

  private getBaselinePath(task: TestTask): string {
    return path.join(
      this.config.directories.baselines,
      task.target,
      `${task.variant}.png`,
    );
  }

  private getActualPath(task: TestTask): string {
    return path.join(
      this.config.directories.actuals,
      task.target,
      `${task.variant}.png`,
    );
  }

  private getDiffPath(task: TestTask): string {
    return path.join(
      this.config.directories.diffs,
      task.target,
      `${task.variant}-diff.png`,
    );
  }

  /**
   * 为多 viewport 场景派生独立的 baseline 来源
   *
   * 字符串路径: `baselines/btn.png` → `baselines/btn@desktop.png`
   * 结构化来源: 保持不变（Figma 节点不因 viewport 变化）
   */
  private deriveViewportBaseline(
    baseline: string | { type: string; source: string; fileKey?: string },
    viewportName: string,
  ): typeof baseline {
    if (typeof baseline === 'string') {
      const ext = path.extname(baseline);
      const base = baseline.slice(0, -ext.length);
      return `${base}@${viewportName}${ext}`;
    }
    return baseline;
  }

  /**
   * 为多浏览器场景派生独立的 baseline 来源
   */
  private deriveBrowserBaseline(
    baseline: string | { type: string; source: string; fileKey?: string },
    browserType: string,
  ): typeof baseline {
    if (typeof baseline === 'string') {
      const ext = path.extname(baseline);
      const base = baseline.slice(0, -ext.length);
      return `${base}@${browserType}${ext}`;
    }
    return baseline;
  }

  /**
   * 创建错误结果（某个步骤失败时）
   */
  private createErrorResult(
    task: TestTask,
    error: unknown,
    failedStep?: 'baseline' | 'screenshot' | 'comparison' | 'analysis',
  ): TestResult {
    const errMsg = error instanceof Error ? error.message : String(error);
    const step = failedStep ?? 'unknown';
    const taskId = `${task.target}/${task.variant}`;

    log.error(`[${taskId}] ${step} step failed: ${errMsg}`);

    return {
      target: task.target,
      variant: task.variant,
      passed: false,
      mismatchPercentage: 100,
      error: { step, message: errMsg },
      screenshots: {
        baseline: this.getBaselinePath(task),
        actual: this.getActualPath(task),
        diff: null,
      },
      comparison: {
        match: false,
        mismatchPercentage: 100,
        mismatchPixels: 0,
        totalPixels: 0,
        diffPath: null,
        sizeDiff: null,
        diffRegions: [],
      },
      analysis: {
        differences: [
          {
            id: `error-${taskId}`,
            type: 'other',
            location: `${taskId}${failedStep ? ` (${failedStep} step)` : ''}`,
            description: `Test error: ${errMsg}`,
            severity: 'critical',
          },
        ],
        assessment: {
          matchScore: 0,
          grade: 'F',
          acceptable: false,
          summary: `Test failed${failedStep ? ` at ${failedStep} step` : ''}: ${errMsg}`,
        },
      },
    };
  }

  // ---- 公共 API ----

  /**
   * 更新失败测试的基准图
   */
  public async updateBaselines(failedResults: TestResult[]): Promise<void> {
    log.info(`Updating ${failedResults.length} baseline(s)...`);

    for (const result of failedResults) {
      try {
        const actualPath = result.screenshots.actual;
        const baselinePath = result.screenshots.baseline;

        if (!actualPath || !baselinePath) {
          log.warn(
            `[${result.target}/${result.variant}] Missing paths, skipping update`,
          );
          continue;
        }

        // 检查实际截图文件是否存在（截图步骤失败时文件不存在）
        if (!(await pathExists(actualPath))) {
          log.warn(
            `[${result.target}/${result.variant}] Actual screenshot not found: ${actualPath}, skipping update`,
          );
          continue;
        }

        await copyFile(actualPath, baselinePath);
        log.info(
          `[${result.target}/${result.variant}] Baseline updated: ${baselinePath}`,
        );
      } catch (error) {
        log.error(
          `[${result.target}/${result.variant}] Failed to update baseline`,
          error as Error,
        );
      }
    }

    log.info('Baseline update completed');
  }

  /**
   * 获取 LLM 分析器的统计信息
   */
  public getLLMStats() {
    return this.llmAnalyzer.getStats();
  }
}
