import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import Bubble from '../src/components/Bubble.vue';
import type { ContentBlock } from '../src/types';

/**
 * Bug 防回归：`toolRenderers` 与 `blockRenderers` 必须是**能力对等**的两张注册表。
 *
 * Bubble 把 `@typing-complete` / `@keep-mounted-change` 与块插槽直接挂在「块渲染器」上；
 * 对 tool_use 而言那个组件是内置 ToolUseBlock 而非委托目标，而它 inheritAttrs:false，
 * 不显式 v-bind="$attrs" + 转发 slot 就会把这两条通道整个吃掉——自定义工具卡里的 Teleport
 * 浮层（同内置 ImageBlock 的图片预览）因此拿不到 keepMounted，虚拟列表回收宿主行时会连同
 * 打开状态一起销毁。
 */

/** 既上抛浮层开合、又消费一个块插槽的自定义渲染器（两条通道各测一次） */
const PanelRenderer = defineComponent({
  name: 'PanelRenderer',
  props: { block: { type: Object, required: true } },
  emits: ['keep-mounted-change', 'typing-complete'],
  setup(_props, { emit, slots }) {
    return () =>
      h('div', [
        h('button', { class: 'open', onClick: () => emit('keep-mounted-change', true) }, 'open'),
        h('span', { class: 'slot-host' }, slots.extra?.({ from: 'renderer' })),
      ]);
  },
});

const toolBlock: ContentBlock = {
  id: 'b1',
  type: 'tool_use',
  toolCallId: 'c1',
  toolName: 'my_tool',
  state: 'output-available',
};

describe('ToolUseBlock — 委托自定义工具渲染器的通道透传', () => {
  it('委托目标上抛的 keep-mounted-change 逐层到达 Bubble（与 blockRenderers 等价）', async () => {
    const w = mount(Bubble, {
      props: { itemKey: 'm1', content: [toolBlock], toolRenderers: { my_tool: PanelRenderer } },
    });
    await w.find('button.open').trigger('click');
    await nextTick();
    expect(w.emitted('keep-mounted-change')).toEqual([[{ messageKey: 'm1', active: true }]]);
  });

  it('对照组：同一渲染器注册为 blockRenderers 时行为一致', async () => {
    const w = mount(Bubble, {
      props: {
        itemKey: 'm1',
        content: [{ id: 'b1', type: 'custom_x' } as unknown as ContentBlock],
        blockRenderers: { custom_x: PanelRenderer },
      },
    });
    await w.find('button.open').trigger('click');
    await nextTick();
    expect(w.emitted('keep-mounted-change')).toEqual([[{ messageKey: 'm1', active: true }]]);
  });

  it('块插槽穿透同样到达委托目标', () => {
    const w = mount(Bubble, {
      props: { itemKey: 'm1', content: [toolBlock], toolRenderers: { my_tool: PanelRenderer } },
      slots: { extra: '透传成功' },
    });
    expect(w.find('.slot-host').text()).toBe('透传成功');
  });

  it('未命中 toolRenderers 时仍走内置折叠卡片（默认路径不受透传改动影响）', () => {
    const w = mount(Bubble, {
      props: { itemKey: 'm1', content: [toolBlock], toolRenderers: { other_tool: PanelRenderer } },
    });
    expect(w.find('.aix-tool-use').exists()).toBe(true);
    expect(w.text()).toContain('my_tool');
  });
});
