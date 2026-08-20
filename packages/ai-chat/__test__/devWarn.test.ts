import { describe, it, expect, vi, afterEach } from 'vitest';
import { devWarn } from '../src/utils/devWarn';

// 用 vi.stubEnv 而非直接写 process.env：vitest 默认按文件 fork 隔离进程，直接改本不会串台，
// 但一旦有人把 pool 改成 threads / 关掉 isolate，裸改全局 env 就会污染并发跑的其它测试文件
// （NODE_ENV 泄漏成 production 会让别处的护栏断言莫名其妙地失败）。stubEnv 由 unstubAllEnvs 兜底复位。
const setNodeEnv = (value: string | undefined) => vi.stubEnv('NODE_ENV', value);

describe('devWarn（开发期护栏告警）', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('非生产环境（含 test / development）照常输出', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setNodeEnv('development');
    devWarn('[ai-chat] 用法错误');
    setNodeEnv('test');
    devWarn('[ai-chat] 用法错误');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('生产环境静默：护栏告警不得刷业务方的线上控制台', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setNodeEnv('production');
    devWarn('[ai-chat] 用法错误');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('NODE_ENV 缺失（未经打包器处理的直出 ESM）按开发态处理，宁可多打不可漏掉护栏', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setNodeEnv(undefined);
    devWarn('[ai-chat] 用法错误');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('透传全部参数（签名与 console.warn 一致）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setNodeEnv('development');
    const err = new Error('boom');
    devWarn('[ai-chat] x', 1, err);
    expect(warn).toHaveBeenCalledWith('[ai-chat] x', 1, err);
    warn.mockRestore();
  });
});

describe('生产构建下护栏调用点确实静默（端到端抽样）', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('useChat.updateBlock 未命中：生产不告警，开发告警', async () => {
    const { useChat } = await import('../src/composables/useChat');
    const chat = useChat({ request: () => Promise.resolve(new ReadableStream()) });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    setNodeEnv('production');
    expect(chat.updateBlock('nope', 'nope', {})).toBe(false); // 返回值语义不受影响
    expect(warn).not.toHaveBeenCalled();

    setNodeEnv('development');
    expect(chat.updateBlock('nope', 'nope', {})).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
