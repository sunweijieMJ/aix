/**
 * @fileoverview 错误处理相关类型定义
 */

/**
 * 错误类型枚举
 */
export enum ErrorType {
  /** 网络错误 */
  Network = 'network',
  /** 超时错误 */
  Timeout = 'timeout',
  /** 认证错误 */
  Auth = 'auth',
  /** 验证错误 */
  Validation = 'validation',
  /** 服务器错误 */
  Server = 'server',
  /** API 错误 */
  API = 'api',
  /** 中止错误 */
  Abort = 'abort',
  /** 未知错误 */
  Unknown = 'unknown',
}

/**
 * 错误级别枚举
 */
export enum ErrorLevel {
  /** 信息 */
  Info = 'info',
  /** 警告 */
  Warning = 'warning',
  /** 错误 */
  Error = 'error',
  /** 致命错误 */
  Fatal = 'fatal',
}

/**
 * 错误记录
 */
export interface ErrorRecord {
  /** 错误 ID */
  id: string;
  /** 错误类型 */
  type: ErrorType;
  /** 错误级别 */
  level: ErrorLevel;
  /** 原始错误 */
  error: Error;
  /** 错误消息 */
  message: string;
  /** 错误上下文 */
  context?: Record<string, unknown>;
  /** 发生时间 */
  timestamp: number;
  /** 是否已处理 */
  handled: boolean;
  /** 重试次数 */
  retryCount?: number;
}

/**
 * 错误处理器配置
 */
export interface ErrorHandlerConfig {
  /** 是否启用日志 */
  enableLogging?: boolean;
  /** 最大错误记录数 */
  maxRecords?: number;
  /** 错误回调 */
  onError?: (record: ErrorRecord) => void;
}
