import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, defineComponent, h } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import MessageOutline from '../src/components/MessageOutline.vue';
import { provideAiChatConfig } from '../src/composables/useAiChatConfig';
import type { ChatMessage } from '../src/types';
import { textBlock } from '../src/utils/helpers';

// virtua 在 jsdom 下需要 ResizeObserver；用 stub 直渲 default slot（与 AiChat.markdown.test 一致）
vi.mock('virtua/vue', () => ({
  Virtualizer: {
    name: 'Virtualizer',
    props: ['data', 'keepMounted'],
    setup(
      props: { data: unknown[] },
      { slots }: { slots: Record<string, (p: unknown) => unknown> },
    ) {
      return () => props.data.map((item, i) => slots.default?.({ item, index: i }));
    },
  },
}));

/** 可投递相交记录的 IntersectionObserver 替身（验证观测回写是否被闸门屏蔽） */
class ControllableIO {
  static instances: ControllableIO[] = [];
  cb: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    ControllableIO.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  static emit(entries: Array<{ id: string; top: number }>) {
    const io = ControllableIO.instances[ControllableIO.instances.length - 1];
    if (!io) throw new Error('没有已创建的 IntersectionObserver 实例');
    const records = entries.map((e) => {
      const el = document.createElement('div');
      el.dataset.aixMessageId = e.id;
      return {
        target: el,
        isIntersecting: true,
        boundingClientRect: { top: e.top } as DOMRectReadOnly,
      };
    }) as unknown as IntersectionObserverEntry[];
    io.cb(records, io as unknown as IntersectionObserver);
  }
}
/** 最小可用替身（多数用例只需不抛错） */
const NoopIO = ControllableIO;

const request = async () => new ReadableStream<Uint8Array>();

function msgs(n: number): ChatMessage[] {
  const list: ChatMessage[] = [];
  for (let i = 1; i <= n; i++) {
    list.push({ id: `u${i}`, role: 'user', status: 'success', content: [textBlock(`问题${i}`)] });
    list.push({ id: `a${i}`, role: 'ai', status: 'success', content: [textBlock(`答案${i}`)] });
  }
  return list;
}

