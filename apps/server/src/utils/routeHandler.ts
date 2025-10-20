import { Context } from 'koa';
import { error, success } from '../middleware/response';
import { AppError, NotFoundError, ValidationError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('ROUTE_HANDLER');

/**
 * 路由处理器选项
 */
export interface RouteHandlerOptions {
  /** 操作描述，用于日志 */
  operation: string;
  /** 成功消息 */
  successMessage?: string;
}

/**
 * 创建路由处理器
 * @param handler 处理函数
 * @param options 选项
 * @returns Koa路由处理器
 */
export function createRouteHandler<T = any>(handler: (ctx: Context) => Promise<T>, options: RouteHandlerOptions) {
  return async (ctx: Context) => {
    try {
      const result = await handler(ctx);
      success(ctx, result, options.successMessage || `${options.operation} successfully`);
    } catch (err: any) {
      handleRouteError(ctx, err, options.operation);
    }
  };
}

/**
 * 处理路由错误
 * @param ctx Koa上下文
 * @param err 错误对象
 * @param operation 操作描述
 */
export function handleRouteError(ctx: Context, err: any, operation: string): void {
  if (err instanceof ValidationError) {
    error(ctx, err.message, -2, 400);
  } else if (err instanceof NotFoundError) {
    error(ctx, err.message, -3, 404);
  } else if (err instanceof AppError) {
    error(ctx, err.message, err.code, err.status);
  } else {
    logger.error(`Failed to ${operation}`, err);
    error(ctx, `Failed to ${operation}: ${err.message}`);
  }
}

/**
 * 提取并验证路径参数中的ID
 * @param ctx Koa上下文
 * @param paramName 参数名称
 * @returns 解析后的ID
 */
export function extractId(ctx: Context, paramName: string = 'id'): number {
  const id = parseInt(ctx.params[paramName]);
  if (isNaN(id)) {
    throw new ValidationError(`Invalid ${paramName}`);
  }
  return id;
}

/**
 * 提取并验证请求体
 * @param ctx Koa上下文
 * @param requiredFields 必填字段列表
 * @returns 请求体
 */
export function extractBody<T>(ctx: Context, requiredFields: string[] = []): T {
  const body = ctx.request.body as T;

  if (!body) {
    throw new ValidationError('Request body is required');
  }

  for (const field of requiredFields) {
    const value = (body as any)[field];
    if (value === undefined || value === null || value === '') {
      throw new ValidationError(`Field '${field}' is required`);
    }
  }

  return body;
}

/**
 * 提取并验证查询参数
 * @param ctx Koa上下文
 * @param requiredParams 必填参数列表
 * @returns 查询参数
 */
export function extractQuery<T>(ctx: Context, requiredParams: string[] = []): T {
  const query = ctx.query as unknown as T;

  for (const param of requiredParams) {
    const value = (query as any)[param];
    if (value === undefined || value === null || value === '') {
      throw new ValidationError(`Query parameter '${param}' is required`);
    }
  }

  return query;
}
