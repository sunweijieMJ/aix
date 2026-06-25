/**
 * PagePool 单元测试
 *
 * 重点回归 Bug：acquire 超时后，失效的 waiter 必须从等待队列移除。
 * 否则后续 release 会把 page 分配给已 reject 的 waiter，导致 page 进入 busy 永不归还（泄漏）。
 */

import { describe, it, expect, vi } from 'vitest';
import type { Page, BrowserContext } from 'playwright';
import { PagePool } from '../../../src/core/screenshot/page-pool';

/** 构造最小 Page mock（仅覆盖 PagePool 用到的 goto/close） */
function makeMockPage(): Page {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
}

/** 构造最小 BrowserContext mock，记录所有创建的 page */
function makeMockContext(): { context: BrowserContext; created: Page[] } {
  const created: Page[] = [];
  const context = {
    newPage: vi.fn().mockImplementation(async () => {
      const page = makeMockPage();
      created.push(page);
      return page;
    }),
  } as unknown as BrowserContext;
  return { context, created };
}

describe('PagePool', () => {
  it('从池中复用已归还的 page，而非重复创建', async () => {
    const { context, created } = makeMockContext();
    const pool = new PagePool(2);
    pool.setContext(context);

    const p1 = await pool.acquire();
    pool.release(p1);
    const p2 = await pool.acquire();

    expect(p2).toBe(p1); // 复用同一个 page
    expect(created).toHaveLength(1); // 只创建过一次
  });

  it('[Bug 回归] acquire 超时后 waiter 出队，release 不会泄漏 page', async () => {
    const { context, created } = makeMockContext();
    // 池容量 1，超时 50ms
    const pool = new PagePool(1, 50);
    pool.setContext(context);

    // 占满池
    const p1 = await pool.acquire();
    expect(pool.getStats()).toMatchObject({ busySize: 1, poolSize: 0 });

    // 第二次 acquire 池已满 → 进入等待 → 超时 reject
    await expect(pool.acquire()).rejects.toThrow(/timeout/i);

    // 关键：超时后归还 p1。
    // 修复前：失效 waiter 仍在队列 → release 把 p1 分配给死 waiter → p1 永留 busy（泄漏）。
    // 修复后：waiter 已出队 → release 把 p1 放回池。
    pool.release(p1);

    const stats = pool.getStats();
    expect(stats.busySize).toBe(0);
    expect(stats.poolSize).toBe(1);

    // 进一步验证：下次 acquire 能拿到归还的 p1，且没有创建新 page
    const p3 = await pool.acquire();
    expect(p3).toBe(p1);
    expect(created).toHaveLength(1);
  });

  it('有等待者时，release 直接把 page 交给等待者', async () => {
    const { context } = makeMockContext();
    const pool = new PagePool(1, 5000);
    pool.setContext(context);

    const p1 = await pool.acquire();
    // 第二次 acquire 进入等待
    const pending = pool.acquire();

    // 归还 p1 → 应立即兑现等待中的 acquire
    pool.release(p1);
    const p2 = await pending;

    expect(p2).toBe(p1);
    expect(pool.getStats()).toMatchObject({ busySize: 1, poolSize: 0 });
  });

  it('drain 拒绝所有等待中的请求并关闭所有 page', async () => {
    const { context } = makeMockContext();
    const pool = new PagePool(1, 5000);
    pool.setContext(context);

    const p1 = await pool.acquire();
    const pending = pool.acquire(); // 进入等待

    await pool.drain();

    await expect(pending).rejects.toThrow(/drained/i);
    expect(p1.close as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect(pool.getStats()).toMatchObject({ busySize: 0, poolSize: 0 });
  });
});
