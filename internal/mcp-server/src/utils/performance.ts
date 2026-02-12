/**
 * 性能优化工具
 */

import { cpus } from 'node:os';

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