describe('AiChat 对话大纲集成', () => {
  // 只替换 IntersectionObserver：unstubAllGlobals 会连带清掉 setup 为 virtua 准备的
  // ResizeObserver，导致虚拟列表在 rAF 回调里抛未捕获异常
  const originalIO = globalThis.IntersectionObserver;
  beforeEach(() => {
    globalThis.IntersectionObserver = NoopIO as unknown as typeof IntersectionObserver;
  });
  afterEach(() => {
    globalThis.IntersectionObserver = originalIO;
  });

  it('默认不渲染大纲', () => {
    const w = mount(AiChat, { props: { request, messages: msgs(2) } });
    expect(w.findComponent(MessageOutline).exists()).toBe(false);
  });

  // 时序验证：outline 的 windowed getter 引用了后声明的 visible.activeId，
  // computed 惰性求值使其在渲染时才求值。若求值时机提前会 ReferenceError。
  it('outline=true 时正常挂载，不因声明顺序报错', async () => {
    const w = mount(AiChat, { props: { request, messages: msgs(3), outline: true } });
    await nextTick();
    const ol = w.findComponent(MessageOutline);
    expect(ol.exists()).toBe(true);
    expect(ol.props('entries')).toHaveLength(3);
  });

  it('只把 user 消息作为刻度', async () => {
    const w = mount(AiChat, { props: { request, messages: msgs(4), outline: true } });
    await nextTick();
    const entries = w.findComponent(MessageOutline).props('entries') as Array<{
      messageId: string;
    }>;
    expect(entries.every((e) => e.messageId.startsWith('u'))).toBe(true);
  });

  it('空会话不渲染大纲（欢迎页阶段）', () => {
    const w = mount(AiChat, { props: { request, messages: [], outline: true } });
    expect(w.findComponent(MessageOutline).exists()).toBe(false);
  });

  // MessageOutline 根节点是带 aria-label 的 <nav> 地标：条目为空还渲染出来，
  // 屏幕阅读器会念出「对话大纲」导航区却什么都没有。判空必须看 entries 而非 messages。
  it('有消息但无刻度时不渲染大纲：开场只有 assistant 欢迎语', async () => {
    const messages: ChatMessage[] = [
      { id: 'a0', role: 'ai', status: 'success', content: [textBlock('你好，有什么可以帮你？')] },
    ];
    const w = mount(AiChat, { props: { request, messages, outline: true } });
    await nextTick();
    expect(w.findComponent(MessageOutline).exists()).toBe(false);
    expect(w.find('nav.aix-message-outline').exists()).toBe(false);
  });

  it('有消息但自定义 filter 一条都没命中时不渲染大纲', async () => {
    const w = mount(AiChat, {
      props: { request, messages: msgs(2), outline: { filter: () => false } },
    });
    await nextTick();
    expect(w.findComponent(MessageOutline).exists()).toBe(false);
  });

  it('自定义 filter 生效', async () => {
    const w = mount(AiChat, {
      props: {
        request,
        messages: msgs(2),
        outline: { filter: (m: ChatMessage) => m.role === 'ai' },
      },
    });
    await nextTick();
    const entries = w.findComponent(MessageOutline).props('entries') as Array<{
      messageId: string;
    }>;
    expect(entries.every((e) => e.messageId.startsWith('a'))).toBe(true);
  });

  it('自定义 toLabel 生效', async () => {
    const w = mount(AiChat, {
      props: { request, messages: msgs(2), outline: { toLabel: (m: ChatMessage) => `Q-${m.id}` } },
    });
    await nextTick();
    const entries = w.findComponent(MessageOutline).props('entries') as Array<{ label: string }>;
    expect(entries[0]!.label).toBe('Q-u1');
  });

  it('window 配置裁剪可见刻度', async () => {
    const w = mount(AiChat, { props: { request, messages: msgs(30), outline: { window: 2 } } });
    await nextTick();
    // 半径 2 → 窗口 5 条
    expect(w.findComponent(MessageOutline).props('entries')).toHaveLength(5);
  });

  it('点击刻度调用 scrollToBubble 定位', async () => {
    const w = mount(AiChat, { props: { request, messages: msgs(3), outline: true } });
    await nextTick();

    const spy = vi.fn().mockResolvedValue(document.createElement('div'));
    // 替换 BubbleList 实例上的定位方法，验证接线而非真实滚动
    const vm = w.vm as unknown as { bubbleListRef?: { scrollToBubble: unknown } };
    if (vm.bubbleListRef) vm.bubbleListRef.scrollToBubble = spy;

    await w.findComponent(MessageOutline).vm.$emit('select', {
      messageId: 'u2',
      label: '问题2',
      ordinal: 2,
    });
    await nextTick();
    expect(spy).toHaveBeenCalledWith('u2', { smooth: true });
  });

  /** 用宿主组件注入全局配置（与 AiChat.quote.test 同一套约定） */
  const mountWithGlobalOutline = (outline?: boolean) => {
    const Host = defineComponent({
      setup() {
        provideAiChatConfig({ outline: true });
        return () =>
          h(AiChat, {
            request,
            messages: msgs(2),
            outline,
          });
      },
    });
    return mount(Host);
  };

  // 闸门死锁回归：scrollToBubble 同步抛错时若跳过 endNavigate，
  // navigatingTo 永久非空 → 观测回写被永久忽略、活跃高亮再也不更新
  it('定位抛错后闸门仍解锁，活跃态可继续更新', async () => {
    const w = mount(AiChat, { props: { request, messages: msgs(3), outline: true } });
    await nextTick();
    const vm = w.vm as unknown as { bubbleListRef?: { scrollToBubble: unknown } };

    // 第一次定位同步抛错
    if (vm.bubbleListRef) {
      vm.bubbleListRef.scrollToBubble = () => {
        throw new Error('scrollToIndex 边界态抛错');
      };
    }
    const ol = w.findComponent(MessageOutline);
    await expect(
      (w.vm as unknown as { onOutlineSelect: (e: unknown) => Promise<void> }).onOutlineSelect({
        messageId: 'u2',
        label: '问题2',
        ordinal: 2,
      }),
    ).rejects.toThrow('边界态抛错');

    // 闸门是否解锁，要看「观测回写」能否再生效——beginNavigate 自身会直写 activeId，
    // 故不能用第二次点击后的 activeId 判断（那样无论闸门开关都成立）
    ControllableIO.emit([{ id: 'u1', top: 500 }]);
    await nextTick();
    expect(ol.props('activeId')).toBe('u1');
  });

  // 半响应式回归：若 toLabel/filter 的「有无」在 setup 时定死，
  // 运行时移除会让包装器读到 undefined 并抛 TypeError；运行时新增则静默不生效
  it('运行时移除 toLabel 不抛错并回落默认摘要', async () => {
    const w = mount(AiChat, {
      props: {
        request,
        messages: msgs(2),
        outline: { toLabel: (m: ChatMessage) => `Q-${m.id}` },
      },
    });
    await nextTick();
    expect(
      (w.findComponent(MessageOutline).props('entries') as Array<{ label: string }>)[0]!.label,
    ).toBe('Q-u1');

    // 去掉 toLabel：不应抛错，且回落到默认摘要（消息文本）
    await w.setProps({ outline: true });
    await nextTick();
    const labels = w.findComponent(MessageOutline).props('entries') as Array<{ label: string }>;
    expect(labels[0]!.label).toBe('问题1');
  });

  it('运行时新增 toLabel 立即生效', async () => {
    const w = mount(AiChat, { props: { request, messages: msgs(2), outline: true } });
    await nextTick();
    expect(
      (w.findComponent(MessageOutline).props('entries') as Array<{ label: string }>)[0]!.label,
    ).toBe('问题1');

    await w.setProps({ outline: { toLabel: (m: ChatMessage) => `后加-${m.id}` } });
    await nextTick();
    expect(
      (w.findComponent(MessageOutline).props('entries') as Array<{ label: string }>)[0]!.label,
    ).toBe('后加-u1');
  });

  it('全局 config.outline 可开启大纲', async () => {
    const w = mountWithGlobalOutline();
    await nextTick();
    expect(w.findComponent(MessageOutline).exists()).toBe(true);
  });

  it('组件 props.outline=false 覆盖全局开启', async () => {
    const w = mountWithGlobalOutline(false);
    await nextTick();
    expect(w.findComponent(MessageOutline).exists()).toBe(false);
  });
});

