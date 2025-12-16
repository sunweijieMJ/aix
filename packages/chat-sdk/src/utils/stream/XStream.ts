/**
 * @fileoverview XStream - 流式数据处理核心
 * 基于 TransformStream 管道的流式数据处理
 */

import { splitPart } from './splitPart';
import { splitStream } from './splitStream';
import type { SSEOutput, XReadableStream, XStreamOptions } from './types';

/**
 * 创建 XStream 流处理管道
 *
 * 将 Uint8Array 二进制流转换为结构化的数据流。
 * 默认按 SSE 标准解析，也支持自定义转换器。
 *
 * @param options 配置选项
 * @returns XReadableStream - 支持异步迭代的可读流
 *
 * @example 基础 SSE 解析
 * ```ts
 * const response = await fetch('/api/chat');
 * const stream = XStream({ readableStream: response.body! });
 *
 * for await (const event of stream) {
 *   console.log(event); // { event: 'delta', data: '...' }
 * }
 * ```
 *
 * @example 自定义转换器
 * ```ts
 * const ndjsonTransformer = new TransformStream({
 *   transform(chunk, controller) {
 *     const lines = chunk.split('\n').filter(l => l.trim());
 *     lines.forEach(line => controller.enqueue(JSON.parse(line)));
 *   }
 * });
 *
 * const stream = XStream({
 *   readableStream: response.body!,
 *   transformStream: ndjsonTransformer
 * });
 * ```
 */
export function XStream<Output = SSEOutput>(
  options: XStreamOptions<Output>,
): XReadableStream<Output> {
  const { readableStream, transformStream } = options;

  if (!(readableStream instanceof ReadableStream)) {
    throw new Error(
      '[XStream] options.readableStream must be an instance of ReadableStream',
    );
  }

  // 文本解码器（默认 UTF-8）
  const decoderStream = new TextDecoderStream();

  // 构建管道
  const stream = (
    transformStream
      ? // 自定义转换器：Uint8Array → string → Output
        readableStream
          .pipeThrough(decoderStream as TransformStream<Uint8Array, string>)
          .pipeThrough(transformStream)
      : // 默认 SSE 解析：Uint8Array → string → event parts → SSEOutput
        readableStream
          .pipeThrough(decoderStream as TransformStream<Uint8Array, string>)
          .pipeThrough(splitStream())
          .pipeThrough(splitPart())
  ) as XReadableStream<Output>;

  // 添加异步迭代器支持
  stream[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        if (value !== undefined) {
          yield value;
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  return stream;
}

/**
 * 从 Response 创建 SSE 流
 *
 * @param response Fetch Response 对象
 * @returns XReadableStream<SSEOutput>
 *
 * @example
 * ```ts
 * const response = await fetch('/api/chat');
 * const stream = createSSEStream(response);
 *
 * for await (const event of stream) {
 *   if (event.data === '[DONE]') break;
 *   console.log(event.data);
 * }
 * ```
 */
export function createSSEStream(
  response: Response,
): XReadableStream<SSEOutput> {
  if (!response.body) {
    throw new Error('[XStream] Response body is empty');
  }

  return XStream<SSEOutput>({ readableStream: response.body });
}

/**
 * 从 Response 创建自定义流
 *
 * @param response Fetch Response 对象
 * @param transformer 自定义转换流
 * @returns XReadableStream<T>
 *
 * @example NDJSON 流
 * ```ts
 * const ndjsonTransformer = new TransformStream<string, any>({
 *   transform(chunk, controller) {
 *     chunk.split('\n')
 *       .filter(line => line.trim())
 *       .forEach(line => controller.enqueue(JSON.parse(line)));
 *   }
 * });
 *
 * const stream = createCustomStream(response, ndjsonTransformer);
 * ```
 */
export function createCustomStream<T>(
  response: Response,
  transformer: TransformStream<string, T>,
): XReadableStream<T> {
  if (!response.body) {
    throw new Error('[XStream] Response body is empty');
  }

  return XStream<T>({
    readableStream: response.body,
    transformStream: transformer,
  });
}

/**
 * 创建 NDJSON 转换流
 *
 * @returns TransformStream<string, any>
 */
export function createNDJSONTransformer<T = unknown>(): TransformStream<
  string,
  T
> {
  let buffer = '';

  return new TransformStream<string, T>({
    transform(chunk: string, controller: TransformStreamDefaultController<T>) {
      buffer += chunk;
      const lines = buffer.split('\n');

      // 保留最后一个可能不完整的行
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          try {
            controller.enqueue(JSON.parse(trimmed) as T);
          } catch (e) {
            // 忽略解析失败的行（可能是不完整的 JSON）
            if (process.env.NODE_ENV === 'development') {
              console.debug('[NDJSON] Failed to parse line:', trimmed, e);
            }
          }
        }
      }
    },

    flush(controller: TransformStreamDefaultController<T>) {
      const trimmed = buffer.trim();
      if (trimmed) {
        try {
          controller.enqueue(JSON.parse(trimmed) as T);
        } catch (e) {
          // 忽略解析失败的行（可能是不完整的 JSON）
          if (process.env.NODE_ENV === 'development') {
            console.debug(
              '[NDJSON] Failed to parse remaining buffer:',
              trimmed,
              e,
            );
          }
        }
      }
    },
  });
}

/**
 * 创建 JSON 行转换流（每行一个 JSON 对象）
 * @alias createNDJSONTransformer
 */
export { createNDJSONTransformer as createJSONLinesTransformer };
