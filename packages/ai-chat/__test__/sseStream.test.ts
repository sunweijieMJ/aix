import { describe, it, expect } from 'vitest';
import { sseStream, type SSEChunk } from '../src/composables/useXStream';

/** 由若干 chunk 字符串构造可读字节流（chunk 边界刻意保留，用于测跨 chunk 缓冲） */
function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

/** 可手动推送/关闭的流 */
function manualStream() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({ start: (c) => (ctrl = c) });
  return {
    stream,
    push: (s: string) => ctrl.enqueue(enc.encode(s)),
    close: () => {
      try {
        ctrl.close();
      } catch {
        /* 可能已被 cancel 关闭 */
      }
    },
  };
}

async function collect(rs: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<SSEChunk[]> {
  const out: SSEChunk[] = [];
  for await (const e of sseStream(rs, signal)) out.push(e);
  return out;
}

describe('sseStream', () => {
  it('解析单个 data 事件', async () => {
    const out = await collect(streamFrom(['data: {"x":1}\n\n']));
    expect(out).toEqual([{ data: '{"x":1}' }]);
  });

  it('关联 event 字段与其后的 data', async () => {
    const out = await collect(streamFrom(['event: content_block_delta\ndata: hi\n\n']));
    expect(out).toEqual([{ event: 'content_block_delta', data: 'hi' }]);
  });

  it('同一事件的多行 data 用 \\n 拼接', async () => {
    const out = await collect(streamFrom(['data: a\ndata: b\n\n']));
    expect(out).toEqual([{ data: 'a\nb' }]);
  });

  it('解析 id 字段', async () => {
    const out = await collect(streamFrom(['id: 42\ndata: x\n\n']));
    expect(out).toEqual([{ id: '42', data: 'x' }]);
  });

  it('retry 字段解析为数字', async () => {
    const out = await collect(streamFrom(['retry: 3000\ndata: x\n\n']));
    expect(out).toEqual([{ retry: 3000, data: 'x' }]);
  });

  it('忽略纯注释事件（: 开头、无 data）', async () => {
    const out = await collect(streamFrom([': keep-alive\n\n']));
    expect(out).toEqual([]);
  });

  it('注释行与 data 共存时只取 data', async () => {
    const out = await collect(streamFrom([': ping\ndata: x\n\n']));
    expect(out).toEqual([{ data: 'x' }]);
  });

  it('一个 chunk 含多个事件', async () => {
    const out = await collect(streamFrom(['data: a\n\ndata: b\n\n']));
    expect(out).toEqual([{ data: 'a' }, { data: 'b' }]);
  });

  it('事件被 chunk 边界切开时正确缓冲', async () => {
    const out = await collect(streamFrom(['data: a\nda', 'ta: b\n\n']));
    expect(out).toEqual([{ data: 'a\nb' }]);
  });

  it('结束时 flush 末尾未被 \\n\\n 终结的事件', async () => {
    const out = await collect(streamFrom(['data: tail']));
    expect(out).toEqual([{ data: 'tail' }]);
  });

  it('字段冒号后仅去掉一个空格（SSE 规范）', async () => {
    const out = await collect(streamFrom(['data:  x\n\n'])); // 两个空格 → 保留一个
    expect(out).toEqual([{ data: ' x' }]);
  });

  it('无空格的 data:value 也能解析', async () => {
    const out = await collect(streamFrom(['data:x\n\n']));
    expect(out).toEqual([{ data: 'x' }]);
  });

  it('剔除行尾 \\r（CRLF 流）', async () => {
    const out = await collect(streamFrom(['data: x\r\n\r\n']));
    expect(out).toEqual([{ data: 'x' }]);
  });

  it('[DONE] 哨兵作为普通 data 透出（结束判定交给 parseChunk）', async () => {
    const out = await collect(streamFrom(['data: [DONE]\n\n']));
    expect(out).toEqual([{ data: '[DONE]' }]);
  });

  it('abort 后停止产出', async () => {
    const ctrl = new AbortController();
    const out: SSEChunk[] = [];
    for await (const e of sseStream(streamFrom(['data: a\n\n', 'data: b\n\n']), ctrl.signal)) {
      out.push(e);
      ctrl.abort();
    }
    expect(out).toEqual([{ data: 'a' }]);
  });

  it('abort 时不 flush 残留事件', async () => {
    const ctrl = new AbortController();
    const a = manualStream();
    const out: SSEChunk[] = [];
    const consume = (async () => {
      for await (const e of sseStream(a.stream, ctrl.signal)) out.push(e);
    })();
    a.push('data: partial'); // 残留事件（无 \n\n 终结）
    await new Promise((r) => setTimeout(r, 0));
    ctrl.abort();
    a.close();
    await consume;
    expect(out).toEqual([]);
  });
});