describe('MessageOutline 组件', () => {
  const entries = [
    { messageId: 'u1', label: '第一问', ordinal: 1 },
    { messageId: 'u2', label: '', ordinal: 2 },
  ];

  it('渲染刻度并高亮 activeId', () => {
    const w = mount(MessageOutline, { props: { entries, activeId: 'u2' } });
    const ticks = w.findAll('.aix-message-outline__tick');
    expect(ticks).toHaveLength(2);
    expect(ticks[1]!.classes()).toContain('is-active');
    expect(ticks[1]!.attributes('aria-current')).toBe('true');
  });

  // 纯图片/附件消息 label 为空，需兜底文案而非留空刻度
  it('label 为空时回退到兜底文案', () => {
    const w = mount(MessageOutline, { props: { entries } });
    expect(w.findAll('.aix-message-outline__tick-text')[1]!.text()).toBe('（无文字内容）');
  });

  it('点击 emit select 并携带条目', async () => {
    const w = mount(MessageOutline, { props: { entries } });
    await w.findAll('.aix-message-outline__tick')[0]!.trigger('click');
    expect(w.emitted('select')![0]![0]).toEqual(entries[0]);
  });

  it('带导航语义与无障碍标签', () => {
    const w = mount(MessageOutline, { props: { entries } });
    expect(w.find('nav').attributes('aria-label')).toBe('对话大纲');
  });
});
