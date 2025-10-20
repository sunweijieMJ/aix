import { Context, Next } from 'koa';
import { getCacheManager } from './index';
import { createLogger } from '../utils/logger';

const logger = createLogger('CACHE_MIDDLEWARE');

/**
 * 缓存中间件选项
 */
export interface ICacheMiddlewareOptions {
  /** 默认TTL（秒） */
  defaultTtl?: number;
  /** 缓存键前缀 */
  keyPrefix?: string;
  /** 是否启用缓存 */
  enabled?: boolean;
  /** 缓存键生成器 */
  keyGenerator?: (ctx: Context) => string;
  /** 是否应该缓存的判断函数 */
  shouldCache?: (ctx: Context) => boolean;
  /** 排除的路径模式 */
  excludePaths?: (string | RegExp)[];
}

/**
 * 默认缓存中间件选项
 */
const DEFAULT_OPTIONS: Required<ICacheMiddlewareOptions> = {
  defaultTtl: 300, // 5分钟
  keyPrefix: 'api',
  enabled: true,
  keyGenerator: (ctx: Context) => {
    const { method, url, query } = ctx;
    // 将query转换为字符串格式
    const queryEntries = Object.entries(query).map(([key, value]) => {
      const strValue = Array.isArray(value) ? value.join(',') : String(value || '');
      return `${key}=${strValue}`;
    });
    const queryString = queryEntries.length > 0 ? `?${queryEntries.join('&')}` : '';
    return `${method}:${url}${queryString}`;
  },
  shouldCache: (ctx: Context) => {
    // 只缓存GET请求且状态码为200的响应
    return ctx.method === 'GET' && ctx.status === 200;
  },
  excludePaths: ['/health', '/metrics'],
};

/**
 * 路径是否匹配排除模式
 */
function isPathExcluded(path: string, excludePaths: (string | RegExp)[]): boolean {
  return excludePaths.some(pattern => {
    if (typeof pattern === 'string') {
      return path === pattern || path.startsWith(pattern);
    } else {
      return pattern.test(path);
    }
  });
}

/**
 * API响应缓存中间件
 */
export function apiCacheMiddleware(options: ICacheMiddlewareOptions = {}): (ctx: Context, next: Next) => Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (ctx: Context, next: Next) => {
    // 检查是否启用缓存
    if (!opts.enabled) {
      return next();
    }

    // 检查路径是否被排除
    if (isPathExcluded(ctx.path, opts.excludePaths)) {
      return next();
    }

    // 只处理GET请求
    if (ctx.method !== 'GET') {
      return next();
    }

    try {
      const cacheManager = await getCacheManager();
      const cacheKey = `${opts.keyPrefix}:${opts.keyGenerator(ctx)}`;

      // 尝试从缓存获取响应
      const cachedResponse = await cacheManager.get<{
        body: any;
        status: number;
        headers: Record<string, string>;
      }>(cacheKey);

      if (cachedResponse) {
        // 设置缓存响应
        ctx.status = cachedResponse.status;
        ctx.body = cachedResponse.body;

        // 设置原始响应头
        Object.entries(cachedResponse.headers).forEach(([key, value]) => {
          ctx.set(key, value);
        });

        // 添加缓存命中标识
        ctx.set('X-Cache', 'HIT');
        ctx.set('X-Cache-Key', cacheKey);

        logger.debug(`Cache hit for: ${cacheKey}`);
        return;
      }

      // 缓存未命中，执行下一个中间件
      ctx.set('X-Cache', 'MISS');
      await next();

      // 检查是否应该缓存响应
      if (opts.shouldCache(ctx)) {
        const responseToCache = {
          body: ctx.body,
          status: ctx.status,
          headers: {
            'Content-Type': ctx.get('Content-Type') || 'application/json',
            ...Object.fromEntries(
              Object.entries(ctx.response.headers).filter(
                ([key]) => !['set-cookie', 'x-cache', 'x-cache-key'].includes(key.toLowerCase()),
              ),
            ),
          },
        };

        // 缓存响应
        await cacheManager.set(cacheKey, responseToCache, opts.defaultTtl);

        // 添加缓存相关响应头
        ctx.set('X-Cache-Key', cacheKey);
        ctx.set('Cache-Control', `public, max-age=${opts.defaultTtl}`);

        logger.debug(`Response cached for: ${cacheKey}`);
      }
    } catch (error) {
      logger.error('Cache middleware error:', error);
      // 缓存错误不应该影响正常请求
      await next();
    }
  };
}

