import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
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

  // Bug 防回归：思考是否结束的权威信号来自数据层的 block.endedAt（由 useChat 在 reasoning
  // 被顶替或消息终态落定时打点），不再靠展示层从数组位置反推——即便消息整体仍在流式
  // （status 仍是 updating），block.endedAt 一旦被打上就应视为思考已结束并自动折叠。
  it('block.endedAt 已设置时，即便消息仍在流式（updating），思考过程也视为已结束并自动折叠', async () => {
    const w = mount(ReasoningBlock, {
      props: { block: { ...block, startedAt: 1000 }, info: info('updating') },
    });
    expect(w.find('.aix-thinking__body').exists()).toBe(true);

    await w.setProps({ block: { ...block, startedAt: 1000, endedAt: 6000 } });
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

  describe('思考耗时', () => {
    afterEach(() => vi.useRealTimers());

    it('block 无 startedAt（历史消息/业务自建、无真实起点）时标题不带耗时', () => {
      const w = mount(ReasoningBlock, { props: { block, info: info('success') } });
      const headerText = w.find('.aix-thinking__header').text();
      expect(headerText).toContain('思考过程');
      expect(headerText).not.toContain('用时');
    });

    it('挂载即带 startedAt/endedAt（如历史消息回填）时按两者差值展示定格耗时', () => {
      const w = mount(ReasoningBlock, {
        props: {
          block: { ...block, startedAt: 1_700_000_000_000, endedAt: 1_700_000_005_000 },
          info: info('success'),
        },
      });
      expect(w.find('.aix-thinking__header').text()).toContain('思考过程（用时5秒）');
    });

    it('未满 1 秒时向下取整展示为 1 秒（避免刚开始思考就显示"0秒"）', () => {
      const w = mount(ReasoningBlock, {
        props: {
          block: { ...block, startedAt: 1_700_000_000_000, endedAt: 1_700_000_000_400 },
          info: info('success'),
        },
      });
      expect(w.find('.aix-thinking__header').text()).toContain('思考过程（用时1秒）');
    });

    it('流式中（尚无 endedAt）标题随时间推移展示耗时；数据层打上 endedAt 后立即定格', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_700_000_000_000);
      const w = mount(ReasoningBlock, {
        props: { block: { ...block, startedAt: 1_700_000_000_000 }, info: info('updating') },
      });
      expect(w.find('.aix-thinking__header').text()).toContain('思考过程（用时1秒）');

      await vi.advanceTimersByTimeAsync(3000);
      expect(w.find('.aix-thinking__header').text()).toContain('思考过程（用时3秒）');

      // 数据层打上 endedAt：耗时立即定格为 endedAt - startedAt，不再跟随后续 tick 增长
      await w.setProps({
        block: { ...block, startedAt: 1_700_000_000_000, endedAt: 1_700_000_005_000 },
      });
      await vi.advanceTimersByTimeAsync(15_000);
      expect(w.find('.aix-thinking__header').text()).toContain('思考过程（用时5秒）');
    });
  });
});
