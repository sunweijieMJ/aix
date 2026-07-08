import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import ToolUseBlock from '../src/components/blocks/ToolUseBlock.vue';
import type { ContentBlock } from '../src/types';

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
});
