/**
 * 缓存管理器 - 适配自 mcp-server 的 CacheManager
 *
 * 内存缓存，支持 TTL 过期、LRU 淘汰、统计信息
 * 用于 LLM 分析结果缓存（默认 1 小时 TTL）
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger';

/** 默认缓存 TTL：1 小时（毫秒） */
const DEFAULT_CACHE_TTL = 60 * 60 * 1000;

/** 默认最大缓存条目数 */
const DEFAULT_MAX_ITEMS = 500;

/**
 * 缓存条目
 */
interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  /** 最大缓存条目数 */
  maxItems?: number;
  /** 默认 TTL（毫秒） */
  defaultTTL?: number;
  /** 文件持久化路径（设置后缓存自动持久化到磁盘） */
  persistPath?: string;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  items: number;
  maxItems: number;
  hits: number;
  misses: number;
  hitRate: string;
}

/**
 * 内存缓存管理器
 */
export class CacheManager {
  private cache = new Map<string, CacheItem<unknown>>();
  private accessOrder = new Map<string, number>(); // key -> 最后访问时间
  private hits = 0;
  private misses = 0;
  private readonly maxItems: number;
  private readonly defaultTTL: number;
  private readonly persistPath?: string;
  private loaded = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: CacheConfig = {}) {
    this.maxItems = config.maxItems ?? DEFAULT_MAX_ITEMS;
    this.defaultTTL = config.defaultTTL ?? DEFAULT_CACHE_TTL;
    this.persistPath = config.persistPath;
  }

  /**
   * 获取缓存项
   */
  /**
   * 从文件加载缓存（首次访问时懒加载）
   */
  async loadFromDisk(): Promise<void> {
    if (this.loaded || !this.persistPath) return;
    this.loaded = true;

    try {
      const data = await fs.readFile(this.persistPath, 'utf-8');
      const entries: Array<[string, CacheItem<unknown>]> = JSON.parse(data);
      for (const [key, item] of entries) {
        if (!this.isExpired(item)) {
          this.cache.set(key, item);
          this.accessOrder.set(key, item.timestamp);
        }
      }
      logger.debug(`Loaded ${this.cache.size} cache entries from disk`);
    } catch {
      // 文件不存在或损坏，忽略
    }
  }

  /**
   * 保存缓存到文件（防抖 500ms）
   */
  private scheduleSave(): void {
    if (!this.persistPath) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveToDisk(), 500);
  }

  private async saveToDisk(): Promise<void> {
    if (!this.persistPath) return;

    try {
      const dir = path.dirname(this.persistPath);
      await fs.mkdir(dir, { recursive: true });
      const entries = Array.from(this.cache.entries()).filter(
        ([, item]) => !this.isExpired(item),
      );
      await fs.writeFile(this.persistPath, JSON.stringify(entries), 'utf-8');
    } catch (error) {
      logger.debug(
        `Failed to save cache to disk: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key) as CacheItem<T> | undefined;

    if (!item) {
      this.misses++;
      return null;
    }

    if (this.isExpired(item)) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.misses++;
      return null;
    }

    // 更新访问时间
    this.accessOrder.set(key, Date.now());
    this.hits++;
    return item.data;
  }

  /**
   * 设置缓存项
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // 达到上限时淘汰最久未访问的条目
    if (this.cache.size >= this.maxItems && !this.cache.has(key)) {
      this.evictLRU();
    }

    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    };
    this.cache.set(key, item);
    this.accessOrder.set(key, Date.now());
    this.scheduleSave();
  }

  /**
   * 检查缓存项是否存在且未过期
   */
  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;
    if (this.isExpired(item)) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return false;
    }
    return true;
  }

  /**
   * 删除缓存项
   */
  delete(key: string): void {
    this.cache.delete(key);
    this.accessOrder.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.hits = 0;
    this.misses = 0;
    logger.debug('Cache cleared');
  }

  /**
   * 清理过期缓存
   */
  cleanupExpired(): number {
    let cleaned = 0;
    for (const [key, item] of this.cache.entries()) {
      if (this.isExpired(item)) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired cache items`);
    }
    return cleaned;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      items: this.cache.size,
      maxItems: this.maxItems,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total).toFixed(2) : '0.00',
    };
  }

  private isExpired(item: CacheItem<unknown>): boolean {
    return Date.now() - item.timestamp > item.ttl;
  }

  /**
   * 淘汰最久未访问的条目（LRU）
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, lastAccessTime] of this.accessOrder.entries()) {
      if (lastAccessTime < oldestTime) {
        oldestTime = lastAccessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
      logger.debug(`Evicted LRU cache key: ${oldestKey}`);
    }
  }
}
