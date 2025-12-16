/**
 * @fileoverview Provider 工具函数
 * 提取各 Provider 实现中的公共逻辑
 */

import type {
  ChatMessage,
  ContentType,
  OpenAIContentPart,
  OpenAIMessage,
} from '../types';
import { toStringContent } from '../types/guards';
import type {
  OpenAIRequestParams,
  RequestMiddleware,
  RequestMiddlewares,
} from './types';

/**
 * 将中间件配置标准化为数组
 */
export function normalizeMiddlewares(
  middlewares?: RequestMiddlewares,
): RequestMiddleware[] {
  if (!middlewares) return [];
  return Array.isArray(middlewares) ? middlewares : [middlewares];
}

/**
 * 合并多个中间件配置
 * 全局中间件在前，实例中间件在后
 */
export function mergeMiddlewares(
  globalMiddlewares?: RequestMiddlewares,
  instanceMiddlewares?: RequestMiddlewares,
): RequestMiddleware[] {
  const global = normalizeMiddlewares(globalMiddlewares);
  const instance = normalizeMiddlewares(instanceMiddlewares);
  return [...global, ...instance];
}

/**
 * 执行中间件链的请求拦截
 * @param middlewares 中间件数组
 * @param url 初始 URL
 * @param options 初始请求选项
 * @returns 处理后的 [url, options]
 */
export async function executeRequestMiddlewares(
  middlewares: RequestMiddleware[],
  url: string,
  options: RequestInit,
): Promise<[string, RequestInit]> {
  let currentUrl = url;
  let currentOptions = options;

  for (const middleware of middlewares) {
    if (middleware.onRequest) {
      const result = await middleware.onRequest(currentUrl, currentOptions);
      currentUrl = result[0];
      currentOptions = result[1];
    }
  }

  return [currentUrl, currentOptions];
}

/**
 * 执行中间件链的响应拦截
 * @param middlewares 中间件数组
 * @param response 初始响应
 * @returns 处理后的响应
 */
export async function executeResponseMiddlewares(
  middlewares: RequestMiddleware[],
  response: Response,
): Promise<Response> {
  let currentResponse = response;

  for (const middleware of middlewares) {
    if (middleware.onResponse) {
      currentResponse = await middleware.onResponse(currentResponse);
    }
  }

  return currentResponse;
}

/**
 * OpenAI 兼容的通用配置参数
 */
export interface OpenAICompatibleParams {
  /** 模型名称 */
  model?: string;
  /** 温度参数 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** Top P 参数 */
  topP?: number;
  /** 频率惩罚 */
  frequencyPenalty?: number;
  /** 存在惩罚 */
  presencePenalty?: number;
  /** 停止词 */
  stop?: string | string[];
}

/**
 * 将 ContentType 数组转换为 OpenAI 多模态内容格式
 */
export function toOpenAIContentParts(
  content: ContentType[],
): OpenAIContentPart[] {
  return content
    .map((item): OpenAIContentPart | null => {
      switch (item.type) {
        case 'text':
          return { type: 'text', text: item.text };
        case 'image_url':
          return {
            type: 'image_url',
            image_url: {
              url: item.image_url.url,
              detail: item.image_url.detail,
            },
          };
        case 'file':
          // 文件类型暂不支持，转换为文本描述
          return { type: 'text', text: `[文件: ${item.file.name}]` };
        default:
          return null;
      }
    })
    .filter((item): item is OpenAIContentPart => item !== null);
}

/**
 * 将 ChatMessage 数组转换为 OpenAI 消息格式
 * 支持多模态内容（文本、图片）
 */
export function toOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
  return messages.map((msg) => {
    const { content, role } = msg;

    // 防御性检查：处理 null/undefined 内容
    if (content == null) {
      return { role, content: '' };
    }

    // 如果是字符串内容，直接使用
    if (typeof content === 'string') {
      return { role, content };
    }

    // 如果是多模态内容数组
    if (Array.isArray(content)) {
      // 空数组返回空字符串
      if (content.length === 0) {
        return { role, content: '' };
      }

      // 检查是否只有文本内容，如果是则简化为字符串
      const hasOnlyText = content.every((item) => item.type === 'text');
      if (hasOnlyText) {
        return { role, content: toStringContent(content) };
      }

      // 多模态内容，转换为 OpenAI 格式
      return { role, content: toOpenAIContentParts(content) };
    }

    // 类型防御：理论上不会到达这里（TypeScript 类型保证）
    return { role, content: '' };
  });
}

/**
 * 构建 OpenAI 兼容的请求参数
 *
 * @param config Provider 配置
 * @param messages OpenAI 格式的消息
 * @param stream 是否启用流式响应
 * @param options 额外选项
 * @returns OpenAI 请求参数
 *
 * @example
 * ```ts
 * const params = buildOpenAIParams(
 *   this.config,
 *   toOpenAIMessages(messages),
 *   this.config.stream ?? true,
 *   options
 * );
 * ```
 */
export function buildOpenAIParams(
  config: OpenAICompatibleParams & { model: string },
  messages: OpenAIMessage[],
  stream: boolean,
  options?: Record<string, unknown>,
): OpenAIRequestParams {
  const params: OpenAIRequestParams = {
    model: config.model,
    messages,
    stream,
  };

  // 使用映射表处理可选参数
  const paramMappings: Array<{
    key: keyof OpenAICompatibleParams;
    targetKey: keyof OpenAIRequestParams;
  }> = [
    { key: 'temperature', targetKey: 'temperature' },
    { key: 'maxTokens', targetKey: 'max_tokens' },
    { key: 'topP', targetKey: 'top_p' },
    { key: 'frequencyPenalty', targetKey: 'frequency_penalty' },
    { key: 'presencePenalty', targetKey: 'presence_penalty' },
    { key: 'stop', targetKey: 'stop' },
  ];

  for (const { key, targetKey } of paramMappings) {
    if (config[key] !== undefined) {
      (params as Record<string, unknown>)[targetKey] = config[key];
    }
  }

  // 合并额外选项
  if (options) {
    Object.assign(params, options);
  }

  return params;
}

/**
 * 解析 SSE 数据字符串
 *
 * @param dataStr SSE data 字段内容
 * @returns 解析后的对象，解析失败返回 null
 */
export function parseSSEData<T>(dataStr: string): T | null {
  const trimmed = dataStr.trim();

  // 检查结束标志
  if (trimmed === '[DONE]') {
    return null;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

/**
 * 从 OpenAI 兼容的流式响应中提取 delta content
 *
 * @param data 流式响应数据
 * @returns delta 内容，如果没有则返回空字符串
 */
export function extractDeltaContent(data: {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
}): string {
  return data.choices?.[0]?.delta?.content ?? '';
}
