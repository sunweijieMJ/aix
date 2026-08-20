import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import Bubble from '../src/components/Bubble.vue';
import BubbleList from '../src/components/BubbleList.vue';
import type { BlockIntentHandler, BlockActionHandler, ChatMessage } from '../src/types';

// virtua 在 jsdom 下需要 ResizeObserver；用 stub 直渲 default slot（与其它列表级测试一致）
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

/** 探针渲染器：一个按钮上抛 intent，一个按钮上抛 action，用于区分两条通道 */
const ProbeRenderer = defineComponent({
  props: {
    block: { type: Object, required: true },
    info: { type: Object, default: () => ({}) },
    typing: { type: [Boolean, Object], default: false },
    onBlockAction: { type: Function as unknown as () => BlockActionHandler, default: undefined },
    onBlockIntent: { type: Function as unknown as () => BlockIntentHandler, default: undefined },
  },
  setup(props) {
    return () =>
      h('div', [
        h(
          'button',
          {
            class: 'intent',
            onClick: () =>
              (props.onBlockIntent as BlockIntentHandler | undefined)?.({
                blockId: (props.block as { id: string }).id,
                type: 'submit',
                payload: { formId: 'f1' },
              }),
          },
          'intent',
        ),
        h(
          'button',
          {
            class: 'action',
            onClick: () =>
              (props.onBlockAction as BlockActionHandler | undefined)?.({
                blockId: (props.block as { id: string }).id,
                type: 'answer',
                patch: { foo: 2 },
              }),
          },
          'action',
        ),
      ]);
  },
});

const probeMessage = (id: string): ChatMessage => ({
  id,
  role: 'ai',
  status: 'success',
  content: [{ id: `${id}-b1`, type: 'probe', foo: 1 }] as never,
});

describe('BlockIntent 通道', () => {
  it('Bubble：渲染器经 onBlockIntent 上抛 → emit block-intent（补齐 messageKey）', async () => {
    const w = mount(Bubble, {
      props: {
        itemKey: 'm1',
        content: [{ id: 'b1', type: 'probe', foo: 1 }] as never,
        blockRenderers: { probe: ProbeRenderer },
      },
    });

    await w.find('.intent').trigger('click');
    expect(w.emitted('block-intent')![0]![0]).toEqual({
      messageKey: 'm1',
      intent: { blockId: 'b1', type: 'submit', payload: { formId: 'f1' } },
    });
    // 两条通道互不串台
    expect(w.emitted('block-action')).toBeUndefined();
  });

  it('BubbleList：原样向上转发 block-intent', async () => {
    const w = mount(BubbleList, {
      props: {
        items: [probeMessage('m1')],
        blockRenderers: { probe: ProbeRenderer },
      },
    });
    await nextTick();

    await w.find('.intent').trigger('click');
    expect(w.emitted('block-intent')![0]![0]).toEqual({
      messageKey: 'm1',
      intent: { blockId: 'm1-b1', type: 'submit', payload: { formId: 'f1' } },
    });
  });

  it('AiChat：转发到 block-intent emit，且不改动块数据（与 block-action 的落地语义相反）', async () => {
    const msg = probeMessage('m1');
    const w = mount(AiChat, {
      props: {
        request: vi.fn(),
        defaultMessages: [msg],
        blockRenderers: { probe: ProbeRenderer },
      },
    });
    await nextTick();

    await w.find('.intent').trigger('click');
    expect(w.emitted('block-intent')![0]![0]).toEqual({
      messageKey: 'm1',
      intent: { blockId: 'm1-b1', type: 'submit', payload: { formId: 'f1' } },
    });
    // intent 不落地任何数据
    expect(w.vm.messages[0]!.content[0]).toMatchObject({ foo: 1 });

    // 对照：action 通道仍照旧落地补丁
    await w.find('.action').trigger('click');
    expect(w.vm.messages[0]!.content[0]).toMatchObject({ foo: 2 });
  });
});
