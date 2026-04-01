/**
 * Playwright Page 池管理器
 *
 * 复用 Page 实例以提升截图性能：
 * - 避免每次截图都创建/销毁 Page（节省 200-500ms）
 * - 自动重置 Page 状态（goto about:blank）
 * - 支持池大小配置
 * - 自动清理资源
 */

import type { Page, BrowserContext } from 'playwright';
import { logger } from '../../utils/logger';

const log = logger.child('PagePool');

export class PagePool {
  private pool: Page[] = [];
  private busy = new Set<Page>();
  private readonly maxSize: number;
  private context: BrowserContext | null = null;
  private waitingQueue: Array<{
    resolve: (page: Page) => void;
    reject: (error: Error) => void;
  }> = [];

  /** 等待队列超时时间 (ms) */
  private readonly acquireTimeout: number;

  constructor(maxSize: number = 5, acquireTimeout: number = 30_000) {
    this.maxSize = maxSize;
    this.acquireTimeout = acquireTimeout;
    log.debug(`PagePool created with max size: ${maxSize}`);
  }

  /**
   * 设置 BrowserContext（初始化后调用）
   */
  setContext(context: BrowserContext): void {
    this.context = context;
  }

  /**
   * 获取一个 Page（优先从池中获取，池空则创建新的或等待）
   */
  async acquire(): Promise<Page> {
    // 优先使用池中的空闲 Page
    if (this.pool.length > 0) {
      const page = this.pool.pop()!;
      this.busy.add(page);

      // 重置 Page 状态
      try {
        await page.goto('about:blank', {
          waitUntil: 'domcontentloaded',
          timeout: 5000,
        });
      } catch (error) {
        log.warn('Failed to reset page, creating new one', error);
        await page.close().catch(() => {});
        this.busy.delete(page);
        return this.createNewPage();
      }

      log.debug(
        `Page acquired from pool (pool: ${this.pool.length}, busy: ${this.busy.size})`,
      );
      return page;
    }

    // 检查是否达到最大数量限制
    const totalPages = this.busy.size + this.pool.length;
    if (totalPages >= this.maxSize) {
      // 达到上限，等待其他 Page 被释放（带超时）
      log.debug(
        `Page pool at max capacity (${totalPages}/${this.maxSize}), waiting...`,
      );
      return new Promise<Page>((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = this.waitingQueue.findIndex((w) => w.resolve === resolve);
          if (idx !== -1) this.waitingQueue.splice(idx, 1);
          reject(
            new Error(`Page acquire timeout after ${this.acquireTimeout}ms`),
          );
        }, this.acquireTimeout);

        this.waitingQueue.push({
          resolve: (page: Page) => {
            clearTimeout(timer);
            resolve(page);
          },
          reject: (error: Error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
      });
    }

    // 未达上限，创建新 Page
    return this.createNewPage();
  }

  /**
   * 归还 Page 到池
   */
  release(page: Page): void {
    this.busy.delete(page);

    // 如果有等待队列，优先分配给等待者
    if (this.waitingQueue.length > 0) {
      const waiter = this.waitingQueue.shift()!;
      this.busy.add(page);
      log.debug(
        `Page allocated to waiting request (pool: ${this.pool.length}, busy: ${this.busy.size}, waiting: ${this.waitingQueue.length})`,
      );
      // 异步重置并分配
      this.resetAndResolve(page, waiter.resolve).catch((error) => {
        log.error('Failed to reset page for waiting request', error);
        this.busy.delete(page);
        page.close().catch(() => {});
        waiter.reject(
          new Error('Failed to acquire page: reset and creation both failed', {
            cause: error,
          }),
        );
      });
      return;
    }

    // 池未满，归还
    if (this.pool.length < this.maxSize) {
      this.pool.push(page);
      log.debug(
        `Page released to pool (pool: ${this.pool.length}, busy: ${this.busy.size})`,
      );
    } else {
      // 池已满，销毁
      page.close().catch(() => {});
      log.debug(
        `Page closed (pool full: ${this.pool.length}/${this.maxSize}, busy: ${this.busy.size})`,
      );
    }
  }

  /**
   * 重置 Page 并分配给等待者
   *
   * 注意：调用前 page 已在 busy 中。成功时 page 仍在 busy 中；
   * 失败时旧 page 从 busy 移除并关闭，新 page 通过 createNewPage 加入 busy。
   */
  private async resetAndResolve(
    page: Page,
    resolve: (page: Page) => void,
  ): Promise<void> {
    try {
      await page.goto('about:blank', {
        waitUntil: 'domcontentloaded',
        timeout: 5000,
      });
      resolve(page);
    } catch (error) {
      // 重置失败，先清理旧 page
      log.warn('Page reset failed, creating new page', error);
      this.busy.delete(page);
      await page.close().catch(() => {});
      // createNewPage 内部会将新 page 加入 busy
      const newPage = await this.createNewPage();
      resolve(newPage);
    }
  }

  /**
   * 清空池，关闭所有 Page
   */
  async drain(): Promise<void> {
    log.debug(
      `Draining page pool (pool: ${this.pool.length}, busy: ${this.busy.size}, waiting: ${this.waitingQueue.length})`,
    );

    // 先拒绝所有等待中的请求，防止 Promise 永久挂起
    const drainError = new Error('Page pool drained');
    for (const waiter of this.waitingQueue) {
      waiter.reject(drainError);
    }
    this.waitingQueue = [];

    await Promise.all([
      ...this.pool.map((p) => p.close().catch(() => {})),
      ...Array.from(this.busy).map((p) => p.close().catch(() => {})),
    ]);

    this.pool = [];
    this.busy.clear();

    log.debug('Page pool drained');
  }

  /**
   * 获取池状态
   */
  getStats() {
    return {
      poolSize: this.pool.length,
      busySize: this.busy.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * 创建新 Page
   */
  private async createNewPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('BrowserContext not set. Call setContext() first.');
    }

    const page = await this.context.newPage();
    this.busy.add(page);
    log.debug(
      `New page created (pool: ${this.pool.length}, busy: ${this.busy.size})`,
    );
    return page;
  }
}
