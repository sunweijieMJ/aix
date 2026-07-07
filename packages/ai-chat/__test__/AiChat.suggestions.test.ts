import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import type { ChatMessage } from '../src/types';

// BubbleList 内部依赖 virtua 做虚拟滚动，jsdom 无真实布局测量；用 stub 直渲 default slot（与既有 AiChat 测试一致）
vi.mock('virtua/vue', () => ({
  Virtualizer: {
    name: 'Virtualizer',
    props: ['data', 'keepMounted'],
    setup(props: any, { slots }: any) {
      return () => (props.data as unknown[]).map((item, i) => slots.default?.({ item, index: i }));
    },
  },
}));

// 永不返回数据的挂起流（隔离请求副作用；按既有 AiChat 测试的 request mock 模式微调）
const pendingRequest = vi.fn(
  async () => new Response(new ReadableStream({ start() {} }), { status: 200 }),
);

const aiMsg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'a1',
  role: 'ai',
  status: 'success',
  content: [{ id: 'b1', type: 'text', text: '回答' }],
  ...over,
});

describe('AiChat 追问建议', () => {
  it('未配置 suggestions（opt-in）：不渲染建议区', () => {
    const w = mount(AiChat, {
      props: {
        request: pendingRequest,
        defaultMessages: [aiMsg({ suggestions: [{ text: '追问1' }] })],
      },
    });
    expect(w.find('.aix-suggestions').exists()).toBe(false);
  });

  it('通道②：最后一条 AI 消息的 suggestions 渲染为 chips；max 截断', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ text: `追问${i}` }));
    const w = mount(AiChat, {
      props: {
        request: pendingRequest,
        suggestions: { max: 3 },
        defaultMessages: [aiMsg({ suggestions: many })],
      },
    });
    expect(w.findAll('.aix-suggestions__item')).toHaveLength(3);
  });

  it('通道①：setSuggestions 立即展示且优先于通道②', async () => {
    const w = mount(AiChat, {
      props: {
        request: pendingRequest,
        suggestions: true,
        defaultMessages: [aiMsg({ suggestions: [{ text: '通道二' }] })],
      },
    });
    (w.vm as unknown as { setSuggestions: (i: string[]) => void }).setSuggestions(['通道一']);
    await nextTick();
    const chips = w.findAll('.aix-suggestions__item');
    expect(chips).toHaveLength(1);
    expect(chips[0]!.text()).toBe('通道一');
  });

  it('点击建议：emit suggestion-select + 走发送（发出 send 事件），通道①被清除', async () => {
    const w = mount(AiChat, {
      props: { request: pendingRequest, suggestions: true, defaultMessages: [aiMsg()] },
    });
    (w.vm as unknown as { setSuggestions: (i: string[]) => void }).setSuggestions(['去问']);
    await nextTick();
    await w.find('.aix-suggestions__item').trigger('click');
    expect(w.emitted('suggestion-select')![0]).toEqual([{ text: '去问' }]);
    expect(w.emitted('send')![0]![0]).toBe('去问');
    await nextTick();
    expect(w.find('.aix-suggestions').exists()).toBe(false); // 发送即清除 + isLoading 抑制
  });

  it('fillOnly：点击仅回填输入框，不发送', async () => {
    const w = mount(AiChat, {
      props: {
        request: pendingRequest,
        suggestions: { fillOnly: true },
        defaultMessages: [aiMsg({ suggestions: [{ text: '回填我' }] })],
      },
    });
    await w.find('.aix-suggestions__item').trigger('click');
    await nextTick();
    expect(w.emitted('send')).toBeUndefined();
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('回填我');
  });

  it('setSuggestions([]) 归位到通道②：清空临时建议后恢复展示消息自带的建议', async () => {
    const w = mount(AiChat, {
      props: {
        request: pendingRequest,
        suggestions: true,
        defaultMessages: [aiMsg({ suggestions: [{ text: '通道二' }] })],
      },
    });
    const vm = w.vm as unknown as { setSuggestions: (i: string[]) => void };
    vm.setSuggestions(['通道一']);
    await nextTick();
    expect(w.findAll('.aix-suggestions__item').map((c) => c.text())).toEqual(['通道一']);
    // 传空数组归位：不再是「无建议」，而是回退显示通道②
    vm.setSuggestions([]);
    await nextTick();
    expect(w.findAll('.aix-suggestions__item').map((c) => c.text())).toEqual(['通道二']);
  });

  it('切换会话（v-model:messages 外部整体替换）后通道①临时建议不跨会话残留', async () => {
    const w = mount(AiChat, {
      props: {
        request: pendingRequest,
        suggestions: true,
        messages: [aiMsg({ id: 'a1', suggestions: [{ text: '会话一建议' }] })],
      },
    });
    const vm = w.vm as unknown as { setSuggestions: (i: string[]) => void };
    vm.setSuggestions(['临时建议']);
    await nextTick();
    expect(w.find('.aix-suggestions').text()).toContain('临时建议');
    // 切会话：外部整体替换 messages（典型场景，如切换到另一个会话）
    await w.setProps({
      messages: [aiMsg({ id: 'a2', suggestions: [{ text: '会话二建议' }] })],
    });
    await nextTick();
    const text = w.find('.aix-suggestions').text();
    expect(text).not.toContain('临时建议'); // 旧会话的通道①临时建议不得残留
    expect(text).toContain('会话二建议'); // 归位到新会话自身的通道②
  });

  it('切换会话（经 ref 调 setMessages）后通道①临时建议不跨会话残留', async () => {
    const w = mount(AiChat, {
      props: { request: pendingRequest, suggestions: true, defaultMessages: [aiMsg({ id: 'a1' })] },
    });
    const vm = w.vm as unknown as {
      setSuggestions: (i: string[]) => void;
      setMessages: (m: ChatMessage[]) => void;
    };
    vm.setSuggestions(['临时建议']);
    await nextTick();
    expect(w.find('.aix-suggestions').text()).toContain('临时建议');
    // 命令式切会话：不经 v-model watch、不触碰 isLoading——expose 包装层须清临时建议
    vm.setMessages([aiMsg({ id: 'a2', suggestions: [{ text: '会话二建议' }] })]);
    await nextTick();
    const text = w.find('.aix-suggestions').text();
    expect(text).not.toContain('临时建议'); // 旧会话通道①不得残留
    expect(text).toContain('会话二建议'); // 归位到新会话自身的通道②
  });

  it('triggers 透传：Sender 收到配置（键入 @ 出菜单）', async () => {
    const w = mount(AiChat, {
      props: {
        request: pendingRequest,
        triggers: [{ char: '@', items: [{ value: 'a', label: '张三' }] }],
      },
      attachTo: document.body,
    });
    const ta = w.find('textarea');
    const el = ta.element as HTMLTextAreaElement;
    el.value = '@';
    el.selectionStart = el.selectionEnd = 1;
    await ta.trigger('input');
    await nextTick();
    expect(document.querySelector('.aix-trigger-menu')).toBeTruthy();
    w.unmount();
  });

  it('send 事件透传 meta（mention 场景）', async () => {
    const w = mount(AiChat, {
      props: {
        request: pendingRequest,
        triggers: [{ char: '@', items: [{ value: 'a', label: '张三' }] }],
      },
      attachTo: document.body,
    });
    const ta = w.find('textarea');
    const el = ta.element as HTMLTextAreaElement;
    el.value = '@张';
    el.selectionStart = el.selectionEnd = 2;
    await ta.trigger('input');
    await nextTick();
    await ta.trigger('keydown', { key: 'Enter' }); // 选中
    await nextTick();
    await ta.trigger('keydown', { key: 'Enter' }); // 提交
    const args = w.emitted('send')![0] as unknown[];
    // Sender.doSubmit 对提交文本做 trim（既有契约，见 Sender.mention.test.ts），
    // mention 后无跟随文本时尾随空格被裁掉，故此处为 '@张三' 而非 '@张三 '
    expect(args[0]).toBe('@张三');
    expect(args[2]).toEqual({ mentions: [{ value: 'a', label: '张三', trigger: '@' }] });
    w.unmount();
  });
});
