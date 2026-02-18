/**
 * JSON 报告生成器
 *
 * 生成完整的机器可读 JSON 报告，包含所有测试结果、比对数据和 LLM 分析。
 * 主要用于 CI/CD 集成和自动化流程。
 */

import path from 'node:path';

import { ensureDir, writeJSON } from '../../utils/file';
import { logger } from '../../utils/logger';
import type { Reporter, ReportContext, TestResult } from './types';

const log = logger.child('JsonReporter');

export class JsonReporter implements Reporter {
  readonly name = 'json';

  async generate(
    results: TestResult[],
    outputDir: string,
    context?: ReportContext,
  ): Promise<string> {
    const outputPath = path.join(outputDir, 'report.json');

    log.info(`Generating JSON report: ${outputPath}`);

    await ensureDir(outputDir);

    const report = {
      generatedAt: new Date().toISOString(),
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      llmStats: context?.llmStats
        ? {
            callCount: context.llmStats.callCount,
            totalTokens: context.llmStats.totalTokens,
            estimatedCost: context.llmStats.estimatedCost,
            averageTokensPerCall: context.llmStats.averageTokensPerCall,
            breakdown: context.llmStats.breakdown,
          }
        : undefined,
      results: results.map((r) => ({
        target: r.target,
        variant: r.variant,
        passed: r.passed,
        mismatchPercentage: r.mismatchPercentage,
        screenshots: r.screenshots,
        comparison: {
          match: r.comparison.match,
          mismatchPercentage: r.comparison.mismatchPercentage,
          mismatchPixels: r.comparison.mismatchPixels,
          totalPixels: r.comparison.totalPixels,
          diffPath: r.comparison.diffPath,
          sizeDiff: r.comparison.sizeDiff,
          diffRegionsCount: r.comparison.diffRegions.length,
        },
        analysis: r.analysis
          ? {
              differences: r.analysis.differences,
              assessment: r.analysis.assessment,
            }
          : null,
        suggestions: r.suggestions ?? [],
      })),
    };

    await writeJSON(outputPath, report);

    log.info(`JSON report generated: ${results.length} results`);
    return outputPath;
  }
}
