import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import { useChat } from '../src/composables/useChat';
import type { ChatMessage } from '../src/types';
import { messageText } from '../src/utils/helpers';

const flush = async () => {
  for (let i = 0; i < 12; i++) await nextTick();
};
// 默认 flatParseChunk 直接读 SSE data 里的 delta 字段（与 useChat.resume.test.ts 同风格）
const stream = (lines: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(`data: ${l}\n\n`));
      c.close();
    },
  });
// 逐 chunk 产出后再报错：验证「回滚后重试」路径（与 useChat.resume.test.ts 的 erringStream 同写法）
const erringStream = (lines: string[]) => {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < lines.length) c.enqueue(new TextEncoder().encode(`data: ${lines[i++]}\n\n`));
      else c.error(new Error('boom'));
    },
  });
};
// 产出一段增量后挂起，等待外部 abort 触发流报错——用于制造「停止生成」场景
const hangingAbortableStream = (firstDelta: string, signal: AbortSignal) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(`data: {"delta":"${firstDelta}"}\n\n`));
      signal.addEventListener('abort', () => c.error(new DOMException('Aborted', 'AbortError')));
    },
  });

describe('useChat — continueGenerate 继续生成', () => {
  it('停止后 continueGenerate 向同一 AI 消息续写，不新建节点，内容拼接到原有末尾', async () => {
    let call = 0;
    const request = vi.fn(({ signal }: { signal: AbortSignal }) => {
      call += 1;
      if (call === 1) return Promise.resolve(hangingAbortableStream('部分回答', signal));
      return Promise.resolve(stream(['{"delta":"续写内容"}', '[DONE]']));
    });
    const chat = useChat({ request });
    const p = chat.onSend('问题');
    await new Promise((r) => setTimeout(r, 10));
    chat.abort();
    await p;
    const aiId = chat.messages.value[1]!.id;
    expect(chat.messages.value[1]!.status).toBe('abort');
    const before = chat.messages.value.length;

    const ok = await chat.continueGenerate(aiId);
    await flush();
    expect(ok).toBe(true);
    expect(chat.messages.value.length).toBe(before); // 无新节点
    expect(chat.messages.value[1]!.id).toBe(aiId);
    expect(messageText(chat.messages.value[1]!)).toBe('部分回答续写内容');
    expect(chat.messages.value[1]!.status).toBe('success');
  });

  it('continueGenerate 发给 request 的 history 含隐藏续写 user 消息，但 messages/exportTree 不含它', async () => {
    let call = 0;
    let capturedHistory: ChatMessage[] = [];
    const request = vi.fn(
      ({ signal, messages: hist }: { signal: AbortSignal; messages: ChatMessage[] }) => {
        call += 1;
        if (call === 1) return Promise.resolve(hangingAbortableStream('部分', signal));
        capturedHistory = hist;
        return Promise.resolve(stream(['{"delta":"完成"}', '[DONE]']));
      },
    );
    const chat = useChat({ request, continuePrompt: '自定义续写指令' });
    const p = chat.onSend('问题');
    await new Promise((r) => setTimeout(r, 10));
    chat.abort();
    await p;
    const aiId = chat.messages.value[1]!.id;

    await chat.continueGenerate(aiId);
    await flush();

    // history 末尾两条：AI 自身快照（含"部分"） + 隐藏续写指令
    const aiSnapshot = capturedHistory[capturedHistory.length - 2]!;
    expect(aiSnapshot.role).toBe('ai');
    expect(messageText(aiSnapshot)).toBe('部分');
    const hidden = capturedHistory[capturedHistory.length - 1]!;
    expect(hidden.role).toBe('user');
    expect(messageText(hidden)).toBe('自定义续写指令');

    // 隐藏消息不进渲染视图 / 不进导出树
    expect(chat.messages.value.some((m) => messageText(m) === '自定义续写指令')).toBe(false);
    const exported = chat.exportTree();
    expect(exported.nodes.some((n) => messageText(n.message) === '自定义续写指令')).toBe(false);
  });

  it('continueGenerate：非 abort / 非 ai / 不存在 id → 返回 false，无副作用', async () => {
    const request = vi.fn(async () => stream(['{"delta":"x"}', '[DONE]']));
    const chat = useChat({ request });
    await chat.onSend('问题');
    await flush();
    const aiId = chat.messages.value[1]!.id; // status 已是 success
    const userId = chat.messages.value[0]!.id;
    expect(await chat.continueGenerate(aiId)).toBe(false);
    expect(await chat.continueGenerate(userId)).toBe(false);
    expect(await chat.continueGenerate('nope')).toBe(false);
  });

  it('isLoading 时 continueGenerate 被拒（并发守卫）', async () => {
    let call = 0;
    let release: () => void = () => {};
    const request = vi.fn(({ signal }: { signal: AbortSignal }) => {
      call += 1;
      if (call === 1) return Promise.resolve(hangingAbortableStream('部分', signal));
      return new Promise<ReadableStream<Uint8Array>>((r) => {
        release = () => r(stream(['[DONE]']));
      });
    });
    const chat = useChat({ request });
    const p = chat.onSend('问题');
    await new Promise((r) => setTimeout(r, 10));
    chat.abort();
    await p;
    const aiId = chat.messages.value[1]!.id;

    const continuing = chat.continueGenerate(aiId);
    await nextTick();
    expect(await chat.continueGenerate(aiId)).toBe(false); // 第二次调用被并发守卫拦截
    release();
    await continuing;
    await flush();
  });

  it('continueGenerate + retryTimes>0：首次尝试失败重试时，history 里的已生成内容是干净快照（不含上次失败尝试残留的增量）', async () => {
    let call = 0;
    let capturedRetryHistory: ChatMessage[] = [];
    const request = vi.fn(
      ({ signal, messages: hist }: { signal: AbortSignal; messages: ChatMessage[] }) => {
        call += 1;
        if (call === 1) return Promise.resolve(hangingAbortableStream('部分回答', signal));
        if (call === 2) {
          // continuation 首次尝试：追加内容后流报错，触发重试
          return Promise.resolve(erringStream(['{"delta":"续写A"}']));
        }
        // continuation 重试：捕获此时的 history
        capturedRetryHistory = hist;
        return Promise.resolve(stream(['{"delta":"续写B"}', '[DONE]']));
      },
    );
    const chat = useChat({ request, retryTimes: 1, retryInterval: 0 });
    const p = chat.onSend('问题');
    await new Promise((r) => setTimeout(r, 10));
    chat.abort();
    await p;
    const aiId = chat.messages.value[1]!.id;

    const ok = await chat.continueGenerate(aiId);
    await flush();
    expect(ok).toBe(true);
    expect(chat.messages.value[1]!.status).toBe('success');

    const aiSnapshot = capturedRetryHistory[capturedRetryHistory.length - 2]!;
    expect(messageText(aiSnapshot)).toBe('部分回答'); // 不含 attempt1 残留的"续写A"
    // 最终内容：部分回答 + 续写B（回滚清空了"续写A"，不重复）
    expect(messageText(chat.messages.value[1]!)).toBe('部分回答续写B');
  });

  it('继续生成中途再次点停止 → status 回到 abort，可再次 continueGenerate', async () => {
    let call = 0;
    const request = vi.fn(({ signal }: { signal: AbortSignal }) => {
      call += 1;
      // 第 1 次（fresh）、第 2 次（第一次 continueGenerate）都挂起等待外部 abort；
      // 第 3 次（第二次 continueGenerate）正常收尾，验证「再次 continueGenerate」本身能成功，
      // 不需要再次 abort 才能结束——若沿用挂起流，测试会等一个永远不来的 abort 而超时。
      if (call <= 2) {
        const delta = call === 1 ? '部分' : '续写中';
        return Promise.resolve(hangingAbortableStream(delta, signal));
      }
      return Promise.resolve(stream(['{"delta":"完成"}', '[DONE]']));
    });
    const chat = useChat({ request });
    const p = chat.onSend('问题');
    await new Promise((r) => setTimeout(r, 10));
    chat.abort();
    await p;
    const aiId = chat.messages.value[1]!.id;
    expect(chat.messages.value[1]!.status).toBe('abort');

    const continuing = chat.continueGenerate(aiId);
    await new Promise((r) => setTimeout(r, 10));
    chat.abort();
    await continuing;
    expect(chat.messages.value[1]!.status).toBe('abort');
    expect(await chat.continueGenerate(aiId)).toBe(true);
  });

  // 回归 Bug：停止后不点"继续生成"，而是直接发新一轮对话——onSend 恒在当前 head（即这条
  // abort 消息）下延展，新一轮对话被挂到旧消息下面。旧消息仍在激活路径 messages 里（在场景
  // 上仍"可见可点"），但它已不是链尾。此时对它调用 continueGenerate 必须被拒绝：否则会用
  // 它位置之前的历史发起续写请求（丢失之后已发生的新对话轮次），且续写内容错误写回这条旧消息。
  it('abort 消息之后又挂了新一轮对话（非链尾）→ continueGenerate 拒绝，无副作用', async () => {
    let call = 0;
    const request = vi.fn(({ signal }: { signal: AbortSignal }) => {
      call += 1;
      if (call === 1) return Promise.resolve(hangingAbortableStream('部分回答', signal));
      return Promise.resolve(stream(['{"delta":"新一轮回复"}', '[DONE]']));
    });
    const chat = useChat({ request });
    const p = chat.onSend('问题1');
    await new Promise((r) => setTimeout(r, 10));
    chat.abort();
    await p;
    const oldAiId = chat.messages.value[1]!.id;
    expect(chat.messages.value[1]!.status).toBe('abort');

    // 不点"继续生成"，直接发新一轮对话——挂在旧 abort 消息之下
    await chat.onSend('问题2');
    await flush();
    expect(chat.messages.value).toHaveLength(4); // user1, ai1(abort), user2, ai2
    expect(chat.messages.value[1]!.id).toBe(oldAiId);
    expect(chat.messages.value[1]!.status).toBe('abort'); // 旧消息仍是 abort 态，仍在激活路径上
    expect(request).toHaveBeenCalledTimes(2);

    const before = chat.messages.value.length;
    const ok = await chat.continueGenerate(oldAiId);
    expect(ok).toBe(false); // 非链尾，被拒绝
    await flush();
    expect(chat.messages.value.length).toBe(before); // 无新节点
    expect(chat.messages.value[1]!.id).toBe(oldAiId);
    expect(chat.messages.value[1]!.status).toBe('abort'); // 旧消息状态未被续写覆盖
    expect(request).toHaveBeenCalledTimes(2); // 未发起第三次请求
  });
});
