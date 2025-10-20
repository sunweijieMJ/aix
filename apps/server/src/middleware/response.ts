import { Context, Next } from 'koa';
import { ERROR_CODES, HTTP_STATUS } from '../constants';
import { IApiResponse } from '../types';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('RESPONSE_MIDDLEWARE');

/**
 * 创建API响应对象
 * @param code 错误码
 * @param message 响应消息
 * @param data 响应数据
 * @returns API响应对象
 */
function createApiResponse<T = null>(code: number, message: string, data: T = null as unknown as T): IApiResponse<T> {
  return {
    code,
    message,
    result: data,
  };
}

/**
 * 发送成功响应
 * @param ctx - Koa上下文
 * @param data - 响应数据
 * @param message - 响应消息
 */
export function success<T>(ctx: Context, data: T, message: string = 'Success'): void {
  ctx.status = HTTP_STATUS.OK;
  ctx.body = createApiResponse(ERROR_CODES.SUCCESS, message, data);
}

/**
 * 发送错误响应
 * @param ctx - Koa上下文
 * @param message - 错误消息
 * @param code - 错误码
 * @param status - HTTP状态码
 */
export function error(
  ctx: Context,
  message: string,
  code: number = ERROR_CODES.GENERAL_ERROR,
  status: number = HTTP_STATUS.BAD_REQUEST,
): void {
  ctx.status = status;
  ctx.body = createApiResponse(code, message);
}

/**
 * 从错误对象中提取错误信息
 * @param err 错误对象
 * @returns 错误信息对象
 */
function extractErrorInfo(err: any): { status: number; message: string; code: number } {
  // 处理自定义应用错误
  if (err instanceof AppError) {
    return {
      status: err.status,
      message: err.message,
      code: err.code,
    };
  }

  // 处理其他错误
  return {
    status: err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR,
    message: err.message || 'Internal Server Error',
    code: err.code || ERROR_CODES.GENERAL_ERROR,
  };
}

/**
 * 统一响应格式中间件
 * 处理应用程序中的所有错误并转换为统一的响应格式
 * @param ctx - Koa上下文
 * @param next - 下一个中间件
 */
export async function responseMiddleware(ctx: Context, next: Next): Promise<void> {
  try {
    await next();
  } catch (err: any) {
    // 自动将 requestId 和 traceId 添加到错误对象
    if (err instanceof AppError) {
      if (!err.requestId && ctx.state.requestId) {
        err.setRequestId(ctx.state.requestId);
      }
      if (!err.traceId && ctx.state.traceId) {
        err.setTraceId(ctx.state.traceId);
      }
      // 添加基础上下文信息
      if (!err.context) {
        err.addContext('method', ctx.method);
        err.addContext('path', ctx.path);
        err.addContext('ip', ctx.ip);
      }
    }

    logger.error('API Error occurred', {
      error: err instanceof AppError ? err.toJSON() : err,
      requestId: ctx.state.requestId,
      traceId: ctx.state.traceId,
      method: ctx.method,
      path: ctx.path,
      ip: ctx.ip,
    });

    // 提取错误信息
    const { status, message, code } = extractErrorInfo(err);

    // 记录详细错误信息
    logger.error(`Error details: status=${status}, code=${code}, message=${message}`, {
      requestId: ctx.state.requestId,
      stack: err.stack,
    });

    // 设置响应
    ctx.status = status;
    const responseBody = createApiResponse(code, message);

    // 在开发环境添加更多调试信息
    if (process.env.NODE_ENV === 'development' && err instanceof AppError) {
      (responseBody as any).debug = {
        requestId: err.requestId,
        traceId: err.traceId,
        context: err.context,
        timestamp: err.timestamp,
      };
    }

    ctx.body = responseBody;
  }
}

/**
 * 404处理中间件
 * 处理未找到的路由端点
 * @param ctx - Koa上下文
 * @param next - 下一个中间件
 */
export async function notFoundMiddleware(ctx: Context, next: Next): Promise<void> {
  await next();

  if (ctx.status === HTTP_STATUS.NOT_FOUND && !ctx.body) {
    logger.warn(`API endpoint not found: ${ctx.method} ${ctx.path}`);
    error(ctx, 'API endpoint not found', ERROR_CODES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }
}
