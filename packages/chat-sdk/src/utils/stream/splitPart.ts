/**
 * @fileoverview splitPart - SSE 解析转换器
 * 将事件文本转换为结构化的 SSE 对象
 */

import { isValidString } from './helpers';
import { DEFAULT_SEPARATORS, type SSEOutput } from './types';

/**
 * 创建 SSE 解析转换流
 *
 * 将事件文本块解析为结构化的 SSE 对象。
 * 支持 SSE 标准的所有字段：data, event, id, retry
 *
 * @param config 分隔符配置
 * @returns TransformStream<string, SSEOutput>
 *
 * @example
 * 输入：
 * "event: delta\ndata: {"content": "hello"}"
 *
 * 输出：
 * { event: "delta", data: '{"content": "hello"}' }
 *
 * @link https://developer.mozilla.org/en-US/docs/Web/API/EventSource
 */
export function splitPart(config?: {
  partSeparator?: string;
  kvSeparator?: string;
}): TransformStream<string, SSEOutput> {
  const partSeparator =
    config?.partSeparator ?? DEFAULT_SEPARATORS.partSeparator;
  const kvSeparator = config?.kvSeparator ?? DEFAULT_SEPARATORS.kvSeparator;

  return new TransformStream<string, SSEOutput>({
    transform(
      chunk: string,
      controller: TransformStreamDefaultController<SSEOutput>,
    ) {
      // 按行分割
      const lines = chunk.split(partSeparator);

      // 构建 SSE 对象
      const sseEvent = lines.reduce<SSEOutput>((acc, line) => {
        // 找到第一个冒号的位置
        const separatorIndex = line.indexOf(kvSeparator);

        // 没有冒号，跳过（可能是空行或格式错误）
        if (separatorIndex === -1) {
          return acc;
        }

        // 提取 key
        const key = line.slice(0, separatorIndex);

        // 以冒号开头的是注释行，跳过
        if (!isValidString(key)) {
          return acc;
        }

        // 提取 value（去除冒号后的第一个空格，如果有的话）
        let value = line.slice(separatorIndex + 1);
        if (value.startsWith(' ')) {
          value = value.slice(1);
        }

        return { ...acc, [key]: value };
      }, {});

      // 只有非空对象才入队
      if (Object.keys(sseEvent).length > 0) {
        controller.enqueue(sseEvent);
      }
    },
  });
}

/**
 * 创建自定义的 SSE 解析转换流
 *
 * @param config 分隔符配置
 * @returns TransformStream<string, SSEOutput>
 */
export function createSplitPart(config?: {
  partSeparator?: string;
  kvSeparator?: string;
}): TransformStream<string, SSEOutput> {
  return splitPart(config);
}
