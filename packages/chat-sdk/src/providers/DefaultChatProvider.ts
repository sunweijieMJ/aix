/**
 * @fileoverview DefaultChatProvider - 默认 Provider 实现
 * 提供最简化的实现，适用于自定义场景
 */

import type { ChatMessage } from '../types';
import { toStringContent } from '../types/guards';
import type { SSEOutput } from '../utils/stream';
import { AbstractChatProvider } from './AbstractChatProvider';
import type { ProviderConfig, TransformInfo } from './types';
import { getOriginContent } from './types';

/**
 * 默认 Provider 配置
 */
export interface DefaultProviderConfig extends ProviderConfig {
  /** 自定义参数转换函数 */
  transformParams?: (messages: ChatMessage[]) => Record<string, unknown>;
  /** 自定义响应解析函数 */
  parseResponse?: (chunk: SSEOutput) => string;
}

/**
 * 默认 Chat Provider
 *
 * 提供最简化的实现，适用于需要完全自定义的场景
 *
 * @example
 * ```ts
 * const provider = new DefaultChatProvider({
 *   baseURL: '/api/chat',
 *   transformParams: (messages) => ({
 *     messages: messages.map(m => ({ role: m.role, content: m.content })),
 *   }),
 *   parseResponse: (chunk) => chunk.data || '',
 * });
 * ```
 */
export class DefaultChatProvider extends AbstractChatProvider<
  ChatMessage,
  Record<string, unknown>,
  SSEOutput
> {
  private defaultConfig: DefaultProviderConfig;

  constructor(config: DefaultProviderConfig) {
    super(config);
    this.defaultConfig = config;
  }

  /**
   * 转换请求参数
   */
  transformParams(
    messages: ChatMessage[],
    options?: Record<string, unknown>,
  ): Record<string, unknown> {
    // 使用自定义转换函数
    if (this.defaultConfig.transformParams) {
      return this.defaultConfig.transformParams(messages);
    }

    // 默认转换：简单映射消息
    return {
      messages: messages.map((msg) => ({
        role: msg.role,
        content: toStringContent(msg.content),
      })),
      stream: this.config.stream ?? true,
      ...options,
    };
  }

  /**
   * 转换本地消息
   */
  transformLocalMessage(
    input: Partial<Record<string, unknown>>,
  ): ChatMessage[] {
    const rawMessages = (input.messages ?? []) as Array<{
      role: string;
      content: string;
    }>;

    return rawMessages.map((msg, index) => ({
      id: `local_${Date.now()}_${index}`,
      role: msg.role as ChatMessage['role'],
      content: msg.content,
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

    // 使用自定义解析函数
    if (chunk && this.defaultConfig.parseResponse) {
      const content = this.defaultConfig.parseResponse(chunk);
      return originContent + content;
    }

    // 默认解析：直接取 data 字段
    if (chunk?.data) {
      const dataStr = chunk.data.trim();
      if (dataStr === '[DONE]') {
        return originContent;
      }
      return originContent + dataStr;
    }

    return originContent;
  }
}

/**
 * 创建默认 Provider 实例
 */
export function createDefaultProvider(
  config: DefaultProviderConfig,
): DefaultChatProvider {
  return new DefaultChatProvider(config);
}
