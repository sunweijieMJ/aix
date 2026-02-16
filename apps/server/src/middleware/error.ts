/**
 * 错误处理中间件
 */
import type { ErrorHandler } from 'hono';
import { AppError } from '../utils/response';

export const errorHandler: ErrorHandler = (err, c) => {
  console.error('Error:', err);

  if (err instanceof AppError) {
    return c.json(
      {
        code: err.code,
        message: err.message,
      },
      // @ts-expect-error - Hono 的状态码类型定义过于严格，但运行时正常
      err.code,
    );
  }

  // 默认 500 错误
  return c.json(
    {
      code: 500,
      message: 'Internal Server Error',
    },
    500,
  );
};
