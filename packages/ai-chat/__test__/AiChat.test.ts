import { flushPromises, mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import BubbleList from '../src/components/BubbleList.vue';
import { provideAiChatConfig } from '../src/composables/useAiChatConfig';
import type { FollowContext } from '../src/composables/useAutoScroll';
import type { ChatMessage, ContentBlock, VoiceRecognizerCtx, VoiceRecognizer } from '../src/types';
import {
  textBlock,
  textMessage,
  createMessage,
  messageText,
  sourcesBlock,
  thoughtChainBlock,
} from '../src/utils/helpers';

vi.mock('virtua/vue', () => ({
  Virtualizer: {
    name: 'Virtualizer',
    props: ['data', 'keepMounted'],
    setup(props: any, { slots }: any) {
      return () => (props.data as unknown[]).map((item, i) => slots.default?.({ item, index: i }));
    },
  },
}));

function once(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  });
}

// 多 delta SSE 流：每个 delta 一行 data，末尾 [DONE]。
// 用于覆盖 appendDelta 的「末尾同 type 就地累加（last.text += delta）」分支。
function multi(deltas: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const d of deltas) c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: d })}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  });
}

describe('AiChat', () => {
  it('空消息时显示 Welcome；发送后出现气泡', async () => {
    const request = vi.fn(async () => once('回答'));
    const w = mount(AiChat, { props: { request, welcomeTitle: '你好' } });
    expect(w.find('.aix-welcome').exists()).toBe(true);

    const ta = w.find('textarea');
    await ta.setValue('问题');
    await ta.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(request).toHaveBeenCalled();
    expect(w.findAll('.aix-bubble').length).toBeGreaterThanOrEqual(2);
  });

  it('historyLoading=true 且消息为空：渲染 BubbleList 骨架屏而非 Welcome', () => {
    const request = vi.fn(async () => once('回答'));
    const w = mount(AiChat, { props: { request, welcomeTitle: '你好', historyLoading: true } });
    expect(w.find('.aix-welcome').exists()).toBe(false);
    expect(w.find('.aix-bubble-list__skeleton').exists()).toBe(true);
  });

  it('historyLoading=false（默认）且消息为空：保持原行为显示 Welcome，不受影响', () => {
    const request = vi.fn(async () => once('回答'));
    const w = mount(AiChat, { props: { request, welcomeTitle: '你好' } });
    expect(w.find('.aix-welcome').exists()).toBe(true);
    expect(w.find('.aix-bubble-list__skeleton').exists()).toBe(false);
  });

  it('historyLoading=true 且已有陈旧消息（如切换会话瞬间）：仍展示骨架屏而非陈旧内容', () => {
    const request = vi.fn(async () => once('回答'));
    const w = mount(AiChat, {
      props: {
        request,
        welcomeTitle: '你好',
        historyLoading: true,
        messages: [textMessage('user', '上一个会话的消息')],
      },
    });
    expect(w.find('.aix-bubble-list__skeleton').exists()).toBe(true);
    expect(w.text()).not.toContain('上一个会话的消息');
  });

  // 非受控回归：不绑 v-model:input 时输入框文本由内部状态持有（兼容 Vue 3.3 的关键场景，
  // 实测 defineModel 在 3.3 非受控下打字会丢失；且守住「input prop 不设默认值」铁律）
  it('非受控（不绑 v-model:input）：输入框文本保留并 emit update:input', async () => {
    const request = vi.fn(async () => once('回答'));
    const w = mount(AiChat, { props: { request } }); // 不传 input
    const ta = w.find('textarea');
    await ta.setValue('草稿文本');
    await nextTick();
    // 关键：内部状态持有，textarea 文本不丢失
    expect((ta.element as HTMLTextAreaElement).value).toBe('草稿文本');
    // 仍 emit，供使用方需要时升级为受控
    expect(w.emitted('update:input')?.at(-1)).toEqual(['草稿文本']);
  });

  it('1→N 拆分：默认操作条仅末子气泡显示（去重）', async () => {
    const request = vi.fn(async () => once('回答'));
    // 把 ai 消息拆成两个气泡（共享同一 SSOT 消息）
    const parser = (m: ChatMessage): ChatMessage | ChatMessage[] =>
      m.role === 'ai' ? [{ ...m }, { ...m }] : m;
    const w = mount(AiChat, { props: { request, parser } });
    const ta = w.find('textarea');
    await ta.setValue('问题');
    await ta.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await nextTick();
    // user(1) + ai 拆 2 = 3 个气泡；用户消息默认也挂载操作条，AI 拆分气泡的操作条仍只在末子气泡出现 1 次，
    // 故总操作条数为 2（user 1 + ai 末子气泡 1）
    expect(w.findAll('.aix-bubble').length).toBe(3);
    expect(w.findAll('.aix-bubble-actions').length).toBe(2);
  });

  it('actionsTrigger 控制消息操作显示时机：默认 always 无修饰类，hover 时加 is-actions-hover', () => {
    const request = vi.fn(async () => once('回答'));
    // 默认 always：根节点不含 is-actions-hover（操作常驻显示）
    const wDefault = mount(AiChat, { props: { request } });
    expect(wDefault.find('.aix-ai-chat').classes()).not.toContain('is-actions-hover');
    // 显式 hover：根节点加 is-actions-hover（由 CSS 收敛悬浮/聚焦显隐）
    const wHover = mount(AiChat, { props: { request, actionsTrigger: 'hover' } });
    expect(wHover.find('.aix-ai-chat').classes()).toContain('is-actions-hover');
  });

  it('点击快捷问题（prompts）以其 label 自动发送', async () => {
    const request = vi.fn(async () => once('回答'));
    const w = mount(AiChat, {
      props: {
        request,
        welcomeTitle: '你好',
        prompts: [{ key: '1', label: '帮我写代码' }],
      },
    });
    const btn = w.get('.aix-prompts__item');
    expect(btn.text()).toBe('帮我写代码');
    await btn.trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalled();
    // 进入对话：Welcome 消失，user 气泡内容为 prompt 的 label
    expect(w.find('.aix-welcome').exists()).toBe(false);
    expect(w.text()).toContain('帮我写代码');
    expect(w.findAll('.aix-bubble').length).toBeGreaterThanOrEqual(2);
  });

  it('AI 回复出错后显示重试入口，点击重试重新请求成功', async () => {
    // 默认开启打字机：成功内容经 typewriter 逐字渲染，需推进定时器播完后再断言完整文本
    vi.useFakeTimers();
    try {
      let call = 0;
      const request = vi.fn(async () => {
        if (call++ === 0) throw new Error('boom');
        return once('重试成功');
      });
      const w = mount(AiChat, { props: { request, welcomeTitle: '你好' } });
      const ta = w.find('textarea');
      await ta.setValue('问题');
      await ta.trigger('keydown', { key: 'Enter' });
      await flushPromises();

      // 出错 → 气泡显示重试入口
      expect(w.find('.aix-bubble__retry').exists()).toBe(true);

      // 点击重试 → 第二次请求成功，重试入口消失
      await w.find('.aix-bubble__retry').trigger('click');
      await flushPromises();
      await vi.advanceTimersByTimeAsync(1000); // 等打字机把成功内容播完
      expect(request).toHaveBeenCalledTimes(2);
      expect(w.text()).toContain('重试成功');
      expect(w.find('.aix-bubble__retry').exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('流式回复渲染到 DOM 且 loading 消失（响应式回归）', async () => {
    // 默认开启打字机：AI 内容经 typewriter 逐字渲染，推进定时器播完后断言完整内容已落到 DOM
    vi.useFakeTimers();
    try {
      const request = vi.fn(async () => once('回答内容XYZ'));
      const w = mount(AiChat, { props: { request, welcomeTitle: '你好' } });
      const ta = w.find('textarea');
      await ta.setValue('问题');
      await ta.trigger('keydown', { key: 'Enter' });
      await flushPromises();
      await vi.advanceTimersByTimeAsync(1000);
      // 关键：断言 DOM 实际渲染，而不是只读 messages 数据
      expect(w.find('.aix-loading-dots').exists()).toBe(false);
      expect(w.text()).toContain('回答内容XYZ');
    } finally {
      vi.useRealTimers();
    }
  });

  // 回归：多个同 type delta 走 appendDelta 的「末尾同 type 就地累加（last.text += delta）」分支，
  // 该分支此前仅有 useChat 数据层断言（messageText），缺 DOM 断言。
  // 本用例验证多 delta 就地 += 后完整文本真正累加并渲染到 DOM（数据层绿 ≠ DOM 更新 的响应式陷阱）。
  it('多个 delta 就地累加（last.text += delta）后完整文本渲染到 DOM（响应式回归）', async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn(async () => multi(['Hello', ' ', 'world']));
      const w = mount(AiChat, { props: { request, welcomeTitle: '你好' } });
      const ta = w.find('textarea');
      await ta.setValue('问题');
      await ta.trigger('keydown', { key: 'Enter' });
      await flushPromises();
      await vi.advanceTimersByTimeAsync(1000); // 等打字机把就地累加后的完整内容播完
      // 关键：三个 delta 经 last.text += delta 就地累加，需真正反映到 DOM
      expect(w.find('.aix-loading-dots').exists()).toBe(false);
      expect(w.text()).toContain('Hello world');
    } finally {
      vi.useRealTimers();
    }
  });

  // 回归：shouldFollow 曾被定义却从未透传给 BubbleList，导致注入的自定义跟随策略静默失效
  it('props.shouldFollow 透传生效：流式更新时被调用', async () => {
    const shouldFollow = vi.fn((_ctx: FollowContext) => true);
    const request = vi.fn(async () => once('回答'));
    const w = mount(AiChat, { props: { request, welcomeTitle: '你好', shouldFollow } });
    const ta = w.find('textarea');
    await ta.setValue('问题');
    await ta.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await w.vm.$nextTick();
    expect(shouldFollow).toHaveBeenCalled();
    // 流式增量会以 reason='streaming' 触发跟随判定
    expect(shouldFollow.mock.calls.map((c) => c[0].reason)).toContain('streaming');
  });

  it('provideAiChatConfig 注入的 shouldFollow 同样透传生效', async () => {
    const shouldFollow = vi.fn((_ctx: FollowContext) => true);
    const request = vi.fn(async () => once('回答'));
    const Wrapper = defineComponent({
      props: { request: { type: Function, required: true } },
      setup(p) {
        provideAiChatConfig({ shouldFollow });
        return () => h(AiChat, { request: p.request as never, welcomeTitle: '你好' });
      },
    });
    const w = mount(Wrapper, { props: { request } });
    const ta = w.find('textarea');
    await ta.setValue('问题');
    await ta.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await w.vm.$nextTick();
    expect(shouldFollow).toHaveBeenCalled();
  });

  // 集成回归：provideAiChatConfig({enableTyping:false}) → AiChat :typing=false → BubbleList → Bubble → TextBlock
  // 关闭打字机后流式回答不逐字、不依赖定时器即全显。此前 config.enableTyping 透传链仅有 inject 单测，缺端到端 DOM 断言。
  it('provideAiChatConfig({enableTyping:false}) 关闭打字机：不推进定时器即全显（config 透传链回归）', async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn(async () => once('完整答案ABC'));
      const Wrapper = defineComponent({
        props: { request: { type: Function, required: true } },
        setup(p) {
          provideAiChatConfig({ enableTyping: false });
          return () => h(AiChat, { request: p.request as never, welcomeTitle: '你好' });
        },
      });
      const w = mount(Wrapper, { props: { request } });
      const ta = w.find('textarea');
      await ta.setValue('问题');
      await ta.trigger('keydown', { key: 'Enter' });
      await flushPromises();
      // 关键：未调用 advanceTimersByTime；打字机若生效 displayed 仍停在 ''。
      // enableTyping=false 时 TextBlock 直接取 block.text，故完整文本立即落到 DOM。
      expect(w.text()).toContain('完整答案ABC');
      expect(w.find('.aix-loading-dots').exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // 集成回归：Sender 停止按钮 → AiChat abort → 消息标记 abort（此前仅在 useChat 单测层验证）
  it('发送中点击停止按钮触发 abort，AI 消息标记为 abort', async () => {
    const request = vi.fn(({ signal }: { signal: AbortSignal }) =>
      Promise.resolve(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {"delta":"部分"}\n\n'));
            // 不 close，模拟挂起的长连接；abort 时以 AbortError 结束
            signal.addEventListener('abort', () =>
              c.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        }),
      ),
    );
    const w = mount(AiChat, { props: { request, welcomeTitle: '你好' } });
    const ta = w.find('textarea');
    await ta.setValue('问题');
    await ta.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await w.vm.$nextTick();
    // 进行中：按钮切换为停止态（aria-label）
    const sendBtn = w.find('.aix-sender__send');
    expect(sendBtn.attributes('aria-label')).toBe('停止');
    // 点击停止 → emit cancel → AiChat abort
    await sendBtn.trigger('click');
    await flushPromises();
    const vm = w.vm as unknown as { messages: ChatMessage[] };
    expect(vm.messages[1]!.status).toBe('abort');
  });

  it('v-model:messages 受控：渲染外部传入的初始消息', () => {
    const request = vi.fn(async () => once('x'));
    const w = mount(AiChat, {
      props: {
        request,
        messages: [textMessage('user', '外部历史')],
      },
    });
    expect(w.find('.aix-welcome').exists()).toBe(false);
    expect(w.text()).toContain('外部历史');
  });

  // #5 注册表透传：AiChat 顶层 blockRenderers 经 BubbleList→Bubble 透传，自定义块被渲染（端到端）
  it('顶层 blockRenderers 透传：自定义 sources 块在气泡中渲染', async () => {
    const Sources = defineComponent({
      props: { block: { type: Object, required: true } },
      setup: (p: { block: { items: { title: string }[] } }) => () =>
        h(
          'ul',
          { class: 'chat-sources' },
          p.block.items.map((s, i) => h('li', { key: i }, s.title)),
        ),
    });
    const request = vi.fn(async () => once('x'));
    const w = mount(AiChat, {
      props: {
        request,
        blockRenderers: { sources: Sources },
        messages: [
          createMessage('ai', [sourcesBlock([{ title: '来源A' }])], {
            id: 's1',
            status: 'success',
          }),
        ],
      },
    });
    await flushPromises();
    expect(w.find('.chat-sources').exists()).toBe(true);
    expect(w.text()).toContain('来源A');
  });

  // #5 config 层透传 + 优先级：provideAiChatConfig.blockRenderers 生效，组件 props 同名覆盖
  it('provideAiChatConfig 的 blockRenderers 透传，且组件 props 优先', async () => {
    const FromConfig = defineComponent({
      props: { block: { type: Object, required: true } },
      setup: () => () => h('span', { class: 'from-config' }, 'CONFIG'),
    });
    const FromProps = defineComponent({
      props: { block: { type: Object, required: true } },
      setup: () => () => h('span', { class: 'from-props' }, 'PROPS'),
    });
    const request = vi.fn(async () => once('x'));
    const msgs = [
      createMessage('ai', [sourcesBlock([{ title: 'A' }])], { id: 's1', status: 'success' }),
    ];
    const Wrapper = defineComponent({
      props: { useProps: { type: Boolean, default: false } },
      setup(p) {
        provideAiChatConfig({ blockRenderers: { sources: FromConfig } });
        return () =>
          h(AiChat, {
            request: request as never,
            messages: msgs,
            blockRenderers: p.useProps ? { sources: FromProps } : undefined,
          });
      },
    });
    // 仅 config：渲染 config 注入的渲染器
    const w1 = mount(Wrapper);
    await flushPromises();
    expect(w1.find('.from-config').exists()).toBe(true);
    // config + props：组件 props 优先
    const w2 = mount(Wrapper, { props: { useProps: true } });
    await flushPromises();
    expect(w2.find('.from-props').exists()).toBe(true);
    expect(w2.find('.from-config').exists()).toBe(false);
  });

  // Task 8：AiChat 顶层 toolRenderers（与 blockRenderers 并列的独立注册表）透传给 BubbleList，
  // 按 tool_use 块的 toolName 路由到自定义渲染器
  it('toolRenderers 透传并对指定 toolName 生效', async () => {
    const Custom = defineComponent({
      props: { block: { type: Object, required: true } },
      setup: () => () => h('div', { class: 'quiz' }, 'QUIZ'),
    });
    const msgs: ChatMessage[] = [
      { id: 'u', role: 'user', content: [{ id: 't', type: 'text', text: 'hi' }] },
      {
        id: 'ai',
        role: 'ai',
        status: 'success',
        content: [
          {
            id: 'b',
            type: 'tool_use',
            toolCallId: 'c',
            toolName: 'generate_quiz',
            state: 'output-available',
            input: {},
            output: {},
          } as ContentBlock,
        ],
      },
    ];
    const request = vi.fn(async () => new ReadableStream());
    const w = mount(AiChat, {
      props: { request, defaultMessages: msgs, toolRenderers: { generate_quiz: Custom } },
    });
    await nextTick();
    expect(w.find('.quiz').exists()).toBe(true);
  });

  it('v-model:messages 受控：外部更新 messages 即时反映到视图', async () => {
    const request = vi.fn(async () => once('x'));
    const w = mount(AiChat, { props: { request, messages: [], welcomeTitle: '你好' } });
    expect(w.find('.aix-welcome').exists()).toBe(true);
    await w.setProps({
      messages: [createMessage('ai', [textBlock('注入消息')], { id: 'n', status: 'success' })],
    });
    await flushPromises();
    expect(w.find('.aix-welcome').exists()).toBe(false);
    expect(w.text()).toContain('注入消息');
  });

  // emit: send —— UI 提交走 onSend 包装函数，先抛 send 再委托 useChat
  it('通过 Sender 提交消息时 emit send，payload 为输入文本', async () => {
    const request = vi.fn(async () => once('回答'));
    const w = mount(AiChat, { props: { request, welcomeTitle: '你好' } });
    const ta = w.find('textarea');
    await ta.setValue('你好世界');
    await ta.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(w.emitted('send')).toBeTruthy();
    expect(w.emitted('send')![0]).toEqual(['你好世界']);
  });

  // emit: send（快捷问题）—— onPromptSelect 同样经 onSend 入口，payload 为 prompt 的 label
  it('点击快捷问题时 emit send，payload 为 prompt 的 label', async () => {
    const request = vi.fn(async () => once('回答'));
    const w = mount(AiChat, {
      props: {
        request,
        welcomeTitle: '你好',
        prompts: [{ key: '1', label: '帮我写代码' }],
      },
    });
    await w.get('.aix-prompts__item').trigger('click');
    await flushPromises();

    expect(w.emitted('send')).toBeTruthy();
    expect(w.emitted('send')![0]).toEqual(['帮我写代码']);
  });

  // emit: finish —— 流正常结束后由 useChat 的 onFinish 透传，消息 status 为 success
  it('流正常结束后 emit finish，实参消息 status 为 success', async () => {
    const request = vi.fn(async () => once('完整回答'));
    const w = mount(AiChat, { props: { request, welcomeTitle: '你好' } });
    const ta = w.find('textarea');
    await ta.setValue('问题');
    await ta.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await w.vm.$nextTick();

    expect(w.emitted('finish')).toBeTruthy();
    const finished = w.emitted('finish')![0]![0] as ChatMessage;
    expect(finished.status).toBe('success');
    expect(messageText(finished)).toBe('完整回答');
    // 正常结束不应触发 error / abort
    expect(w.emitted('error')).toBeFalsy();
    expect(w.emitted('abort')).toBeFalsy();
  });

  // emit: error —— request 抛错由 onError 透传（status 'error'），不应 emit finish
  it('request 抛错时 emit error（status error），且不 emit finish', async () => {
    const request = vi.fn(async () => {
      throw new Error('boom');
    });
    const w = mount(AiChat, { props: { request, welcomeTitle: '你好' } });
    const ta = w.find('textarea');
    await ta.setValue('问题');
    await ta.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(w.emitted('error')).toBeTruthy();
    const errored = w.emitted('error')![0]![0] as ChatMessage;
    expect(errored.status).toBe('error');
    expect(w.emitted('finish')).toBeFalsy();
  });

  // emit: abort —— 调用暴露的 abort() 中断长流，由 onAbort 透传（status 'abort'）
  it('中断进行中的长流时 emit abort，实参消息 status 为 abort', async () => {
    const request = vi.fn(({ signal }: { signal: AbortSignal }) =>
      Promise.resolve(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {"delta":"部分"}\n\n'));
            signal.addEventListener('abort', () =>
              c.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        }),
      ),
    );
    const w = mount(AiChat, { props: { request, welcomeTitle: '你好' } });
    const ta = w.find('textarea');
    await ta.setValue('问题');
    await ta.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await w.vm.$nextTick();

    // 调用暴露的命令式 abort()
    (w.vm as unknown as { abort: () => void }).abort();
    await flushPromises();

    expect(w.emitted('abort')).toBeTruthy();
    const aborted = w.emitted('abort')![0]![0] as ChatMessage;
    expect(aborted.status).toBe('abort');
    expect(w.emitted('finish')).toBeFalsy();
  });

  // 回归：停止后的气泡应恢复 BubbleActions（与 success 一致）并前置"继续生成"按钮，
  // 点击后内容拼接到同一气泡、status 回到 success，不新建气泡
  it('停止后 BubbleActions 恢复且前置继续生成按钮；点击继续生成后内容拼接、status 回到 success', async () => {
    let call = 0;
    const request = vi.fn(({ signal }: { signal: AbortSignal }) => {
      call += 1;
      if (call === 1) {
        return Promise.resolve(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(new TextEncoder().encode('data: {"delta":"部分回答"}\n\n'));
              signal.addEventListener('abort', () =>
                c.error(new DOMException('Aborted', 'AbortError')),
              );
            },
          }),
        );
      }
      return Promise.resolve(once('续写内容'));
    });
    const w = mount(AiChat, { props: { request, welcomeTitle: '你好' } });
    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await w.vm.$nextTick();

    (w.vm as unknown as { abort: () => void }).abort();
    await flushPromises();

    const aiId = w.vm.messages[1]!.id;
    expect(w.vm.messages[1]!.status).toBe('abort');

    const aiBubble = w.findAll('.aix-bubble--start')[0]!;
    const labels = aiBubble
      .findAll('.aix-bubble-actions__btn')
      .map((b) => b.attributes('aria-label'));
    expect(labels).toEqual(['继续生成', '复制', '重新生成']); // continue 前置，其余同 success

    await aiBubble.find('[aria-label="继续生成"]').trigger('click');
    await flushPromises();

    expect(messageText(w.vm.messages[1]!)).toBe('部分回答续写内容');
    expect(w.vm.messages[1]!.status).toBe('success');
    expect(w.vm.messages[1]!.id).toBe(aiId); // 未新建气泡
  });

  it('actions: [] 时，停止态也不显示继续生成按钮（完全遵守 actions 配置）', async () => {
    const request = vi.fn(({ signal }: { signal: AbortSignal }) =>
      Promise.resolve(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {"delta":"部分"}\n\n'));
            signal.addEventListener('abort', () =>
              c.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        }),
      ),
    );
    const w = mount(AiChat, { props: { request, actions: [], welcomeTitle: '你好' } });
    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await w.vm.$nextTick();
    (w.vm as unknown as { abort: () => void }).abort();
    await flushPromises();

    const aiBubble = w.findAll('.aix-bubble--start')[0]!;
    expect(aiBubble.find('.aix-bubble-actions').exists()).toBe(false);
  });

  // 回归：1→N 拆分场景下，abort 态的 continue 按钮同样只应在末子气泡出现，
  // 遵守既有的"操作条仅末子气泡显示"规则（sub 判断先于 continue 注入执行）
  it('1→N 拆分 + 停止：继续生成按钮仅在末子气泡出现', async () => {
    const request = vi.fn(({ signal }: { signal: AbortSignal }) =>
      Promise.resolve(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {"delta":"部分"}\n\n'));
            signal.addEventListener('abort', () =>
              c.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        }),
      ),
    );
    // 把 ai 消息拆成两个气泡（共享同一 SSOT 消息，status 一并透传）
    const parser = (m: ChatMessage): ChatMessage | ChatMessage[] =>
      m.role === 'ai' ? [{ ...m }, { ...m }] : m;
    const w = mount(AiChat, { props: { request, parser, welcomeTitle: '你好' } });
    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await w.vm.$nextTick();
    (w.vm as unknown as { abort: () => void }).abort();
    await flushPromises();

    // user(1) + ai 拆 2 = 3 个气泡；continue 按钮只应在其中 1 个气泡（末子气泡）出现
    const aiBubbles = w.findAll('.aix-bubble--start');
    expect(aiBubbles).toHaveLength(2);
    const continueButtons = w.findAll('button[aria-label="继续生成"]');
    expect(continueButtons).toHaveLength(1);
    expect(aiBubbles[0]!.find('button[aria-label="继续生成"]').exists()).toBe(false);
    expect(aiBubbles[1]!.find('button[aria-label="继续生成"]').exists()).toBe(true);
  });

  // 回归：函数形态 actions 由业务全权决定，不自动注入 continue（与数组形态不同规则），
  // 即便消息处于 abort 态、函数返回的列表里没有 'continue' 也不应凭空出现
  it('函数形态 actions + abort：不自动注入 continue（业务未在返回值里包含则不出现）', async () => {
    const request = vi.fn(({ signal }: { signal: AbortSignal }) =>
      Promise.resolve(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {"delta":"部分"}\n\n'));
            signal.addEventListener('abort', () =>
              c.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        }),
      ),
    );
    const w = mount(AiChat, {
      props: {
        request,
        actions: (m: ChatMessage) => (m.role === 'ai' ? ['regenerate'] : null),
        welcomeTitle: '你好',
      },
    });
    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await w.vm.$nextTick();
    (w.vm as unknown as { abort: () => void }).abort();
    await flushPromises();

    const aiBubble = w.findAll('.aix-bubble--start')[0]!;
    expect(aiBubble.find('button[aria-label="继续生成"]').exists()).toBe(false);
    expect(aiBubble.find('button[aria-label="重新生成"]').exists()).toBe(true);
  });

  // 回归 Bug：'continue' 是合法 ActionKey，业务可能显式把它写进静态 actions 数组
  // （例如想自定义按钮顺序）；此时 abort 态的自动注入不应再 unshift 出第二个 'continue'，
  // 否则 BubbleActions 的 v-for :key="item.key" 撞重复渲染出两个"继续生成"按钮
  it("actions 数组显式包含 'continue' + abort：不重复渲染，按业务声明的位置显示", async () => {
    const request = vi.fn(({ signal }: { signal: AbortSignal }) =>
      Promise.resolve(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {"delta":"部分"}\n\n'));
            signal.addEventListener('abort', () =>
              c.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        }),
      ),
    );
    const w = mount(AiChat, {
      props: { request, actions: ['copy', 'continue', 'regenerate'], welcomeTitle: '你好' },
    });
    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await w.vm.$nextTick();
    (w.vm as unknown as { abort: () => void }).abort();
    await flushPromises();

    const aiBubble = w.findAll('.aix-bubble--start')[0]!;
    const labels = aiBubble
      .findAll('.aix-bubble-actions__btn')
      .map((b) => b.attributes('aria-label'));
    // 只出现一次"继续生成"，且保持业务声明的位置（copy, continue, regenerate），不被前置
    expect(labels).toEqual(['复制', '继续生成', '重新生成']);
  });

  // v-model:input —— 双向绑定到 Sender 的 modelValue
  it('v-model:input 同步：传入值回填到 Sender，且输入触发 update:input', async () => {
    const request = vi.fn(async () => once('x'));
    const w = mount(AiChat, { props: { request, input: '草稿内容', welcomeTitle: '你好' } });
    // 外部 input model 值回填到 Sender 的 textarea
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('草稿内容');

    // Sender 输入触发 update:modelValue → AiChat emit update:input
    await w.find('textarea').setValue('新输入');
    expect(w.emitted('update:input')).toBeTruthy();
    expect(w.emitted('update:input')!.at(-1)).toEqual(['新输入']);
  });

  // expose: focus / clear —— 委托 senderRef
  it('暴露 focus / clear 命令式方法，可调用且 focus 真实生效', async () => {
    const request = vi.fn(async () => once('x'));
    const w = mount(AiChat, {
      props: { request, welcomeTitle: '你好' },
      attachTo: document.body,
    });
    const vm = w.vm as unknown as { focus: () => void; clear: () => void };
    expect(typeof vm.focus).toBe('function');
    expect(typeof vm.clear).toBe('function');

    const ta = w.find('textarea').element as HTMLTextAreaElement;
    vm.focus();
    expect(document.activeElement).toBe(ta);

    // clear 不报错并清空输入框
    await w.find('textarea').setValue('要被清空的内容');
    vm.clear();
    await w.vm.$nextTick();
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('');

    w.unmount();
  });

  // 默认消息操作（复制 / 重新生成）
  it('默认为 AI 成功回复挂载消息操作；点击重新生成会再次请求', async () => {
    let call = 0;
    const request = vi.fn(async () => once(call++ === 0 ? '一答' : '二答'));
    const w = mount(AiChat, { props: { request, welcomeTitle: '你好' } });
    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();

    // AI 气泡 footer 出现默认操作区（复制 + 重新生成）；quote 为 opt-in，不再自动注入
    // 用户消息现在也默认挂载操作条（copy/edit），需限定到 AI 气泡（--start）以定位到目标操作区
    const actions = w.findAll('.aix-bubble--start')[0]!.find('.aix-bubble-actions');
    expect(actions.exists()).toBe(true);
    expect(actions.findAll('.aix-bubble-actions__btn')).toHaveLength(2);

    // 点击重新生成 → onReload → 第二次请求
    await actions.findAll('.aix-bubble-actions__btn')[1]!.trigger('click');
    await flushPromises();
    expect(request).toHaveBeenCalledTimes(2);
    expect(messageText(w.vm.messages[w.vm.messages.length - 1]!)).toBe('二答');
  });

  it('actions=[] 只关闭 AI 消息的操作条，用户消息仍是固定默认值', async () => {
    const request = vi.fn(async () => once('答'));
    const w = mount(AiChat, { props: { request, actions: [] } });
    await w.find('textarea').setValue('问');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    // 先确认气泡已渲染（user + ai），再断言操作条状态，避免「因没渲染才无操作条」的假阳性
    expect(w.findAll('.aix-bubble').length).toBeGreaterThanOrEqual(2);
    // 数组形态 actions=[] 只作用于 AI 消息：AI 气泡无操作条
    const aiBubble = w.findAll('.aix-bubble--start')[0]!;
    expect(aiBubble.find('.aix-bubble-actions').exists()).toBe(false);
    // 用户消息的操作条是固定默认值，不受 actions 数组形态影响
    const userBubble = w.findAll('.aix-bubble--end')[0]!;
    const btns = userBubble.findAll('.aix-bubble-actions__btn');
    expect(btns.map((b) => b.attributes('aria-label'))).toEqual(['复制', '编辑']);
  });

  it('#footer 作用域 slot 覆盖默认操作并收到对应消息 item', async () => {
    const request = vi.fn(async () => once('答'));
    const w = mount(AiChat, {
      props: { request },
      slots: {
        footer: ({ item }: { item: ChatMessage }) =>
          h('span', { class: 'custom-footer' }, item.role),
      },
    });
    await w.find('textarea').setValue('问');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(w.find('.aix-bubble-actions').exists()).toBe(false);
    // 每条消息都进入自定义 footer（user + ai）
    const footers = w.findAll('.custom-footer');
    expect(footers.length).toBeGreaterThanOrEqual(2);
    expect(footers.map((f) => f.text())).toContain('ai');
  });

  it('用户消息默认操作条为 [copy, edit]', async () => {
    const request = vi.fn(async () => once('答'));
    const w = mount(AiChat, { props: { request } });
    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    const userBubble = w.findAll('.aix-bubble--end')[0]!;
    const btns = userBubble.findAll('.aix-bubble-actions__btn');
    expect(btns.map((b) => b.attributes('aria-label'))).toEqual(['复制', '编辑']);
  });

  it('流式进行中，用户消息默认操作条收窄为 [copy]（编辑入口隐藏，避免草稿被静默丢弃）', async () => {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const request = vi.fn(async () => new ReadableStream<Uint8Array>({ start: (c) => (ctrl = c) }));
    const w = mount(AiChat, { props: { request } });
    await w.find('textarea').setValue('问');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises(); // 流挂起：isLoading 保持 true
    const userBubble = w.findAll('.aix-bubble--end')[0]!;
    const btns = userBubble.findAll('.aix-bubble-actions__btn');
    expect(btns.map((b) => b.attributes('aria-label'))).toEqual(['复制']);
    ctrl.close();
    await flushPromises();

    const userBubbleAfter = w.findAll('.aix-bubble--end')[0]!;
    expect(
      userBubbleAfter.findAll('.aix-bubble-actions__btn').map((b) => b.attributes('aria-label')),
    ).toEqual(['复制', '编辑']);
  });

  it('点击用户消息的编辑按钮 → 进入内联编辑态 → 保存触发 onEdit（产生兄弟分支 + 重新请求）+ emit edit', async () => {
    let call = 0;
    const request = vi.fn(async () => once(call++ === 0 ? '一答' : '二答'));
    const w = mount(AiChat, { props: { request, welcomeTitle: '你好' } });
    await w.find('textarea').setValue('原问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();

    const originalMsgId = (w.vm as unknown as { messages: ChatMessage[] }).messages[0]!.id;

    const userBubble = w.findAll('.aix-bubble--end')[0]!;
    await userBubble.find('[aria-label="编辑"]').trigger('click');
    await w.find('textarea.aix-bubble__edit-input').setValue('改后问题');
    await w.find('.aix-bubble__edit-save').trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledTimes(2);
    expect(w.emitted('edit')![0]).toEqual([{ id: originalMsgId, text: '改后问题' }]);
    expect(messageText((w.vm as unknown as { messages: ChatMessage[] }).messages[0]!)).toBe(
      '改后问题',
    );
    expect((w.vm as unknown as { messages: unknown[] }).messages).toHaveLength(2);
    expect((w.vm as unknown as { messages: ChatMessage[] }).messages[0]!.id).not.toBe(
      originalMsgId,
    );
  });

  // Bug 防回归：流式期间 useChat.onEdit 被守卫拒绝（消息未改写未重发），
  // AiChat 不得仍 emit 'edit'——否则业务持久化与实际消息状态脱节。
  it('流式期间保存编辑不 emit edit（守卫拒绝时不误导业务持久化）', async () => {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const request = vi.fn(async () => new ReadableStream<Uint8Array>({ start: (c) => (ctrl = c) }));
    const w = mount(AiChat, { props: { request } });
    await w.find('textarea').setValue('原问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises(); // 流挂起：isLoading 保持 true；此时编辑入口已从默认操作条隐藏（见上一条测试），
    // 直接经 BubbleList 暴露的 startEdit 绕过 UI 隐藏，验证 emit 门控本身仍然生效
    (w.findComponent(BubbleList).vm as unknown as { startEdit: (id: string) => void }).startEdit(
      w.vm.messages[0]!.id,
    );
    await flushPromises();
    w.findComponent(BubbleList).vm.$emit('edit', w.vm.messages[0]!.id, '改后');
    await flushPromises();
    expect(w.emitted('edit')).toBeUndefined();
    expect(messageText(w.vm.messages[0]!)).toBe('原问题');
    ctrl.close();
    await flushPromises();
  });

  // 用户消息默认操作条不再含 delete（见上方"用户消息默认操作条为 [copy, edit]"），
  // 这里用函数形态 actions 显式为该消息追加 delete，覆盖 BubbleActions → AiChat 的 emit 接线本身仍然生效
  it('点击用户消息的删除按钮（业务通过函数形态 actions 显式开启）→ emit delete(message)，不改动 messages', async () => {
    const request = vi.fn(async () => once('答'));
    const w = mount(AiChat, { props: { request, actions: () => ['copy', 'edit', 'delete'] } });
    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    const userMsg = (w.vm as unknown as { messages: ChatMessage[] }).messages[0]!;
    const userBubble = w.findAll('.aix-bubble--end')[0]!;
    await userBubble.find('[aria-label="删除"]').trigger('click');
    expect(w.emitted('delete')![0]).toEqual([userMsg]);
    // 只 emit，不自己删——messages 长度不变
    expect((w.vm as unknown as { messages: unknown[] }).messages).toHaveLength(2);
  });

  // RFC 明确的语义：数组形态 actions 的历史含义不变——只配置 AI 消息，
  // 用户消息永远拿固定默认值，不会被这个数组"顺便"影响到（哪怕数组里没有 edit/delete 也一样）
  it('数组形态 actions 只影响 AI 消息，用户消息默认操作条不受影响', async () => {
    const request = vi.fn(async () => once('答'));
    const w = mount(AiChat, { props: { request, actions: ['copy'] } });
    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    const aiBubble = w.findAll('.aix-bubble--start')[0]!;
    expect(
      aiBubble.findAll('.aix-bubble-actions__btn').map((b) => b.attributes('aria-label')),
    ).toEqual(['复制']); // AI 消息收窄为只剩 copy（regenerate 被拿掉）
    const userBubble = w.findAll('.aix-bubble--end')[0]!;
    expect(
      userBubble.findAll('.aix-bubble-actions__btn').map((b) => b.attributes('aria-label')),
    ).toEqual(['复制', '编辑']); // 用户消息依旧是固定默认值，未被 ['copy'] 这个数组影响
  });

  it('actions 含 feedback：点击赞写回 extra.feedback 并 emit feedback', async () => {
    const request = vi.fn(async () => once('答'));
    const w = mount(AiChat, {
      props: { request, actions: ['copy', 'regenerate', 'feedback'], welcomeTitle: '你好' },
    });
    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();

    const like = w.findAll('.aix-bubble-actions__feedback')[0]!;
    expect(like).toBeTruthy();
    await like.trigger('click');
    await flushPromises();

    const aiMsg = w.vm.messages[w.vm.messages.length - 1]!;
    expect(aiMsg.extra?.feedback).toBe('like');
    expect(w.emitted('feedback')![0]).toEqual([{ id: aiMsg.id, value: 'like' }]);
  });

  it('actions 函数形态：按消息细粒度控制', async () => {
    const request = vi.fn(async () => once('答'));
    const w = mount(AiChat, {
      props: {
        request,
        actions: (m: ChatMessage) => (m.role === 'ai' ? ['regenerate'] : null),
        welcomeTitle: '你好',
      },
    });
    await w.find('textarea').setValue('问');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();

    // AI 消息有操作条，且只有 1 个按钮（重新生成）
    const actions = w.find('.aix-bubble-actions');
    expect(actions.exists()).toBe(true);
    const btns = actions.findAll('.aix-bubble-actions__btn');
    expect(btns).toHaveLength(1);
    expect(btns[0]!.attributes('aria-label')).toBe('重新生成');

    // user 消息（end 气泡）函数返回 null，其内不渲染操作条
    const userBubble = w.find('.aix-bubble--end');
    expect(userBubble.exists()).toBe(true);
    expect(userBubble.find('.aix-bubble-actions').exists()).toBe(false);
    // 全局仅 1 个操作条（即 AI 那条）
    expect(w.findAll('.aix-bubble-actions')).toHaveLength(1);
  });

  it('autoPlay + 流式 error 终态：stop 被调用（speakingId 不悬挂）', async () => {
    const stopFn = vi.fn();
    const synthesizer = () => ({ enqueue: vi.fn(), finish: vi.fn(), stop: stopFn });
    const enc = new TextEncoder();
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const request = vi.fn(
      async () =>
        new ReadableStream<Uint8Array>({
          start: (c) => {
            ctrl = c;
          },
        }),
    );
    const w = mount(AiChat, {
      props: { request, speech: { autoPlay: true, synthesizer }, welcomeTitle: '你好' },
    });

    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();

    // 喂入含句末标点的 chunk → AI 消息进入 updating，autoPlay 起播（speakingId 置位）
    ctrl.enqueue(enc.encode('data: {"delta":"你好。"}\n\n'));
    await flushPromises();
    await w.vm.$nextTick();

    // 流出错 → status 变 error → autoPlay watch 触发，修复应调用 speech.stop()
    ctrl.error(new Error('network error'));
    await flushPromises();
    await w.vm.$nextTick();

    expect(stopFn).toHaveBeenCalled();
  });

  it('speech 启用：ai+success 消息操作条出现朗读按钮，点击触发合成器', async () => {
    const enqueue = vi.fn();
    const synthesizer = () => ({ enqueue, finish: vi.fn(), stop: vi.fn() });
    const w = mount(AiChat, {
      props: {
        request: async () => new Response(''),
        speech: { synthesizer },
        messages: [
          {
            id: 'a1',
            role: 'ai',
            status: 'success',
            content: [{ id: 'b1', type: 'text', text: '你好世界' }],
          },
        ],
      },
    });
    await flushPromises();
    // 找到朗读按钮（aria-label=朗读）并点击
    const speakBtn = w
      .findAll('.aix-bubble-actions__btn')
      .find((b) => b.attributes('aria-label') === '朗读');
    expect(speakBtn).toBeTruthy();
    await speakBtn!.trigger('click');
    expect(enqueue).toHaveBeenCalledWith('你好世界');
  });

  it('toolbarItems 透传给 Sender，渲染自定义工具栏项', () => {
    const Custom = { template: '<button class="custom-item">x</button>' };
    const request = vi.fn(async () => once('回答'));
    const w = mount(AiChat, {
      props: { request, toolbarItems: [{ key: 'x', component: Custom }] },
    });
    expect(w.find('.aix-sender .custom-item').exists()).toBe(true);
  });

  it('#toolbar / #prefix 插槽转发给 Sender，不被块插槽通用逻辑误吞', () => {
    const request = vi.fn(async () => once('回答'));
    const w = mount(AiChat, {
      props: { request },
      slots: {
        toolbar: '<button class="ins">灵感</button>',
        prefix: '<span class="pre">+</span>',
      },
    });
    expect(w.find('.aix-sender__toolbar .ins').exists()).toBe(true);
    expect(w.find('.aix-sender__prefix .pre').exists()).toBe(true);
  });

  it('#toolbar 不泄漏给 BubbleList 的块渲染器（直接验证 AICHAT_RESERVED_SLOTS 修复，而非仅验证 Sender 收到内容）', async () => {
    const ToolbarProbe = defineComponent({
      props: { block: { type: Object, required: true } },
      setup(_props, { slots }) {
        return () =>
          h('div', { class: 'toolbar-probe' }, [
            slots.toolbar
              ? slots.toolbar()
              : h('span', { class: 'toolbar-probe-fallback' }, 'fallback'),
          ]);
      },
    });
    const request = vi.fn(async () => once('回答'));
    const w = mount(AiChat, {
      props: {
        request,
        blockRenderers: { probe: ToolbarProbe },
        defaultMessages: [
          {
            id: 'm1',
            role: 'ai',
            status: 'success',
            content: [{ id: 'b1', type: 'probe' }],
          },
        ] as never,
      },
      slots: {
        toolbar: '<button class="ins">灵感</button>',
      },
    });
    await nextTick();
    // Sender 的工具栏行仍正常收到内容（既有行为不变）
    expect(w.find('.aix-sender__toolbar .ins').exists()).toBe(true);
    // 关键断言：块渲染器内部的 toolbar slot 从未被 Bubble.vue 绑定过——渲染的是回退内容，
    // 而不是 AiChat 顶层传入的 .ins 按钮。若 'toolbar' 仍残留在 AICHAT_RESERVED_SLOTS 之外
    // （即修复未生效），blockSlotNames 会把它转发给 Bubble → ToolbarProbe，这里就会断言失败。
    expect(w.find('.toolbar-probe .toolbar-probe-fallback').exists()).toBe(true);
    expect(w.find('.toolbar-probe .ins').exists()).toBe(false);
  });
});

