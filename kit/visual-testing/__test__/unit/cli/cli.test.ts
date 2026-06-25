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

/** 轮询等待条件成立，避免依赖固定延时 */
async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeout) {
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
