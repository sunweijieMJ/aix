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

describe('xStream', () => {
  it('按行切分跨 chunk 的数据', async () => {
    const rs = streamFrom(['data: a\n', 'data: b\n', 'data:', ' c\n']);
    const lines: string[] = [];
    for await (const line of xStream(rs)) lines.push(line);
    expect(lines).toEqual(['data: a', 'data: b', 'data: c']);
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
});
