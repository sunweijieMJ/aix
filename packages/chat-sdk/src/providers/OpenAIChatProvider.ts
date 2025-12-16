/**
 * @fileoverview OpenAIChatProvider - OpenAI API Provider 实现
 * 支持 OpenAI 及其兼容 API（如 Azure OpenAI、OneAPI 等）
 */

import type { ChatMessage, OpenAIToolCall } from '../types';
import type { SSEOutput } from '../utils/stream';
import { AbstractChatProvider } from './AbstractChatProvider';
import type {
  OpenAIRequestParams,
  OpenAIStreamResponse,
  OpenAITool,
  ProviderConfig,
  TransformInfo,
} from './types';
import { getOriginContent } from './types';
import {
  buildOpenAIParams,
  toOpenAIMessages,
  parseSSEData,
  extractDeltaContent,
} from './utils';

/**
 * OpenAI Provider 配置
 */
export interface OpenAIProviderConfig extends ProviderConfig {
  /** 模型名称，默认 'gpt-3.5-turbo' */
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
  /** 工具定义列表 */
  tools?: OpenAITool[];
  /** 工具选择策略 */
  toolChoice?:
    | 'none'
    | 'auto'
    | 'required'
    | { type: 'function'; function: { name: string } };
}

/**
 * OpenAI 响应结果（包含 tool_calls）
 */
export interface OpenAIResponseResult {
  /** 响应内容 */
  content: string;
  /** 工具调用列表 */
  toolCalls?: OpenAIToolCall[];
}

/**
 * OpenAI Chat Provider
 *
 * 支持 OpenAI API 及其兼容实现
 *
 * @example 基础用法
 * ```ts
 * const provider = new OpenAIChatProvider({
 *   baseURL: 'https://api.openai.com/v1/chat/completions',
 *   apiKey: 'sk-xxx',
 *   model: 'gpt-4',
 * });
 *
 * await provider.sendMessage(messages, {
 *   onUpdate: (content) => console.log(content),
 *   onSuccess: (content) => console.log('Done:', content),
 * });
 * ```
 *
 * @example 使用工具
 * ```ts
 * const provider = new OpenAIChatProvider({
 *   baseURL: 'https://api.openai.com/v1/chat/completions',
 *   apiKey: 'sk-xxx',
 *   model: 'gpt-4',
 *   tools: [{
 *     type: 'function',
 *     function: {
 *       name: 'get_weather',
 *       description: '获取天气信息',
 *       parameters: {
 *         type: 'object',
 *         properties: {
 *           location: { type: 'string', description: '城市名称' }
 *         },
 *         required: ['location']
 *       }
 *     }
 *   }]
 * });
 * ```
 */
export class OpenAIChatProvider extends AbstractChatProvider<
  ChatMessage,
  OpenAIRequestParams,
  SSEOutput
> {
  private openaiConfig: OpenAIProviderConfig;

  /** 当前响应的 tool_calls（流式累积） */
  private currentToolCalls: Map<number, OpenAIToolCall> = new Map();

  constructor(config: OpenAIProviderConfig) {
    super(config);
    this.openaiConfig = {
      model: 'gpt-3.5-turbo',
      ...config,
    };
  }

  /**
   * 转换请求参数
   */
  transformParams(
    messages: ChatMessage[],
    options?: Record<string, unknown>,
  ): OpenAIRequestParams {
    const params = buildOpenAIParams(
      { ...this.openaiConfig, model: this.openaiConfig.model! },
      toOpenAIMessages(messages),
      this.config.stream ?? true,
      options,
    );

    // 添加工具配置
    if (this.openaiConfig.tools?.length) {
      params.tools = this.openaiConfig.tools;
      if (this.openaiConfig.toolChoice) {
        params.tool_choice = this.openaiConfig.toolChoice;
      }
    }

    return params;
  }

  /**
   * 转换本地消息
   */
  transformLocalMessage(input: Partial<OpenAIRequestParams>): ChatMessage[] {
    const messages = input.messages || [];
    return messages.map((msg, index) => ({
      id: `local_${Date.now()}_${index}`,
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : '',
      createAt: Date.now(),
      updateAt: Date.now(),
      status: 'success' as const,
    }));
  }

  /**
   * 转换响应消息
   */
  transformMessage(info: TransformInfo<SSEOutput>): string {
    const { chunk, status } = info;
    const originContent = getOriginContent(info);

    // 成功状态，返回完整内容
    if (status === 'success') {
      return originContent;
    }

    // 处理流式更新
    if (chunk?.data) {
      const data = parseSSEData<OpenAIStreamResponse>(chunk.data);
      if (data) {
        // 处理文本内容
        const content = extractDeltaContent(data);

        // 处理 tool_calls
        const delta = data.choices?.[0]?.delta;
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = this.currentToolCalls.get(tc.index);
            if (existing) {
              // 累积 arguments
              if (tc.function?.arguments) {
                existing.function.arguments += tc.function.arguments;
              }
            } else if (tc.id && tc.function?.name) {
              // 新的 tool_call
              this.currentToolCalls.set(tc.index, {
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments || '',
                },
              });
            }
          }
        }

        if (content) {
          return originContent + content;
        }
      }
    }

    return originContent;
  }

  /**
   * 获取当前累积的 tool_calls
   */
  getToolCalls(): OpenAIToolCall[] {
    return Array.from(this.currentToolCalls.values());
  }

  /**
   * 清理 tool_calls 状态
   */
  clearToolCalls(): void {
    this.currentToolCalls.clear();
  }

  /**
   * 重置请求状态
   * 在每次请求开始时清理 tool_calls
   */
  protected override resetRequestState(): void {
    this.clearToolCalls();
  }
}

/**
 * 创建 OpenAI Provider 实例
 */
export function createOpenAIProvider(
  config: OpenAIProviderConfig,
): OpenAIChatProvider {
  return new OpenAIChatProvider(config);
}
