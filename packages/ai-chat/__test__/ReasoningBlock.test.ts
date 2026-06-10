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

  // 回归：MarkdownRenderer 的 streaming 与 TextBlock 同款按「状态 ∪ 打字机未追平」推导，
  // 不直接绑定 typing 配置（success 后 typing 仍为 true，常开会导致末块永不固化）。
  it('success 且打字机已追平（挂载快照）时 markdown 不再处于流式态', async () => {
    // 打字机初始取挂载快照（displayed 即追平），updating 期间 streaming 仍由状态撑起
    const w = mount(ReasoningBlock, { props: { block, typing: true, info: info('updating') } });
    expect(w.findComponent({ name: 'MarkdownRenderer' }).props('streaming')).toBe(true);

    // success 后面板自动折叠（v-if 卸载渲染体），手动展开后检查：typing 仍为 true 但已固化
    await w.setProps({ info: info('success') });
    await w.find('.aix-thinking__header').trigger('click');
    expect(w.findComponent({ name: 'MarkdownRenderer' }).props('streaming')).toBe(false);
  });

  it('流式中（updating）markdown 处于流式态（与 typing 配置无关）', () => {
    const w = mount(ReasoningBlock, { props: { block, typing: false, info: info('updating') } });
    const md = w.findComponent({ name: 'MarkdownRenderer' });
    expect(md.props('streaming')).toBe(true);
  });
});
