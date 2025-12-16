/**
 * @fileoverview Stream 模块统一导出
 * TransformStream 管道式流处理
 */

// 类型导出
export type {
  JSONOutput,
  SplitConfig,
  SSEFields,
  SSEOutput,
  StreamRequestCallbacks,
  StreamRequestOptions,
  XReadableStream,
  XStreamOptions,
} from './types';

export { DEFAULT_SEPARATORS } from './types';

// 公共工具函数
export { isValidString } from './helpers';

// 核心功能导出
export {
  createCustomStream,
  createJSONLinesTransformer,
  createNDJSONTransformer,
  createSSEStream,
  XStream,
} from './XStream';

// 转换器导出
export { createSplitPart, splitPart } from './splitPart';
export { createSplitStream, splitStream } from './splitStream';
