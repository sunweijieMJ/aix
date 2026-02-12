/**
 * 缓存管理器 - 简化的纯内存缓存实现
 *
 * 设计说明：
 * - 方法声明为 async 是为了保持 API 一致性和未来可扩展性
 * - 当前实现是同步的内存缓存，但 async 签名允许未来无缝切换到
 *   异步存储（如 Redis、IndexedDB 等）而无需修改调用方代码
 */

import { DEFAULT_CACHE_TTL } from '../constants';
import type { CacheItem } from '../types/index';
import { log } from './logger';

// 默认最大缓存条目数
const DEFAULT_MAX_ITEMS = 1000;

/**
 * 缓存配置
 */
export interface CacheConfig {
  maxItems?: number;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  memoryItems: number;
  maxItems: number;
  hits: number;
  misses: number;
  hitRate: string;
  size: number;
  sizeFormatted: string;
}

/**
 * 内存缓存管理器
 */
export class CacheManager {
  private cache = new Map<string, CacheItem<unknown>>();
  private hits = 0;
  private misses = 0;
  private readonly maxItems: number;

  constructor(config: CacheConfig = {}) {
    this.maxItems = config.maxItems ?? DEFAULT_MAX_ITEMS;
  }

  /**
   * 获取缓存项
   */
  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key) as CacheItem<T> | undefined;

    if (!item) {
      this.misses++;
      return null;
    }

    // 检查是否过期
    if (this.isExpired(item)) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return item.data;
  }

  /**
   * 设置缓存项
   */
  async set<T>(key: string, data: T, ttl = DEFAULT_CACHE_TTL): Promise<void> {
    // 如果达到上限，删除最旧的条目
    if (this.cache.size >= this.maxItems && !this.cache.has(key)) {
      this.evictOldest();
    }

    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    this.cache.set(key, item);
  }

  /**
   * 淘汰最旧的缓存条目
   */
  private evictOldest(): void {
    // Map 保持插入顺序，第一个就是最旧的
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey !== undefined) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 删除缓存项
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    log.info('Cache cleared');
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total).toFixed(2) : '0.00';

    // 估算缓存大小
    let size = 0;
    for (const item of this.cache.values()) {
      try {
        size += JSON.stringify(item).length;
      } catch {
        // 忽略序列化错误
      }
    }

    return {
      memoryItems: this.cache.size,
      maxItems: this.maxItems,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      size,
      sizeFormatted: this.formatSize(size),
    };
  }

  /**
   * 清理过期缓存
   */
  async cleanupExpired(): Promise<number> {
    let cleanedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (this.isExpired(item)) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      log.debug(`Cleaned up ${cleanedCount} expired cache items`);
    }

    return cleanedCount;
  }

  /**
   * 检查缓存项是否过期
   */
  private isExpired(item: CacheItem<unknown>): boolean {
    return Date.now() - item.timestamp > item.ttl;
  }

  /**
   * 格式化大小
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

/**
 * 创建缓存管理器
 */
export function createCacheManager(): CacheManager {
  return new CacheManager();
}