describe('AiChat 交互块回传端到端', () => {
  // stub 交互渲染器：渲染 block.selected，点击上抛 select 动作
  const Probe = defineComponent({
    props: {
      block: { type: Object, required: true },
      onBlockAction: {
        type: Function as unknown as () => (a: unknown) => void,
        default: undefined,
      },
    },
    setup(props) {
      return () =>
        h(
          'button',
          {
            class: 'probe',
            onClick: () =>
              (props.onBlockAction as ((a: unknown) => void) | undefined)?.({
                blockId: (props.block as { id: string }).id,
                type: 'select',
                patch: { selected: 'o2' },
              }),
          },
          String((props.block as { selected?: string }).selected ?? 'none'),
        );
    },
  });

  it('点击交互块 → updateBlock 写回 block.selected → DOM 反映；并对外 emit block-action', async () => {
    const wrapper = mount(AiChat, {
      props: {
        request: async () => new ReadableStream(),
        blockRenderers: { probe: Probe },
        defaultMessages: [
          {
            id: 'm1',
            role: 'ai',
            status: 'success',
            content: [{ id: 'b1', type: 'probe', selected: undefined }],
          },
        ] as never,
      },
    });
    await nextTick();
    const probe = wrapper.find('.probe');
    expect(probe.text()).toBe('none');
    await probe.trigger('click');
    await nextTick();
    // 对外事件
    const ev = wrapper.emitted('block-action');
    expect(ev).toBeTruthy();
    expect((ev![0]![0] as { action: { patch: { selected: string } } }).action.patch.selected).toBe(
      'o2',
    );
    // updateBlock 写回 → DOM 反映
    expect(wrapper.find('.probe').text()).toBe('o2');
  });

  it('块动作 blockId 未命中时不写回、且不对外 emit block-action', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 渲染器上抛一个不存在的 blockId，模拟误传 / 脏数据
    const BadProbe = defineComponent({
      props: {
        block: { type: Object, required: true },
        onBlockAction: {
          type: Function as unknown as () => (a: unknown) => void,
          default: undefined,
        },
      },
      setup(props) {
        return () =>
          h(
            'button',
            {
              class: 'bad-probe',
              onClick: () =>
                (props.onBlockAction as ((a: unknown) => void) | undefined)?.({
                  blockId: 'does-not-exist',
                  type: 'select',
                  patch: { selected: 'o2' },
                }),
            },
            'x',
          );
      },
    });
    const wrapper = mount(AiChat, {
      props: {
        request: async () => new ReadableStream(),
        blockRenderers: { probe: BadProbe },
        defaultMessages: [
          {
            id: 'm1',
            role: 'ai',
            status: 'success',
            content: [{ id: 'b1', type: 'probe', selected: undefined }],
          },
        ] as never,
      },
    });
    await nextTick();
    await wrapper.find('.bad-probe').trigger('click');
    await nextTick();
    // 未命中：不对外透出，避免业务据空动作持久化
    expect(wrapper.emitted('block-action')).toBeFalsy();
    warn.mockRestore();
  });
});

