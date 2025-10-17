import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BYTES_PER_KB, BYTES_PER_MB, DEFAULT_CACHE_TTL } from '../constants';
import type { CacheItem } from '../types/index';
import { log } from './logger';

/**
 * 缓存监控器（内部使用）
 */
class CacheMonitor {
  private metrics: {
    hits: number;
    misses: number;
    size: number;
    operations: Array<{
      op: 'get' | 'set' | 'delete';
      key: string;
      hit?: boolean;
      time: number;
      size?: number;
    }>;
  };

  constructor(private maxOperationsLog = 100) {
    this.metrics = {
      hits: 0,
      misses: 0,
      size: 0,
      operations: [],
    };
  }

  /**
   * 记录缓存命中
   */
  recordHit(key: string): void {
    this.metrics.hits++;
    this.logOperation('get', key, true);
  }

  /**
   * 记录缓存未命中
   */
  recordMiss(key: string): void {
    this.metrics.misses++;
    this.logOperation('get', key, false);
  }

  /**
   * 记录缓存设置
   */
  recordSet(key: string, size: number): void {
    this.metrics.size += size;
    this.logOperation('set', key, undefined, size);
  }

  /**
   * 记录缓存删除
   */
  recordDelete(key: string, size: number): void {
    this.metrics.size -= size;
    this.logOperation('delete', key, undefined, size);
  }

  /**
   * 记录操作
   */
  private logOperation(
    op: 'get' | 'set' | 'delete',
    key: string,
    hit?: boolean,
    size?: number,
  ): void {
    this.metrics.operations.push({
      op,
      key,
      hit,
      time: Date.now(),
      size,
    });

    // 保持操作日志在限定大小内
    if (this.metrics.operations.length > this.maxOperationsLog) {
      this.metrics.operations.shift();
    }
  }

  /**
   * 获取缓存指标
   */
  getMetrics() {
    const hitRate =
      this.metrics.hits + this.metrics.misses === 0
        ? 0
        : this.metrics.hits / (this.metrics.hits + this.metrics.misses);

    return {
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      hitRate: hitRate.toFixed(2),
      size: this.metrics.size,
      sizeFormatted: this.formatSize(this.metrics.size),
      recentOperations: this.metrics.operations.slice(-10),
    };
  }

  /**
   * 格式化大小
   */
  private formatSize(bytes: number): string {
    if (bytes < BYTES_PER_KB) return `${bytes} B`;
    if (bytes < BYTES_PER_MB) return `${(bytes / BYTES_PER_KB).toFixed(2)} KB`;
    return `${(bytes / BYTES_PER_MB).toFixed(2)} MB`;
  }

  /**
   * 重置指标
   */
  reset(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      size: 0,
      operations: [],
    };
  }
}

/**
 * 缓存管理器
 */
export class CacheManager {
  private memoryCache: Map<string, CacheItem<any>> = new Map();
  private fileCache: string;
  private monitor: CacheMonitor;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(cacheDir: string) {
    this.fileCache = cacheDir;
    this.monitor = new CacheMonitor();

    // 确保缓存目录存在
    this.ensureCacheDir();

    // 启动自动清理
    this.startCleanupScheduler();
  }

  /**
   * 获取缓存项
   */
  async get<T>(key: string): Promise<T | null> {
    // 先检查内存缓存
    const memItem = this.memoryCache.get(key);
    if (memItem && !this.isExpired(memItem)) {
      this.monitor.recordHit(key);
      return memItem.data;
    }

    // 再检查文件缓存
    try {
      const filePath = this.getFilePath(key);
      if (!existsSync(filePath)) {
        this.monitor.recordMiss(key);
        return null;
      }

      const content = await readFile(filePath, 'utf8');
      const item: CacheItem<T> = JSON.parse(content);

      if (this.isExpired(item)) {
        this.monitor.recordMiss(key);
        await this.delete(key);
        return null;
      }

      // 添加到内存缓存
      this.memoryCache.set(key, item);
      this.monitor.recordHit(key);

      return item.data;
    } catch (error) {
      log.error('Failed to get cache item:', error);
      this.monitor.recordMiss(key);
      return null;
    }
  }

  /**
   * 设置缓存项
   */
  async set<T>(key: string, data: T, ttl = DEFAULT_CACHE_TTL): Promise<void> {
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    // 设置内存缓存
    this.memoryCache.set(key, item);

    // 设置文件缓存
    try {
      const filePath = this.getFilePath(key);
      const content = JSON.stringify(item);
      await writeFile(filePath, content, 'utf8');

      // 记录缓存设置
      this.monitor.recordSet(key, content.length);
    } catch (error) {
      log.error(`Failed to write cache file for ${key}:`, error);
    }
  }

  /**
   * 删除缓存项
   */
  async delete(key: string): Promise<void> {
    // 获取缓存项大小（用于监控）
    let size = 0;
    try {
      const item = this.memoryCache.get(key);
      if (item) {
        size = JSON.stringify(item).length;
      }
    } catch {
      // 忽略错误
    }

    // 删除内存缓存
    this.memoryCache.delete(key);

    // 删除文件缓存
    try {
      const { unlink } = await import('node:fs/promises');
      const filePath = this.getFilePath(key);

      if (existsSync(filePath)) {
        await unlink(filePath);
      }

      // 记录缓存删除
      this.monitor.recordDelete(key, size);
    } catch (error) {
      log.error('Failed to delete cache file:', error);
    }
  }

  /**
   * 清空缓存
   */
  async clear(): Promise<void> {
    // 清空内存缓存
    this.memoryCache.clear();

    // 清空文件缓存
    try {
      const { rm } = await import('node:fs/promises');
      await rm(this.fileCache, { recursive: true, force: true });
      await this.ensureCacheDir();

      // 重置监控指标
      this.monitor.reset();
    } catch (error) {
      log.error('Failed to clear cache directory:', error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      memoryItems: this.memoryCache.size,
      ...this.monitor.getMetrics(),
    };
  }

  /**
   * 启动自动清理调度器
   */
  private startCleanupScheduler(): void {
    // 每5分钟清理一次过期缓存
    this.cleanupTimer = setInterval(
      () => {
        this.cleanupExpired().catch((error) => {
          log.error('Cache cleanup failed:', error);
        });
      },
      5 * 60 * 1000,
    ); // 5分钟
  }

  /**
   * 停止自动清理调度器
   */
  stopCleanupScheduler(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * 清理过期的缓存项
   */
  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    // 清理内存缓存
    for (const [key, item] of this.memoryCache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      log.debug(`Cleaned up ${cleanedCount} expired cache items`);
    }

    return cleanedCount;
  }

  /**
   * 清理所有缓存
   */
  async clearAll(): Promise<void> {
    // 清理内存缓存
    this.memoryCache.clear();
    log.info('All cache cleared');
  }

  /**
   * 检查缓存项是否过期
   */
  private isExpired(item: CacheItem<any>): boolean {
    return Date.now() - item.timestamp > item.ttl;
  }

  /**
   * 获取缓存文件路径
   */
  private getFilePath(key: string): string {
    // 简单的哈希函数
    const hash = Buffer.from(key).toString('base64').replace(/[/+=]/g, '_');
    return join(this.fileCache, `${hash}.json`);
  }

  /**
   * 确保缓存目录存在
   */
  private async ensureCacheDir(): Promise<void> {
    try {
      await mkdir(this.fileCache, { recursive: true });
    } catch (error) {
      log.error('Failed to create cache directory:', error);
    }
  }
}

/**
 * 创建缓存管理器
 */
export function createCacheManager(cacheDir: string): CacheManager {
  return new CacheManager(cacheDir);
}
