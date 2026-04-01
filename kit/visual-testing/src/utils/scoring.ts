/**
 * 评分工具函数 - 供 rule-based provider 和 conclusion-reporter 共享
 */

import type { Severity } from '../types/llm';
import type { Assessment } from '../types/llm';

/**
 * 百分比 → 严重性映射
 */
export function percentageToSeverity(percentage: number): Severity {
  if (percentage > 10) return 'critical';
  if (percentage > 5) return 'major';
  if (percentage > 1) return 'minor';
  return 'trivial';
}

/**
 * 分数 → 等级映射
 */
export function scoreToGrade(score: number): Assessment['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}
