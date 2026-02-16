/**
 * 日志中间件
 */
import type { MiddlewareHandler } from 'hono';

export const logger = (): MiddlewareHandler => {
  return async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;

    // 彩色输出
    const statusColor = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
    const reset = '\x1b[0m';

    console.log(`${statusColor}${status}${reset} ${method} ${path} - ${duration}ms`);
  };
};
