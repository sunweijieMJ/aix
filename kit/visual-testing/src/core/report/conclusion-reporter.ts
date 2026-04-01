/**
 * 结论报告生成器（核心）
 *
 * 聚合所有测试结果和 LLM 分析，生成结构化结论报告。
 * 包含评分、问题清单、修复计划和下一步行动建议。
 */

import path from 'node:path';

import { ensureDir, writeJSON } from '../../utils/file';
import { logger } from '../../utils/logger';
import type { VisualTestConfig } from '../config/schema';
import type { Severity, Difference, FixSuggestion } from '../../types/llm';
import { percentageToSeverity, scoreToGrade } from '../../utils/scoring';
import type {
  ConclusionReport,
  ExecutiveSummary,
  FixPlan,
  FixPlanItem,
  Issue,
  NextAction,
  ReportContext,
  ReportMeta,
  Reporter,
  TestResult,
} from './types';

const log = logger.child('ConclusionReporter');

/** 工时估算常量 (小时) */
const HOURS_BY_SEVERITY: Record<Severity, number> = {
  critical: 2,
  major: 1,
  minor: 0.5,
  trivial: 0.25,
};

/** 评分扣分权重 */
const SCORE_PENALTY: Record<Severity, number> = {
  critical: 15,
  major: 8,
  minor: 3,
  trivial: 1,
};

/** gradeFromScore 已迁移到 utils/scoring.ts，使用 scoreToGrade */

export class ConclusionReporter implements Reporter {
  readonly name = 'conclusion';

  private config?: VisualTestConfig;

  constructor(config?: VisualTestConfig) {
    this.config = config;
  }

  async generate(
    results: TestResult[],
    outputDir: string,
    context?: ReportContext,
  ): Promise<string> {
    const outputPath = path.join(outputDir, 'conclusion.json');

    log.info(`Generating conclusion report: ${outputPath}`);

    await ensureDir(outputDir);

    const report = context?.conclusion ?? this.buildReport(results, context);
    await writeJSON(outputPath, report);

    log.info(
      `Conclusion report generated: score=${report.summary.overallScore}, grade=${report.summary.grade}`,
    );
    return outputPath;
  }

  /**
   * 构建结论报告（也可直接调用获取数据）
   */
  buildReport(
    results: TestResult[],
    context?: ReportContext,
  ): ConclusionReport {
    const issues = this.extractIssues(results);
    const summary = this.buildSummary(results, issues);
    const fixPlan = this.buildFixPlan(issues);
    const nextActions = this.buildNextActions(summary, issues);

    // 添加 LLM 成本统计
    let llmStats: ConclusionReport['llmStats'] | undefined;
    if (context?.llmStats) {
      const failed = results.filter((r) => !r.passed).length;
      llmStats = {
        callCount: context.llmStats.callCount,
        totalTokens: context.llmStats.totalTokens,
        estimatedCost: context.llmStats.estimatedCost,
        averageTokensPerCall: context.llmStats.averageTokensPerCall,
        costPerFailedTest:
          failed > 0 ? context.llmStats.estimatedCost / failed : 0,
      };
    }

    return {
      meta: this.buildMeta(results),
      summary,
      issues,
      fixPlan,
      nextActions,
      llmStats,
    };
  }

  private buildMeta(results: TestResult[]): ReportMeta {
    const targets = new Set(results.map((r) => r.target));

    return {
      id: `vt-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`,
      generatedAt: new Date().toISOString(),
      scope: {
        targets: targets.size,
        variants: results.length,
      },
      config: {
        threshold: this.config?.comparison.threshold ?? 0.01,
        viewport: this.config?.screenshot.viewport ?? {
          width: 1280,
          height: 720,
        },
        llmModel: this.config?.llm.model,
      },
    };
  }

  private buildSummary(
    results: TestResult[],
    issues: Issue[],
  ): ExecutiveSummary {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    // 计算评分：100 分起始，按严重性扣分
    let score = 100;
    for (const issue of issues) {
      score -= SCORE_PENALTY[issue.severity] ?? 0;
    }
    score = Math.max(0, Math.min(100, score));

    const grade = scoreToGrade(score);

    const keyFindings = this.extractKeyFindings(issues);
    const oneLiner = this.generateOneLiner(passed, failed, issues);

    return {
      overallScore: Math.round(score),
      grade,
      passed,
      failed,
      keyFindings,
      oneLiner,
      acceptable: grade !== 'F',
    };
  }

  private extractIssues(results: TestResult[]): Issue[] {
    const issues: Issue[] = [];
    let issueIndex = 1;

    for (const result of results) {
      if (result.passed) continue;

      if (result.analysis) {
        // 从 LLM 分析结果中提取详细 issue
        for (const diff of result.analysis.differences) {
          const suggestion = this.findSuggestion(diff, result.suggestions);

          issues.push({
            id: `issue-${String(issueIndex++).padStart(3, '0')}`,
            target: result.target,
            variant: result.variant,
            severity: diff.severity,
            type: diff.type,
            description: diff.description,
            location: diff.location,
            expected: diff.expected,
            actual: diff.actual,
            mismatchPercentage: result.mismatchPercentage,
            screenshots: {
              baseline: result.screenshots.baseline,
              actual: result.screenshots.actual,
              diff: result.screenshots.diff ?? '',
            },
            suggestion: suggestion
              ? {
                  type: suggestion.type,
                  code: suggestion.code,
                  file: suggestion.file,
                  explanation: suggestion.explanation,
                }
              : undefined,
          });
        }
      } else {
        // 无 LLM 分析时，基于比对结果生成基础 issue
        const severity = percentageToSeverity(result.mismatchPercentage);
        issues.push({
          id: `issue-${String(issueIndex++).padStart(3, '0')}`,
          target: result.target,
          variant: result.variant,
          severity,
          type: 'other',
          description: `Visual mismatch: ${result.mismatchPercentage.toFixed(2)}% difference`,
          mismatchPercentage: result.mismatchPercentage,
          screenshots: {
            baseline: result.screenshots.baseline,
            actual: result.screenshots.actual,
            diff: result.screenshots.diff ?? '',
          },
        });
      }
    }

    // 按严重性排序：critical > major > minor > trivial
    const order: Record<string, number> = {
      critical: 0,
      major: 1,
      minor: 2,
      trivial: 3,
    };
    issues.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

    return issues;
  }

