/**
 * @kit/visual-testing - 视觉比对测试库入口
 *
 * 支持 Figma 设计稿作为基准图，对任意页面/组件进行像素级比对，
 * 结合 LLM 智能分析差异并生成修复建议。
 */

// ---- 核心 API ----

export { VisualTestOrchestrator } from './core/orchestrator';

// ---- 配置 ----

export {
  configSchema,
  loadConfig,
  loadConfigFromFile,
  validateConfig,
  defineConfig,
} from './core/config';

// ---- Storybook 自动发现 ----

export { discoverStories } from './core/storybook';

// ---- 核心模块 ----

export { PixelComparisonEngine } from './core/comparison/pixel-engine';
export { LLMAnalyzer } from './core/llm';
export { createBaselineProvider } from './core/baseline';
export { PlaywrightScreenshotEngine } from './core/screenshot/playwright-engine';
export { JsonReporter, HtmlReporter, ConclusionReporter } from './core/report';

// ---- 工具 ----

export { logger, LogLevel } from './utils/logger';

// ---- 类型导出 ----

export type {
  VisualTestConfig,
  VisualTestUserConfig,
} from './core/config/schema';

export type { TestResult } from './core/report/types';
export type {
  ConclusionReport,
  ExecutiveSummary,
  FixPlan,
  FixPlanItem,
  Issue,
  NextAction,
  ReportMeta,
  Reporter,
} from './core/report/types';

export type {
  ComparisonEngine,
  CompareOptions,
  CompareResult,
  SizeDiff,
  DiffRegion,
} from './types/comparison';

export type {
  AnalyzeOptions,
  AnalyzeResult,
  AnalysisContext,
  Assessment,
  Difference,
  DifferenceType,
  FixSuggestion,
  Severity,
  TokenUsage,
} from './types/llm';

export type {
  BaselineProvider,
  BaselineResult,
  BaselineSource,
  BaselineSourceType,
  BaselineMetadata,
  FetchBaselineOptions,
} from './core/baseline/types';

export type {
  CaptureOptions,
  ScreenshotEngine,
  WaitStrategy,
  StabilityConfig,
  RetryOptions,
} from './types/screenshot';
