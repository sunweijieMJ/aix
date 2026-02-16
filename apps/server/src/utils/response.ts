/**
 * 统一响应工具
 */
import type { ApiResponse } from '../types';

export function success<T>(data?: T, message = 'Success'): ApiResponse<T> {
  return {
    code: 200,
    message,
    data,
  };
}

export function error(code: number, message: string): ApiResponse {
  return {
    code,
    message,
  };
}

export class AppError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
