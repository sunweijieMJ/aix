/**
 * DevServer 单元测试
 *
 * 测试重点：
 * - 自动启动的进程崩溃时，应立即报错而非空等到超时
 *   （回归：exit handler 会把 this.process 置空，崩溃检测不能依赖 this.process.exitCode）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: mockSpawn }));

import { DevServer } from '../../../src/core/server/dev-server';

/** 构造一个最小化的假 ChildProcess */
function makeFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    exitCode: number | null;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.exitCode = null;
  proc.kill = vi.fn();
  return proc;
}

describe('DevServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 健康检查始终连接失败，确保退出循环只能靠崩溃检测或超时
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should detect early process crash instead of waiting for the full timeout', async () => {
    const proc = makeFakeProcess();
    mockSpawn.mockReturnValue(proc);

    const server = new DevServer({
      url: 'http://localhost:3000',
      command: 'broken-command',
      autoStart: true,
      timeout: 10_000,
    });

    // 进程在启动后立即崩溃退出（非 0 退出码）
    queueMicrotask(() => {
      proc.exitCode = 1;
      proc.emit('exit', 1);
    });

    const startedAt = Date.now();
    await expect(server.start()).rejects.toThrow(/exited unexpectedly with code 1/);

    // 必须远早于 timeout 返回，证明走的是崩溃检测而非空等超时
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  it('should be a no-op when autoStart is disabled', async () => {
    const server = new DevServer({ url: 'http://localhost:3000', autoStart: false });
    await expect(server.start()).resolves.toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
