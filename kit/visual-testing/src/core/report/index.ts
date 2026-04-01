/**
 * 报告生成器模块
 *
 * 提供多格式报告生成：JSON（机器可读）、HTML（可视化）、结论报告（核心）。
 */

export { JsonReporter } from './json-reporter';
export { HtmlReporter } from './html-reporter';
export { ConclusionReporter } from './conclusion-reporter';

export type {
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
