/**
 * 并发控制器
 * 管理并发请求的数量和执行顺序
 */
export class ConcurrencyController {
  private queue: Array<() => Promise<any>> = [];
  private running: number = 0;
  private maxConcurrency: number;

  constructor(maxConcurrency: number = 5) {
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * 原地调整最大并发数；调高时主动拉起被阻塞的队列任务。
   *
   * Why: 之前 LLMClient.adjustConcurrency 直接 new 一个新 controller 替换字段，
   *      旧 controller 中已 enqueue 但未启动的任务永远不会被消费，对应 Promise
   *      永远 pending，造成翻译/ID 生成卡死。原地调整可保留队列与 running 状态。
   */
  setMaxConcurrency(maxConcurrency: number): void {
    if (maxConcurrency < 1) return;
    const previous = this.maxConcurrency;
    this.maxConcurrency = maxConcurrency;
    // 调高时按差值多拉起若干任务；调低时不抢占已运行任务，等其自然回落
    if (maxConcurrency > previous) {
      const slots = maxConcurrency - previous;
      for (let i = 0; i < slots; i++) void this.process();
    }
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
    void this.process();
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

  /** 当前最大并发数 */
  getMaxConcurrency(): number {
    return this.maxConcurrency;
  }
}
