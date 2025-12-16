/**
 * @fileoverview useErrorHandler - 全局错误处理
 * 基于 @aix/chat-sdk ErrorHandler 的 Vue 3 响应式封装
 *
 * 注意: ErrorType, ErrorLevel, ErrorRecord, ErrorHandlerConfig
 * 请直接从 @aix/chat-sdk 导入
 */

import {
  createErrorHandler,
  ErrorType,
  ErrorLevel,
  type ErrorRecord,
  type ErrorHandlerConfig,
} from '@aix/chat-sdk';
import { ref, onScopeDispose, type Ref } from 'vue';

/**
 * 错误处理器返回值
 */
export interface ErrorHandlerResult {
  /** 错误记录列表 */
  errors: Ref<ErrorRecord[]>;
  /** 最后一个错误 */
  lastError: Ref<ErrorRecord | null>;
  /** 错误计数 */
  errorCount: Ref<number>;
  /** 处理错误 */
  handleError: (
    error: Error,
    type: ErrorType,
    level?: ErrorLevel,
    context?: Record<string, unknown>,
  ) => void;
  /** 清除错误 */
  clearError: (id: string) => void;
  /** 清除所有错误 */
  clearAllErrors: () => void;
}

/**
 * useErrorHandler - 错误处理 Composable
 *
 * @example
 * ```ts
 * const { handleError, errors } = useErrorHandler({
 *   enableLogging: true,
 *   onError: (record) => {
 *     sendToMonitoring(record);
 *   }
 * });
 *
 * try {
 *   await fetchData();
 * } catch (error) {
 *   handleError(
 *     error as Error,
 *     ErrorType.API,
 *     ErrorLevel.Error,
 *     { url: '/api/chat' }
 *   );
 * }
 * ```
 */
export function useErrorHandler(
  config: ErrorHandlerConfig = {},
): ErrorHandlerResult {
  // 创建 SDK ErrorHandler 实例
  const handler = createErrorHandler(config);

  // Vue 响应式状态
  const errors = ref<ErrorRecord[]>([]);
  const lastError = ref<ErrorRecord | null>(null);
  const errorCount = ref(0);

  // 订阅 ErrorHandler 状态变化
  const unsubscribe = handler.subscribe(() => {
    errors.value = handler.getErrors();
    lastError.value = handler.getLastError();
    errorCount.value = handler.getErrorCount();
  });

  /**
   * 处理错误
   */
  const handleError = (
    error: Error,
    type: ErrorType,
    level: ErrorLevel = ErrorLevel.Error,
    context?: Record<string, unknown>,
  ): void => {
    handler.handleError(error, type, level, context);
  };

  /**
   * 清除指定错误
   */
  const clearError = (id: string) => {
    handler.clearError(id);
  };

  /**
   * 清除所有错误
   */
  const clearAllErrors = () => {
    handler.clearAllErrors();
  };

  // 清理订阅
  onScopeDispose(() => {
    unsubscribe();
  });

  return {
    errors,
    lastError,
    errorCount,
    handleError,
    clearError,
    clearAllErrors,
  };
}
