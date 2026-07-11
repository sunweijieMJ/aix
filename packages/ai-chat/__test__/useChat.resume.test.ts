import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import { useChat } from '../src/composables/useChat';
import type { ParsedChunk } from '../src/types';
import { messageText } from '../src/utils/helpers';

const flush = async () => {
  for (let i = 0; i < 12; i++) await nextTick();
};
const stream = (lines: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(`data: ${l}\n\n`));
      c.close();
    },
  });
// 逐 chunk 产出 lines，全部读完后再 error：用 pull（而非 start 内同步 c.error）保证
// 报错前的增量被消费方读到——同步 c.error 会清空未读队列，无法复现「增量已并入后再失败」。
const erringStream = (lines: string[]) => {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < lines.length) c.enqueue(new TextEncoder().encode(`data: ${lines[i++]}\n\n`));
      else c.error(new Error('boom'));
    },
  });
};
const parseChunk = (chunk: { data?: string }): ParsedChunk => {
  if (chunk.data === '[DONE]') return { done: true };
  try {
    return JSON.parse(chunk.data ?? '{}') as ParsedChunk;
  } catch {
    return {};
  }
};

describe('useChat — resume 续流', () => {
  it('resume 向同一 AI 消息续写，不新建节点，output 按 toolCallId 命中', async () => {
    const chat = useChat({
      request: ({ resume }) =>
        Promise.resolve(
          resume
            ? stream([
                JSON.stringify({ tool: { index: 0, toolCallId: 'c1', output: '已确认' } }),
                JSON.stringify({ delta: '完成' }),
                '[DONE]',
              ])
            : stream([
                JSON.stringify({
                  tool: { index: 0, toolCallId: 'c1', toolName: 'act', input: { x: 1 } },
                }),
                '[DONE]',
              ]),
        ),
      parseChunk,
    });
    await chat.onSend('做点事');
    await flush();
    const aiId = chat.messages.value[1]!.id;
    const before = chat.messages.value.length;
    expect(chat.messages.value[1]!.content.find((b) => b.type === 'tool_use')).toMatchObject({
      state: 'input-available',
    });

    const ok = await chat.resume(aiId, { approved: true });
    await flush();
    expect(ok).toBe(true);
    expect(chat.messages.value.length).toBe(before); // 无新节点
    const ai = chat.messages.value[1]!;
    expect(ai.content.find((b) => b.type === 'tool_use')).toMatchObject({
      state: 'output-available',
      output: '已确认',
    });
    expect(ai.content.some((b) => b.type === 'text' && b.text === '完成')).toBe(true);
  });

  // 回归：resume 只校验 role==='ai' 不校验激活路径——目标被 reload 顶替（非激活分支）时
  // history 为空仍照常发起请求，续写的内容用户永远看不见（消息不在渲染路径）
  it('resume 目标不在激活路径（被 reload 顶替的旧分支）→ 拒绝且不发起请求', async () => {
    let n = 0;
    const request = vi.fn(() =>
      Promise.resolve(stream([JSON.stringify({ delta: `回复${(n += 1)}` }), '[DONE]'])),
    );
    const chat = useChat({ request, parseChunk });
    await chat.onSend('问题');
    await flush();
    const ai1 = chat.messages.value[1]!.id;
    await chat.onReload(ai1); // 生成兄弟分支并激活，ai1 脱离激活路径
    await flush();
    expect(chat.messages.value[1]!.id).not.toBe(ai1);
    const calls = request.mock.calls.length;
    await expect(chat.resume(ai1)).resolves.toBe(false);
    expect(request.mock.calls.length).toBe(calls);
  });

  // 回归：baseSnapshot 深拷贝在外层 try 内、但外层 try 只有 finally——块内容经
  // updateBlock 可写入任意值（循环引用等），JSON 深拷贝抛错会以 unhandled rejection
  // 逃逸，且消息状态永久卡在 updating（无活跃流推进的假加载态）、onError 不触发
  it('resume 快照深拷贝抛错：消息落 error 终态并触发 onError，不卡 updating', async () => {
    const onError = vi.fn();
    const chat = useChat({
      request: () => Promise.resolve(stream([JSON.stringify({ delta: '内容' }), '[DONE]'])),
      parseChunk,
      onError,
    });
    await chat.onSend('q');
    await flush();
    const ai = chat.messages.value[1]!;
    expect(ai.status).toBe('success');
    // 业务经 updateBlock 可写入任意值：构造循环引用使 JSON 深拷贝必抛
    const blk = ai.content[0]! as unknown as { extra?: Record<string, unknown> };
    blk.extra = {};
    blk.extra.self = blk.extra;
    await expect(chat.resume(ai.id)).resolves.toBe(true);
    await flush();
    expect(ai.status).toBe('error');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(chat.isLoading.value).toBe(false);
  });

  it('isLoading 时 resume 被拒（并发守卫）', async () => {
    let release: () => void = () => {};
    const chat = useChat({
      request: () =>
        new Promise((r) => {
          release = () => r(stream(['[DONE]']));
        }),
      parseChunk,
    });
    const p = chat.onSend('x');
    await nextTick();
    const aiId = chat.messages.value[1]!.id;
    expect(await chat.resume(aiId, {})).toBe(false);
    release();
    await p;
    await flush();
  });

  it('非 ai 消息 / 不存在 id → resume 返回 false', async () => {
    const chat = useChat({ request: () => Promise.resolve(stream(['[DONE]'])), parseChunk });
    expect(await chat.resume('nope', {})).toBe(false);
  });

  it('既有 text 块结尾 + resume 首尝试同型 delta 后流失败重试 → 内容不重复', async () => {
    let resumeCall = 0;
    const chat = useChat({
      request: ({ resume }) => {
        if (!resume) {
          // fresh：产出末尾 text 块 'part1' 作为 resume 前既有内容
          return Promise.resolve(stream([JSON.stringify({ delta: 'part1' }), '[DONE]']));
        }
        resumeCall += 1;
        if (resumeCall === 1) {
          // resume 首尝试：同型 delta 'part2' 会被 appendDelta 就地并入 'part1'，随后流报错
          return Promise.resolve(erringStream([JSON.stringify({ delta: 'part2' })]));
        }
        // resume 重试：正常完成
        return Promise.resolve(stream([JSON.stringify({ delta: 'part2done' }), '[DONE]']));
      },
      parseChunk,
      retryTimes: 1,
      retryInterval: 0,
    });
    await chat.onSend('go');
    await flush();
    const ai = chat.messages.value[1]!;
    expect(messageText(ai)).toBe('part1'); // resume 前既有内容

    await chat.resume(ai.id, { approved: true });
    await flush();
    expect(ai.status).toBe('success');
    // 重试回滚须把既有末尾块还原到进入快照（appendDelta 曾就地并入的增量一并撤销），否则内容重复
    expect(messageText(ai)).toBe('part1part2done');
  });

  it('既有 tool_use 块 + resume 命中既有块累加 argsText 后失败重试 → argsText 不重复', async () => {
    let resumeCall = 0;
    const chat = useChat({
      request: ({ resume }) => {
        if (!resume) {
          // fresh：产出带部分 argsText 的 tool_use 块（不发 argsDone，停在 input-streaming）
          return Promise.resolve(
            stream([
              JSON.stringify({
                tool: { index: 0, toolCallId: 'c1', toolName: 'act', argsTextDelta: '{"a":' },
              }),
              '[DONE]',
            ]),
          );
        }
        resumeCall += 1;
        if (resumeCall === 1) {
          // resume 首尝试：按 toolCallId 命中既有块累加 '1}'（argsText → '{"a":1}'），随后流报错
          return Promise.resolve(
            erringStream([
              JSON.stringify({ tool: { index: 0, toolCallId: 'c1', argsTextDelta: '1}' } }),
            ]),
          );
        }
        // resume 重试：再次累加并收尾
        return Promise.resolve(
          stream([
            JSON.stringify({
              tool: { index: 0, toolCallId: 'c1', argsTextDelta: '1}', argsDone: true },
            }),
            '[DONE]',
          ]),
        );
      },
      parseChunk,
      retryTimes: 1,
      retryInterval: 0,
    });
    await chat.onSend('go');
    await flush();
    const ai = chat.messages.value[1]!;
    const tool0 = ai.content.find((b) => b.type === 'tool_use')!;
    expect(tool0).toMatchObject({ argsText: '{"a":' });

    await chat.resume(ai.id, { approved: true });
    await flush();
    expect(ai.status).toBe('success');
    const tool = ai.content.find((b) => b.type === 'tool_use')!;
    // 重试回滚须把既有 tool_use 块的 argsText 还原到进入快照，否则重发的分片会重复累加
    expect(tool).toMatchObject({
      argsText: '{"a":1}',
      input: { a: 1 },
      state: 'input-available',
    });
    // 全程只有一个 tool_use 块（未因回滚新建重复块）
    expect(ai.content.filter((b) => b.type === 'tool_use').length).toBe(1);
  });
});
