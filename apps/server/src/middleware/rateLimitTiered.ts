/**
 * 分级限流中间件
 * 根据用户角色、路由路径实现差异化限流策略
 */
import { Context, Next } from 'koa';
import { createLogger } from '../utils/logger';
import { UserRole } from '../auth/types';

const logger = createLogger('RATE_LIMIT_TIERED');

/**
 * 限流规则配置
 */
export interface IRateLimitRule {
  /** 最大请求数 */
  max: number;
  /** 时间窗口（毫秒） */
  window: number;
  /** 限流消息 */
  message?: string;
}

/**
 * 分级限流配置
 */
export interface ITieredRateLimitOptions {
  /** 基于角色的限流规则 */
  roleRules?: Record<string, IRateLimitRule>;
  /** 基于路径的限流规则 */
  pathRules?: Record<string, IRateLimitRule>;
  /** 默认限流规则 */
  defaultRule: IRateLimitRule;
  /** 是否启用IP级别的限流 */
  enableIpLimit?: boolean;
  /** 是否跳过认证用户 */
  skipAuthenticatedUsers?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: ITieredRateLimitOptions = {
  roleRules: {
    [UserRole.ADMIN]: { max: 1000, window: 60000, message: 'Admin rate limit exceeded' },
    [UserRole.USER]: { max: 100, window: 60000, message: 'User rate limit exceeded' },
    guest: { max: 20, window: 60000, message: 'Guest rate limit exceeded' },
  },
  pathRules: {
    '/local/v1/auth/login': { max: 10, window: 60000, message: 'Login attempts exceeded' },
    '/local/v1/auth/register': { max: 5, window: 60000, message: 'Registration attempts exceeded' },
  },
  defaultRule: { max: 100, window: 60000, message: 'Rate limit exceeded' },
  enableIpLimit: true,
  skipAuthenticatedUsers: false,
};

/**
 * 请求记录存储
 * 结构: Map<identifier, timestamps[]>
 */
class RateLimitStore {
  private store = new Map<string, number[]>();
  private readonly cleanupInterval = 60000; // 1分钟清理一次
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    this.startCleanup();
  }

  /**
   * 记录请求
   * @param identifier 唯一标识（IP、用户ID等）
   * @param window 时间窗口
   * @returns 当前窗口内的请求数
   */
  record(identifier: string, window: number): number {
    const now = Date.now();
    const windowStart = now - window;

    // 获取并过滤过期记录
    let timestamps = this.store.get(identifier) || [];
    timestamps = timestamps.filter(time => time > windowStart);

    // 添加当前请求
    timestamps.push(now);
    this.store.set(identifier, timestamps);

    return timestamps.length;
  }

  /**
   * 获取当前请求数
   */
  getCount(identifier: string, window: number): number {
    const now = Date.now();
    const windowStart = now - window;
    const timestamps = this.store.get(identifier) || [];
    return timestamps.filter(time => time > windowStart).length;
  }

  /**
   * 清理过期记录
   */
  private cleanup(): void {
    const now = Date.now();
    const expireTime = now - 300000; // 保留5分钟内的记录

    for (const [identifier, timestamps] of this.store.entries()) {
      const validTimestamps = timestamps.filter(time => time > expireTime);
      if (validTimestamps.length === 0) {
        this.store.delete(identifier);
      } else {
        this.store.set(identifier, validTimestamps);
      }
    }

    logger.debug(`Rate limit store cleaned. Current entries: ${this.store.size}`);
  }

  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  /**
   * 停止清理
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalIdentifiers: this.store.size,
      entries: Array.from(this.store.entries()).map(([id, timestamps]) => ({
        identifier: id,
        requestCount: timestamps.length,
      })),
    };
  }
}

// 全局限流存储
const rateLimitStore = new RateLimitStore();

/**
 * 分级限流中间件
 * @param options 配置选项
 */
export function tieredRateLimitMiddleware(options: Partial<ITieredRateLimitOptions> = {}) {
  const opts: ITieredRateLimitOptions = { ...DEFAULT_OPTIONS, ...options };

  return async (ctx: Context, next: Next) => {
    // 获取用户角色
    const userRole = ctx.state.user?.role || 'guest';
    const userId = ctx.state.user?.userId;

    // 如果配置跳过认证用户且用户已认证，则跳过限流
    if (opts.skipAuthenticatedUsers && userId) {
      await next();
      return;
    }

    // 确定限流规则（优先级：路径规则 > 角色规则 > 默认规则）
    let rule = opts.defaultRule;

    // 检查路径规则
    const pathRule = opts.pathRules?.[ctx.path];
    if (pathRule) {
      rule = pathRule;
    } else if (opts.roleRules?.[userRole]) {
      // 检查角色规则
      rule = opts.roleRules[userRole];
    }

    // 生成唯一标识
    const identifier = userId ? `user:${userId}` : `ip:${getClientIP(ctx)}`;

    // 记录请求并获取当前计数
    const requestCount = rateLimitStore.record(identifier, rule.window);

    // 检查是否超过限制
    if (requestCount > rule.max) {
      const resetTime = Math.ceil(Date.now() / 1000 + rule.window / 1000);

      // 设置响应头
      ctx.set('X-RateLimit-Limit', rule.max.toString());
      ctx.set('X-RateLimit-Remaining', '0');
      ctx.set('X-RateLimit-Reset', resetTime.toString());
      ctx.set('Retry-After', Math.ceil(rule.window / 1000).toString());

      ctx.status = 429;
      ctx.body = {
        code: -1,
        message: rule.message || 'Too many requests',
        result: null,
      };

      logger.warn('Rate limit exceeded', {
        identifier,
        role: userRole,
        path: ctx.path,
        requestCount,
        limit: rule.max,
        window: rule.window,
        ip: getClientIP(ctx),
      });

      return;
    }

    // 添加限流信息到响应头
    ctx.set('X-RateLimit-Limit', rule.max.toString());
    ctx.set('X-RateLimit-Remaining', Math.max(0, rule.max - requestCount).toString());
    ctx.set('X-RateLimit-Reset', Math.ceil((Date.now() + rule.window) / 1000).toString());

    await next();
  };
}

/**
 * 获取客户端IP地址
 */
function getClientIP(ctx: Context): string {
  return (
    ctx.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    ctx.get('X-Real-IP') ||
    ctx.get('X-Client-IP') ||
    ctx.ip ||
    'unknown'
  );
}

/**
 * 获取限流统计信息
 */
export function getRateLimitStats() {
  return rateLimitStore.getStats();
}

/**
 * 清理限流存储（用于测试）
 */
export function clearRateLimitStore() {
  rateLimitStore.stop();
}

export default tieredRateLimitMiddleware;
