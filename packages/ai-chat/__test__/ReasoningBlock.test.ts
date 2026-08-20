import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, nextTick, createCommentVNode } from 'vue';
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
      expect(w.find('.aix-thinking__header').text()).toContain('思考过程（用时5.00秒）');
    });

    it('不满 1 秒时按实际精度展示（默认 2 位小数）', () => {
      const w = mount(ReasoningBlock, {
        props: {
          block: { ...block, startedAt: 1_700_000_000_000, endedAt: 1_700_000_000_400 },
          info: info('success'),
        },
      });
      expect(w.find('.aix-thinking__header').text()).toContain('思考过程（用时0.40秒）');
    });

    it('流式中（尚无 endedAt）标题随时间推移展示耗时；数据层打上 endedAt 后立即定格', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_700_000_000_000);
      const w = mount(ReasoningBlock, {
        props: { block: { ...block, startedAt: 1_700_000_000_000 }, info: info('updating') },
      });
      expect(w.find('.aix-thinking__header').text()).toContain('思考过程（用时0.00秒）');

      await vi.advanceTimersByTimeAsync(3000);
      expect(w.find('.aix-thinking__header').text()).toContain('思考过程（用时3.00秒）');

      // 数据层打上 endedAt：耗时立即定格为 endedAt - startedAt，不再跟随后续 tick 增长
      await w.setProps({
        block: { ...block, startedAt: 1_700_000_000_000, endedAt: 1_700_000_005_000 },
      });
      await vi.advanceTimersByTimeAsync(15_000);
      expect(w.find('.aix-thinking__header').text()).toContain('思考过程（用时5.00秒）');
    });
  });
});

// ============================================================================
// 深度思考 UI 定制：Thinking 具名插槽 + ReasoningBlock 按 <块类型>-<内部slot> 约定转发。
// 此前 ReasoningBlock 不向 Thinking 转发任何插槽、Thinking 的标题/箭头写死，导致
// README 宣传的插槽穿透对 reasoning-* 完全无效，想改思考区外观只能整体替换渲染器
// （代价是自己复刻打字机 / 计时 / 流式自动展开 / typing-complete 上抛）。
// ============================================================================
describe('ReasoningBlock — 思考 UI 插槽穿透', () => {
  const reasoning = (over: Partial<{ text: string; startedAt: number; endedAt: number }> = {}) =>
    ({ id: 'r-slot', type: 'reasoning', text: '思考文本', ...over }) as ContentBlock & {
      type: 'reasoning';
    };

  it('reasoning-title 覆盖标题，且拿得到 elapsed / streaming / open', () => {
    const scopes: Record<string, unknown>[] = [];
    const w = mount(ReasoningBlock, {
      props: {
        block: reasoning({ startedAt: Date.now() - 5000, endedAt: Date.now() }),
        info: { status: 'success', role: 'ai', key: 'm1' },
      },
      slots: {
        'reasoning-title': (sp: Record<string, unknown>) => {
          scopes.push(sp);
          return h('span', { class: 'my-title' }, `思考 ${sp.elapsed}s`);
        },
      },
    });
    expect(w.find('.my-title').text()).toBe('思考 5.00s');
    expect(scopes[0]).toMatchObject({ elapsed: '5.00', streaming: false, open: false });
    // 内置标题（含 i18n 的「思考过程」）不再出现
    expect(w.text()).not.toContain('思考过程');
  });

  it('reasoning-icon 渲染在标题前，且拿得到 elapsed / streaming / open', () => {
    const scopes: Record<string, unknown>[] = [];
    const w = mount(ReasoningBlock, {
      props: {
        block: reasoning({ startedAt: Date.now() - 5000, endedAt: Date.now() }),
        info: { status: 'success', role: 'ai', key: 'm1' },
      },
      slots: {
        'reasoning-icon': (sp: Record<string, unknown>) => {
          scopes.push(sp);
          return h('i', { class: 'my-icon' });
        },
      },
    });
    expect(w.find('.my-icon').exists()).toBe(true);
    expect(scopes[0]).toMatchObject({ elapsed: '5.00', streaming: false, open: false });
  });

  it('不提供 reasoning-icon 时无副作用：标题前不出现空白图标区', () => {
    const w = mount(ReasoningBlock, {
      props: { block: reasoning(), info: { status: 'success', role: 'ai', key: 'm1' } },
    });
    expect(w.find('.my-icon').exists()).toBe(false);
    expect(w.find('.aix-thinking__header').text()).toContain('思考过程');
  });

  it('reasoning-arrow 覆盖展开箭头（内置 ▾ 消失）', () => {
    const w = mount(ReasoningBlock, {
      props: { block: reasoning() },
      slots: { 'reasoning-arrow': () => h('i', { class: 'my-arrow' }) },
    });
    expect(w.find('.my-arrow').exists()).toBe(true);
    expect(w.find('.aix-thinking__arrow').exists()).toBe(false);
  });

  it('reasoning-body 覆盖正文，拿得到 text / displayed，且不再渲染内置 Markdown', async () => {
    let scope!: Record<string, unknown>;
    const w = mount(ReasoningBlock, {
      props: {
        block: reasoning({ text: '一段思考' }),
        info: { status: 'updating', role: 'ai', key: 'm1' }, // 流式中自动展开，正文可见
      },
      slots: {
        'reasoning-body': (sp: Record<string, unknown>) => {
          scope = sp;
          return h('pre', { class: 'my-body' }, sp.text as string);
        },
      },
    });
    await nextTick();
    expect(w.find('.my-body').text()).toBe('一段思考');
    expect(scope).toMatchObject({ text: '一段思考', displayed: '一段思考', streaming: true });
    expect(w.find('.aix-markdown').exists()).toBe(false);
  });

  it('不提供插槽时零副作用：标题 / 箭头 / 内置 Markdown 正文全部保持内置形态', async () => {
    const w = mount(ReasoningBlock, {
      props: {
        block: reasoning(),
        info: { status: 'updating', role: 'ai', key: 'm1' },
      },
    });
    await nextTick();
    expect(w.find('.aix-thinking__arrow').exists()).toBe(true);
    expect(w.find('.aix-thinking__header').text()).toContain('思考过程');
    expect(w.find('.aix-thinking__body').exists()).toBe(true);
  });

  it('reasoning-body 条件渲染为空时不回退内置 Markdown（renderSlot 全 Comment 陷阱）', async () => {
    // 模拟业务的 v-if：编译后条件为假会产出 Comment 占位节点，而非什么都不返回。
    // 若 ReasoningBlock 用 <slot> 的 fallback 写法，Vue 会据此判定「插槽未提供」而强行
    // 套回内置 MarkdownRenderer——业务明确表达的「这种情况不显示思考正文」被无视。
    const showBody = false as boolean;
    const w = mount(ReasoningBlock, {
      props: {
        block: reasoning(),
        info: { status: 'updating', role: 'ai', key: 'm1' },
      },
      slots: { 'reasoning-body': () => (showBody ? h('div') : createCommentVNode('v-if')) },
    });
    await nextTick();
    expect(w.find('.aix-markdown').exists()).toBe(false);
  });
});