describe('AiChat 顶部 header', () => {
  const req = () => vi.fn(async () => new ReadableStream());

  it('默认不传 header 相关：不渲染标题栏节点', () => {
    const w = mount(AiChat, { props: { request: req() } });
    expect(w.find('.aix-ai-chat__header').exists()).toBe(false);
  });

  it('传 headerTitle：渲染标题栏并展示标题文本', () => {
    const w = mount(AiChat, { props: { request: req(), headerTitle: 'AI助手' } });
    const header = w.find('.aix-ai-chat__header');
    expect(header.exists()).toBe(true);
    expect(header.find('.aix-ai-chat__header-title').text()).toBe('AI助手');
  });

  it('header-extra slot：右侧渲染自定义内容（如关闭按钮）', () => {
    const w = mount(AiChat, {
      props: { request: req(), headerTitle: 'AI助手' },
      slots: { 'header-extra': '<button class="biz-close">x</button>' },
    });
    expect(w.find('.aix-ai-chat__header .biz-close').exists()).toBe(true);
  });

  it('header slot：完全覆盖默认标题栏内容', () => {
    const w = mount(AiChat, {
      props: { request: req() },
      slots: { header: '<div class="biz-header">自定义头</div>' },
    });
    const header = w.find('.aix-ai-chat__header');
    expect(header.exists()).toBe(true);
    expect(header.find('.biz-header').text()).toBe('自定义头');
    // 完全覆盖时不应再渲染内置标题节点
    expect(header.find('.aix-ai-chat__header-title').exists()).toBe(false);
  });

  it('header 具名插槽不被当作块插槽透传给 BubbleList', () => {
    // header/header-icon/header-extra 属 AiChat 保留插槽，不应出现在块插槽穿透路径
    const w = mount(AiChat, {
      props: { request: req(), headerTitle: 'AI助手' },
      slots: { 'header-extra': '<button class="biz-close">x</button>' },
    });
    // 仅渲染于 header 区域一次，BubbleList（空态为 Welcome）内不出现
    expect(w.findAll('.biz-close').length).toBe(1);
  });
});