/**
 * 缓存控制中间件
 * 为静态资源和API响应添加适当的缓存头
 */
export function cacheControlMiddleware() {
  return async (ctx: Context, next: Next) => {
    await next();

    // 根据路径类型设置不同的缓存策略
    if (ctx.path.startsWith('/api/')) {
      // API接口：短期缓存，允许重新验证
      if (ctx.method === 'GET' && ctx.status === 200) {
        ctx.set('Cache-Control', 'public, max-age=300, must-revalidate'); // 5分钟
      } else {
        ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    } else if (ctx.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
      // 静态资源：长期缓存
      ctx.set('Cache-Control', 'public, max-age=31536000, immutable'); // 1年
    } else {
      // 其他页面：短期缓存
      ctx.set('Cache-Control', 'public, max-age=300'); // 5分钟
    }

    // 添加ETag支持
    if (ctx.body && typeof ctx.body === 'object') {
      const etag = generateETag(JSON.stringify(ctx.body));
      ctx.set('ETag', etag);

      // 检查If-None-Match头
      const ifNoneMatch = ctx.get('If-None-Match');
      if (ifNoneMatch === etag) {
        ctx.status = 304;
        ctx.body = null;
      }
    }
  };
}

/**
 * 生成ETag
 */
function generateETag(content: string): string {
  // 简单的哈希函数生成ETag
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 转换为32位整数
  }
  return `"${Math.abs(hash).toString(36)}"`;
}

/**
 * 缓存预热中间件
 * 在应用启动时预热常用缓存
 */

export function cacheWarmupMiddleware() {
  return async (_ctx: Context, next: Next) => {
    // 这个中间件主要用于记录需要预热的路由
    // 实际的预热逻辑在应用启动时执行
    await next();
  };
}

/**
 * 缓存管理API中间件
 * 提供缓存管理的API端点
 */
export function cacheManagementMiddleware() {
  return async (ctx: Context, next: Next) => {
    if (!ctx.path.startsWith('/api/cache')) {
      return next();
    }

    try {
      const cacheManager = await getCacheManager();

      switch (ctx.path) {
        case '/api/cache/stats':
          if (ctx.method === 'GET') {
            const stats = await cacheManager.getStats();
            ctx.body = {
              success: true,
              data: stats,
            };
            return;
          }
          break;

        case '/api/cache/clear':
          if (ctx.method === 'POST') {
            await cacheManager.clear();
            ctx.body = {
              success: true,
              message: 'Cache cleared successfully',
            };
            return;
          }
          break;

        case '/api/cache/delete':
          if (ctx.method === 'DELETE') {
            const { key } = ctx.request.query;
            if (typeof key === 'string') {
              const deleted = await cacheManager.del(key);
              ctx.body = {
                success: true,
                data: { deleted },
                message: deleted ? 'Cache entry deleted' : 'Cache entry not found',
              };
              return;
            }
          }
          break;

        default:
          break;
      }

      await next();
    } catch (error) {
      logger.error('Cache management middleware error:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: 'Internal cache error',
      };
    }
  };
}

/**
 * 缓存健康检查
 */
export async function checkCacheHealth(): Promise<{ healthy: boolean; details: any }> {
  try {
    const cacheManager = await getCacheManager();
    const testKey = 'health:check:' + Date.now();
    const testValue = { timestamp: Date.now() };

    // 测试缓存读写
    await cacheManager.set(testKey, testValue, 10);
    const retrieved = await cacheManager.get(testKey);
    await cacheManager.del(testKey);

    const stats = await cacheManager.getStats();

    return {
      healthy: JSON.stringify(retrieved) === JSON.stringify(testValue),
      details: {
        stats,
        lastCheck: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Cache health check failed:', error);
    return {
      healthy: false,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date().toISOString(),
      },
    };
  }
}
