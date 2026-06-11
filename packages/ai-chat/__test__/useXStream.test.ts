import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { xStream, useXStream } from '../src/composables/useXStream';

/** 可手动推送/关闭的流，用于模拟未结束的长连接 */
function manualStream() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({ start: (c) => (ctrl = c) });
  return {
    stream,
    push: (s: string) => ctrl.enqueue(enc.encode(s)),
    // 幂等关闭：abort/cancel 现在会通过 reader.cancel() 主动关闭底层流，
    // 此时再调 controller.close() 会抛 "already closed"，容错忽略即可。
    close: () => {
      try {
        ctrl.close();
      } catch {
        /* 流可能已被 reader.cancel() 关闭 */
      }
    },
  };
}

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

/** 由原始字节 chunk 构造可读流：用于把多字节 UTF-8 字符精确切断在 chunk 边界 */
function streamFromBytes(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

describe('xStream', () => {
  it('按行切分跨 chunk 的数据', async () => {
    const rs = streamFrom(['data: a\n', 'data: b\n', 'data:', ' c\n']);
    const lines: string[] = [];
    for await (const line of xStream(rs)) lines.push(line);
    expect(lines).toEqual(['data: a', 'data: b', 'data: c']);
  });

  it('多字节 UTF-8 字符（emoji）被 chunk 边界切断时按行完整解码', async () => {
    // 源码注释承诺 TextDecoder { stream: true } 能处理跨 chunk 的多字节字符，此用例锁定该行为：
    // 'hi' 占第 0-2 字节，'😀' 占第 2-6 字节（4 字节 UTF-8）；在第 4 字节切断，emoji 被拆进
    // 两个 chunk。若解码未跨 chunk 缓冲残字节，行内容会出现 U+FFFD 替换符。
    const bytes = new TextEncoder().encode('hi😀ok\n');
    const rs = streamFromBytes([bytes.subarray(0, 4), bytes.subarray(4)]);
    const lines: string[] = [];
    for await (const line of xStream(rs)) lines.push(line);
    expect(lines).toEqual(['hi😀ok']);
    expect(lines[0]).not.toContain('�');
  });

  it('abort 后停止产出', async () => {
    const ctrl = new AbortController();
    const rs = streamFrom(['data: a\n', 'data: b\n']);
    const lines: string[] = [];
    for await (const line of xStream(rs, ctrl.signal)) {
      lines.push(line);
      ctrl.abort();
    }
    expect(lines).toEqual(['data: a']);
  });

  it('abort 时不 flush 残留的半行 buffer', async () => {
    const ctrl = new AbortController();
    // chunk 含完整行 'data: a' + 未被 \n 终结的半行 'par'
    const a = manualStream();
    const lines: string[] = [];
    const gen = xStream(a.stream, ctrl.signal);
    a.push('data: a\npar');
    // 消费首个完整行后中断：此时 buffer 残留 'par'
    const first = await gen.next();
    lines.push(first.value as string);
    ctrl.abort();
    a.close();
    // 继续迭代，应直接结束而不 yield 残留的 'par'
    for await (const line of gen) lines.push(line);
    expect(lines).toEqual(['data: a']);
  });

  it('中断挂起的 read 时不 flush 残留的半行 buffer', async () => {
    // 覆盖与上一条不同的路径：abort 发生在 reader.read() 挂起期间（而非两次 yield 之间）。
    // 此时 reader.cancel() 会让挂起的 read 以 done:true 收尾、走 break 退出循环，
    // 必须在 flush 残留 buffer 前再次检查 signal，否则会向已中断的消费方多 yield 一个半行。
    const ctrl = new AbortController();
    const a = manualStream();
    const lines: string[] = [];
    // 后台消费：首个 chunk 仅含半行（无 \n），不产出任何行，生成器停在挂起的 read 上
    const consume = (async () => {
      for await (const line of xStream(a.stream, ctrl.signal)) lines.push(line);
    })();
    a.push('par'); // 残留半行进 buffer，无完整行可 yield
    await new Promise((r) => setTimeout(r, 0)); // 让生成器跑到挂起的 reader.read()
    ctrl.abort(); // 在挂起的 read 上中断
    a.close();
    await consume;
    expect(lines).toEqual([]);
  });
});

describe('useXStream', () => {
  it('start 收集行、触发 onLine，并在结束后复位 isStreaming', async () => {
    const seen: string[] = [];
    const { lines, isStreaming, error, start } = useXStream();
    await start(streamFrom(['a\n', 'b\n']), (l) => seen.push(l));
    expect(lines.value).toEqual(['a', 'b']);
    expect(seen).toEqual(['a', 'b']);
    expect(isStreaming.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it('cancel 取消进行中的流且不写入 error', async () => {
    const a = manualStream();
    const { isStreaming, error, start, cancel } = useXStream();
    const p = start(a.stream);
    await nextTick();
    expect(isStreaming.value).toBe(true);
    cancel();
    a.close(); // 让底层流结束，使生成器收尾
    await p;
    expect(isStreaming.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it('并发 start：被取消的旧流结束后不会把新流的 isStreaming 置 false', async () => {
    const a = manualStream();
    const b = manualStream();
    const { isStreaming, start } = useXStream();
    const p1 = start(a.stream); // 旧流，挂起
    await nextTick();
    expect(isStreaming.value).toBe(true);
    const p2 = start(b.stream); // 新流接管（内部 cancel 旧流）
    a.close(); // 旧流结束
    await p1;
    expect(isStreaming.value).toBe(true); // 新流仍在进行，未被旧流 finally 误置 false
    b.close(); // 新流结束
    await p2;
    expect(isStreaming.value).toBe(false);
  });

  // 防回归：useChat 在协议层 done（如 [DONE]）时 break 提前结束消费，生成器 finally 必须
  // cancel 底层流——否则后端在 done 后保持连接（连接复用/自定义协议）时，每条消息泄漏
  // 一个挂起连接与流缓冲。与 abort 路径的 reader.cancel() 对称。
  it('消费方提前 break（协议层 done）：底层流被 cancel，不留挂起连接', async () => {
    let cancelled = false;
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(enc.encode('line1\nline2\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const line of xStream(stream)) {
      expect(line).toBe('line1');
      break;
    }
    expect(cancelled).toBe(true);
  });
});
