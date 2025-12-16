/**
 * @fileoverview Providers 模块统一导出
 * 聊天服务商抽象层
 */

import { AgentRunner } from '../core/AgentRunner';
import type { ChatMessage, OpenAIMessage } from '../types';
import type { AgentCallbacks } from '../types';
import type { AbstractChatProvider } from './AbstractChatProvider';
import { _injectGlobalConfigGetter } from './AbstractChatProvider';
import { DefaultChatProvider } from './DefaultChatProvider';
import type { DefaultProviderConfig } from './DefaultChatProvider';
import type { OpenAIProviderConfig } from './OpenAIChatProvider';
import { OpenAIChatProvider } from './OpenAIChatProvider';
import type { ProviderGlobalConfig } from './types';
import type { ProviderConfig } from './types';

// 类型导出
export type {
  OpenAIDelta,
  OpenAIRequestParams,
  OpenAIStreamChoice,
  OpenAIStreamResponse,
  ProviderCallbacks,
  ProviderConfig,
  ProviderGlobalConfig,
  ProviderMessageStatus,
  ProviderState,
  RequestMiddleware,
  RequestMiddlewares,
  TransformInfo,
  OpenAITool,
  OpenAIFunctionDefinition,
} from './types';

// OpenAIMessage 从 types 模块导出（避免重复定义）
export type { OpenAIMessage };

// 辅助函数
export { getOriginContent } from './types';

// ==================== 全局配置 ====================

/**
 * Provider 全局配置
 */
