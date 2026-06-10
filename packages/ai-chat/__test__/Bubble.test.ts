import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, h, defineComponent } from 'vue';
import Bubble from '../src/components/Bubble.vue';
import type { BlockActionHandler } from '../src/types';
import { textBlock, sourcesBlock, thoughtChainBlock } from '../src/utils/helpers';

describe('Bubble', () => {
  it('渲染 content 与 placement/variant class', () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('hello')], placement: 'end', variant: 'outlined' },
    });
    expect(w.text()).toContain('hello');
    expect(w.classes()).toContain('aix-bubble--end');
    expect(w.find('.aix-bubble__content--outlined').exists()).toBe(true);
  });

  it('typing 关闭（默认）时直接显示完整 content', () => {
    const w = mount(Bubble, { props: { content: [textBlock('完整内容')] } });
    expect(w.text()).toContain('完整内容');
  });

  it('contentRender 自定义整条内容区渲染', () => {
    const w = mount(Bubble, {
      props: {
        content: [textBlock('raw')],
        status: 'success',
        contentRender: (blocks: any[], info: { status?: string }) =>
          h('em', { class: 'custom-render' }, `${blocks.length}:${info.status}`),
      },
    });
    const el = w.find('.custom-render');
    expect(el.exists()).toBe(true);
    expect(el.text()).toBe('1:success');
  });

  it('loading 时显示加载点，不显示 content', () => {
    const w = mount(Bubble, { props: { content: [textBlock('x')], loading: true } });
    expect(w.find('.aix-bubble__loading').exists()).toBe(true);
  });

  it('content 作用域 slot 覆盖默认渲染并拿到 blocks/info', () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('raw')], role: 'ai', status: 'success' },
      slots: { content: ({ blocks, info }: any) => `${blocks.length}-${info.status}` },
    });
    expect(w.text()).toContain('1-success');
  });

  it('error 状态显示重试入口，点击 emit retry', async () => {
    const w = mount(Bubble, { props: { status: 'error' } });
    expect(w.find('.aix-bubble__error').exists()).toBe(true);
    const retry = w.find('.aix-bubble__retry');
    expect(retry.exists()).toBe(true);
    await retry.trigger('click');
    expect(w.emitted('retry')).toBeTruthy();
  });

  it('非 error 状态不显示错误/重试', () => {
    const w = mount(Bubble, { props: { status: 'success', content: [textBlock('ok')] } });
    expect(w.find('.aix-bubble__error').exists()).toBe(false);
  });

  describe('typing 打字机', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('typing 开启时逐字显示流式增量，最终与 content 一致', async () => {
      const block = textBlock('');
      const w = mount(Bubble, { props: { content: [block], typing: true } });
      await w.setProps({ content: [{ ...block, text: '你好世界' }] });
      await nextTick();
      vi.advanceTimersByTime(30); // step=2 / interval=30 → 一帧约 2 字
      await nextTick();
      const mid = w.text();
      expect(mid.length).toBeGreaterThan(0);
      expect('你好世界'.startsWith(mid)).toBe(true); // 中间态是最终文本的前缀
      vi.advanceTimersByTime(300);
      await nextTick();
      expect(w.text()).toContain('你好世界');
    });
  });

  // #5 注册表重构：内置 text/reasoning 与用户 blockRenderers 收敛为单一注册表（用户优先），
  // 未注册类型安全跳过并告警。下列用例覆盖「自定义渲染、覆盖内置、未注册告警」三条路径。
  describe('blockRenderers 注册表', () => {
    const Sources = defineComponent({
      props: { block: { type: Object, required: true } },
      setup: (p: { block: { items: { title: string }[] } }) => () =>
        h(
          'ul',
          { class: 'my-sources' },
          p.block.items.map((s, i) => h('li', { key: i }, s.title)),
        ),
    });

    it('注册自定义 sources 渲染器后该块被渲染', () => {
      const w = mount(Bubble, {
        props: {
          content: [textBlock('看资料'), sourcesBlock([{ title: 'Vue' }, { title: 'MDN' }])],
          blockRenderers: { sources: Sources },
          status: 'success',
        },
      });
      expect(w.find('.my-sources').exists()).toBe(true);
      expect(w.text()).toContain('Vue');
      expect(w.text()).toContain('MDN');
    });

    it('用户 blockRenderers 可覆盖内置 text 渲染器', () => {
      const MyText = defineComponent({
        props: { block: { type: Object, required: true } },
        setup: (p: { block: { text: string } }) => () =>
          h('span', { class: 'my-text' }, `[${p.block.text}]`),
      });
      const w = mount(Bubble, {
        props: { content: [textBlock('hi')], blockRenderers: { text: MyText } },
      });
      expect(w.find('.my-text').exists()).toBe(true);
      expect(w.text()).toContain('[hi]');
    });

    it('未注册的块类型安全跳过并仅告警一次', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // 用一个不存在于内置注册表的类型作样本（sources 已是内置类型，不能再充当“未注册”示例）
      const unknownBlock = { id: 'u1', type: 'mystery-block', text: 'X' } as never;
      const w = mount(Bubble, {
        props: { content: [textBlock('正文'), unknownBlock], status: 'success' },
      });
      // 文本块正常渲染；未注册块被跳过，内容不出现在 DOM
      expect(w.text()).toContain('正文');
      expect(w.text()).not.toContain('X');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('mystery-block');
      warn.mockRestore();
    });
  });
});