  private findSuggestion(
    diff: Difference,
    suggestions?: FixSuggestion[],
  ): FixSuggestion | undefined {
    if (!suggestions) return undefined;
    return suggestions.find((s) => s.differenceId === diff.id);
  }

  private buildFixPlan(issues: Issue[]): FixPlan {
    const critical: FixPlanItem[] = [];
    const major: FixPlanItem[] = [];
    const minor: FixPlanItem[] = [];

    for (const issue of issues) {
      if (!issue.suggestion) continue;

      const item: FixPlanItem = {
        issueId: issue.id,
        type: issue.suggestion.type,
        code: issue.suggestion.code ?? '',
        file: issue.suggestion.file,
        explanation: issue.suggestion.explanation,
      };

      switch (issue.severity) {
        case 'critical':
          critical.push(item);
          break;
        case 'major':
          major.push(item);
          break;
        case 'minor':
        case 'trivial':
          minor.push(item);
          break;
      }
    }

    return {
      totalFixes: critical.length + major.length + minor.length,
      estimatedHours: this.estimateHours(issues),
      byPriority: { critical, major, minor },
    };
  }

  private buildNextActions(
    summary: ExecutiveSummary,
    issues: Issue[],
  ): NextAction[] {
    const actions: NextAction[] = [];

    const criticalIssues = issues.filter((i) => i.severity === 'critical');
    const majorIssues = issues.filter((i) => i.severity === 'major');
    const minorIssues = issues.filter(
      (i) => i.severity === 'minor' || i.severity === 'trivial',
    );

    if (criticalIssues.length > 0) {
      actions.push({
        type: 'fix',
        description: `Immediately fix ${criticalIssues.length} critical issue(s)`,
        priority: 'high',
        relatedIssues: criticalIssues.map((i) => i.id),
      });
    }

    if (majorIssues.length > 0) {
      actions.push({
        type: 'fix',
        description: `Fix ${majorIssues.length} major issue(s) in current sprint`,
        priority: 'medium',
        relatedIssues: majorIssues.map((i) => i.id),
      });
    }

    if (minorIssues.length > 0) {
      actions.push({
        type: 'fix',
        description: `Address ${minorIssues.length} minor issue(s) when convenient`,
        priority: 'low',
        relatedIssues: minorIssues.map((i) => i.id),
      });
    }

    if (summary.failed > 0) {
      actions.push({
        type: 'review',
        description: 'Re-run visual tests after fixes to verify resolution',
        priority: criticalIssues.length > 0 ? 'high' : 'medium',
      });
    }

    if (summary.failed === 0) {
      actions.push({
        type: 'update-baseline',
        description:
          'All tests pass - consider updating baselines if intentional changes were made',
        priority: 'low',
      });
    }

    return actions;
  }

  private extractKeyFindings(issues: Issue[]): string[] {
    const findings: string[] = [];

    // 按 target 分组统计
    const byTarget = new Map<string, Issue[]>();
    for (const issue of issues) {
      const key = issue.target;
      if (!byTarget.has(key)) byTarget.set(key, []);
      byTarget.get(key)!.push(issue);
    }

    // 每个 target 取最严重的 issue 作为发现
    for (const [target, targetIssues] of byTarget) {
      const worst = targetIssues[0]!; // 已排序，第一个最严重
      findings.push(`${target}: ${worst.description}`);
    }

    return findings.slice(0, 5);
  }

  private generateOneLiner(
    passed: number,
    failed: number,
    issues: Issue[],
  ): string {
    const total = passed + failed;

    if (failed === 0) {
      return `All ${total} visual tests passed with no differences detected.`;
    }

    const criticalCount = issues.filter(
      (i) => i.severity === 'critical',
    ).length;
    const majorCount = issues.filter((i) => i.severity === 'major').length;

    const parts: string[] = [];
    if (criticalCount > 0) parts.push(`${criticalCount} critical`);
    if (majorCount > 0) parts.push(`${majorCount} major`);

    const issueSummary =
      parts.length > 0
        ? parts.join(', ') + ' issue(s)'
        : `${issues.length} issue(s)`;

    return `${failed}/${total} tests failed with ${issueSummary}. Estimated ${this.estimateHours(issues)}h to fix.`;
  }

  private estimateHours(issues: Issue[]): number {
    let hours = 0;
    for (const issue of issues) {
      hours += HOURS_BY_SEVERITY[issue.severity] ?? 0;
    }
    return Math.round(hours * 10) / 10;
  }
}