describe('AiChat 欢迎页插槽透传', () => {
  it('welcome-title/description/icon 透传到 Welcome 内部具名插槽（支持富文本标题）', () => {
    const w = mount(AiChat, {
      props: { request: vi.fn(async () => new ReadableStream()) },
      slots: {
        'welcome-icon': '<span class="biz-wicon">🤖</span>',
        'welcome-title': '我是 <em class="biz-brand">AI试题助手</em>',
        'welcome-description': '<span class="biz-wdesc">告诉我你的想法</span>',
      },
    });
    expect(w.find('.aix-welcome__title .biz-brand').text()).toBe('AI试题助手');
    expect(w.find('.aix-welcome__icon .biz-wicon').exists()).toBe(true);
    expect(w.find('.aix-welcome__description .biz-wdesc').exists()).toBe(true);
  });
});

describe('AiChat 语音透传', () => {
  const fakeRecognizer = () => {
    let ctx: VoiceRecognizerCtx | null = null;
    const stop = vi.fn(() => ctx?.onEnd());
    const recognizer: VoiceRecognizer = (c) => {
      ctx = c;
      return { stop };
    };
    return { recognizer, stop, drive: () => ctx! };
  };

  it('voice 透传 Sender：注入识别器后渲染麦克风按钮；默认不传无按钮', () => {
    const { recognizer } = fakeRecognizer();
    const w = mount(AiChat, {
      props: { request: vi.fn(async () => new ReadableStream()), voice: { recognizer } },
    });
    expect(w.find('[aria-label="语音输入"]').exists()).toBe(true);
    const off = mount(AiChat, { props: { request: vi.fn(async () => new ReadableStream()) } });
    expect(off.find('[aria-label="语音输入"]').exists()).toBe(false);
  });
});

