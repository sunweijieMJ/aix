import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, useSlots } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import Bubble from '../src/components/Bubble.vue';
import BubbleList from '../src/components/BubbleList.vue';
import type { ChatMessage } from '../src/types';
import { genBlockId } from '../src/utils/helpers';
import { BUBBLE_LIST_RESERVED_SLOTS, BUBBLE_RESERVED_SLOTS } from '../src/utils/reservedSlots';

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

const idleRequest = () =>
  Promise.resolve(new ReadableStream<Uint8Array>({ start: (c) => c.close() }));

const msg = (): ChatMessage => ({
  id: 'm1',
  role: 'ai',
  status: 'success',
  content: [{ id: genBlockId(), type: 'text', text: '正文' }],
});

/** 记录自己收到了哪些具名插槽的假块渲染器（注册为 text 覆盖内置 TextBlock） */
const makeSpy = () => {
  const seen: string[][] = [];
  const Spy = defineComponent({
    name: 'SlotSpy',
    props: { block: { type: Object, required: true } },
    setup() {
      seen.push(Object.keys(useSlots()));
      return () => h('div', { class: 'spy' }, 'spy');
    },
  });
  return { Spy, seen };
};

/**
 * 块插槽穿透链路（AiChat → BubbleList → Bubble → 块渲染器）的核心不变量：
 * **消息级插槽不得泄漏成块插槽**。
 *
 * 每层都靠「不在本层保留名单里的具名插槽一律下传」实现穿透，于是漏登记一个名字不会报错，
 * 而是让它落到每个块渲染器的同名内部插槽上——在所有消息的每个块里重复渲染一遍。
 * 'error' 真实漏过一次（自定义块渲染器声明同名内部插槽是很自然的设计，图表卡 / 工具卡都
 * 需要错误态），消息级出错 UI 因此被渲染进了每个块体内。
 *
 * 这里刻意做**行为级**断言而非比对三份名单：名单怎么组织是实现细节，
 * 「消息级插槽不落进块渲染器」才是真正要守住的性质。新增任何消息级插槽后忘记登记，
 * 只要把名字加进下方 MESSAGE_LEVEL_SLOTS 就会立刻失败。
 *
 * 变异验证（确认本组用例确有拦截力，而非碰巧全绿）：
 * - 从 BUBBLE_RESERVED_SLOTS 删 'error' → 失败，块渲染器收到 ['error', 'my-block-slot']；
 * - 从 AICHAT_RESERVED_SLOTS 删 'toolbar' → 失败，收到 ['my-block-slot', 'toolbar']。
 *
 * 顺带记录一条层间的**不对称性**：从 AICHAT_RESERVED_SLOTS 里删掉 Bubble/BubbleList 也保留的
 * 名字（如 'error'）**不会**泄漏到块渲染器——它会被下层的名单接住，转而落到 Bubble 的同名
 * 插槽上。即 AiChat 的名单真正"非有不可"的只是它独有的那些（sender-* / toolbar / prefix /
 * welcome-* / header-* / bubble-header / quote-menu / bottom）；与下层重合的部分属冗余防线。
 * 别据此去精简 AiChat 的名单：重合项同时承担「本层显式转发」的职责，删了会改变转发语义。
 */
describe('插槽穿透 — 消息级插槽不得泄漏到块渲染器', () => {
  // AiChat 层全部由自己消费或显式转发的具名插槽（与 AICHAT_RESERVED_SLOTS 同步维护）
  const MESSAGE_LEVEL_SLOTS = [
    'header',
    'header-icon',
    'header-extra',
    'welcome-icon',
    'welcome-title',
    'welcome-description',
    'welcome-extra',
    'content',
    'footer',
    'bubble-header',
    'row-before',
    'error',
    'quote-menu',
    'toolbar',
    'prefix',
    'attachments-panel',
    'attachments-placeholder',
    'sender-header',
    'sender-footer',
    'sender-before',
    'bottom',
  ];

  // content 例外：它按设计就是「整块接管内容区」，提供后块渲染器根本不会被实例化
  // （见 Bubble 模板的 <slot name="content">），故不参与本组「是否泄漏」的探测。
  const probeSlots = (names: readonly string[]) => {
    const slots: Record<string, () => unknown> = { 'my-block-slot': () => h('i', 'blk') };
    for (const name of names) if (name !== 'content') slots[name] = () => h('i', name);
    return slots;
  };

  it('AiChat：全部消息级插槽都不下传，只有真正的块插槽到达块渲染器', async () => {
    const { Spy, seen } = makeSpy();
    const slots = probeSlots(MESSAGE_LEVEL_SLOTS);

    mount(AiChat, {
      props: { request: idleRequest, defaultMessages: [msg()], blockRenderers: { text: Spy } },
      slots,
    });
    await flushPromises();

    expect(seen.length).toBeGreaterThan(0); // 渲染器确实被实例化了，否则断言无意义
    for (const received of seen) {
      expect(received).toEqual(['my-block-slot']);
    }
  });

  it('BubbleList：同上（直接使用 BubbleList 的宿主同样受保护）', () => {
    const { Spy, seen } = makeSpy();
    mount(BubbleList, {
      props: { items: [msg()], blockRenderers: { text: Spy } },
      slots: probeSlots(BUBBLE_LIST_RESERVED_SLOTS),
    });

    expect(seen.length).toBeGreaterThan(0);
    for (const received of seen) expect(received).toEqual(['my-block-slot']);
  });

  it('Bubble：同上（直接使用 Bubble 的宿主同样受保护）', () => {
    const { Spy, seen } = makeSpy();
    mount(Bubble, {
      props: { content: msg().content, status: 'success', blockRenderers: { text: Spy } },
      slots: probeSlots(BUBBLE_RESERVED_SLOTS),
    });

    expect(seen.length).toBeGreaterThan(0);
    for (const received of seen) expect(received).toEqual(['my-block-slot']);
  });

  it('层间关系：BubbleList 的保留名单必须覆盖 Bubble 的全部', () => {
    // 反向若不成立，BubbleList 会把 Bubble 要消费的插槽当作穿透插槽下传，在 Bubble 上重复声明
    for (const name of BUBBLE_RESERVED_SLOTS) {
      expect(BUBBLE_LIST_RESERVED_SLOTS).toContain(name);
    }
  });

  it('真正的块插槽仍能贯通三层到达块渲染器（防止把穿透一起改坏）', async () => {
    const { Spy, seen } = makeSpy();
    mount(AiChat, {
      props: { request: idleRequest, defaultMessages: [msg()], blockRenderers: { text: Spy } },
      slots: { 'thought-chain-item-content': () => h('i', 'tc') },
    });
    await flushPromises();

    expect(seen.length).toBeGreaterThan(0);
    for (const received of seen) expect(received).toContain('thought-chain-item-content');
  });
});
