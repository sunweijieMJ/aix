/**
 * 报告生成器类型定义
 */

import type {
  Severity,
  DifferenceType,
  AnalyzeResult,
  FixSuggestion,
} from '../../types/llm';
import type { CompareResult } from '../../types/comparison';

/**
 * 单个测试结果（编排器产出，报告器消费）
 */
export interface TestResult {
  /** 目标名称 */
  target: string;
  /** 变体名称 */
  variant: string;
  /** 是否通过 */
  passed: boolean;
  /** 差异百分比 */
  mismatchPercentage: number;
  /** 截图路径 */
  screenshots: {
    baseline: string;
    actual: string;
    diff: string | null;
  };
  /** 比对结果 */
  comparison: CompareResult;
  /** LLM 分析结果 */
  analysis?: AnalyzeResult;
  /** 修复建议 */
  suggestions?: FixSuggestion[];
  /** 错误信息（流程中某步骤失败时） */
  error?: {
    step: 'baseline' | 'screenshot' | 'comparison' | 'analysis' | 'unknown';
    message: string;
  };
}

// ---- 结论报告类型 ----

export interface ConclusionReport {
  meta: ReportMeta;
  summary: ExecutiveSummary;
  issues: Issue[];
  fixPlan: FixPlan;
  nextActions: NextAction[];
  llmStats?: {
    callCount: number;
    totalTokens: number;
    estimatedCost: number;
    averageTokensPerCall: number;
    costPerFailedTest: number;
  };
}

export interface ReportMeta {
  id: string;
  generatedAt: string;
  scope: {
    targets: number;
    variants: number;
  };
  config: {
    threshold: number;
    viewport: { width: number; height: number };
    llmModel?: string;
  };
}

export interface ExecutiveSummary {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  passed: number;
  failed: number;
  keyFindings: string[];
  oneLiner: string;
  acceptable: boolean;
}

export interface Issue {
  id: string;
  target: string;
  variant: string;
  severity: Severity;
  type: DifferenceType;
  description: string;
  location?: string;
  expected?: string;
  actual?: string;
  mismatchPercentage: number;
  screenshots: {
    baseline: string;
    actual: string;
    diff: string;
  };
  suggestion?: {
    type: 'css' | 'html' | 'component' | 'config';
    code?: string;
    file?: string;
    explanation: string;
  };
}

export interface FixPlan {
  totalFixes: number;
  estimatedHours: number;
  byPriority: {
    critical: FixPlanItem[];
    major: FixPlanItem[];
    minor: FixPlanItem[];
  };
}

export interface FixPlanItem {
  issueId: string;
  type: 'css' | 'html' | 'component' | 'config';
  code: string;
  file?: string;
  explanation: string;
}

export interface NextAction {
  type: 'fix' | 'review' | 'update-baseline' | 'investigate';
  description: string;
  priority: 'high' | 'medium' | 'low';
  relatedIssues?: string[];
}

/**
 * 报告上下文（可选的额外信息）
 */
export interface ReportContext {
  /** LLM 统计数据 */
  llmStats?: {
    callCount: number;
    totalTokens: number;
    estimatedCost: number;
    averageTokensPerCall: number;
    breakdown: {
      promptTokens: number;
      completionTokens: number;
    };
  };
  /** 预构建的结论报告数据（避免各 reporter 重复计算） */
  conclusion?: ConclusionReport;
}

/**
 * 报告器接口
 */
export interface Reporter {
  readonly name: string;
  generate(
    results: TestResult[],
    outputDir: string,
    context?: ReportContext,
  ): Promise<string>;
}