// 极简交互渲染器：点击即调用 onBlockAction
const ProbeRenderer = defineComponent({
  props: {
    block: { type: Object, required: true },
    info: { type: Object, default: undefined },
    typing: { type: Boolean, default: false },
    onBlockAction: { type: Function as unknown as () => BlockActionHandler, default: undefined },
  },
  setup(props) {
    return () =>
      h(
        'button',
        {
          class: 'probe',
          onClick: () =>
            (props.onBlockAction as BlockActionHandler | undefined)?.({
              blockId: (props.block as { id: string }).id,
              type: 'select',
              patch: { selected: 'o2' },
            }),
        },
        'probe',
      );
  },
});

describe('Bubble block-action 回传', () => {
  it('交互块经 onBlockAction 触发 Bubble 向上 emit block-action（带 messageKey）', async () => {
    const wrapper = mount(Bubble, {
      props: {
        itemKey: 'm1',
        content: [{ id: 'b1', type: 'probe', foo: 1 }] as never,
        blockRenderers: { probe: ProbeRenderer },
      },
    });
    await wrapper.find('.probe').trigger('click');
    const ev = wrapper.emitted('block-action');
    expect(ev).toBeTruthy();
    expect(ev![0][0]).toEqual({
      messageKey: 'm1',
      action: { blockId: 'b1', type: 'select', patch: { selected: 'o2' } },
    });
  });
});

describe('Bubble slot 透传到块渲染器', () => {
  it('非保留命名插槽透传到块渲染器（thought-chain-item-content）', () => {
    const tc = thoughtChainBlock([
      { key: '1', icon: '🤔', title: '步骤一' },
      { key: '2', icon: '📝', title: '步骤二' },
    ]);
    const w = mount(Bubble, {
      props: { role: 'ai', status: 'success', content: [tc] },
      slots: {
        'thought-chain-item-content': (scope: { item: { title: string } }) =>
          h('span', { class: 'rich' }, `R:${scope.item.title}`),
      },
    });
    const rich = w.findAll('.rich');
    expect(rich).toHaveLength(2);
    expect(rich[0].text()).toBe('R:步骤一');
  });

  it('reserved 插槽（content）不会被当作块插槽透传，仍走内容覆盖', () => {
    const w = mount(Bubble, {
      props: { role: 'ai', status: 'success', content: [textBlock('orig')] },
      slots: { content: () => h('div', { class: 'custom-content' }, '覆盖') },
    });
    expect(w.find('.custom-content').exists()).toBe(true);
    expect(w.text()).toContain('覆盖');
  });
});

describe('Bubble 内联编辑', () => {
  it('editable 且 user 角色时显示编辑按钮', () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('hi')], role: 'user', editable: true },
    });
    expect(w.find('.aix-bubble__edit-btn').exists()).toBe(true);
  });

  it('editable 但 ai 角色不显示编辑按钮', () => {
    const w = mount(Bubble, { props: { content: [textBlock('hi')], role: 'ai', editable: true } });
    expect(w.find('.aix-bubble__edit-btn').exists()).toBe(false);
  });

  it('未开启 editable 不显示编辑按钮', () => {
    const w = mount(Bubble, { props: { content: [textBlock('hi')], role: 'user' } });
    expect(w.find('.aix-bubble__edit-btn').exists()).toBe(false);
  });

  it('点击编辑进入编辑态，textarea 初值为原文', async () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('原始内容')], role: 'user', editable: true },
    });
    await w.find('.aix-bubble__edit-btn').trigger('click');
    const ta = w.find('textarea.aix-bubble__edit-input');
    expect(ta.exists()).toBe(true);
    expect((ta.element as HTMLTextAreaElement).value).toBe('原始内容');
  });

  it('保存非空内容 emit edit 并退出编辑态', async () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('old')], role: 'user', editable: true },
    });
    await w.find('.aix-bubble__edit-btn').trigger('click');
    await w.find('textarea.aix-bubble__edit-input').setValue('new text');
    await w.find('.aix-bubble__edit-save').trigger('click');
    expect(w.emitted('edit')).toEqual([['new text']]);
    expect(w.find('textarea.aix-bubble__edit-input').exists()).toBe(false);
  });

  it('保存空白内容不 emit', async () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('old')], role: 'user', editable: true },
    });
    await w.find('.aix-bubble__edit-btn').trigger('click');
    await w.find('textarea.aix-bubble__edit-input').setValue('   ');
    await w.find('.aix-bubble__edit-save').trigger('click');
    expect(w.emitted('edit')).toBeUndefined();
  });

  it('取消编辑退出且不 emit', async () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('old')], role: 'user', editable: true },
    });
    await w.find('.aix-bubble__edit-btn').trigger('click');
    await w.find('.aix-bubble__edit-cancel').trigger('click');
    expect(w.find('textarea.aix-bubble__edit-input').exists()).toBe(false);
    expect(w.emitted('edit')).toBeUndefined();
  });
});
