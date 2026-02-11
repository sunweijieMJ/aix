/**
 * 性能优化工具
 */

import { readFile, stat } from 'node:fs/promises';
import { cpus } from 'node:os';
import { BYTES_PER_MB } from '../constants';
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
 * 创建性能优化实例
 */
export function createPerformanceUtils() {
  return {
    largeFileProcessor: new LargeFileProcessor(),
    concurrencyController: new ConcurrencyController(),
  };
}
