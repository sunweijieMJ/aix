/**
 * @fileoverview Provider 类型定义
 * 聊天服务商抽象层的类型系统
 */

import type { RetryEngineConfig } from '../core/RetryEngine';
import type { OpenAIMessage } from '../types/message';
import type { SSEOutput } from '../utils/stream';

// NOTE: OpenAIMessage 从 '../types/message' 导入，不再重新导出
// 使用时请直接从 '@aix/chat-sdk' 或 '../types' 导入

/**
 * 消息状态
 */
export type ProviderMessageStatus =
  | 'local'
  | 'loading'
  | 'updating'
  | 'success'
  | 'error'
  | 'abort';

/**
 * 响应转换信息
 *
 * @template Output 输出类型，默认为 SSEOutput
 */
export interface TransformInfo<Output = SSEOutput> {
  /**
   * 原消息（用于增量更新）
   * 至少包含 content 字段用于内容累积
   */
  originMessage?: { content?: string };
  /** 当前数据块 */
  chunk?: Output;
  /** 所有已接收的数据块 */
  chunks: Output[];
  /** 当前状态 */
  status: ProviderMessageStatus;
  /** 响应头 */
  responseHeaders?: Headers;
}

/**
 * 从 TransformInfo 中提取原始内容字符串
 * 辅助函数，用于简化 Provider 实现
 */
export function getOriginContent(info: TransformInfo): string {
  return info.originMessage?.content ?? '';
}

/**
 * 请求中间件
 * 可在请求前后进行拦截和修改
 */
export interface RequestMiddleware {
  /**
   * 请求前拦截
   * @param url 请求 URL
   * @param options 请求选项
   * @returns 修改后的 [url, options]
   */
  onRequest?: (
    url: string,
    options: RequestInit,
  ) => Promise<[string, RequestInit]> | [string, RequestInit];

  /**
   * 响应后拦截
   * @param response 原始响应
   * @returns 修改后的响应
   */
  onResponse?: (response: Response) => Promise<Response> | Response;
}

/**
 * 请求中间件配置
 * 支持单个中间件或中间件数组（链式调用）
 */
export type RequestMiddlewares = RequestMiddleware | RequestMiddleware[];

/**
 * Provider 配置
 */
export interface ProviderConfig {
  /** API 基础 URL */
  baseURL: string;
  /** API 密钥 */
  apiKey?: string;
  /** 模型名称 */
  model?: string;
  /** 请求超时（毫秒） */
  timeout?: number;
  /** 流超时（毫秒） */
  streamTimeout?: number;
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** 是否启用流式响应 */
  stream?: boolean;
  /** 请求中间件 */
  middlewares?: RequestMiddlewares;
  /** 自定义 fetch 函数 */
  fetch?: typeof fetch;
  /**
   * 是否手动模式
   * 手动模式下，Provider 不会自动执行，需要调用 run() 方法触发
   */
  manual?: boolean;
  /**
   * 重试配置
   * 启用后会在请求失败时自动重试
   */
  retry?: RetryEngineConfig;
}

/**
 * OpenAI 兼容的请求参数
 */
export interface OpenAIRequestParams {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
  n?: number;
  user?: string;
  /** 工具定义列表 */
  tools?: OpenAITool[];
  /** 工具选择策略 */
  tool_choice?:
    | 'none'
    | 'auto'
    | 'required'
    | { type: 'function'; function: { name: string } };
  [key: string]: unknown;
}

/**
 * OpenAI 工具定义
 */
export interface OpenAITool {
  type: 'function';
  function: OpenAIFunctionDefinition;
}

/**
 * OpenAI 函数定义
 */
export interface OpenAIFunctionDefinition {
  /** 函数名称 */
  name: string;
  /** 函数描述 */
  description?: string;
  /** 参数 JSON Schema */
  parameters?: {
    type: 'object';
    properties?: Record<
      string,
      {
        type: string;
        description?: string;
        enum?: string[];
        [key: string]: unknown;
      }
    >;
    required?: string[];
    [key: string]: unknown;
  };
}

/**
 * OpenAI 流式响应的 Delta
 */
export interface OpenAIDelta {
  role?: string;
  content?: string;
  function_call?: {
    name?: string;
    arguments?: string;
  };
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

/**
 * OpenAI 流式响应的 Choice
 */
export interface OpenAIStreamChoice {
  index: number;
  delta: OpenAIDelta;
  finish_reason: string | null;
}

/**
 * OpenAI 流式响应格式
 */
export interface OpenAIStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIStreamChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Provider 回调函数
 */
export interface ProviderCallbacks {
  /** 接收到数据更新 */
  onUpdate?: (content: string, responseHeaders?: Headers) => void;
  /** 请求成功完成 */
  onSuccess?: (content: string, responseHeaders?: Headers) => void;
  /** 发生错误 */
  onError?: (error: Error, errorInfo?: unknown) => void;
}

/**
 * Provider 状态
 */
export interface ProviderState {
  /** 是否正在请求 */
  isRequesting: boolean;
  /** 当前内容 */
  content: string;
  /** 错误信息 */
  error?: Error;
}

/**
 * Provider 全局配置（可选项）
 */
export type ProviderGlobalConfig = Pick<
  ProviderConfig,
  'headers' | 'timeout' | 'streamTimeout' | 'middlewares' | 'fetch'
>;

// DynamicTransformStream 和 TransformStreamFactoryInfo 已在 ../utils/xstream 中定义
// 需要使用时请从 '@aix/chat-sdk' 或 '../utils/xstream' 导入
export type {
  DynamicTransformStream,
  TransformStreamFactoryInfo,
} from '../utils/xstream';
