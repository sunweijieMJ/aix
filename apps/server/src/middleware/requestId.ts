/**
 * 请求追踪 ID 中间件
 */
import { Context, Next } from 'koa';
import { randomUUID } from 'crypto';
import { createLogger } from '../utils/logger';

const logger = createLogger('REQUEST_ID');

/**
 * 请求 ID 中间件配置
 */
export interface IRequestIdOptions {
  /** 请求ID的header名称 */
  header?: string;
  /** 是否将请求ID添加到响应头 */
  setResponseHeader?: boolean;
  /** 是否在state中设置请求ID */
  setContextState?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: Required<IRequestIdOptions> = {
  header: 'X-Request-ID',
  setResponseHeader: true,
  setContextState: true,
};

/**
 * 请求追踪 ID 中间件
 * 为每个请求生成或使用已有的唯一ID，用于日志追踪
 *
 * @param options 配置选项
 */
export function requestIdMiddleware(options: IRequestIdOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (ctx: Context, next: Next) => {
    // 尝试从请求头获取请求ID，如果没有则生成新的
    let requestId = ctx.get(opts.header);

    if (!requestId) {
      requestId = generateRequestId();
    }

    // 将请求ID设置到context state
    if (opts.setContextState) {
      ctx.state.requestId = requestId;
    }

    // 将请求ID添加到响应头
    if (opts.setResponseHeader) {
      ctx.set(opts.header, requestId);
    }

    // 记录请求开始
    const startTime = Date.now();
    logger.info('Request started', {
      requestId,
      method: ctx.method,
      url: ctx.url,
      ip: ctx.ip,
      userAgent: ctx.get('user-agent'),
    });

    try {
      await next();

      // 记录请求完成
      const duration = Date.now() - startTime;
      logger.info('Request completed', {
        requestId,
        method: ctx.method,
        url: ctx.url,
        status: ctx.status,
        duration: `${duration}ms`,
      });
    } catch (error) {
      // 记录请求错误
      const duration = Date.now() - startTime;
      logger.error('Request failed', {
        requestId,
        method: ctx.method,
        url: ctx.url,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  };
}

/**
 * 生成请求ID
 * 使用 UUID v4 格式
 */
function generateRequestId(): string {
  return randomUUID();
}

/**
 * 从上下文获取请求ID
 * @param ctx Koa Context
 * @returns 请求ID，如果不存在则返回undefined
 */
export function getRequestId(ctx: Context): string | undefined {
  return ctx.state.requestId;
}

/**
 * 为日志添加请求ID
 * 这个函数可以在业务代码中使用，确保日志包含请求ID
 *
 * @param ctx Koa Context
 * @param data 日志数据
 * @returns 包含请求ID的日志数据
 */
export function withRequestId(ctx: Context, data: Record<string, any>): Record<string, any> {
  const requestId = getRequestId(ctx);
  if (requestId) {
    return { ...data, requestId };
  }
  return data;
}

/**
 * 请求统计中间件
 * 收集请求统计信息
 */
export class RequestStatsCollector {
  private stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    requestsByMethod: new Map<string, number>(),
    requestsByPath: new Map<string, number>(),
    requestsByStatus: new Map<number, number>(),
  };

  private responseTimes: number[] = [];
  private readonly maxResponTimesSamples = 1000; // 保留最近1000个响应时间

  middleware() {
    return async (ctx: Context, next: Next) => {
      const startTime = Date.now();
      this.stats.totalRequests++;

      // 统计请求方法
      const methodCount = this.stats.requestsByMethod.get(ctx.method) || 0;
      this.stats.requestsByMethod.set(ctx.method, methodCount + 1);

      // 统计请求路径
      const pathCount = this.stats.requestsByPath.get(ctx.path) || 0;
      this.stats.requestsByPath.set(ctx.path, pathCount + 1);

      try {
        await next();

        // 统计成功请求
        if (ctx.status >= 200 && ctx.status < 400) {
          this.stats.successfulRequests++;
        }

        // 统计状态码
        const statusCount = this.stats.requestsByStatus.get(ctx.status) || 0;
        this.stats.requestsByStatus.set(ctx.status, statusCount + 1);
      } catch (error) {
        // 统计失败请求
        this.stats.failedRequests++;
        throw error;
      } finally {
        // 记录响应时间
        const duration = Date.now() - startTime;
        this.recordResponseTime(duration);
      }
    };
  }

  private recordResponseTime(duration: number): void {
    this.responseTimes.push(duration);

    // 限制数组大小
    if (this.responseTimes.length > this.maxResponTimesSamples) {
      this.responseTimes.shift();
    }

    // 计算平均响应时间
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    this.stats.averageResponseTime = Math.round(sum / this.responseTimes.length);
  }

  getStats() {
    return {
      ...this.stats,
      requestsByMethod: Object.fromEntries(this.stats.requestsByMethod),
      requestsByPath: Object.fromEntries(this.stats.requestsByPath),
      requestsByStatus: Object.fromEntries(this.stats.requestsByStatus),
      successRate:
        this.stats.totalRequests > 0
          ? Math.round((this.stats.successfulRequests / this.stats.totalRequests) * 100 * 100) / 100
          : 0,
    };
  }

  reset(): void {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsByMethod: new Map(),
      requestsByPath: new Map(),
      requestsByStatus: new Map(),
    };
    this.responseTimes = [];
  }
}

// 创建全局请求统计收集器
export const requestStatsCollector = new RequestStatsCollector();
