import { Context, Next } from 'koa';
import { metricsManager } from './metrics';
import { createLogger } from '../utils/logger';

const logger = createLogger('METRICS_MIDDLEWARE');

/**
 * 性能监控中间件
 * 收集请求指标用于性能分析
 */
export function metricsMiddleware() {
  return async (ctx: Context, next: Next) => {
    const startTime = Date.now();
    let error: string | undefined;

    try {
      await next();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err; // 重新抛出错误
    } finally {
      // 记录请求指标
      const duration = Date.now() - startTime;

      // 排除特定路径（如健康检查、指标本身等）
      const excludePaths = ['/health', '/metrics', '/favicon.ico'];
      const shouldRecord = !excludePaths.some(path => ctx.path.includes(path));

      if (shouldRecord) {
        metricsManager.recordRequest({
          duration,
          status: ctx.status,
          method: ctx.method,
          path: sanitizePath(ctx.path),
          error,
        });

        // 记录慢请求
        if (duration > 1000) {
          logger.warn(`Slow request detected: ${ctx.method} ${ctx.path} - ${duration}ms`);
        }

        // 记录错误请求
        if (ctx.status >= 400) {
          logger.debug(`Error request: ${ctx.method} ${ctx.path} - ${ctx.status} (${duration}ms)`, {
            status: ctx.status,
            method: ctx.method,
            path: ctx.path,
            duration,
            error,
            userAgent: ctx.get('User-Agent'),
            ip: getClientIP(ctx),
          });
        }
      }

      // 添加性能相关的响应头
      ctx.set('X-Response-Time', `${duration}ms`);

      // 在开发环境添加更多调试信息
      if (process.env.NODE_ENV === 'development') {
        ctx.set('X-Request-ID', generateRequestId());
        ctx.set('X-Process-Time', new Date().toISOString());
      }
    }
  };
}

/**
 * 清理路径，移除动态参数以便于聚合统计
 */
function sanitizePath(path: string): string {
  // 将动态参数替换为占位符
  return path
    .replace(/\/\d+/g, '/:id') // 数字ID
    .replace(/\/[a-f0-9]{24}/g, '/:mongoId') // MongoDB ObjectId
    .replace(/\/[a-f0-9-]{36}/g, '/:uuid') // UUID
    .replace(/\/[a-zA-Z0-9._-]+\.[a-zA-Z]{2,4}$/g, '/:file') // 文件名
    .replace(/\?.+$/, ''); // 移除查询参数
}

/**
 * 获取客户端IP地址
 */
function getClientIP(ctx: Context): string {
  return ctx.get('X-Forwarded-For') || ctx.get('X-Real-IP') || ctx.get('X-Client-IP') || ctx.ip || 'unknown';
}

/**
 * 生成请求ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 请求日志中间件
 * 记录详细的请求日志用于调试和审计
 */
export function requestLoggingMiddleware() {
  return async (ctx: Context, next: Next) => {
    const startTime = Date.now();
    const requestId = generateRequestId();

    // 记录请求开始
    logger.info(`Request started: ${ctx.method} ${ctx.path}`, {
      requestId,
      method: ctx.method,
      path: ctx.path,
      query: ctx.query,
      userAgent: ctx.get('User-Agent'),
      ip: getClientIP(ctx),
      timestamp: new Date().toISOString(),
    });

    try {
      // 将请求ID添加到上下文，便于后续使用
      ctx.state.requestId = requestId;

      await next();

      const duration = Date.now() - startTime;

      // 记录请求完成
      logger.info(`Request completed: ${ctx.method} ${ctx.path}`, {
        requestId,
        status: ctx.status,
        duration,
        responseSize: ctx.get('Content-Length') || '0',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      // 记录请求错误
      logger.error(`Request failed: ${ctx.method} ${ctx.path}`, {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        duration,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  };
}

/**
 * 限流中间件
 * 简单的基于IP的限流实现
 */
export function rateLimitMiddleware(
  options: {
    max: number; // 最大请求数
    window: number; // 时间窗口（毫秒）
    message?: string; // 限流消息
  } = { max: 100, window: 60000 },
) {
  const requests = new Map<string, number[]>();

  return async (ctx: Context, next: Next) => {
    const ip = getClientIP(ctx);
    const now = Date.now();
    const windowStart = now - options.window;

    // 获取该IP的请求记录
    let ipRequests = requests.get(ip) || [];

    // 清理过期的请求记录
    ipRequests = ipRequests.filter(time => time > windowStart);

    // 检查是否超过限制
    if (ipRequests.length >= options.max) {
      ctx.status = 429;
      ctx.body = {
        code: -1,
        message: options.message || 'Too many requests',
        result: null,
      };

      // 添加限流相关的响应头
      ctx.set('X-RateLimit-Limit', options.max.toString());
      ctx.set('X-RateLimit-Remaining', '0');
      ctx.set('X-RateLimit-Reset', Math.ceil((windowStart + options.window) / 1000).toString());

      logger.warn(`Rate limit exceeded for IP: ${ip}`, {
        ip,
        requests: ipRequests.length,
        limit: options.max,
        window: options.window,
      });

      return;
    }

    // 记录当前请求
    ipRequests.push(now);
    requests.set(ip, ipRequests);

    // 添加限流信息到响应头
    ctx.set('X-RateLimit-Limit', options.max.toString());
    ctx.set('X-RateLimit-Remaining', (options.max - ipRequests.length).toString());
    ctx.set('X-RateLimit-Reset', Math.ceil((windowStart + options.window) / 1000).toString());

    await next();
  };
}

/**
 * 安全头中间件
 * 添加常见的安全响应头
 */
export function securityHeadersMiddleware() {
  return async (ctx: Context, next: Next) => {
    await next();

    // 安全相关的响应头
    ctx.set('X-Content-Type-Options', 'nosniff');
    ctx.set('X-Frame-Options', 'DENY');
    ctx.set('X-XSS-Protection', '1; mode=block');
    ctx.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 仅在HTTPS环境下设置HSTS
    if (ctx.protocol === 'https') {
      ctx.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // CSP头（根据需要调整）
    ctx.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
    );
  };
}

/**
 * 响应压缩中间件选项
 */
export function compressionMiddleware() {
  return async (ctx: Context, next: Next) => {
    await next();

    // 只压缩文本类型的响应
    const contentType = ctx.get('Content-Type');
    const shouldCompress =
      contentType &&
      (contentType.includes('application/json') ||
        contentType.includes('text/') ||
        contentType.includes('application/javascript'));

    if (shouldCompress && ctx.body && ctx.get('Content-Encoding') === '') {
      // 这里可以添加gzip压缩逻辑
      // 实际项目中通常使用专门的压缩中间件如koa-compress
      ctx.set('Content-Encoding', 'identity'); // 标识不压缩
    }
  };
}
