/**
 * @fileoverview XStream - 流式数据处理工具
 * 基于 TransformStream 管道的流式响应处理
 *
 * @example 基础 SSE 解析
 * ```ts
 * const response = await fetch('/api/chat');
 * const stream = XStream({ readableStream: response.body! });
 *
 * for await (const event of stream) {
 *   console.log(event.data);
 * }
 * ```
 *
 * @example 便捷 API
 * ```ts
 * await streamRequest('/api/chat', {
 *   body: { message: 'Hello' },
 *   onChunk: (event) => console.log(event.data),
 *   onSuccess: (events) => console.log('Done'),
 *   onError: (error) => console.error(error),
 * });
 * ```
 */

// 重新导出所有 stream 模块的内容
export * from './stream';

// 额外的高级 API
import type { RequestMiddleware, RequestMiddlewares } from '../providers/types';
import {
  normalizeMiddlewares,
  executeRequestMiddlewares,
  executeResponseMiddlewares,
} from '../providers/utils';
import type {
  JSONOutput,
  SSEOutput,
  StreamRequestCallbacks,
  XReadableStream,
} from './stream';
import { createSSEStream, XStream as XStreamCore } from './stream';

// 从 providers/types 导入统一的中间件类型
// 从 providers/utils 导入统一的中间件处理函数

// 导出中间件类型别名（保持向后兼容）
export type XStreamMiddleware = RequestMiddleware;
export type XStreamMiddlewares = RequestMiddlewares;

/**
 * 动态转换流类型
 * 可以是静态的 TransformStream，或者根据请求信息动态生成的函数
 */
export type DynamicTransformStream<Output = SSEOutput> =
  | TransformStream<string, Output>
  | ((
      info: TransformStreamFactoryInfo,
    ) => TransformStream<string, Output> | undefined);

/**
 * 转换流工厂信息
 */
export interface TransformStreamFactoryInfo {
  /** 请求 URL */
  baseURL: string;
  /** 响应头 */
  responseHeaders: Headers;
  /** 响应状态码 */
  statusCode: number;
  /** Content-Type */
  contentType: string;
}

/**
 * 支持的响应 MIME 类型
 */
export const SUPPORTED_MIME_TYPES = [
  'text/event-stream',
  'application/json',
  'text/plain',
  'application/octet-stream',
] as const;

/**
 * 流式请求客户端
 *
 * 提供完整的流式请求生命周期管理，包括：
 * - 自动创建 AbortController
 * - 请求超时处理
 * - 流超时处理
 * - 错误处理
 * - 请求/响应中间件
 * - 状态追踪（isRequesting, isTimeout, isStreamTimeout）
 */
export class XStreamClient {
  private abortController: AbortController | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private streamTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // 状态属性
  private _isAborted = false;
  private _isRequesting = false;
  private _isTimeout = false;
  private _isStreamTimeout = false;

  /**
   * 是否正在请求中
   */
  get isRequesting(): boolean {
    return this._isRequesting;
  }

  /**
   * 是否已中止
   */
  get aborted(): boolean {
    return this._isAborted;
  }

  /**
   * 是否请求超时
   */
  get isTimeout(): boolean {
    return this._isTimeout;
  }

  /**
   * 是否流超时
   */
  get isStreamTimeout(): boolean {
    return this._isStreamTimeout;
  }

