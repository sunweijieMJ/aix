/**
 * @fileoverview 统一的错误检测工具
 * 提供可靠的错误类型检测，使用正则匹配提高准确性
 */

import { ErrorType } from '../types/error';

/**
 * HTTP 状态码匹配正则
 * 匹配 "HTTP 500", "status: 500", "500 Internal Server Error" 等格式
 */
const HTTP_STATUS_PATTERNS = {
  /** 5xx 服务器错误 */
  server: /\b(5\d{2})\b|http\s*5\d{2}/i,
  /** 401/403 认证错误 */
  auth: /\b(401|403)\b|unauthorized|forbidden/i,
  /** 400 验证错误 */
  validation: /\b400\b|validation|invalid\s+(request|param|argument)/i,
} as const;

/**
 * 检测是否为网络错误
 * 使用多种判断条件确保准确性
 */
export function isNetworkError(error: Error): boolean {
  // 检查 error.name
  if (error.name === 'NetworkError') {
    return true;
  }

  // TypeError 只有在与 fetch 相关时才视为网络错误
  // 普通的 TypeError（如类型转换错误）不是网络错误
  if (error.name === 'TypeError') {
    const message = error.message.toLowerCase();
    // 只有包含 fetch 相关关键词时才认为是网络错误
    if (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('cors')
    ) {
      return true;
    }
    return false;
  }

  // 检查特定的错误消息
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('failed to fetch') ||
    message.includes('net::err_') ||
    message.includes('dns')
  );
}

/**
 * 检测是否为超时错误
 */
export function isTimeoutError(error: Error): boolean {
  return (
    error.name === 'TimeoutError' ||
    error.name === 'StreamTimeoutError' ||
    error.message.toLowerCase().includes('timeout')
  );
}

/**
 * 检测是否为认证错误
 */
export function isAuthError(error: Error): boolean {
  return HTTP_STATUS_PATTERNS.auth.test(error.message);
}

/**
 * 检测是否为验证错误
 */
export function isValidationError(error: Error): boolean {
  return HTTP_STATUS_PATTERNS.validation.test(error.message);
}

/**
 * 检测是否为服务器错误 (5xx)
 */
export function isServerError(error: Error): boolean {
  return HTTP_STATUS_PATTERNS.server.test(error.message);
}

/**
 * 检测是否为 API 错误
 */
export function isAPIError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('http') ||
    message.includes('api') ||
    message.includes('endpoint')
  );
}

/**
 * 检测是否为中止错误
 */
export function isAbortError(error: Error): boolean {
  return error.name === 'AbortError';
}

/**
 * 检测错误是否可以重试（不考虑重试次数）
 */
export function isRetryable(error: Error): boolean {
  // AbortError 不重试（用户主动取消）
  if (isAbortError(error)) {
    return false;
  }

  // 网络错误应该重试
  if (isNetworkError(error) || isTimeoutError(error)) {
    return true;
  }

  // 服务器错误应该重试
  if (isServerError(error)) {
    return true;
  }

  // 认证错误和验证错误不应该重试
  if (isAuthError(error) || isValidationError(error)) {
    return false;
  }

  // 其他情况不重试
  return false;
}

/**
 * 检测错误是否应该重试
 * 统一的重试条件判断，复用 isRetryable 逻辑
 */
export function shouldRetryError(
  error: Error,
  retryCount: number,
  maxRetries: number,
): boolean {
  // 超过最大重试次数
  if (retryCount >= maxRetries) {
    return false;
  }

  // 复用 isRetryable 判断错误类型是否可重试
  return isRetryable(error);
}

/**
 * 检测错误类型
 * 返回 ErrorType 枚举值
 */
export function detectErrorType(error: Error): ErrorType {
  if (isNetworkError(error)) return ErrorType.Network;
  if (isTimeoutError(error)) return ErrorType.Timeout;
  if (isAuthError(error)) return ErrorType.Auth;
  if (isValidationError(error)) return ErrorType.Validation;
  if (isServerError(error)) return ErrorType.Server;
  if (isAPIError(error)) return ErrorType.API;
  if (isAbortError(error)) return ErrorType.Abort;
  return ErrorType.Unknown;
}
