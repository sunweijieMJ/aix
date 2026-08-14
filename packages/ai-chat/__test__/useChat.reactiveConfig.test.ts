import { describe, it, expect, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useChat } from '../src/composables/useChat';
import type { ChatMessage } from '../src/types';

/**
 * 运行期配置（streamMode / retryTimes / retryInterval / streamTimeout / continuePrompt）
 * 一律在**使用那一刻**求值，故 ref / getter 形态可在运行时切换，无需重建 useChat 实例
 * （经 AiChat 接入时即无需 :key 重建组件——那会丢掉整棵对话树）。
 *
 * 传普通值的既有用法不受影响，由包内其余 useChat 用例覆盖。
 */

const streamOf = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (const s of chunks) c.enqueue(enc.encode(s));
      c.close();
    },
  });

const runIn = <T>(fn: () => T): [T, () => void] => {
  const scope = effectScope();
  const r = scope.run(fn)!;
  return [r, () => scope.stop()];
};

describe('useChat 运行期配置可响应式切换', () => {
  it('streamMode：切到 line 后按行分帧，无需重建实例', async () => {
    const streamMode = ref<'sse' | 'line'>('sse');
    const [chat, dispose] = runIn(() =>
      useChat({
        streamMode,
        // 两种模式各自能解析的形态：sse 走 data: 事件，line 收原始行
        parseChunk: ((unit: { data?: string } | string) =>
          typeof unit === 'string' ? { delta: unit } : { delta: unit.data ?? '' }) as never,
        request: () =>
          Promise.resolve(
            streamMode.value === 'sse'
              ? streamOf(['data: SSE\n\n'])
              : streamOf(['LINE-A\nLINE-B\n']),
          ),
      }),
    );

    await chat.onSend('q1');
    expect((chat.messages.value.at(-1)!.content[0] as { text: string }).text).toBe('SSE');

    streamMode.value = 'line';
    await chat.onSend('q2');
    // line 模式下两行各产出一个增量，拼接为 LINE-ALINE-B
    expect((chat.messages.value.at(-1)!.content[0] as { text: string }).text).toBe('LINE-ALINE-B');
    dispose();
  });

  it('retryTimes：运行时从 0 调到 2，当次之后的请求即吃到新额度', async () => {
    const retryTimes = ref(0);
    let calls = 0;
    const [chat, dispose] = runIn(() =>
      useChat({
        retryTimes,
        retryInterval: () => 0,
        request: () => {
          calls += 1;
          return Promise.reject(new Error('boom'));
        },
      }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await chat.onSend('q1');
    expect(calls).toBe(1); // 不重试

    calls = 0;
    retryTimes.value = 2;
    await chat.onSend('q2');
    expect(calls).toBe(3); // 首次 + 2 次重试

    errSpy.mockRestore();
    dispose();
  });

  it('continuePrompt：运行时改文案，下次 continueGenerate 用新值', async () => {
    const continuePrompt = ref('续写A');
    const seen: ChatMessage[][] = [];
    const [chat, dispose] = runIn(() =>
      useChat({
        continuePrompt,
        request: (ctx) => {
          seen.push(ctx.messages);
          return Promise.resolve(streamOf(['data: {"delta":"x"}\n\n', 'data: [DONE]\n\n']));
        },
      }),
    );

    await chat.onSend('hi');
    const ai = chat.messages.value.at(-1)!;
    ai.status = 'abort';
    continuePrompt.value = '续写B';
    expect(await chat.continueGenerate(ai.id)).toBe(true);

    const lastHistory = seen.at(-1)!;
    const tail = lastHistory.at(-1)!;
    expect(tail.role).toBe('user');
    expect((tail.content[0] as { text: string }).text).toBe('续写B');
    dispose();
  });

  it('getter 求得 undefined 时回落各自默认值', async () => {
    let calls = 0;
    const [chat, dispose] = runIn(() =>
      useChat({
        // 显式传 undefined getter：默认值必须仍然生效（默认值放在求值处，不在解构处）
        streamMode: () => undefined,
        retryTimes: () => undefined,
        streamTimeout: () => undefined,
        request: () => {
          calls += 1;
          return Promise.resolve(streamOf(['data: {"delta":"ok"}\n\n', 'data: [DONE]\n\n']));
        },
      }),
    );
    await chat.onSend('q');
    // streamMode 默认 'sse' → data: 事件被正确解析
    expect((chat.messages.value.at(-1)!.content[0] as { text: string }).text).toBe('ok');
    // retryTimes 默认 0 → 成功路径只请求一次
    expect(calls).toBe(1);
    expect(chat.messages.value.at(-1)!.status).toBe('success');
    dispose();
  });
});
