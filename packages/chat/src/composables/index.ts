/**
 * @fileoverview Composables 统一导出
 */

// ========== 核心 Composables ==========
export { useXChat } from './useXChat';
export { useXAgent } from './useXAgent';

// ========== 全局配置 ==========
export {
  useGlobalConfig,
  useComponentConfig,
  useMergedConfig,
} from './useGlobalConfig';

// ========== 多会话管理 ==========
export { useChatStore, tryUseChatStore } from './useChatStore';

// ========== 辅助功能 ==========
export { useRetry, retryFetch } from './useRetry';
export { useErrorHandler } from './useErrorHandler';
export { useFileUpload, FileType } from './useFileUpload';
export { useSpeechInput } from './useSpeechInput';
// 注意: ErrorType, ErrorLevel, ErrorRecord, ErrorHandlerConfig 请从 @aix/chat-sdk 导入

// ========== 类型导出 ==========
export type { RetryConfig, RetryState, RetryResult } from './useRetry';
export type { ErrorHandlerResult } from './useErrorHandler';
export type {
  UploadedFile,
  UploadConfig,
  UseFileUploadReturn,
} from './useFileUpload';
export type {
  SpeechConfig,
  UseSpeechInputOptions,
  UseSpeechInputReturn,
} from './useSpeechInput';