  /**
   * 发起流式请求
   *
   * 自动根据 Content-Type 选择处理方式：
   * - `text/event-stream`: SSE 流式处理
   * - `application/json`: JSON 单次响应处理
   * - 其他: 使用自定义 transformStream 或默认 SSE 解析
   *
   * @example 使用动态转换流
   * ```ts
   * await client.request({
   *   url: '/api/chat',
   *   transformStream: (info) => {
   *     // 根据 Content-Type 动态选择转换流
   *     if (info.contentType.includes('application/json')) {
   *       return createNDJSONTransformer();
   *     }
   *     return undefined; // 使用默认 SSE 解析
   *   },
   * });
   * ```
   */
  async request<Output = SSEOutput>(options: {
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: Record<string, unknown> | string | null;
    timeout?: number;
    streamTimeout?: number;
    /** 转换流，支持静态或动态生成 */
    transformStream?: DynamicTransformStream<Output>;
    middlewares?: XStreamMiddlewares;
    fetch?: typeof globalThis.fetch;
    onChunk?: (chunk: Output, responseHeaders?: Headers) => void;
    onSuccess?: (chunks: Output[], responseHeaders?: Headers) => void;
    onError?: (error: Error, errorInfo?: unknown) => void;
  }): Promise<Output[]> {
    const {
      url,
      method = 'POST',
      headers = {},
      body,
      timeout,
      streamTimeout,
      transformStream,
      middlewares,
      fetch: customFetch = globalThis.fetch,
      onChunk,
      onSuccess,
      onError,
    } = options;

    this.abortController = new AbortController();
    this._isAborted = false;
    this._isRequesting = true;
    this._isTimeout = false;
    this._isStreamTimeout = false;
    const chunks: Output[] = [];

    // 设置请求超时
    if (timeout && timeout > 0) {
      this.timeoutId = setTimeout(() => {
        this._isTimeout = true;
        this.abort();
        const error = new Error('Request timeout');
        error.name = 'TimeoutError';
        onError?.(error);
      }, timeout);
    }

    try {
      // 构建初始请求参数
      let requestUrl = url;
      let requestInit: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body
          ? typeof body === 'string'
            ? body
            : JSON.stringify(body)
          : undefined,
        signal: this.abortController.signal,
      };

      // 应用请求中间件链
      const normalizedMiddlewares = normalizeMiddlewares(middlewares);
      if (normalizedMiddlewares.length > 0) {
        const result = await executeRequestMiddlewares(
          normalizedMiddlewares,
          requestUrl,
          requestInit,
        );
        requestUrl = result[0];
        requestInit = { ...result[1], signal: this.abortController.signal };
      }

      let response = await customFetch(requestUrl, requestInit);

      // 应用响应中间件链
      if (normalizedMiddlewares.length > 0) {
        response = await executeResponseMiddlewares(
          normalizedMiddlewares,
          response,
        );
      }

      // 清除请求超时
      this.clearTimeout();

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      // 保存响应头用于回调
      const responseHeaders = response.headers;

      // 根据 Content-Type 自动选择处理方式
      const contentType = response.headers.get('content-type') || '';
      const mimeType = (contentType.split(';')[0] ?? '').trim();

      // JSON 响应处理（非流式）
      if (!transformStream && mimeType === 'application/json') {
        return this.handleJSONResponse<Output>(response, {
          onChunk,
          onSuccess,
          onError,
        });
      }

      // 检查是否支持该 Content-Type（仅在没有自定义 transformStream 时检查）
      if (
        !transformStream &&
        mimeType &&
        !SUPPORTED_MIME_TYPES.includes(
          mimeType as (typeof SUPPORTED_MIME_TYPES)[number],
        )
      ) {
        const error = new Error(`Unsupported content-type: ${contentType}`);
        error.name = 'UnsupportedContentTypeError';
        throw error;
      }

      // 解析动态转换流
      let resolvedTransformStream: TransformStream<string, Output> | undefined;
      if (typeof transformStream === 'function') {
        const factoryInfo: TransformStreamFactoryInfo = {
          baseURL: requestUrl,
          responseHeaders: response.headers,
          statusCode: response.status,
          contentType: response.headers.get('content-type') || '',
        };
        resolvedTransformStream = transformStream(factoryInfo);
      } else {
        resolvedTransformStream = transformStream;
      }

      // 创建流
      const stream = XStreamCore<Output>({
        readableStream: response.body,
        transformStream: resolvedTransformStream,
      });

      // 处理流
      for await (const chunk of stream) {
        // 先检查是否已中止
        if (this._isAborted) break;

        // 重置流超时
        this.clearStreamTimeout();

        if (streamTimeout && streamTimeout > 0 && !this._isAborted) {
          this.streamTimeoutId = setTimeout(() => {
            // 检查状态再触发错误
            if (!this._isAborted) {
              this._isStreamTimeout = true;
              this.abort();
              const error = new Error('Stream timeout');
              error.name = 'StreamTimeoutError';
              onError?.(error);
            }
          }, streamTimeout);
        }

        // 再次检查（如果在设置定时器后立即中止，清除定时器）
        if (this._isAborted) {
          this.clearStreamTimeout();
          break;
        }

        chunks.push(chunk);
        onChunk?.(chunk, responseHeaders);
      }

      this.clearStreamTimeout();

      if (!this._isAborted) {
        onSuccess?.(chunks, responseHeaders);
      }

      return chunks;
    } catch (error) {
      this.clearTimeout();
      this.clearStreamTimeout();

      if (error instanceof Error) {
        if (error.name === 'AbortError' && this._isAborted) {
          // 用户主动取消，不报错
          return chunks;
        }
        onError?.(error);
      }

      throw error;
    } finally {
      this._isRequesting = false;
      this.cleanup();
    }
  }

  /**
   * 发起 SSE 请求
   */
  async requestSSE(options: {
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: Record<string, unknown> | string | null;
    timeout?: number;
    streamTimeout?: number;
    onChunk?: (chunk: SSEOutput) => void;
    onSuccess?: (chunks: SSEOutput[]) => void;
    onError?: (error: Error) => void;
  }): Promise<SSEOutput[]> {
    return this.request<SSEOutput>(options);
  }

  /**
   * 中止请求
   */
  abort(): void {
    this._isAborted = true;
    this.abortController?.abort();
    this.clearTimeout();
    this.clearStreamTimeout();
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private clearStreamTimeout(): void {
    if (this.streamTimeoutId) {
      clearTimeout(this.streamTimeoutId);
      this.streamTimeoutId = null;
    }
  }

  private cleanup(): void {
    this.clearTimeout();
    this.clearStreamTimeout();
    this.abortController = null;
    // 状态标志 (_isAborted/_isTimeout/_isStreamTimeout) 在 request() 开始时重置
    // 这里保留最终状态供查询，直到下次请求开始
  }

  /**
   * 处理 JSON 响应（非流式）
   */
  private async handleJSONResponse<Output>(
    response: Response,
    callbacks: {
      onChunk?: (chunk: Output, responseHeaders?: Headers) => void;
      onSuccess?: (chunks: Output[], responseHeaders?: Headers) => void;
      onError?: (error: Error, errorInfo?: unknown) => void;
    },
  ): Promise<Output[]> {
    const { onChunk, onSuccess, onError } = callbacks;
    const responseHeaders = response.headers;

    try {
      const json = (await response.json()) as JSONOutput;

      // 检查业务错误
      if (json?.success === false) {
        const error = new Error(json.message || 'Request failed');
        error.name = json.name || 'APIError';
        onError?.(error, json);
        throw error;
      }

      const chunks = [json as Output];
      onChunk?.(json as Output, responseHeaders);
      onSuccess?.(chunks, responseHeaders);
      return chunks;
    } finally {
      this._isRequesting = false;
      this.cleanup();
    }
  }
}

