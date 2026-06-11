import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { h } from 'vue';
import ThoughtChainBlock from '../src/components/blocks/ThoughtChainBlock.vue';
import Bubble from '../src/components/Bubble.vue';
import type { ContentBlock } from '../src/types';
import { thoughtChainBlock } from '../src/utils/helpers';

const block = thoughtChainBlock([
  { key: '1', icon: '🤔', title: '获取用户输入', duration: '12.59秒' },
  { key: '2', icon: '📝', title: '正文创作', status: 'active', duration: '01.00秒' },
]) as Extract<ContentBlock, { type: 'thought-chain' }>;

describe('ThoughtChainBlock', () => {
  it('渲染 ThoughtChain 时间线', () => {
    const w = mount(ThoughtChainBlock, { props: { block } });
    expect(w.find('.aix-thought-chain').exists()).toBe(true);
    expect(w.findAll('.aix-thought-chain__item')).toHaveLength(2);
  });

  it('作为内置渲染器：Bubble 渲染 thought-chain 块', () => {
    const w = mount(Bubble, { props: { role: 'ai', status: 'success', content: [block] } });
    expect(w.find('.aix-thought-chain').exists()).toBe(true);
    expect(w.text()).toContain('正文创作');
  });

  it('thought-chain-item-content 命名插槽映射到 ThoughtChain 的 item-content（携带 item/index）', () => {
    const w = mount(ThoughtChainBlock, {
      props: { block },
      slots: {
        'thought-chain-item-content': (scope: { item: { title: string }; index: number }) =>
          h('span', { class: 'rich' }, `R-${scope.index}-${scope.item.title}`),
      },
    });
    const rich = w.findAll('.rich');
    expect(rich).toHaveLength(2);
    expect(rich[0].text()).toBe('R-0-获取用户输入');
    expect(rich[1].text()).toBe('R-1-正文创作');
  });

  // 防回归：注册表统一透传 typing（boolean | BubbleTypingConfig），收窄为 boolean 会触发 dev 警告
  it('typing 透传配置对象不触发 prop 类型校验警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mount(ThoughtChainBlock, { props: { block, typing: { step: 2, interval: 20 } } });
      expect(warn.mock.calls.filter((c) => String(c[0]).includes('Invalid prop'))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it('未提供该命名插槽时不产生幽灵正文（hasBody 不被误触发）', () => {
    // block 的两步均无 content，未提供 slot 时不应出现可折叠正文区与展开箭头
    const w = mount(ThoughtChainBlock, { props: { block } });
    expect(w.find('.aix-thought-chain__body').exists()).toBe(false);
    expect(w.find('.aix-thought-chain__arrow').exists()).toBe(false);
  });
});
