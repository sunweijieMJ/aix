/**
 * @fileoverview XStream 类型定义
 * 流式数据处理相关类型
 */

/**
 * SSE 标准字段
 * @link https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#fields
 */
export type SSEFields = 'data' | 'event' | 'id' | 'retry';

/**
 * SSE 输出格式
 * @example
 * { event: 'delta', data: '{"content": "Hello"}' }
 */
export type SSEOutput = Partial<Record<SSEFields, string>>;

/**
 * JSON 输出格式（用于非流式响应）
 */
export interface JSONOutput extends Partial<Record<SSEFields, string>> {
  success?: boolean;
  message?: string;
  name?: string;
}

/**
 * 扩展的 ReadableStream，支持异步迭代
 */
export type XReadableStream<T = SSEOutput> = ReadableStream<T> &
  AsyncIterable<T>;

/**
 * XStream 配置选项
 */
export interface XStreamOptions<Output = SSEOutput> {
  /**
   * 二进制可读流
   * @link https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream
   */
  readableStream: ReadableStream<Uint8Array>;

  /**
   * 自定义转换流，用于适配不同的数据格式
   * 如果不提供，默认使用 SSE 解析
   * @link https://developer.mozilla.org/en-US/docs/Web/API/TransformStream
   */
  transformStream?: TransformStream<string, Output>;
}

/**
 * 流式请求配置
 */
export interface StreamRequestOptions {
  /** 请求 URL */
  url: string;
  /** 请求方法 */
  method?: 'GET' | 'POST';
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求体 */
  body?: Record<string, unknown> | string | null;
  /** 请求超时（毫秒） */
  timeout?: number;
  /** 流超时（相邻两个数据块之间的最大间隔，毫秒） */
  streamTimeout?: number;
  /** AbortSignal 用于取消请求 */
  signal?: AbortSignal;
}

/**
 * 流式请求回调
 */
export interface StreamRequestCallbacks<Output = SSEOutput> {
  /** 接收到数据块 */
  onChunk?: (chunk: Output, responseHeaders?: Headers) => void;
  /** 请求成功完成 */
  onSuccess?: (chunks: Output[], responseHeaders?: Headers) => void;
  /** 发生错误 */
  onError?: (error: Error, errorInfo?: unknown) => void;
}

/**
 * 分隔符配置
 */
export interface SplitConfig {
  /** 事件分隔符，默认 '\n\n' */
  streamSeparator?: string;
  /** 行分隔符，默认 '\n' */
  partSeparator?: string;
  /** 键值分隔符，默认 ':' */
  kvSeparator?: string;
}

/**
 * 默认分隔符
 */
export const DEFAULT_SEPARATORS: Required<SplitConfig> = {
  streamSeparator: '\n\n',
  partSeparator: '\n',
  kvSeparator: ':',
};
