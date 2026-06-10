import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { defineComponent } from 'vue';
import { h } from 'vue';
import Bubble from '../src/components/Bubble.vue';
import BubbleList from '../src/components/BubbleList.vue';
import type { ChatMessage } from '../src/types';
import { textBlock, messageText, thoughtChainBlock } from '../src/utils/helpers';

// vi.mock 会被提升到文件顶部，用 vi.hoisted 安全地共享 mock 函数以便断言委托行为
const { scrollToIndexMock, followMock } = vi.hoisted(() => ({
  scrollToIndexMock: vi.fn(),
  followMock: vi.fn(),
}));

// mock useAutoScroll：保留真实返回结构，仅把 follow 替换为可断言的 spy，
// 以便验证消息变化时以正确的 reason（own-message / new-message）触发跟随。
vi.mock('../src/composables/useAutoScroll', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/composables/useAutoScroll')>();
  return {
    ...actual,
    useAutoScroll: (...args: Parameters<typeof actual.useAutoScroll>) => {
      const real = actual.useAutoScroll(...args);
      return { ...real, follow: followMock };
    },
  };
});

// virtua 在 jsdom 下退化：用 stub 直接渲染 default slot，并 expose scrollToIndex
vi.mock('virtua/vue', () => ({
  Virtualizer: defineComponent({
    name: 'VirtualizerWrapper',
    props: ['data'],
    setup(props: any, { slots, expose }: any) {
      expose({ scrollToIndex: scrollToIndexMock });
      return () => (props.data as unknown[]).map((item, i) => slots.default?.({ item, index: i }));
    },
  }),
}));

const items: ChatMessage[] = [
  { id: '1', role: 'user', content: [textBlock('问')], status: 'success' },
  { id: '2', role: 'ai', content: [textBlock('答')], status: 'success' },
];

