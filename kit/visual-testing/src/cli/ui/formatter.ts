/**
 * 结果格式化工具
 *
 * 用于 CLI 输出美化：颜色、统计、摘要等
 */

import chalk from 'chalk';
import type { TestResult } from '../../core/report/types';
import type { CostStats } from '../../core/llm/cost-controller';

/**
 * 格式化测试结果摘要
 */
export function formatSummary(results: TestResult[], totalMs: number): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.bold('Summary:'));

  if (passed > 0) {
    lines.push(`  ${chalk.green(`✓ ${passed} passed`)}`);
  }
  if (failed > 0) {
    lines.push(`  ${chalk.red(`✗ ${failed} failed`)}`);
  }
  if (total === 0) {
    lines.push(`  ${chalk.gray('No tests found')}`);
  }

  lines.push(`  Total: ${formatTime(totalMs)}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * 格式化失败结果的详细信息
 */
export function formatFailures(results: TestResult[]): string {
  const failures = results.filter((r) => !r.passed);
  if (failures.length === 0) return '';

  const lines: string[] = [];
  lines.push(chalk.bold.red('Failures:'));
  lines.push('');

  for (const result of failures) {
    lines.push(
      `  ${chalk.red('✗')} ${chalk.bold(`${result.target}/${result.variant}`)}`,
    );
    lines.push(
      `    Mismatch: ${chalk.yellow(`${result.mismatchPercentage.toFixed(2)}%`)}`,
    );

    if (result.analysis?.assessment) {
      lines.push(`    Grade: ${formatGrade(result.analysis.assessment.grade)}`);
      lines.push(`    ${chalk.gray(result.analysis.assessment.summary)}`);
    }

    if (result.suggestions && result.suggestions.length > 0) {
      lines.push(`    Suggestions:`);
      for (const suggestion of result.suggestions.slice(0, 3)) {
        lines.push(`      - ${chalk.cyan(suggestion.explanation)}`);
        if (suggestion.file) {
          lines.push(`        ${chalk.gray(suggestion.file)}`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 格式化报告路径
 */
export function formatReportPaths(
  reportsDir: string,
  formats: string[],
  hasConclusion: boolean,
): string {
  const lines: string[] = [];
  lines.push(chalk.bold('Reports:'));

  if (formats.includes('html')) {
    lines.push(`  HTML: ${chalk.underline(`${reportsDir}/report.html`)}`);
  }
  if (formats.includes('json')) {
    lines.push(`  JSON: ${chalk.underline(`${reportsDir}/report.json`)}`);
  }
  if (hasConclusion) {
    lines.push(
      `  Conclusion: ${chalk.underline(`${reportsDir}/conclusion.json`)}`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * 格式化同步结果
 */
export function formatSyncResult(count: number, elapsed: number): string {
  return `Synced ${chalk.bold(String(count))} baselines (${formatTime(elapsed)})`;
}

/**
 * 格式化 init 完成信息
 */
export function formatInitSuccess(configPath: string): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.green('✓') + ` Created ${chalk.bold(configPath)}`);
  lines.push(
    chalk.green('✓') + ` Created ${chalk.bold('.visual-test/')} directories`,
  );
  lines.push('');
  lines.push(chalk.bold('Next steps:'));
  lines.push(`  1. Edit ${chalk.cyan(configPath)} to add targets`);
  lines.push(
    `  2. Run ${chalk.cyan("'visual-test sync'")} to download baselines`,
  );
  lines.push(`  3. Run ${chalk.cyan("'visual-test test'")} to start testing`);
  lines.push('');
  return lines.join('\n');
}

/**
 * 格式化评分等级
 */
function formatGrade(grade: string): string {
  switch (grade) {
    case 'A':
      return chalk.green(grade);
    case 'B':
      return chalk.blue(grade);
    case 'C':
      return chalk.yellow(grade);
    case 'D':
      return chalk.magenta(grade);
    case 'F':
      return chalk.red(grade);
    default:
      return grade;
  }
}

/**
 * 格式化 LLM 成本摘要
 */
export function formatLLMCost(stats: CostStats): string {
  if (stats.callCount === 0) return '';

  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.bold('LLM Usage:'));
  lines.push(`  Calls: ${chalk.cyan(String(stats.callCount))}`);
  lines.push(
    `  Tokens: ${chalk.cyan(formatTokens(stats.totalTokens))} (avg: ${Math.round(stats.averageTokensPerCall)}/call)`,
  );
  lines.push(`  Cost: ${chalk.magenta(`$${stats.estimatedCost.toFixed(4)}`)}`);

  if (stats.breakdown) {
    lines.push(
      chalk.gray(
        `  Breakdown: ${stats.breakdown.promptTokens.toLocaleString()} input + ` +
          `${stats.breakdown.completionTokens.toLocaleString()} output`,
      ),
    );
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * 格式化 token 数量
 */
function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

/**
 * 格式化时间
 */
function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
