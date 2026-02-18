/**
 * visual-test test - 运行视觉回归测试
 *
 * 加载配置，调用 Orchestrator 执行完整测试流程，输出结果。
 */

import chalk from 'chalk';
import type { Command } from 'commander';
import { loadConfig, loadConfigFromFile } from '../../core/config/loader';
import { VisualTestOrchestrator } from '../../core/orchestrator';
import { createSpinner } from '../ui/spinner';
import {
  formatSummary,
  formatFailures,
  formatReportPaths,
  formatLLMCost,
} from '../ui/formatter';
import { logger, LogLevel, parseLogLevel } from '../../utils/logger';

/**
 * 注册 test 命令
 */
export function registerTestCommand(program: Command): void {
  program
    .command('test [targets...]')
    .description('Run visual regression tests')
    .option('-c, --config <path>', 'Config file path')
    .option('--debug', 'Enable debug logging')
    .option('--ci', 'CI mode: fail on diff')
    .option('--update', 'Update baselines for failed tests')
    .option('--no-llm', 'Disable LLM analysis')
    .action(
      async (
        targets: string[],
        options: {
          config?: string;
          debug?: boolean;
          ci?: boolean;
          update?: boolean;
          llm?: boolean;
        },
      ) => {
        await runTest(targets, options);
      },
    );
}

async function runTest(
  targetNames: string[],
  options: {
    config?: string;
    debug?: boolean;
    ci?: boolean;
    update?: boolean;
    llm?: boolean;
  },
): Promise<void> {
  // 加载配置
  const config = options.config
    ? await loadConfigFromFile(options.config)
    : await loadConfig();

  // 应用配置中的日志级别（--debug 覆盖配置）
  if (options.debug) {
    logger.setLevel(LogLevel.DEBUG);
  } else if (config.logging.level) {
    logger.setLevel(parseLogLevel(config.logging.level));
  }

  // --no-llm 覆盖：创建新的 llm 配置对象，避免修改 Zod 输出
  const llmConfig =
    options.llm === false ? { ...config.llm, enabled: false } : config.llm;

  // 目标过滤提示
  if (targetNames.length > 0) {
    console.log(chalk.gray(`Running tests for: ${targetNames.join(', ')}`));
  } else {
    console.log(chalk.gray('Running all visual tests...'));
  }

  // 运行测试
  const spinner = createSpinner('Running visual tests...').start();
  const effectiveConfig =
    llmConfig !== config.llm ? { ...config, llm: llmConfig } : config;
  const orchestrator = new VisualTestOrchestrator(effectiveConfig);
  const startTime = Date.now();

  let results;
  try {
    results = await orchestrator.runTests(
      targetNames.length > 0 ? targetNames : undefined,
    );
    spinner.succeed('Visual tests completed');
  } catch (error) {
    spinner.fail(error instanceof Error ? error.message : 'Test failed');
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error)),
    );
    process.exitCode = 1;
    return;
  }

  const elapsed = Date.now() - startTime;

  // 首次运行引导：检测是否大量测试因缺少基准图而失败
  const failedResults = results.filter((r) => !r.passed);
  const missingBaselineResults = failedResults.filter(
    (r) => r.mismatchPercentage === 100,
  );
  if (
    !options.update &&
    missingBaselineResults.length > 0 &&
    missingBaselineResults.length === failedResults.length
  ) {
    console.log('');
    console.log(
      chalk.yellow(
        'Hint: All failures appear to be missing baselines (first run?).',
      ),
    );
    console.log(
      chalk.yellow(
        `  Run ${chalk.cyan('visual-test test --update')} to capture initial baselines.`,
      ),
    );
  }

  // 如果启用了 --update，更新失败用例的基准图
  if (options.update) {
    if (failedResults.length > 0) {
      console.log(
        chalk.yellow(`\n📝 Updating ${failedResults.length} baseline(s)...`),
      );
      await orchestrator.updateBaselines(failedResults);
      console.log(chalk.green('✓ Baselines updated successfully\n'));
    } else {
      console.log(chalk.gray('No failed tests to update\n'));
    }
  }

  // 输出结果
  console.log(formatSummary(results, elapsed));

  // 输出失败详情
  const failureOutput = formatFailures(results);
  if (failureOutput) {
    console.log(failureOutput);
  }

  // 输出 LLM 成本摘要
  const llmStats = orchestrator.getLLMStats();
  const costOutput = formatLLMCost(llmStats);
  if (costOutput) {
    console.log(costOutput);
  }

  // 输出报告路径
  console.log(
    formatReportPaths(
      config.directories.reports,
      config.report.formats,
      config.report.conclusion,
    ),
  );

  // CI 模式下按 severity 阈值判断是否退出非零
  const hasFailed = results.some((r) => !r.passed);
  if (hasFailed && (options.ci || config.ci.failOnDiff)) {
    const severityOrder: Record<string, number> = {
      critical: 0,
      major: 1,
      minor: 2,
      trivial: 3,
    };
    const thresholdLevel = severityOrder[config.ci.failOnSeverity] ?? 1;

    const hasSignificantIssues = results.some((r) => {
      if (r.passed) return false;
      // 无 LLM 分析时，视为显著问题
      if (!r.analysis) return true;
      return r.analysis.differences.some(
        (d) => (severityOrder[d.severity] ?? 0) <= thresholdLevel,
      );
    });

    if (hasSignificantIssues) {
      process.exitCode = 1;
    }
  }
}
