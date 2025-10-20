/**
 * 缓存模块 - 支持内存缓存和 Redis 缓存
 */
import { createLogger } from '../utils/logger';
import { config } from '../config';
import { MemoryCacheManager } from './memory';
import { RedisCacheManager } from './redis';
import type { ICacheManager, ICacheConfig, CacheType } from './types';

const logger = createLogger('CACHE');

// 导出类型
export type { ICacheManager, ICacheConfig, ICacheStats, CacheType } from './types';
export { MemoryCacheManager } from './memory';
export { RedisCacheManager } from './redis';

/**
 * 缓存管理器工厂
 */
export class CacheManagerFactory {
  private static instance: ICacheManager | null = null;

  static async createCacheManager(cacheConfig?: ICacheConfig): Promise<ICacheManager> {
    if (this.instance) {
      logger.info('Returning existing cache manager instance');
      return this.instance;
    }

    const finalConfig: ICacheConfig = cacheConfig || {
      type: (config.cache.type as CacheType) || 'memory',
      defaultTtl: config.cache.ttl,
      checkPeriod: Math.max(60, Math.floor(config.cache.ttl / 10)),
      redis: config.cache.redis,
    };

    logger.info(`Creating ${finalConfig.type} cache manager...`);

    if (finalConfig.type === 'redis') {
      if (!finalConfig.redis) {
        logger.error('Redis configuration is missing, falling back to memory cache');
        this.instance = new MemoryCacheManager({
          type: 'memory',
          defaultTtl: finalConfig.defaultTtl,
          checkPeriod: finalConfig.checkPeriod || 60,
        });
      } else {
        this.instance = new RedisCacheManager({
          host: finalConfig.redis.host,
          port: finalConfig.redis.port,
          password: finalConfig.redis.password,
          db: finalConfig.redis.db,
          keyPrefix: finalConfig.redis.keyPrefix,
        });
      }
    } else {
      this.instance = new MemoryCacheManager({
        type: 'memory',
        defaultTtl: finalConfig.defaultTtl,
        checkPeriod: finalConfig.checkPeriod || 60,
      });
    }

    logger.info(`Cache manager created: ${finalConfig.type}`);
    return this.instance;
  }

  static async getCacheManager(): Promise<ICacheManager> {
    if (!this.instance) {
      return this.createCacheManager();
    }
    return this.instance;
  }

  static async closeCacheManager(): Promise<void> {
    if (this.instance) {
      await this.instance.close();
      this.instance = null;
      logger.info('Cache manager closed');
    }
  }

  static resetInstance(): void {
    this.instance = null;
  }
}

/**
 * 缓存装饰器 - 用于方法缓存
 */
export function CacheResult(ttl?: number, keyGenerator?: (...args: any[]) => string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheManager = await CacheManagerFactory.getCacheManager();

      // 生成缓存键
      const cacheKey = keyGenerator
        ? keyGenerator(...args)
        : `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;

      // 尝试从缓存获取
      const cachedResult = await cacheManager.get(cacheKey);
      if (cachedResult !== undefined) {
        return cachedResult;
      }

      // 执行原方法
      const result = await method.apply(this, args);

      // 缓存结果
      if (result !== undefined) {
        await cacheManager.set(cacheKey, result, ttl);
      }

      return result;
    };

    return descriptor;
  };
}

// 导出全局缓存管理器实例获取函数
export const getCacheManager = () => CacheManagerFactory.getCacheManager();
export const createCacheManager = (cacheConfig?: ICacheConfig) => CacheManagerFactory.createCacheManager(cacheConfig);
export const closeCacheManager = () => CacheManagerFactory.closeCacheManager();

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
        type: config.cache.type,
        stats,
        lastCheck: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Cache health check failed', error);
    return {
      healthy: false,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date().toISOString(),
      },
    };
  }
}
