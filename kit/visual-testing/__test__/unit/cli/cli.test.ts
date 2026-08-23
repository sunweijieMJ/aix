/**
 * CLI 入口（cli.ts）单元测试
 *
 * 测试重点：
 * - 子命令 async action 抛出的逃逸异常应被顶层 catch 兜住，
 *   转为非零退出码 + 友好错误输出，而非 unhandled rejection
 *   （回归：必须用 parseAsync 而非 parse，否则 async action 不被 await）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Command } from 'commander';

const { registerInitCommand, registerSyncCommand, registerTestCommand } = vi.hoisted(() => ({
  registerInitCommand: vi.fn(),
  registerSyncCommand: vi.fn(),
  // 注册一个 action 会抛错的 test 命令，模拟"配置加载失败"等逃逸异常
  registerTestCommand: vi.fn((program: Command) => {
    program.command('test').action(async () => {
      throw new Error('config load failed');
    });
  }),
}));

vi.mock('../../../src/cli/commands', () => ({
  registerInitCommand,
  registerSyncCommand,
  registerTestCommand,
}));

/**
 * 轮询等待条件成立，避免依赖固定延时。
 *
 * 两点刻意为之：
 * - 上限取 15s 而非 1s。它是「卡死了」的判据，不是「应该多快」的预算——条件一成立就
 *   立刻返回，调大在正常路径上零成本。`pnpm test` 并发跑 31 个任务时事件循环会被抢占，
 *   墙钟照走而轮询跑不了几轮，1s 的预算容易在机器繁忙时误判。
 * - 超时抛错而非静默返回。原先循环到点直接退出，后续断言会以「exitCode 不是 1」这种
 *   看不出根因的形式失败；抛错才能一眼认出是等待超时。
 */
async function waitFor(predicate: () => boolean, timeout = 15_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start >= timeout) throw new Error('waitFor 超时：条件始终未成立');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('cli entry', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetModules();
    process.exitCode = undefined;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('should set non-zero exit code on an escaping async error', async () => {
    process.argv = ['node', 'visual-test', 'test'];

    // 动态 import 触发 cli.ts 顶层的 parseAsync().catch(...)
    await import('../../../src/cli');
    await waitFor(() => process.exitCode === 1);

    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });
});
