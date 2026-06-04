import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ReasoningBlock from '../src/components/blocks/ReasoningBlock.vue';
import type { ContentBlock, BubbleContentInfo } from '../src/types';

const block = { id: 'r1', type: 'reasoning', text: '推理内容' } as Extract<
  ContentBlock,
  { type: 'reasoning' }
>;
const info = (status: BubbleContentInfo['status']): BubbleContentInfo => ({
  status,
  role: 'ai',
  key: 'k',
});

describe('ReasoningBlock', () => {
  it('用 Thinking 折叠面板包裹，标题为「思考过程」', () => {
    const w = mount(ReasoningBlock, { props: { block, info: info('success') } });
    expect(w.find('.aix-thinking').exists()).toBe(true);
    expect(w.find('.aix-thinking__header').text()).toContain('思考过程');
  });

  it('流式中（updating）自动展开思考过程', () => {
    const w = mount(ReasoningBlock, { props: { block, info: info('updating') } });
    expect(w.find('.aix-thinking__body').exists()).toBe(true);
  });

  it('回复完成（success）后自动折叠', () => {
    const w = mount(ReasoningBlock, { props: { block, info: info('success') } });
    expect(w.find('.aix-thinking__body').exists()).toBe(false);
  });

  it('从流式转为完成时自动收起折叠面板', async () => {
    const w = mount(ReasoningBlock, { props: { block, info: info('updating') } });
    expect(w.find('.aix-thinking__body').exists()).toBe(true);
    await w.setProps({ info: info('success') });
    expect(w.find('.aix-thinking__body').exists()).toBe(false);
  });
});