describe('AiChat 块插槽穿透', () => {
  it('顶层 #thought-chain-item-content 端到端穿透到 ThoughtChain 内部（携带 item/index）', () => {
    const tcMsg: ChatMessage = {
      id: 'm1',
      role: 'ai',
      status: 'success',
      content: [thoughtChainBlock([{ key: '1', icon: '🤔', title: '步骤一' }])],
    };
    const w = mount(AiChat, {
      props: { request: vi.fn(async () => once('x')), defaultMessages: [tcMsg] },
      slots: {
        'thought-chain-item-content': (scope: { item: { title: string }; index: number }) =>
          h('span', { class: 'rich' }, `R-${scope.index}-${scope.item.title}`),
      },
    });
    expect(w.find('.rich').text()).toBe('R-0-步骤一');
  });
});

describe('AiChat 附件接线', () => {
  it('attachments 透传 Sender；带附件发送组装 [attachmentBlock, textBlock] 消息并回显', async () => {
    const upload = vi.fn(async (f: File) => ({ name: f.name, url: `/f/${f.name}` }));
    const request = vi.fn(async () => once('好的'));
    const w = mount(AiChat, {
      props: { request, welcomeTitle: '你好', attachments: { upload } },
    });

    // 1) 经隐藏 input 选文件并触发 change，等待上传 Promise 完成
    const fileInput = w.find('input[type="file"]');
    expect(fileInput.exists()).toBe(true);
    const file = new File(['pdf content'], 'a.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      configurable: true,
    });
    await fileInput.trigger('change');
    await flushPromises();

    // 2) 输入文本并点击发送按钮
    await w.find('textarea').setValue('帮我总结');
    await w.find('.aix-sender__send').trigger('click');
    await flushPromises();

    // 3) 断言 emitted('send'): [text, attachments]
    expect(w.emitted('send')).toBeTruthy();
    const sendArgs = w.emitted('send')![0] as [string, { name: string; url: string }[]];
    expect(sendArgs[0]).toBe('帮我总结');
    expect(Array.isArray(sendArgs[1])).toBe(true);
    expect(sendArgs[1][0]!.name).toBe('a.pdf');

    // 4) 断言数据层：用户消息 content 为两块
    const vm = w.vm as unknown as { messages: ChatMessage[] };
    const userMsg = vm.messages[0]!;
    expect(userMsg.content).toHaveLength(2);
    const attachmentBlock = userMsg.content[0]!;
    expect(attachmentBlock.type).toBe('attachment');
    expect(
      (attachmentBlock as { type: 'attachment'; items: { name: string }[] }).items[0]!.name,
    ).toBe('a.pdf');
    const txtBlock = userMsg.content[1]!;
    expect(txtBlock.type).toBe('text');
    expect((txtBlock as { type: 'text'; text: string }).text).toBe('帮我总结');

    // 5) DOM 兜底：气泡内出现 .aix-attachment-card
    await nextTick();
    expect(w.find('.aix-attachment-card').exists()).toBe(true);
  });

  it('纯附件发送：消息只含 attachment 块', async () => {
    const upload = vi.fn(async (f: File) => ({ name: f.name, url: `/f/${f.name}` }));
    const request = vi.fn(async () => once('好的'));
    const w = mount(AiChat, {
      props: { request, welcomeTitle: '你好', attachments: { upload } },
    });

    // 选文件但不输入文本
    const fileInput = w.find('input[type="file"]');
    const file = new File(['data'], 'b.png', { type: 'image/png' });
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      configurable: true,
    });
    await fileInput.trigger('change');
    await flushPromises();

    // 直接点击发送（文本为空）
    await w.find('.aix-sender__send').trigger('click');
    await flushPromises();

    // 断言 emitted('send')[0][0] === '' 且无第三个参数（第二个参数是 attachments 数组）
    expect(w.emitted('send')).toBeTruthy();
    const sendArgs = w.emitted('send')![0] as [string, unknown];
    expect(sendArgs[0]).toBe('');
    expect(Array.isArray(sendArgs[1])).toBe(true);
    expect(sendArgs).toHaveLength(2); // 无 meta 时保持旧签名：不携带第三参

    // 断言用户消息 content 仅 1 块且 type === 'attachment'
    const vm = w.vm as unknown as { messages: ChatMessage[] };
    const userMsg = vm.messages[0]!;
    expect(userMsg.content).toHaveLength(1);
    expect(userMsg.content[0]!.type).toBe('attachment');
  });

  it('默认不开启：AiChat 不传 attachments 无附件 UI', () => {
    const request = vi.fn(async () => once('x'));
    const w = mount(AiChat, { props: { request } });
    expect(w.find('input[type="file"]').exists()).toBe(false);
    expect(w.find('[aria-label="添加附件"]').exists()).toBe(false);
  });
});
