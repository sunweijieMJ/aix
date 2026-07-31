import { describe, it, expect } from 'vitest';
import { nextTick, effectScope } from 'vue';
import { useChat } from '../src/composables/useChat';
import type { ChatMessage } from '../src/types';
import { textBlock, messageText } from '../src/utils/helpers';

/** 可手动投喂的 SSE 流 */
function manualStream() {
  let ctrl: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  return {
    stream,
    push: (s: string) => ctrl.enqueue(enc.encode(s)),
    delta: (s: string) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ delta: s })}\n\n`)),
    done: () => {
      ctrl.enqueue(enc.encode('data: [DONE]\n\n'));
      ctrl.close();
    },
  };
}

const history = (n: number): ChatMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `h${i}`,
    role: i % 2 ? 'ai' : 'user',
    content: [textBlock(`历史消息 ${i}`)],
    status: 'success' as const,
  }));

/**
 * parser 的映射结果按消息逐条缓存。
 *
 * 拆分前整份列表共用一个 computed：流式每个 chunk 就地 mutate 末条消息内容 → 整份视图失效 →
 * parser 对**全量历史**重跑一遍（实测 42 条消息的会话每 chunk 就是 42 次调用 + 42 个新对象），
 * 随历史长度线性劣化。以下用例把这条性质钉死。
 */
describe('useChat — parser 逐条缓存', () => {
  it('流式期间只对正在增长的那条消息重跑 parser，与历史长度无关', async () => {
    const seen: string[] = [];
    const s = manualStream();
    const chat = useChat({
      defaultMessages: history(40),
      // 真实 parser 会读消息内容，从而与之建立依赖（这正是失效范围的来源）
      parser: (m) => {
        seen.push(m.id);
        return { ...m, content: m.content.map((b) => ({ ...b })) };
      },
      request: async () => s.stream,
    });

    void chat.parsedMessages.value.length; // 首次全量映射
    expect(seen).toHaveLength(40);

    const send = chat.onSend('提问');
    await nextTick();
    void chat.parsedMessages.value.length;
    seen.length = 0;

    const streamingId = chat.messages.value[chat.messages.value.length - 1]!.id;
    for (let i = 0; i < 10; i++) {
      s.delta('字');
      await new Promise((r) => setTimeout(r, 1));
      void chat.parsedMessages.value.length; // 模拟每帧渲染读取
    }
    s.done();
    await send;

    // 每个 chunk 至多重跑一次，且只跑正在流式的那条
    expect(seen.every((id) => id === streamingId)).toBe(true);
    expect(seen.length).toBeLessThanOrEqual(10);
    // 历史消息一次都没有被重新映射
    expect(seen).not.toContain('h0');
    expect(seen).not.toContain('h39');
  });

  it('未变化的消息复用上一帧的渲染对象引用（下游 Bubble 不必逐帧重渲染）', async () => {
    const s = manualStream();
    const chat = useChat({
      defaultMessages: history(6),
      parser: (m) => ({ ...m, content: m.content.map((b) => ({ ...b })) }),
      request: async () => s.stream,
    });
    const send = chat.onSend('提问');
    await nextTick();
    const before = chat.parsedMessages.value.slice(0, 6);

    s.delta('增量');
    await new Promise((r) => setTimeout(r, 1));
    const after = chat.parsedMessages.value.slice(0, 6);
    expect(after.every((m, i) => m === before[i])).toBe(true);

    s.done();
    await send;
  });

  it('内容变化后该条消息重新映射（缓存不会返回陈旧结果）', async () => {
    const s = manualStream();
    const chat = useChat({
      // 映射结果里带上源文本：缓存若返回陈旧结果，断言会停在上一帧的文本上
      parser: (m) => ({ ...m, content: [textBlock(`[${messageText(m)}]`)] }),
      request: async () => s.stream,
    });
    const send = chat.onSend('提问');
    await nextTick();
    const last = () => chat.parsedMessages.value[chat.parsedMessages.value.length - 1]!;

    s.delta('你好');
    await new Promise((r) => setTimeout(r, 1));
    expect(last().content[0]).toMatchObject({ text: '[你好]' });

    // 同一条消息就地追加增量（source 引用与 index 都不变，只能靠依赖追踪失效）
    s.delta('，世界');
    await new Promise((r) => setTimeout(r, 1));
    expect(last().content[0]).toMatchObject({ text: '[你好，世界]' });

    s.done();
    await send;
  });

  // 逐条 computed 是惰性创建的，谁先读就落在谁的 activeEffectScope 里。若被某个子组件的
  // scope 接管，组件卸载（scope.stop()）后 vue < 3.5 的 computed 不再推进 dirty 标记、
  // .value 永久返回旧值，而缓存活到 useChat 结束 —— 故实现里显式挂到游离 scope 上。
  // 注意：本仓库装的是 vue 3.5（computed 改为全局版本号比对，被 stop 也能重算），
  // 这条用例在 3.5 下恒过，是给最低支持版本（peer ^3.3）跑时的护栏。
  it('逐条缓存不被读它的组件 scope 接管（该 scope 停止后仍随源数据更新）', async () => {
    const s = manualStream();
    const chat = useChat({
      parser: (m) => ({ ...m, content: [textBlock(`[${messageText(m)}]`)] }),
      request: async () => s.stream,
    });
    const send = chat.onSend('提问');
    await nextTick();

    // 模拟子组件在自己的 scope 里首次读到（= 惰性建 computed 的时机），随后卸载
    const childScope = effectScope();
    childScope.run(() => {
      void chat.parsedMessages.value.length;
    });
    childScope.stop();

    s.delta('你好');
    await new Promise((r) => setTimeout(r, 1));
    const last = chat.parsedMessages.value[chat.parsedMessages.value.length - 1]!;
    expect(last.content[0]).toMatchObject({ text: '[你好]' });

    s.done();
    await send;
  });

  it('setMessages 换掉同 id 的消息对象后不复用旧缓存', async () => {
    let calls = 0;
    const chat = useChat({
      defaultMessages: [{ id: 'm1', role: 'user', content: [textBlock('旧')], status: 'success' }],
      parser: (m) => {
        calls += 1;
        return m;
      },
      request: async () => manualStream().stream,
    });
    expect(chat.parsedMessages.value[0]!.content[0]).toMatchObject({ text: '旧' });
    const before = calls;

    // 同 id、不同对象（切会话 / 外部整体替换的典型形态）
    chat.setMessages([{ id: 'm1', role: 'user', content: [textBlock('新')], status: 'success' }]);
    expect(chat.parsedMessages.value[0]!.content[0]).toMatchObject({ text: '新' });
    expect(calls).toBeGreaterThan(before);
  });

  it('1→N 派生 id 与父消息映射在缓存路径下保持正确', async () => {
    const s = manualStream();
    const chat = useChat({
      parser: (m) =>
        m.role === 'ai' && m.content.length
          ? [
              { ...m, content: [m.content[0]!] },
              { ...m, content: [m.content[0]!] },
            ]
          : m,
      request: async () => s.stream,
    });
    const send = chat.onSend('提问');
    await nextTick();
    s.delta('回答');
    await new Promise((r) => setTimeout(r, 1));

    const ids = chat.parsedMessages.value.map((m) => m.id);
    const parentId = chat.messages.value[chat.messages.value.length - 1]!.id;
    expect(ids).toEqual([chat.messages.value[0]!.id, parentId, `${parentId}__1`]);

    // 经派生气泡 id 回写，须解析回 SSOT 父消息块
    const blockId = chat.messages.value[chat.messages.value.length - 1]!.content[0]!.id;
    expect(chat.updateBlock(`${parentId}__1`, blockId, { text: '已改写' })).toBe(true);
    expect(chat.messages.value[chat.messages.value.length - 1]!.content[0]).toMatchObject({
      text: '已改写',
    });

    s.done();
    await send;
  });

  it('缓存随消息离开激活路径而回收，不随会话历史无界增长', async () => {
    const chat = useChat({
      defaultMessages: history(4),
      parser: (m) => m,
      request: async () => manualStream().stream,
    });
    expect(chat.parsedMessages.value).toHaveLength(4);
    chat.setMessages(history(2));
    expect(chat.parsedMessages.value).toHaveLength(2);
    // 旧消息已不在视图内（缓存被剪除；这里以对外可观察的结果断言）
    expect(chat.parsedMessages.value.map((m) => m.id)).toEqual(['h0', 'h1']);
  });
});
