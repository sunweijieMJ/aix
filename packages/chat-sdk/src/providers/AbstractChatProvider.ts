/**
 * @fileoverview AbstractChatProvider - 聊天服务商抽象基类
 * 定义 Provider 的核心接口和基础实现
 */

import { RetryEngine } from '../core/RetryEngine';
import type { BaseMessage, ChatMessage } from '../types';
import type { SSEOutput } from '../utils/stream';
import { XStreamClient } from '../utils/xstream';
import type {
  ProviderCallbacks,
  ProviderConfig,
  ProviderGlobalConfig,
  ProviderState,
  RequestMiddleware,
  TransformInfo,
} from './types';
import { mergeMiddlewares } from './utils';

/** 全局配置引用（延迟导入避免循环依赖） */
let _getGlobalConfig: (() => ProviderGlobalConfig) | null = null;

/**
 * 注入全局配置获取函数（由 index.ts 调用）
 * @internal
 */
export function _injectGlobalConfigGetter(
  getter: () => ProviderGlobalConfig,
): void {
  _getGlobalConfig = getter;
}

/**
 * 聊天服务商抽象基类
 *
 * 所有 Provider 实现都需要继承此类并实现三个抽象方法：
 * - transformParams: 转换请求参数
 * - transformLocalMessage: 转换本地消息
 * - transformMessage: 转换响应内容
 *
 * @example
 * ```ts
 * class MyProvider extends AbstractChatProvider {
 *   transformParams(messages) {
 *     return { model: 'my-model', messages };
 *   }
 *
 *   transformLocalMessage(input) {
 *     return { role: 'user', content: input.content };
 *   }
 *
 *   transformMessage(info) {
 *     return info.chunk?.data || '';
 *   }
 * }
 * ```
 */
export abstract class AbstractChatProvider<
  Message extends BaseMessage = ChatMessage,
  Input extends Record<string, unknown> = Record<string, unknown>,
  Output = SSEOutput,