const globalProviderConfig: ProviderGlobalConfig = {
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * 设置 Provider 全局配置
 *
 * 配置将被所有新创建的 Provider 实例继承
 *
 * @example
 * ```ts
 * // 设置全局请求头
 * setProviderGlobalConfig({
 *   headers: {
 *     'X-Custom-Header': 'value',
 *   },
 *   timeout: 30000,
 * });
 *
 * // 设置全局中间件
 * setProviderGlobalConfig({
 *   middlewares: {
 *     onRequest: async (url, options) => {
 *       const headers = new Headers(options.headers);
 *       headers.set('Authorization', `Bearer ${getToken()}`);
 *       return [url, { ...options, headers }];
 *     },
 *   },
 * });
 * ```
 */
export function setProviderGlobalConfig(
  config: Partial<ProviderGlobalConfig>,
): void {
  Object.assign(globalProviderConfig, config);
}

/**
 * 获取当前 Provider 全局配置
 */
export function getProviderGlobalConfig(): ProviderGlobalConfig {
  return { ...globalProviderConfig };
}

/**
 * 重置 Provider 全局配置为默认值
 */
export function resetProviderGlobalConfig(): void {
  globalProviderConfig.headers = { 'Content-Type': 'application/json' };
  globalProviderConfig.timeout = undefined;
  globalProviderConfig.streamTimeout = undefined;
  globalProviderConfig.middlewares = undefined;
  globalProviderConfig.fetch = undefined;
}

// 抽象基类
export { AbstractChatProvider } from './AbstractChatProvider';

// 注入全局配置获取函数
_injectGlobalConfigGetter(getProviderGlobalConfig);

// OpenAI Provider
export type { OpenAIProviderConfig } from './OpenAIChatProvider';
export { createOpenAIProvider, OpenAIChatProvider } from './OpenAIChatProvider';

// 默认 Provider
export type { DefaultProviderConfig } from './DefaultChatProvider';
export {
  createDefaultProvider,
  DefaultChatProvider,
} from './DefaultChatProvider';

// Provider 工具函数
export {
  buildOpenAIParams,
  executeRequestMiddlewares,
  executeResponseMiddlewares,
  extractDeltaContent,
  mergeMiddlewares,
  normalizeMiddlewares,
  parseSSEData,
  toOpenAIMessages,
  toOpenAIContentParts,
  type OpenAICompatibleParams,
} from './utils';

// ==================== Provider 注册表 ====================

/**
 * 支持的 Provider 类型
 */
export type ProviderType = 'openai' | 'default' | string;

/**
 * Provider 构造器类型
 * 使用 any 作为配置类型以支持注册表模式
 */
export type ProviderConstructor = new (
  config: any,
) => AbstractChatProvider<ChatMessage, Record<string, unknown>, unknown>;

/**
 * Provider 注册表
 * 用于注册和创建不同类型的 Provider 实例
 */
class ProviderRegistryClass {
  private providers: Map<string, ProviderConstructor> = new Map();

  constructor() {
    // 注册内置 Provider
    this.register('openai', OpenAIChatProvider);
    this.register('default', DefaultChatProvider);
  }

  /**
   * 注册 Provider
   * @param name Provider 名称
   * @param constructor Provider 构造器
   */
  register(name: string, constructor: ProviderConstructor): void {
    this.providers.set(name, constructor);
  }

  /**
   * 获取已注册的 Provider 构造器
   * @param name Provider 名称
   */
  get(name: string): ProviderConstructor | undefined {
    return this.providers.get(name);
  }

  /**
   * 检查是否已注册
   * @param name Provider 名称
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * 获取所有已注册的 Provider 名称
   */
  list(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 创建 Provider 实例
   * @param name Provider 名称
   * @param config Provider 配置
   */
  create(name: 'openai', config: OpenAIProviderConfig): OpenAIChatProvider;
  create(name: 'default', config: DefaultProviderConfig): DefaultChatProvider;
  create(
    name: string,
    config: ProviderConfig,
  ): AbstractChatProvider<ChatMessage, Record<string, unknown>, unknown>;

  create(
    name: string,
    config: ProviderConfig,
  ): AbstractChatProvider<ChatMessage, Record<string, unknown>, unknown> {
    const Constructor = this.providers.get(name);
    if (!Constructor) {
      throw new Error(
        `[ProviderRegistry] Unknown provider: ${name}. Available: ${this.list().join(', ')}`,
      );
    }
    return new Constructor(config);
  }
}

/**
 * Provider 注册表单例
 */
export const ProviderRegistry = new ProviderRegistryClass();

/**
 * 创建 Provider 实例（便捷函数）
 * @param type Provider 类型
 * @param config Provider 配置
 */
export function createProvider(
  type: 'openai',
  config: OpenAIProviderConfig,
): OpenAIChatProvider;
export function createProvider(
  type: 'default',
  config: DefaultProviderConfig,
): DefaultChatProvider;
export function createProvider(
  type: string,
  config: ProviderConfig,
): AbstractChatProvider<ChatMessage, Record<string, unknown>, unknown>;
export function createProvider(
  type: string,
  config: ProviderConfig,
): AbstractChatProvider<ChatMessage, Record<string, unknown>, unknown> {
  return ProviderRegistry.create(type, config);
}

// ==================== Provider 适配器 ====================

/**
 * 从 Provider 创建 AgentRunner
 *
 * 将 AbstractChatProvider 适配为 AgentRunner，便于与 ChatStore 集成
 *
 * @remarks
 * 此函数使用类型断言将 ChatMessage[] 转换为 Provider 期望的消息类型。
 * 这是必要的，因为 Provider 可能使用自定义消息格式（如 OpenAI 格式）。
 * Provider 的 transformParams 方法负责将消息转换为正确的 API 格式。
 *
 * @example
 * ```ts
 * const provider = new OpenAIChatProvider({
 *   baseURL: 'https://api.openai.com/v1/chat/completions',
 *   apiKey: 'sk-xxx',
 *   model: 'gpt-4',
 * });
 *
 * const agent = createAgentFromProvider(provider);
 * const store = new ChatStore({ agent });
 *
 * await store.sendMessage('Hello');
 * ```
 */
export function createAgentFromProvider(
  provider: AbstractChatProvider<ChatMessage, Record<string, unknown>, unknown>,
  options?: { model?: string; timeout?: number },
): AgentRunner {
  return new AgentRunner({
    request: async (info, callbacks) => {
      await provider.sendMessage(info.messages, {
        onUpdate: callbacks.onUpdate,
        onSuccess: callbacks.onSuccess,
        onError: callbacks.onError,
      });
    },
    model: options?.model,
    timeout: options?.timeout,
  });
}

// ==================== 请求适配器工厂 ====================

/**
 * 请求适配器函数类型
 */
export type RequestAdapterFunction = (
  messages: ChatMessage[],
  callbacks: AgentCallbacks,
) => Promise<void>;

/**
 * 请求适配器选项
 */
export interface RequestAdapterOptions {
  /** 额外的请求选项 */
  requestOptions?: Record<string, unknown>;
}

/**
 * 创建请求适配器
 *
 * 将 Provider 封装为统一的请求适配器函数，便于在 Vue 组件中使用
 *
 * @example
 * ```ts
 * const provider = new OpenAIChatProvider({
 *   baseURL: 'https://api.openai.com/v1/chat/completions',
 *   apiKey: 'sk-xxx',
 *   model: 'gpt-4',
 * });
 *
 * const requestAdapter = createRequestAdapter(provider);
 *
 * // 在 Vue 组件中使用
 * await requestAdapter(messages, {
 *   onUpdate: (content) => updateMessage(content),
 *   onSuccess: (content) => completeMessage(content),
 *   onError: (error) => handleError(error),
 * });
 * ```
 */
export function createRequestAdapter(
  provider: AbstractChatProvider<ChatMessage, Record<string, unknown>, unknown>,
  options?: RequestAdapterOptions,
): RequestAdapterFunction {
  return async (messages: ChatMessage[], callbacks: AgentCallbacks) => {
    await provider.sendMessage(
      messages,
      {
        onUpdate: callbacks.onUpdate,
        onSuccess: callbacks.onSuccess,
        onError: callbacks.onError,
      },
      options?.requestOptions,
    );
  };
}
