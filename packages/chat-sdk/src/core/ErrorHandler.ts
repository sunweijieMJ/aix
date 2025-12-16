/**
 * @fileoverview ErrorHandler - 框架无关的错误处理器
 * 从 useErrorHandler composable 提取的核心逻辑
 */

import type { ErrorRecord, ErrorHandlerConfig } from '../types';
import { ErrorType, ErrorLevel } from '../types';
import { logger, uid } from '../utils';
import { Observable } from './Observable';

/**
 * ErrorHandler 状态
 */
export interface ErrorHandlerState {
  /** 错误列表 */
  errors: ErrorRecord[];
  /** 最后一个错误 */
  lastError: ErrorRecord | null;
  /** 错误计数 */
  errorCount: number;
}

/**
 * ErrorHandler - 错误处理核心类
 *
 * 继承自 Observable，提供状态订阅能力
 *
 * @example
 * ```ts
 * const handler = new ErrorHandler({
 *   enableLogging: true,
 *   onError: (record) => sendToMonitoring(record),
 * });
 *
 * try {
 *   await fetchData();
 * } catch (error) {
 *   handler.handleError(error as Error, 'api', 'error', { url: '/api/chat' });
 * }
 *
 * // 订阅状态变化
 * handler.subscribe((state) => {
 *   console.log('Errors:', state.errors);
 * });
 * ```
 */
export class ErrorHandler extends Observable<ErrorHandlerState> {
  private config: Required<ErrorHandlerConfig>;

  constructor(config: ErrorHandlerConfig = {}) {
    super({
      errors: [],
      lastError: null,
      errorCount: 0,
    });

    this.config = {
      enableLogging: config.enableLogging ?? true,
      maxRecords: config.maxRecords ?? 50,
      onError: config.onError ?? (() => {}),
    };
  }

  /**
   * 处理错误
   */
  handleError(
    error: Error,
    type: ErrorType,
    level: ErrorLevel = ErrorLevel.Error,
    context?: Record<string, unknown>,
  ): ErrorRecord {
    const record: ErrorRecord = {
      id: uid(),
      type,
      level,
      message: error.message,
      error,
      timestamp: Date.now(),
      context,
      handled: false,
    };

    // 添加到错误列表
    const errors = [...this.state.errors, record];

    // 限制记录数量
    if (errors.length > this.config.maxRecords) {
      errors.shift();
    }

    this.updateState({
      errors,
      lastError: record,
      errorCount: this.state.errorCount + 1,
    });

    // 记录日志
    if (this.config.enableLogging) {
      const message = `[ErrorHandler] [${level.toUpperCase()}] [${type}] ${error.message} ${context || ''}`;
      if (level === ErrorLevel.Fatal || level === ErrorLevel.Error) {
        logger.error(message);
      } else {
        logger.warn(message);
      }
    }

    // 触发回调
    this.config.onError(record);

    return record;
  }

  /**
   * 获取所有错误记录
   */
  getErrors(): ErrorRecord[] {
    return [...this.state.errors];
  }

  /**
   * 获取最后一个错误
   */
  getLastError(): ErrorRecord | null {
    return this.state.lastError;
  }

  /**
   * 获取错误计数
   */
  getErrorCount(): number {
    return this.state.errorCount;
  }

  /**
   * 清除指定错误
   */
  clearError(id: string): boolean {
    const errors = this.state.errors;
    const index = errors.findIndex((e) => e.id === id);
    if (index !== -1) {
      const newErrors = [...errors];
      newErrors.splice(index, 1);
      this.updateState({ errors: newErrors });
      return true;
    }
    return false;
  }

  /**
   * 清除所有错误
   */
  clearAllErrors(): void {
    this.updateState({
      errors: [],
      lastError: null,
    });
  }
}

/**
 * 创建 ErrorHandler 实例
 */
export function createErrorHandler(config?: ErrorHandlerConfig): ErrorHandler {
  return new ErrorHandler(config);
}
