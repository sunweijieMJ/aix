/**
 * 规则降级 Provider
 *
 * 当 LLM 不可用或超出成本限制时，基于规则生成分析结果。
 * 根据差异百分比和区域信息进行启发式判断。
 */

import type {
  AnalyzeOptions,
  AnalyzeResult,
  SuggestFixOptions,
  FixSuggestion,
  Difference,
  Assessment,
  Severity,
} from '../../../types/llm';
import { percentageToSeverity, scoreToGrade } from '../../../utils/scoring';

export class RuleBasedProvider {
  readonly name = 'rule-based';

  async analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
    const { comparisonResult, context } = options;
    const { mismatchPercentage, diffRegions, sizeDiff } = comparisonResult;

    const differences: Difference[] = [];
    let diffIdx = 1;

    // 尺寸差异
    if (sizeDiff) {
      differences.push({
        id: `diff-${diffIdx++}`,
        type: 'size',
        location: '整体容器',
        description: `尺寸不匹配: 基准图 ${sizeDiff.baseline.width}x${sizeDiff.baseline.height}, 实际 ${sizeDiff.actual.width}x${sizeDiff.actual.height}`,
        severity: this.sizeDiffSeverity(sizeDiff),
        expected: `${sizeDiff.baseline.width}x${sizeDiff.baseline.height}`,
        actual: `${sizeDiff.actual.width}x${sizeDiff.actual.height}`,
      });
    }

    // 基于差异区域生成差异条目
    for (const region of diffRegions) {
      const regionPercentage =
        (region.pixels / comparisonResult.totalPixels) * 100;
      differences.push({
        id: `diff-${diffIdx++}`,
        type: region.type === 'unknown' ? 'other' : region.type,
        location: `区域 (${region.bounds.x}, ${region.bounds.y}) ${region.bounds.width}x${region.bounds.height}`,
        description: `检测到 ${region.pixels} 个差异像素 (${regionPercentage.toFixed(2)}%)`,
        severity: percentageToSeverity(regionPercentage),
      });
    }

    // 如果没有具体区域但有差异，添加一个总体条目
    if (differences.length === 0 && mismatchPercentage > 0) {
      differences.push({
        id: `diff-${diffIdx}`,
        type: 'other',
        location: context?.name || '整体',
        description: `整体差异 ${mismatchPercentage.toFixed(2)}%`,
        severity: percentageToSeverity(mismatchPercentage),
      });
    }

    const assessment = this.buildAssessment(mismatchPercentage, differences);

    return { differences, assessment };
  }

  async suggestFix(_options: SuggestFixOptions): Promise<FixSuggestion[]> {
    // 规则引擎不生成修复建议
    return [];
  }

  private sizeDiffSeverity(
    sizeDiff: NonNullable<AnalyzeOptions['comparisonResult']['sizeDiff']>,
  ): Severity {
    const widthDiff = Math.abs(sizeDiff.baseline.width - sizeDiff.actual.width);
    const heightDiff = Math.abs(
      sizeDiff.baseline.height - sizeDiff.actual.height,
    );
    const maxDiff = Math.max(widthDiff, heightDiff);

    if (maxDiff > 100) return 'critical';
    if (maxDiff > 20) return 'major';
    if (maxDiff > 5) return 'minor';
    return 'trivial';
  }

  private buildAssessment(
    mismatchPercentage: number,
    differences: Difference[],
  ): Assessment {
    const matchScore = Math.max(0, Math.round(100 - mismatchPercentage * 5));
    const grade = scoreToGrade(matchScore);
    const hasCritical = differences.some((d) => d.severity === 'critical');
    const hasMajor = differences.some((d) => d.severity === 'major');

    return {
      matchScore,
      grade,
      acceptable: !hasCritical && !hasMajor && matchScore >= 80,
      summary: this.buildSummaryText(
        matchScore,
        differences.length,
        hasCritical,
        hasMajor,
      ),
    };
  }

  private buildSummaryText(
    score: number,
    diffCount: number,
    hasCritical: boolean,
    hasMajor: boolean,
  ): string {
    if (diffCount === 0) return '无差异，完美匹配';
    if (hasCritical)
      return `发现 ${diffCount} 处差异，包含严重问题，需要立即修复`;
    if (hasMajor) return `发现 ${diffCount} 处差异，存在明显问题，建议尽快修复`;
    if (score >= 90) return `发现 ${diffCount} 处微小差异，整体匹配度良好`;
    return `发现 ${diffCount} 处差异，匹配度 ${score}%`;
  }
}
