import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h, markRaw } from 'vue';
import ToolUseBlock from '../src/components/blocks/ToolUseBlock.vue';
import type { BlockAction, BlockIntent, ContentBlock } from '../src/types';

type ToolUseContentBlock = Extract<ContentBlock, { type: 'tool_use' }>;

const block = (over: Partial<ToolUseContentBlock>): ToolUseContentBlock => ({
  id: 'b1',
  type: 'tool_use',
  toolCallId: 'c1',
  toolName: 'search',
  state: 'input-available',
  input: { q: 'x' },
  ...over,
});

describe('ToolUseBlock', () => {
  it('默认渲染工具名与 input/output', () => {
    const w = mount(ToolUseBlock, {
      props: {
        block: block({ state: 'output-available', output: 'ok' }),
        info: { role: 'ai', key: 'ai1' },
      },
    });
    expect(w.text()).toContain('search');
    expect(w.text()).toContain('ok');
  });

  it('output-error 展示 errorText', () => {
    const w = mount(ToolUseBlock, {
      props: {
        block: block({ state: 'output-error', errorText: '超时' }),
        info: { role: 'ai', key: 'ai1' },
      },
    });
    expect(w.text()).toContain('超时');
  });

  it('命中 toolRenderers[toolName] 时委托自定义渲染器', () => {
    const Custom = defineComponent({
      props: ['block'],
      setup: (p) => () =>
        h('div', { class: 'custom-tool' }, (p.block as ToolUseContentBlock).toolName),
    });
    const w = mount(ToolUseBlock, {
      props: {
        block: block({}),
        info: { role: 'ai', key: 'ai1' },
        toolRenderers: { search: Custom },
      },
    });
    expect(w.find('.custom-tool').exists()).toBe(true);
  });

  it('toolName 为原型链键（constructor）时回退默认卡片，不误当渲染器', () => {
    const w = mount(ToolUseBlock, {
      props: {
        block: block({ toolName: 'constructor' }),
        info: { role: 'ai', key: 'ai1' },
        // toolRenderers 未自有声明 'constructor'，沿原型链能取到 Object.prototype.constructor
        toolRenderers: {},
      },
    });
    // 落到默认可折叠卡片而非把原型函数当组件渲染
    expect(w.find('.aix-tool-use').exists()).toBe(true);
    expect(w.text()).toContain('constructor');
  });

  it('input-available/executing 态展示 LoadingDots 进度指示', () => {
    const w = mount(ToolUseBlock, {
      props: { block: block({ state: 'input-available' }), info: { role: 'ai', key: 'ai1' } },
    });
    expect(w.find('.aix-loading-dots').exists()).toBe(true);
  });

  it('output-available 态不展示 LoadingDots', () => {
    const w = mount(ToolUseBlock, {
      props: {
        block: block({ state: 'output-available', output: 'ok' }),
        info: { role: 'ai', key: 'ai1' },
      },
    });
    expect(w.find('.aix-loading-dots').exists()).toBe(false);
  });

  // 回归：Bubble 对所有注册渲染器都传 on-block-intent，但 ToolUseBlock 此前既未声明该 prop
  // （inheritAttrs:false 下落进 attrs 被丢弃）、也未转发给 delegate，导致 toolRenderers 注册的
  // 组件是唯一拿不到 intent 通道的渲染器类型——工具审批（ToolUseState.'awaiting-approval'）
  // 这类「改数据走 action、点提交走 intent」的场景因此走不通。
  it('委托自定义渲染器时透传 onBlockIntent，意图可上抛', async () => {
    const Custom = defineComponent({
      props: {
        block: { type: Object, required: true },
        onBlockIntent: { type: Function, default: undefined },
      },
      setup: (p) => () =>
        h(
          'button',
          {
            class: 'approve',
            onClick: () =>
              (p.onBlockIntent as ((i: BlockIntent) => void) | undefined)?.({
                blockId: (p.block as ToolUseContentBlock).id,
                type: 'approve',
              }),
          },
          'approve',
        ),
    });
    const intents: BlockIntent[] = [];
    const w = mount(ToolUseBlock, {
      props: {
        block: block({ state: 'awaiting-approval' }),
        info: { role: 'ai', key: 'ai1' },
        toolRenderers: { search: markRaw(Custom) },
        onBlockIntent: (i: BlockIntent) => intents.push(i),
      },
    });
    await w.find('.approve').trigger('click');
    expect(intents).toEqual([{ blockId: 'b1', type: 'approve' }]);
  });

  it('委托自定义渲染器时透传 onBlockAction，数据补丁可上抛', async () => {
    const Custom = defineComponent({
      props: {
        block: { type: Object, required: true },
        onBlockAction: { type: Function, default: undefined },
      },
      setup: (p) => () =>
        h(
          'button',
          {
            class: 'answer',
            onClick: () =>
              (p.onBlockAction as ((a: BlockAction) => void) | undefined)?.({
                blockId: (p.block as ToolUseContentBlock).id,
                type: 'answer',
                patch: { output: 'B' },
              }),
          },
          'answer',
        ),
    });
    const actions: BlockAction[] = [];
    const w = mount(ToolUseBlock, {
      props: {
        block: block({}),
        info: { role: 'ai', key: 'ai1' },
        toolRenderers: { search: markRaw(Custom) },
        onBlockAction: (a: BlockAction) => actions.push(a),
      },
    });
    await w.find('.answer').trigger('click');
    expect(actions).toEqual([{ blockId: 'b1', type: 'answer', patch: { output: 'B' } }]);
  });

  // 防回归：注册表统一透传 typing（boolean | BubbleTypingConfig），收窄为 boolean 会触发 dev 警告
  it('typing 透传配置对象不触发 prop 类型校验警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mount(ToolUseBlock, {
        props: {
          block: block({ state: 'output-available', output: 'ok' }),
          info: { role: 'ai', key: 'ai1' },
          typing: { step: 2, interval: 20 },
        },
      });
      expect(warn.mock.calls.filter((c) => String(c[0]).includes('Invalid prop'))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});
