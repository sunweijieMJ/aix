/**
 * @kit/visual-testing - 视觉比对测试库入口
 *
 * 支持 Figma 设计稿作为基准图，对任意页面/组件进行像素级比对，
 * 结合 LLM 智能分析差异并生成修复建议。
 */

// ---- 核心 API ----

export { VisualTestOrchestrator } from './core/orchestrator';
export { FidelityOrchestrator, summarize as summarizeFidelity } from './core/fidelity/orchestrator';
export type { FidelityRunOptions, FidelityRunOutput } from './core/fidelity/orchestrator';

// ---- Fidelity 独立模块 ----

export {
  extractDesignSpec,
  normalizeText,
  collectFontFamilies,
} from './core/fidelity/figma-spec-extractor';
export { extractRenderSpec, resolveRootSelector } from './core/fidelity/dom-extractor';
export { matchNodes, iou, similarity } from './core/fidelity/node-matcher';
export { diffMatches, diffNode, fontFamilyMatches } from './core/fidelity/property-diff';
export { TokenMapper } from './core/fidelity/token-mapper';
export { cropRegions, isUnexplainedRegion } from './core/fidelity/crop';
export { FidelityReporter, renderMarkdown } from './core/report/fidelity-reporter';
export { FigmaClient, FigmaApiError, resolveFigmaToken } from './core/figma/client';
export { parseFigmaRef, normalizeNodeId, isBareNodeId } from './core/figma/url';
export { FigmaApiProvider } from './core/baseline/figma-api-provider';
export { deltaE2000, parseCssColor, rgbaToColor } from './utils/color';

export type {
  Bounds,
  Color,
  DesignNode,
  DesignSpec,
  RenderNode,
  RenderSpec,
  NodeMatch,
  PropertyDiff,
  FidelityRegion,
  FidelityResult,
  FidelitySummary,
  FidelitySeverity,
  MatchMethod,
} from './core/fidelity/types';
export type { FigmaNode, FigmaNodesResponse, FigmaFileMeta } from './core/figma/types';

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

export type { VisualTestConfig, VisualTestUserConfig } from './core/config/schema';

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
