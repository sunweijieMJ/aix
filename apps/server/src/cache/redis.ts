/**
 * Redis 缓存管理器实现
 */
import Redis from 'ioredis';
import { createLogger } from '../utils/logger';
import type { ICacheManager, ICacheStats } from './types';

const logger = createLogger('REDIS_CACHE');

export interface IRedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
}

/**
 * Redis 缓存管理器
 */
export class RedisCacheManager implements ICacheManager {
  private client: Redis;
  private stats: { hits: number; misses: number } = { hits: 0, misses: 0 };

  constructor(private config: IRedisConfig) {
    this.client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || 'cache:',
      maxRetriesPerRequest: config.maxRetriesPerRequest ?? 3,
      enableReadyCheck: config.enableReadyCheck ?? true,
      lazyConnect: false,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis connecting...', {
        host: this.config.host,
        port: this.config.port,
      });
    });

    this.client.on('ready', () => {
      logger.info('Redis connection ready');
    });

    this.client.on('error', (error: Error) => {
      logger.error('Redis connection error', error);
    });

    this.client.on('close', () => {
      logger.warn('Redis connection closed');
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      logger.debug(`Cache set: ${key}${ttl ? ` (TTL: ${ttl}s)` : ''}`);
      return true;
    } catch (error) {
      logger.error(`Failed to set cache for key ${key}`, error);
      return false;
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.client.get(key);
      if (value !== null) {
        this.stats.hits++;
        logger.debug(`Cache hit: ${key}`);
        return JSON.parse(value) as T;
      } else {
        this.stats.misses++;
        logger.debug(`Cache miss: ${key}`);
        return undefined;
      }
    } catch (error) {
      logger.error(`Failed to get cache for key ${key}`, error);
      this.stats.misses++;
      return undefined;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      logger.debug(`Cache delete: ${key} (${result > 0 ? 'success' : 'not found'})`);
      return result > 0;
    } catch (error) {
      logger.error(`Failed to delete cache for key ${key}`, error);
      return false;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error(`Failed to check cache for key ${key}`, error);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      if (this.config.keyPrefix) {
        // 只删除带前缀的键
        const pattern = `${this.config.keyPrefix}*`;
        const stream = this.client.scanStream({ match: pattern, count: 100 });

        stream.on('data', async (keys: string[]) => {
          if (keys.length) {
            const pipeline = this.client.pipeline();
            keys.forEach(key => pipeline.del(key));
            await pipeline.exec();
          }
        });

        await new Promise<void>((resolve, reject) => {
          stream.on('end', () => resolve());
          stream.on('error', error => reject(error));
        });
      } else {
        await this.client.flushdb();
      }
      this.stats = { hits: 0, misses: 0 };
      logger.info('All cache cleared');
    } catch (error) {
      logger.error('Failed to clear cache', error);
    }
  }

  async getStats(): Promise<ICacheStats> {
    try {
      const info = await this.client.info('stats');
      const dbSize = await this.client.dbsize();

      const total = this.stats.hits + this.stats.misses;
      const hitRate = total > 0 ? this.stats.hits / total : 0;

      return {
        keys: dbSize,
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: Math.round(hitRate * 10000) / 100,
        size: dbSize,
        info: this.parseRedisInfo(info),
      };
    } catch (error) {
      logger.error('Failed to get cache stats', error);
      return {
        keys: 0,
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: 0,
      };
    }
  }

  private parseRedisInfo(info: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = info.split('\r\n');
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = value;
        }
      }
    }
    return result;
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
      logger.info('Redis cache manager closed');
    } catch (error) {
      logger.error('Failed to close Redis cache manager', error);
    }
  }

  /**
   * 批量设置缓存
   */
  async mset(data: Array<{ key: string; value: any; ttl?: number }>): Promise<boolean> {
    try {
      const pipeline = this.client.pipeline();
      for (const item of data) {
        const serialized = JSON.stringify(item.value);
        if (item.ttl) {
          pipeline.setex(item.key, item.ttl, serialized);
        } else {
          pipeline.set(item.key, serialized);
        }
      }
      await pipeline.exec();
      return true;
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
    try {
      const values = await this.client.mget(...keys);
      keys.forEach((key, index) => {
        const value = values[index] ?? null;
        if (value !== null) {
          result[key] = JSON.parse(value) as T;
          this.stats.hits++;
        } else {
          result[key] = undefined;
          this.stats.misses++;
        }
      });
    } catch (error) {
      logger.error('Failed to batch get cache', error);
      keys.forEach(key => {
        result[key] = undefined;
        this.stats.misses++;
      });
    }
    return result;
  }

  /**
   * 批量删除缓存
   */
  async mdel(keys: string[]): Promise<number> {
    try {
      const result = await this.client.del(...keys);
      return result;
    } catch (error) {
      logger.error('Failed to batch delete cache', error);
      return 0;
    }
  }

  /**
   * 获取匹配模式的所有键
   * @param pattern 匹配模式（Redis SCAN 模式，支持 * 和 ?）
   * @returns 匹配的键数组
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      const keys: string[] = [];
      const stream = this.client.scanStream({
        match: pattern,
        count: 100,
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (resultKeys: string[]) => {
          keys.push(...resultKeys);
        });
        stream.on('end', () => resolve());
        stream.on('error', (error: Error) => reject(error));
      });

      logger.debug(`Found ${keys.length} keys matching pattern: ${pattern}`);
      return keys;
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
    try {
      const keys = await this.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }
      return await this.mdel(keys);
    } catch (error) {
      logger.error(`Failed to delete keys by pattern ${pattern}`, error);
      return 0;
    }
  }

  /**
   * 获取 Redis 客户端（用于高级操作）
   */
  getClient(): Redis {
    return this.client;
  }
}
