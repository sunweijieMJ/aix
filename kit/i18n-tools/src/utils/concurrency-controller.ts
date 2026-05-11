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
   *
   * 队列中的 task 已在 add() 内包装了 try-catch，正常路径下 `await task()` 不会抛。
   * 但用 try/finally 兜底是防御性的：若未来有人直接 `controller.queue.push(rawTask)`
   * 绕过 add，或 add 内的 Promise 包装本身抛错（如 reject 内的代码异常），running
   * 计数仍能正确回落，避免槽位泄漏导致后续任务永远 pending。
   */
  private async process(): Promise<void> {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift()!;

    try {
      await task();
    } finally {
      this.running--;
      void this.process();
    }
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