describe('BubbleList', () => {
  it('把消息映射成 Bubble 并按 role 设 placement', () => {
    const w = mount(BubbleList, {
      props: { items, roles: { user: { placement: 'end' }, ai: { placement: 'start' } } },
    });
    const bubbles = w.findAll('.aix-bubble');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0].classes()).toContain('aix-bubble--end');
    expect(bubbles[1].classes()).toContain('aix-bubble--start');
  });

  it('expose scrollToBottom 等方法', () => {
    const w = mount(BubbleList, { props: { items } });
    const vm = w.vm as unknown as Record<string, unknown>;
    expect(typeof vm.scrollToBottom).toBe('function');
    expect(typeof vm.scrollToBubble).toBe('function');
  });

  it('scrollToBubble 委托给 virtua 的 scrollToIndex', () => {
    scrollToIndexMock.mockClear();
    const w = mount(BubbleList, { props: { items } });
    const vm = w.vm as unknown as { scrollToBubble: (i: number, s?: boolean) => void };
    vm.scrollToBubble(1, true);
    expect(scrollToIndexMock).toHaveBeenCalledWith(1, { smooth: true });
  });

  it('Bubble 重试事件冒泡为带消息 id 的 retry', async () => {
    const errItems: ChatMessage[] = [
      { id: 'u1', role: 'user', content: [textBlock('问')], status: 'local' },
      { id: 'a1', role: 'ai', content: [], status: 'error' },
    ];
    const w = mount(BubbleList, { props: { items: errItems } });
    await w.find('.aix-bubble__retry').trigger('click');
    expect(w.emitted('retry')![0]).toEqual(['a1']);
  });

  // 回归：挂载时不计算滚动态，导致初始滚动态硬编码 AT_BOTTOM 与真实 DOM 不一致
  describe('挂载时同步滚动态', () => {
    it('autoScroll 默认开启时，挂载后自动滚动到底部', async () => {
      const spy = vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(() => {});
      mount(BubbleList, { props: { items } });
      await flushPromises();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('autoScroll 关闭时，挂载后按真实滚动位置同步状态（长列表显示回到底部按钮）', async () => {
      // 伪造布局：内容高于视口且停在顶部 → distance 远大于阈值，应判为非 AT_BOTTOM
      const sh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
      const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get: () => 1000,
      });
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get: () => 500,
      });
      try {
        const w = mount(BubbleList, { props: { items, autoScroll: false } });
        await flushPromises();
        // distance = 1000 - 0 - 500 = 500 > 40 → 非 AT_BOTTOM → 回到底部按钮可见（修复前该按钮被误隐藏）
        const back = w.find('.aix-bubble-list__back');
        expect(back.exists()).toBe(true);
        // a11y：回到底部按钮带无障碍标签（图标按钮无文本，需 aria-label）
        expect(back.attributes('aria-label')).toBeTruthy();
      } finally {
        if (sh) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', sh);
        if (ch) Object.defineProperty(HTMLElement.prototype, 'clientHeight', ch);
      }
    });
  });

  // 防回归：一次 onSend 同时新增 user + ai 占位，须按"本次新增是否含 user"判定，
  // 否则看末条（恒为 ai）会让 own-message 永不触发（BubbleList.vue:91-99）
  describe('own-message vs new-message 跟随判定', () => {
    it('新增包含 user 角色的消息时，以 own-message 触发跟随', async () => {
      const w = mount(BubbleList, { props: { items: [...items] } });
      await flushPromises();
      followMock.mockClear();

      // 模拟 onSend：同时新增 user 消息 + ai 占位（末条为 ai）
      await w.setProps({
        items: [
          ...items,
          { id: 'u2', role: 'user', content: [textBlock('再问')], status: 'local' },
          { id: 'a3', role: 'ai', content: [], status: 'loading' },
        ],
      });
      await flushPromises();

      expect(followMock).toHaveBeenCalled();
      expect(followMock.mock.calls.map((c) => c[0])).toContain('own-message');
    });

    it('仅新增 ai 角色的消息时，以 new-message 触发跟随', async () => {
      const w = mount(BubbleList, { props: { items: [...items] } });
      await flushPromises();
      followMock.mockClear();

      await w.setProps({
        items: [
          ...items,
          { id: 'a4', role: 'ai', content: [textBlock('系统通知')], status: 'success' },
        ],
      });
      await flushPromises();

      expect(followMock).toHaveBeenCalled();
      const reasons = followMock.mock.calls.map((c) => c[0]);
      expect(reasons).toContain('new-message');
      expect(reasons).not.toContain('own-message');
    });
  });

  // 防回归：typing 全局开启时，「本会话流式过（曾 updating）」的消息在 status 转为 success 后
  // 仍应保持 typing=true，使 typewriter 把剩余字符播放完，避免结尾跳显；
  // 而纯历史消息（从未 updating，直接以 success 进入）始终 typing=false，不逐字重播。
  describe('流式消息 typing 持续到播放完整', () => {
    const findByKey = (w: ReturnType<typeof mount>, key: string) =>
      w.findAllComponents(Bubble).find((b) => b.props('itemKey') === key)!;

    it('updating 消息 typing=true，转 success 后仍 true；纯历史 success 消息始终 false', async () => {
      const base: ChatMessage[] = [
        { id: 'h-user', role: 'user', content: [textBlock('历史问')], status: 'local' },
        { id: 'h-ai', role: 'ai', content: [textBlock('历史答')], status: 'success' }, // 纯历史，从未 updating
      ];
      const w = mount(BubbleList, { props: { items: [...base], typing: true } });
      await flushPromises();
      // 纯历史 ai 消息：从未 updating → typing=false（不逐字重播）
      expect(findByKey(w, 'h-ai').props('typing')).toBe(false);

      // 新增流式 ai 消息（status=updating）
      const streaming: ChatMessage[] = [
        ...base,
        { id: 's-user', role: 'user', content: [textBlock('新问')], status: 'local' },
        { id: 's-ai', role: 'ai', content: [textBlock('部分')], status: 'updating' },
      ];
      await w.setProps({ items: [...streaming] });
      await flushPromises();
      expect(findByKey(w, 's-ai').props('typing')).toBe(true);

      // 流结束：同一条 ai 消息 status 转 success
      const finished = streaming.map((m) =>
        m.id === 's-ai'
          ? { ...m, content: [textBlock('部分内容已完整')], status: 'success' as const }
          : m,
      );
      await w.setProps({ items: finished });
      await flushPromises();
      // 关键：曾流式过 → success 后仍 typing=true，让 typewriter 把剩余字符播放完
      expect(findByKey(w, 's-ai').props('typing')).toBe(true);
      // 历史 ai 始终 false，不受影响
      expect(findByKey(w, 'h-ai').props('typing')).toBe(false);
    });

    it('typing 全局关闭时，即便消息 updating 也不启用打字机', async () => {
      const w = mount(BubbleList, {
        props: {
          items: [{ id: 'a', role: 'ai', content: [textBlock('流式中')], status: 'updating' }],
          typing: false,
        },
      });
      await flushPromises();
      expect(findByKey(w, 'a').props('typing')).toBe(false);
    });

    // 防回归（点击停止即"暂停"）：曾流式的消息被中断（status=abort）后应立即关闭打字机，
    // 使 TextBlock 直接取完整已收文本一次性全显，而非继续把缓冲逐字打完。
    it('曾流式的消息被中断（status=abort）后 typing=false', async () => {
      const items: ChatMessage[] = [
        { id: 'a-user', role: 'user', content: [textBlock('问')], status: 'local' },
        { id: 'a-ai', role: 'ai', content: [textBlock('部分')], status: 'updating' },
      ];
      const w = mount(BubbleList, { props: { items: [...items], typing: true } });
      await flushPromises();
      expect(findByKey(w, 'a-ai').props('typing')).toBe(true);

      // 用户点击停止 → 该消息 status 转 abort
      const aborted = items.map((m) => (m.id === 'a-ai' ? { ...m, status: 'abort' as const } : m));
      await w.setProps({ items: aborted });
      await flushPromises();
      expect(findByKey(w, 'a-ai').props('typing')).toBe(false);
    });

    // 防回归（streamedIds 不随会话切换泄漏）：某 id 流式过后切走会话应被 prune 清理；
    // 若之后另一会话复用同一 id 作为纯历史 success 消息，不应残留为 typing=true。
    it('切走会话后 streamedIds 被清理，复用同一 id 的历史消息不误判 typing', async () => {
      // 会话 A：reuse-id 流式过（updating）→ 进入 streamedIds
      const w = mount(BubbleList, {
        props: {
          items: [
            { id: 'reuse-id', role: 'ai', content: [textBlock('流式中')], status: 'updating' },
          ],
          typing: true,
        },
      });
      await flushPromises();
      expect(findByKey(w, 'reuse-id').props('typing')).toBe(true);

      // 切到会话 B（不含 reuse-id）→ prune 应清理掉 reuse-id
      await w.setProps({
        items: [{ id: 'other', role: 'ai', content: [textBlock('别的会话')], status: 'success' }],
      });
      await flushPromises();

      // 会话 C 复用同一 id，但本次是纯历史 success（从未在本生命周期 updating）
      await w.setProps({
        items: [{ id: 'reuse-id', role: 'ai', content: [textBlock('历史答')], status: 'success' }],
      });
      await flushPromises();
      // 关键：旧标记已被 prune → 不残留 → 当作历史消息，typing=false
      expect(findByKey(w, 'reuse-id').props('typing')).toBe(false);
    });
  });

  // roles 支持函数形态 (item) => Partial<BubbleProps>（bubble-list-types.ts:5），
  // 现有用例只覆盖对象形态，这里覆盖函数形态的动态解析
  it('roles 为函数形态时，Bubble 收到由函数动态解析的 props', () => {
    const w = mount(BubbleList, {
      props: {
        items,
        roles: {
          // 根据消息内容动态返回 placement / variant
          user: (item: ChatMessage) => ({
            placement: 'end',
            variant: messageText(item) === '问' ? 'outlined' : 'filled',
          }),
          ai: () => ({ placement: 'start' }),
        },
      },
    });
    const bubbles = w.findAll('.aix-bubble');
    expect(bubbles).toHaveLength(2);
    // user 气泡：函数返回 placement:'end'（根 modifier）+ variant:'outlined'（content modifier）
    expect(bubbles[0].classes()).toContain('aix-bubble--end');
    expect(bubbles[0].find('.aix-bubble__content').classes()).toContain(
      'aix-bubble__content--outlined',
    );
    // ai 气泡：函数返回 placement:'start'
    expect(bubbles[1].classes()).toContain('aix-bubble--start');
  });

  it('editable 时仅 user 气泡显示编辑按钮，点击保存冒泡为带 id 的 edit', async () => {
    const w = mount(BubbleList, { props: { items, editable: true } });
    const editBtns = w.findAll('.aix-bubble__edit-btn');
    expect(editBtns).toHaveLength(1); // 仅 user 气泡（items[0]）
    await editBtns[0].trigger('click');
    await w.find('textarea.aix-bubble__edit-input').setValue('改后');
    await w.find('.aix-bubble__edit-save').trigger('click');
    expect(w.emitted('edit')![0]).toEqual(['1', '改后']); // [id, text]
  });

  it('未开启 editable 时不显示任何编辑按钮', () => {
    const w = mount(BubbleList, { props: { items } });
    expect(w.findAll('.aix-bubble__edit-btn')).toHaveLength(0);
  });

  it('透传非保留命名插槽到每个 Bubble 的块渲染器', () => {
    const tcItems: ChatMessage[] = [
      {
        id: 'm1',
        role: 'ai',
        status: 'success',
        content: [thoughtChainBlock([{ key: '1', icon: '🤔', title: '步骤一' }])],
      },
    ];
    const w = mount(BubbleList, {
      props: { items: tcItems },
      slots: {
        'thought-chain-item-content': (scope: { item: { title: string } }) =>
          h('span', { class: 'rich' }, `R:${scope.item.title}`),
      },
    });
    expect(w.find('.rich').text()).toBe('R:步骤一');
  });
});
