/**
 * LLM 分析器相关类型定义
 */

import type { CompareResult } from './comparison';

export type DifferenceType =
  | 'color'
  | 'spacing'
  | 'font'
  | 'size'
  | 'border'
  | 'shadow'
  | 'position'
  | 'missing'
  | 'extra'
  | 'layout'
  | 'other';

export type Severity = 'critical' | 'major' | 'minor' | 'trivial';

export interface Difference {
  id: string;
  type: DifferenceType;
  location: string;
  description: string;
  severity: Severity;
  expected?: string;
  actual?: string;
}

export interface Assessment {
  matchScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  acceptable: boolean;
  summary: string;
}

export interface AnalyzeOptions {
  baselinePath: string;
  actualPath: string;
  diffPath: string;
  comparisonResult: CompareResult;
  context?: AnalysisContext;
}

export interface AnalysisContext {
  name: string;
  type: 'component' | 'page';
  framework?: string;
  description?: string;
}

/** Token 使用情况 */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface AnalyzeResult {
  differences: Difference[];
  assessment: Assessment;
  rawResponse?: string;
  /** Token 使用情况（可选） */
  usage?: TokenUsage;
}

export interface SuggestFixOptions {
  differences: Difference[];
  context?: AnalysisContext;
}

export interface FixSuggestion {
  differenceId: string;
  type: 'css' | 'html' | 'component' | 'config';
  code: string;
  file?: string;
  confidence: number;
  explanation: string;
}

// ---- LLM 配置 ----

export interface LLMConfig {
  /** API 密钥 */
  apiKey: string;
  /** 模型名称 (e.g., 'gpt-4o', 'claude-sonnet-4-20250514') */
  model: string;
  /** API 端点 URL（用于切换 OpenAI 兼容厂商或 Azure） */
  baseURL?: string;
  /** 最大输出 token 数 */
  maxTokens?: number;
  /** 请求超时（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 温度参数 */
  temperature?: number;
}

// ---- Vision 适配器 ----

export interface ImageInput {
  /** 图片原始数据 */
  data: Buffer;
  /** 图片标签，如 '[设计稿]'、'[实际渲染]'、'[差异图]' */
  label: string;
}

export interface VisionCallResult {
  /** LLM 返回的文本内容 */
  text: string;
  /** Token 使用情况 */
  usage?: TokenUsage;
}

export interface VisionAdapter {
  readonly name: string;
  /** 带图片的 Vision 调用 */
  chatWithImages(
    images: ImageInput[],
    prompt: string,
    options: {
      model: string;
      maxTokens: number;
      temperature: number;
      signal?: AbortSignal;
    },
  ): Promise<VisionCallResult>;
  /** 纯文本调用 */
  chat(
    prompt: string,
    options: {
      model: string;
      maxTokens: number;
      temperature: number;
      signal?: AbortSignal;
    },
  ): Promise<VisionCallResult>;
}