> {
  /** 配置 */
  protected config: ProviderConfig;

  /** 流式请求客户端 */
  protected client: XStreamClient;

  /** 重试引擎（可选） */
  protected retryEngine: RetryEngine | null = null;

  /** 消息获取函数 */
  protected getMessagesFn: (() => Message[]) | null = null;

  /** 当前状态 */
  protected state: ProviderState = {
    isRequesting: false,
    content: '',
  };

  /** 当前请求的响应头 */
  protected currentResponseHeaders: Headers | undefined;

  /** 状态监听器 */
  protected listeners: Set<(state: ProviderState) => void> = new Set();

  /** 是否为手动模式 */
  protected _manual: boolean = false;

  /** 待执行的请求参数（手动模式使用） */
  protected pendingRequest: {
    messages: Message[];
    callbacks?: ProviderCallbacks;
    options?: Record<string, unknown>;
  } | null = null;

  /** 合并后的中间件数组（支持链式调用） */
  protected middlewares: RequestMiddleware[];

  constructor(config: ProviderConfig) {
    // 合并全局配置
    const globalConfig = _getGlobalConfig?.() ?? {};

    this.config = {
      stream: true,
      // 全局配置优先级较低
      timeout: globalConfig.timeout,
      streamTimeout: globalConfig.streamTimeout,
      fetch: globalConfig.fetch,
      // 实例配置覆盖全局配置
      ...config,
      // 合并 headers（实例配置优先）
      headers: {
        ...globalConfig.headers,
        ...config.headers,
      },
    };

    // 合并中间件（全局中间件在前，实例中间件在后，支持链式调用）
    this.middlewares = mergeMiddlewares(
      globalConfig.middlewares,
      config.middlewares,
    );

    this.client = new XStreamClient();
    this._manual = config.manual ?? false;

    // 初始化重试引擎
    if (config.retry) {
      this.retryEngine = new RetryEngine(config.retry);
    }
  }

  /**
   * 是否为手动模式
   */
  get manual(): boolean {
    return this._manual;
  }

  /**
   * 转换请求参数
   *
   * 将本地消息列表转换为 API 请求参数格式
   *
   * @param messages 消息列表
   * @param options 额外选项
   * @returns API 请求参数
   */
  abstract transformParams(
    messages: Message[],
    options?: Record<string, unknown>,
  ): Input;

  /**
   * 转换本地消息
   *
   * 将请求参数转换为本地消息格式（用于 UI 渲染）
   * 统一返回数组格式，简化调用方处理
   *
   * @param input 请求参数
   * @returns 本地消息数组
   */
  abstract transformLocalMessage(input: Partial<Input>): Message[];

  /**
   * 转换响应消息
   *
   * 将 API 响应转换为文本内容
   *
   * @param info 响应转换信息
   * @returns 文本内容
   */
  abstract transformMessage(info: TransformInfo<Output>): string;

  /**
   * 注入消息获取函数
   *
   * @param fn 获取消息的函数
   */
  injectGetMessages(fn: () => Message[]): void {
    this.getMessagesFn = fn;
  }

  /**
   * 获取消息列表
   */
  getMessages(): Message[] {
    return this.getMessagesFn?.() ?? [];
  }

  /**
   * 发送消息
   *
   * @param messages 消息列表
   * @param callbacks 回调函数
   * @param options 额外选项
   */
  async sendMessage(
    messages: Message[],
    callbacks?: ProviderCallbacks,
    options?: Record<string, unknown>,
  ): Promise<string> {
    // 如果配置了重试引擎，使用重试包装
    if (this.retryEngine) {
      return this.retryEngine.execute(() =>
        this.doSendMessage(messages, callbacks, options),
      );
    }

    return this.doSendMessage(messages, callbacks, options);
  }

  /**
   * 实际发送消息的内部方法
   */
  private async doSendMessage(
    messages: Message[],
    callbacks?: ProviderCallbacks,
    options?: Record<string, unknown>,
  ): Promise<string> {
    // 重置请求相关状态（子类可覆盖）
    this.resetRequestState();

    const params = this.transformParams(messages, options);

    this.state = {
      isRequesting: true,
      content: '',
    };
    this.notifyListeners();

    let fullContent = '';
    // 使用标志位追踪错误是否已处理，避免重复调用 onError
    let errorHandled = false;

    try {
      await this.client.request<Output>({
        url: this.config.baseURL,
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          ...this.config.headers,
        },
        body: params as Record<string, unknown>,
        timeout: this.config.timeout,
        streamTimeout: this.config.streamTimeout,
        transformStream: this.getTransformStream(),
        middlewares: this.middlewares,
        fetch: this.config.fetch,
        onChunk: (chunk, responseHeaders) => {
          // 保存响应头
          this.currentResponseHeaders = responseHeaders;
          const content = this.transformMessage({
            chunk,
            chunks: [],
            status: 'updating',
            originMessage: this.createOriginMessage(fullContent),
            responseHeaders,
          });
          fullContent = content;
          this.state.content = content;
          this.notifyListeners();
          callbacks?.onUpdate?.(content, responseHeaders);
        },
        onSuccess: (allChunks, responseHeaders) => {
          const finalContent = this.transformMessage({
            chunks: allChunks,
            status: 'success',
            originMessage: this.createOriginMessage(fullContent),
            responseHeaders,
          });
          fullContent = finalContent;
          this.state = {
            isRequesting: false,
            content: finalContent,
          };
          this.currentResponseHeaders = responseHeaders;
          this.notifyListeners();
          callbacks?.onSuccess?.(finalContent, responseHeaders);
        },
        onError: (error, errorInfo) => {
          // 标记错误已处理
          errorHandled = true;
          this.state = {
            isRequesting: false,
            content: fullContent,
            error,
          };
          this.notifyListeners();
          callbacks?.onError?.(error, errorInfo);
        },
      });

      return fullContent;
    } catch (error) {
      // 只有在 onError 未被调用时才处理错误
      if (!errorHandled) {
        this.state = {
          isRequesting: false,
          content: fullContent,
          error: error as Error,
        };
        this.notifyListeners();
        callbacks?.onError?.(error as Error);
      }
      throw error;
    }
  }

  /**
   * 中止当前请求
   */
  abort(): void {
    this.client.abort();
    this.state.isRequesting = false;
    this.notifyListeners();
  }

  /**
   * 获取当前状态
   */
  getState(): ProviderState {
    return { ...this.state };
  }

  /**
   * 是否正在请求
   */
  isRequesting(): boolean {
    return this.state.isRequesting;
  }

  /**
   * 获取当前请求的响应头
   */
  getResponseHeaders(): Headers | undefined {
    return this.currentResponseHeaders;
  }

  /**
   * 获取重试状态
   * 仅在配置了 retry 时有效
   */
  getRetryState(): {
    retryCount: number;
    isRetrying: boolean;
    nextDelay: number;
  } | null {
    return this.retryEngine?.getState() ?? null;
  }

  /**
   * 准备请求（手动模式使用）
   *
   * 在手动模式下，调用此方法准备请求参数，然后调用 run() 执行
   *
   * @example
   * ```ts
   * const provider = new OpenAIChatProvider({ manual: true, ... });
   *
   * // 准备请求
   * provider.prepare(messages, callbacks, options);
   *
   * // 稍后执行
   * await provider.run();
   * ```
   *
   * @throws 非手动模式下调用会抛出错误
   */
  prepare(
    messages: Message[],
    callbacks?: ProviderCallbacks,
    options?: Record<string, unknown>,
  ): this {
    if (!this._manual) {
      throw new Error(
        '[Provider] prepare() 仅在手动模式下可用，请使用 sendMessage() 代替或设置 manual: true',
      );
    }
    this.pendingRequest = { messages, callbacks, options };
    return this;
  }

  /**
   * 执行请求（手动模式使用）
   *
   * 执行通过 prepare() 准备的请求，或传入新的参数
   *
   * @param params 可选的请求参数，覆盖 prepare() 设置的参数
   * @returns 响应内容
   *
   * @example
   * ```ts
   * // 方式1：先 prepare 再 run
   * provider.prepare(messages, callbacks);
   * await provider.run();
   *
   * // 方式2：直接 run 并传参
   * await provider.run({ messages, callbacks });
   * ```
   */
  async run(params?: {
    messages?: Message[];
    callbacks?: ProviderCallbacks;
    options?: Record<string, unknown>;
  }): Promise<string> {
    const request = params
      ? {
          messages: params.messages ?? this.pendingRequest?.messages ?? [],
          callbacks: params.callbacks ?? this.pendingRequest?.callbacks,
          options: params.options ?? this.pendingRequest?.options,
        }
      : this.pendingRequest;

    if (!request || !request.messages?.length) {
      throw new Error(
        '[Provider] 没有待执行的请求，请先调用 prepare() 或传入参数',
      );
    }

    // 清除待执行请求
    this.pendingRequest = null;

    return this.sendMessage(
      request.messages,
      request.callbacks,
      request.options,
    );
  }

  /**
   * 订阅状态变化
   *
   * @param listener 监听函数
   * @returns 取消订阅函数
   */
  subscribe(listener: (state: ProviderState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 获取认证头
   */
  protected getAuthHeaders(): Record<string, string> {
    if (this.config.apiKey) {
      return {
        Authorization: `Bearer ${this.config.apiKey}`,
      };
    }
    return {};
  }

  /**
   * 获取自定义转换流
   *
   * 子类可以覆盖此方法来提供自定义的流转换器
   */
  protected getTransformStream(): TransformStream<string, Output> | undefined {
    return undefined;
  }

  /**
   * 通知所有监听器
   */
  protected notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  /**
   * 创建用于 transformMessage 的 originMessage
   * 返回包含 content 的简单对象，子类可以覆盖此方法提供更完整的消息结构
   *
   * @remarks
   * 此方法创建的消息仅用于 transformMessage 中的内容累积，
   * 不需要包含完整的消息字段（如 id, createAt 等）
   */
  protected createOriginMessage(content: string): { content: string } {
    return { content };
  }

  /**
   * 重置请求相关状态
   *
   * 在每次请求开始时调用，子类可以覆盖此方法来清理自己的状态
   * 例如：OpenAIChatProvider 清理 currentToolCalls
   */
  protected resetRequestState(): void {
    // 基类无需清理，子类可覆盖
  }
}
