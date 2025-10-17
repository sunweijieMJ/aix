/**
 * 性能优化工具
 */

import { readFile, stat } from 'node:fs/promises';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { BYTES_PER_KB, BYTES_PER_MB, DEFAULT_CACHE_TTL } from '../constants';
import { log } from './logger';

/**
 * 大文件处理器
 */
export class LargeFileProcessor {
  private maxFileSize: number;
  private chunkSize: number;

  constructor(maxFileSize = 10 * BYTES_PER_MB, chunkSize = BYTES_PER_MB) {
    // 10MB, 1MB chunks
    this.maxFileSize = maxFileSize;
    this.chunkSize = chunkSize;
  }

  /**
   * 安全读取文件（处理大文件）
   */
  async safeReadFile(filePath: string): Promise<string | null> {
    try {
      const stats = await stat(filePath);

      if (stats.size > this.maxFileSize) {
        log.warn(
          `File ${filePath} is too large (${Math.round(stats.size / BYTES_PER_MB)}MB), skipping`,
        );
        return null;
      }

      if (stats.size > this.chunkSize) {
        return await this.readFileInChunks(filePath);
      }

      return await readFile(filePath, 'utf8');
    } catch (error) {
      log.warn(`Failed to read file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 分块读取文件
   */
  private async readFileInChunks(filePath: string): Promise<string> {
    const chunks: string[] = [];
    const fs = await import('node:fs');

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });

      stream.on('data', (chunk: string | Buffer) => {
        chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      });

      stream.on('end', () => {
        resolve(chunks.join(''));
      });

      stream.on('error', reject);
    });
  }

  /**
   * 检查文件是否过大
   */
  async isFileTooLarge(filePath: string): Promise<boolean> {
    try {
      const stats = await stat(filePath);
      return stats.size > this.maxFileSize;
    } catch {
      return false;
    }
  }
}

/**
 * 并发控制器
 */
export class ConcurrencyController {
  private maxConcurrent: number;
  private running = 0;
  private queue: Array<() => Promise<unknown>> = [];

  constructor(maxConcurrent?: number) {
    this.maxConcurrent =
      maxConcurrent || Math.max(2, Math.floor(cpus().length / 2));
  }

  /**
   * 添加任务到队列
   */
  async execute<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift();

    if (task) {
      try {
        await task();
      } finally {
        this.running--;
        this.processQueue();
      }
    }
  }

  /**
   * 等待所有任务完成
   */
  async waitForAll(): Promise<void> {
    while (this.running > 0 || this.queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

/**
 * 内存优化的缓存
 */
export class OptimizedCache<T> {
  private cache = new Map<
    string,
    { data: T; timestamp: number; size: number }
  >();

  private maxSize: number;
  private currentSize = 0;
  private ttl: number;

  constructor(maxSize = 50 * BYTES_PER_MB, ttl = DEFAULT_CACHE_TTL) {
    // 50MB, 1 hour
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * 设置缓存项
   */
  set(key: string, data: T): void {
    const size = this.estimateSize(data);
    const now = Date.now();

    // 检查是否需要清理过期项
    this.cleanupExpired();

    // 检查是否需要释放空间
    if (this.currentSize + size > this.maxSize) {
      this.evictLRU(size);
    }

    this.cache.set(key, { data, timestamp: now, size });
    this.currentSize += size;
  }

  /**
   * 获取缓存项
   */
  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.ttl) {
      this.delete(key);
      return null;
    }

    return item.data;
  }

  /**
   * 删除缓存项
   */
  delete(key: string): void {
    const item = this.cache.get(key);
    if (item) {
      this.cache.delete(key);
      this.currentSize -= item.size;
    }
  }

  /**
   * 清理过期项
   */
  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > this.ttl) {
        this.delete(key);
      }
    }
  }

  /**
   * LRU 淘汰
   */
  private evictLRU(neededSize: number): void {
    const entries = Array.from(this.cache.entries()).sort(
      ([, a], [, b]) => a.timestamp - b.timestamp,
    );

    let freedSize = 0;
    for (const [key] of entries) {
      if (freedSize >= neededSize) break;
      const item = this.cache.get(key);
      if (item) {
        freedSize += item.size;
        this.delete(key);
      }
    }
  }

  /**
   * 估算数据大小
   */
  private estimateSize(data: T): number {
    try {
      return JSON.stringify(data).length * 2; // 粗略估算
    } catch {
      return BYTES_PER_KB; // 默认 1KB
    }
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    return {
      entries: this.cache.size,
      currentSize: this.currentSize,
      maxSize: this.maxSize,
      hitRatio: 0, // 可以扩展添加命中率统计
    };
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }
}

/**
 * Worker 线程池
 */
export class WorkerPool {
  private workers: Worker[] = [];
  private taskQueue: Array<{
    task: unknown;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }> = [];

  private busyWorkers = new Set<Worker>();

  constructor(
    private workerScript: string,
    private poolSize?: number,
  ) {
    this.poolSize = poolSize || Math.max(2, cpus().length - 1);
    this.initializeWorkers();
  }

  /**
   * 初始化 Worker 池
   */
  private initializeWorkers(): void {
    for (let i = 0; i < this.poolSize!; i++) {
      const worker = new Worker(this.workerScript);

      worker.on('message', () => {
        this.busyWorkers.delete(worker);
        this.processNextTask();
      });

      worker.on('error', (error) => {
        log.error('Worker error:', error);
        this.busyWorkers.delete(worker);
      });

      this.workers.push(worker);
    }
  }

  /**
   * 执行任务
   */
  async execute<T>(task: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ task, resolve, reject });
      this.processNextTask();
    });
  }

  /**
   * 处理下一个任务
   */
  private processNextTask(): void {
    if (this.taskQueue.length === 0) return;

    const availableWorker = this.workers.find((w) => !this.busyWorkers.has(w));
    if (!availableWorker) return;

    const { task, resolve, reject } = this.taskQueue.shift()!;
    this.busyWorkers.add(availableWorker);

    availableWorker.once('message', resolve);
    availableWorker.once('error', reject);
    availableWorker.postMessage(task);
  }

  /**
   * 关闭线程池
   */
  async terminate(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }

  /**
   * 获取池状态
   */
  getStatus() {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.busyWorkers.size,
      queuedTasks: this.taskQueue.length,
    };
  }
}

/**
 * 批处理工具
 */
export class BatchProcessor<T, R> {
  private batchSize: number;
  private processor: (batch: T[]) => Promise<R[]>;

  constructor(batchSize: number, processor: (batch: T[]) => Promise<R[]>) {
    this.batchSize = batchSize;
    this.processor = processor;
  }

  /**
   * 批量处理数据
   */
  async process(items: T[]): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      const batchResults = await this.processor(batch);
      results.push(...batchResults);
    }

    return results;
  }
}

/**
 * 创建性能优化实例
 */
export function createPerformanceUtils() {
  return {
    largeFileProcessor: new LargeFileProcessor(),
    concurrencyController: new ConcurrencyController(),
    optimizedCache: new OptimizedCache(),
    batchProcessor: (
      batchSize: number,
      processor: (batch: unknown[]) => Promise<unknown[]>,
    ) => new BatchProcessor(batchSize, processor),
  };
}
