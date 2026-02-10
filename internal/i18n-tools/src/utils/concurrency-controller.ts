/**
 * 并发控制器
 * 管理并发请求的数量和执行顺序
 */
export class ConcurrencyController {
  private queue: Array<() => Promise<any>> = [];
  private running: number = 0;
  private readonly maxConcurrency: number;

  constructor(maxConcurrency: number = 5) {
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * 添加任务到队列
   * @param task - 异步任务函数
   * @returns Promise
   */
  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  /**
   * 处理队列中的任务
   * 注意: 队列中的 task 已在 add() 中包装了 try-catch，不会抛出异常
   */
  private async process(): Promise<void> {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift()!;

    await task();
    this.running--;
    this.process();
  }

  /**
   * 获取当前队列状态
   */
  getStatus(): { running: number; queued: number; maxConcurrency: number } {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrency: this.maxConcurrency,
    };
  }
}