/**
 * 便捷函数：创建流式请求
 *
 * @example 基础用法
 * ```ts
 * const chunks = await streamRequest('/api/chat', {
 *   body: { message: 'Hello' },
 *   onChunk: (event) => console.log(event.data),
 * });
 * ```
 *
 * @example 动态转换流
 * ```ts
 * const chunks = await streamRequest('/api/chat', {
 *   transformStream: (info) => {
 *     if (info.contentType.includes('application/json')) {
 *       return createNDJSONTransformer();
 *     }
 *     return undefined;
 *   },
 * });
 * ```
 */
export async function streamRequest<Output = SSEOutput>(
  url: string,
  options: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: Record<string, unknown> | string | null;
    timeout?: number;
    streamTimeout?: number;
    /** 转换流，支持静态或动态生成 */
    transformStream?: DynamicTransformStream<Output>;
    onChunk?: (chunk: Output) => void;
    onSuccess?: (chunks: Output[]) => void;
    onError?: (error: Error) => void;
  } = {},
): Promise<Output[]> {
  const client = new XStreamClient();
  return client.request<Output>({ url, ...options });
}

/**
 * 便捷函数：创建 SSE 请求
 *
 * @example
 * ```ts
 * const events = await streamSSE('/api/events', {
 *   onChunk: (event) => console.log(event.data),
 * });
 * ```
 */
export async function streamSSE(
  url: string,
  options: Omit<Parameters<typeof streamRequest>[1], 'transformStream'> = {},
): Promise<SSEOutput[]> {
  return streamRequest<SSEOutput>(url, options);
}

/**
 * 便捷函数：从 Response 创建异步迭代器
 *
 * @example
 * ```ts
 * const response = await fetch('/api/chat');
 * for await (const event of createStreamIterator(response)) {
 *   console.log(event.data);
 * }
 * ```
 */
export function createStreamIterator(
  response: Response,
): XReadableStream<SSEOutput> {
  return createSSEStream(response);
}

// 导出类型（SSEOutput, StreamRequestCallbacks, XReadableStream 从 ./stream 重新导出）
// DynamicTransformStream 和 TransformStreamFactoryInfo 在本文件定义
// XStreamMiddleware 和 XStreamMiddlewares 用于中间件链式调用（已在上方导出）
export type { SSEOutput, StreamRequestCallbacks, XReadableStream };
