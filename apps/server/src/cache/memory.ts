/**
 * 内存缓存管理器实现
 */
import NodeCache from 'node-cache';
import { createLogger } from '../utils/logger';
import type { ICacheManager, ICacheStats, ICacheConfig } from './types';

const logger = createLogger('MEMORY_CACHE');

/**
 * 内存缓存管理器
 */
export class MemoryCacheManager implements ICacheManager {
  private cache: NodeCache;
  private stats: { hits: number; misses: number } = { hits: 0, misses: 0 };

  constructor(config: ICacheConfig) {
    this.cache = new NodeCache({
      stdTTL: config.defaultTtl,
      checkperiod: config.checkPeriod || 60,
      useClones: false, // 提升性能，但需要注意对象修改
    });

    // 监听缓存事件
    this.cache.on('set', key => {
      logger.debug(`Cache set: ${key}`);
    });

    this.cache.on('del', key => {
      logger.debug(`Cache deleted: ${key}`);
    });

    this.cache.on('expired', key => {
      logger.debug(`Cache expired: ${key}`);
    });

    logger.info('Memory cache manager initialized');
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const success = this.cache.set(key, value, ttl ?? 0);
      if (success) {
        logger.debug(`Cache set success: ${key}${ttl ? ` (TTL: ${ttl}s)` : ''}`);
      }
      return success;
    } catch (error) {
      logger.error(`Failed to set cache for key ${key}`, error);
      return false;
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = this.cache.get<T>(key);
      if (value !== undefined) {
        this.stats.hits++;
        logger.debug(`Cache hit: ${key}`);
      } else {
        this.stats.misses++;
        logger.debug(`Cache miss: ${key}`);
      }
      return value;
    } catch (error) {
      logger.error(`Failed to get cache for key ${key}`, error);
      this.stats.misses++;
      return undefined;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const deleted = this.cache.del(key);
      logger.debug(`Cache delete: ${key} (${deleted ? 'success' : 'not found'})`);
      return deleted > 0;
    } catch (error) {
      logger.error(`Failed to delete cache for key ${key}`, error);
      return false;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      return this.cache.has(key);
    } catch (error) {
      logger.error(`Failed to check cache for key ${key}`, error);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      this.cache.flushAll();
      this.stats = { hits: 0, misses: 0 };
      logger.info('All cache cleared');
    } catch (error) {
      logger.error('Failed to clear cache', error);
    }
  }

  async getStats(): Promise<ICacheStats> {
    const keys = this.cache.keys();
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      keys: keys.length,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: Math.round(hitRate * 10000) / 100, // 保留两位小数
    };
  }

  async close(): Promise<void> {
    try {
      this.cache.close();
      logger.info('Memory cache manager closed');
    } catch (error) {
      logger.error('Failed to close memory cache manager', error);
    }
  }

  /**
   * 批量设置缓存
   */
  async mset(data: Array<{ key: string; value: any; ttl?: number }>): Promise<boolean> {
    try {
      let success = true;
      for (const item of data) {
        const result = await this.set(item.key, item.value, item.ttl);
        if (!result) success = false;
      }
      return success;
    } catch (error) {
      logger.error('Failed to batch set cache', error);
      return false;
    }
  }

  /**
   * 批量获取缓存
   */
  async mget<T>(keys: string[]): Promise<Record<string, T | undefined>> {
    const result: Record<string, T | undefined> = {};
    for (const key of keys) {
      result[key] = await this.get<T>(key);
    }
    return result;
  }

  /**
   * 批量删除缓存
   */
  async mdel(keys: string[]): Promise<number> {
    let deletedCount = 0;
    for (const key of keys) {
      const deleted = await this.del(key);
      if (deleted) deletedCount++;
    }
    return deletedCount;
  }

  /**
   * 获取匹配模式的所有键
   * @param pattern 匹配模式（支持通配符 * 和 ?）
   * @returns 匹配的键数组
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      const allKeys = this.cache.keys();

      // 将通配符模式转换为正则表达式
      const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
        .replace(/\*/g, '.*') // * 匹配任意字符
        .replace(/\?/g, '.'); // ? 匹配单个字符

      const regex = new RegExp(`^${regexPattern}$`);

      // 过滤匹配的键
      const matchedKeys = allKeys.filter(key => regex.test(key));

      logger.debug(`Found ${matchedKeys.length} keys matching pattern: ${pattern}`);
      return matchedKeys;
    } catch (error) {
      logger.error(`Failed to get keys for pattern ${pattern}`, error);
      return [];
    }
  }

  /**
   * 根据模式删除缓存
   * @param pattern 匹配模式
   * @returns 删除的键数量
   */
  async delByPattern(pattern: string): Promise<number> {
    const keys = await this.keys(pattern);
    return await this.mdel(keys);
  }
}
