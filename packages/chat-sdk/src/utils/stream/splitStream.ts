/**
 * @fileoverview splitStream - 事件分隔转换器
 * 将连续的字节流分割成完整的事件块
 */

import { isValidString } from './helpers';
import { DEFAULT_SEPARATORS } from './types';

/**
 * 创建事件分隔转换流
 *
 * 将连续的文本流按照事件分隔符（默认 '\n\n'）分割成独立的事件块。
 * 处理跨 chunk 的事件边界问题。
 *
 * @param separator 事件分隔符，默认 '\n\n'
 * @returns TransformStream<string, string>
 *
 * @example
 * 输入流：
 * "event: delta\ndata: hello\n\nevent: delta\ndata: world\n\n"
 *
 * 输出：
 * "event: delta\ndata: hello"
 * "event: delta\ndata: world"
 */
export function splitStream(
  separator: string = DEFAULT_SEPARATORS.streamSeparator,
): TransformStream<string, string> {
  // 缓冲区，存储跨 chunk 的不完整数据
  let buffer = '';

  return new TransformStream<string, string>({
    transform(
      chunk: string,
      controller: TransformStreamDefaultController<string>,
    ) {
      buffer += chunk;

      // 按分隔符分割
      const parts = buffer.split(separator);

      // 入队所有完整的部分（除最后一个可能不完整的）
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (part !== undefined && isValidString(part)) {
          controller.enqueue(part);
        }
      }

      // 保留最后一个可能不完整的部分
      buffer = parts[parts.length - 1] ?? '';
    },

    flush(controller: TransformStreamDefaultController<string>) {
      // 流结束时，入队任何剩余的有效数据
      if (isValidString(buffer)) {
        controller.enqueue(buffer);
      }
    },
  });
}

/**
 * 创建自定义分隔符的事件分隔转换流
 *
 * @param config 分隔符配置
 * @returns TransformStream<string, string>
 */
export function createSplitStream(config?: {
  separator?: string;
}): TransformStream<string, string> {
  return splitStream(config?.separator);
}
