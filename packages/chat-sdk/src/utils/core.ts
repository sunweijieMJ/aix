/**
 * @fileoverview Utils 核心模块
 * 轻量级工具函数
 * @module @aix/chat-sdk/utils/core
 */

// 错误检测
export {
  detectErrorType,
  isRetryable,
  shouldRetryError,
  isNetworkError,
  isTimeoutError,
  isAuthError,
  isValidationError,
  isServerError,
  isAPIError,
  isAbortError,
} from './error-detection';

// 流式数据处理（包含 TransformStream 管道和 XStreamClient）
export * from './xstream';

// 日志工具
export {
  logger,
  configureLogger,
  getLoggerConfig,
  silentMode,
  enableLogs,
  LogLevel,
  type LoggerConfig,
  type LogHandler,
} from './logger';

// 唯一 ID 生成
export { uid } from './uid';
