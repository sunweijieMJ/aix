import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, h, defineComponent } from 'vue';
import Bubble from '../src/components/Bubble.vue';
import type { BlockActionHandler, ContentBlock } from '../src/types';
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

  it('loading 时显示 LoadingDots，不显示 content', () => {
    const w = mount(Bubble, { props: { content: [textBlock('x')], loading: true } });
    expect(w.find('.aix-loading-dots').exists()).toBe(true);
    expect(w.text()).not.toContain('x');
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

  it('status=updating：内容区带 aria-live/aria-atomic，供屏幕阅读器感知流式更新', () => {
    const w = mount(Bubble, { props: { status: 'updating', content: [textBlock('流式中')] } });
    const content = w.find('.aix-bubble__content');
    expect(content.attributes('aria-live')).toBe('polite');
    expect(content.attributes('aria-atomic')).toBe('false');
  });

  it('非 updating 状态：内容区不带 aria-live（避免虚拟列表滚动回收时误播报）', () => {
    const w = mount(Bubble, { props: { status: 'success', content: [textBlock('已完成')] } });
    const content = w.find('.aix-bubble__content');
    expect(content.attributes('aria-live')).toBeUndefined();
    expect(content.attributes('aria-atomic')).toBeUndefined();
  });

  it('根元素带 data-aix-message-id / data-aix-role，text 块带 data-aix-block-id', () => {
    const w = mount(Bubble, {
      props: {
        itemKey: 'm1',
        role: 'ai',
        content: [{ id: 'b1', type: 'text', text: 'hello' }],
      },
    });
    const root = w.find('.aix-bubble');
    expect(root.attributes('data-aix-message-id')).toBe('m1');
    expect(root.attributes('data-aix-role')).toBe('ai');
    expect(w.find('[data-aix-block-id="b1"]').exists()).toBe(true);
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
      expect(warn.mock.calls[0]![0]).toContain('mystery-block');
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
    expect(ev![0]![0]).toEqual({
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
    expect(rich[0]!.text()).toBe('R:步骤一');
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

describe('Bubble 内联编辑（editing 受控 prop）', () => {
  it('editing=true 且 user 角色时显示内联编辑框，textarea 初值为原文', () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('原始内容')], role: 'user', editing: true },
    });
    const ta = w.find('textarea.aix-bubble__edit-input');
    expect(ta.exists()).toBe(true);
    expect((ta.element as HTMLTextAreaElement).value).toBe('原始内容');
  });

  it('editing=false（默认）不显示内联编辑框', () => {
    const w = mount(Bubble, { props: { content: [textBlock('hi')], role: 'user' } });
    expect(w.find('textarea.aix-bubble__edit-input').exists()).toBe(false);
  });

  it('不再自带独立编辑按钮（入口已移交 BubbleActions，见 Task 2）', () => {
    const w = mount(Bubble, { props: { content: [textBlock('hi')], role: 'user' } });
    expect(w.find('.aix-bubble__edit-btn').exists()).toBe(false);
  });

  it('保存非空内容 emit edit 并退出编辑态', async () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('old')], role: 'user', editing: true },
    });
    await w.find('textarea.aix-bubble__edit-input').setValue('new text');
    await w.find('.aix-bubble__edit-save').trigger('click');
    expect(w.emitted('edit')).toEqual([['new text']]);
    expect(w.emitted('editing-change')).toEqual([[false]]);
  });

  it('保存空白内容不 emit', async () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('old')], role: 'user', editing: true },
    });
    await w.find('textarea.aix-bubble__edit-input').setValue('   ');
    await w.find('.aix-bubble__edit-save').trigger('click');
    expect(w.emitted('edit')).toBeUndefined();
  });

  it('取消编辑 emit editing-change(false) 且不 emit edit', async () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('old')], role: 'user', editing: true },
    });
    await w.find('.aix-bubble__edit-cancel').trigger('click');
    expect(w.emitted('editing-change')).toEqual([[false]]);
    expect(w.emitted('edit')).toBeUndefined();
  });

  it('saveDisabled=true 时点击保存不 emit edit、不退出编辑态（保留草稿）', async () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('old')], role: 'user', editing: true, saveDisabled: true },
    });
    await w.find('textarea.aix-bubble__edit-input').setValue('new text');
    await w.find('.aix-bubble__edit-save').trigger('click');
    expect(w.emitted('edit')).toBeUndefined();
    expect(w.emitted('editing-change')).toBeUndefined();
    // 草稿仍在（编辑框还开着）
    expect(w.find('textarea.aix-bubble__edit-input').exists()).toBe(true);
  });

  it('editing prop 从 false 变 true 时，draft 重新取当前 content 的最新文本', async () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('第一版')], role: 'user', editing: false },
    });
    await w.setProps({ content: [textBlock('第二版')], editing: true });
    const ta = w.find('textarea.aix-bubble__edit-input');
    expect((ta.element as HTMLTextAreaElement).value).toBe('第二版');
  });

  it('editing=true 时隐藏 footer（避免草稿未保存时被同排的删除等操作误触）', async () => {
    const w = mount(Bubble, {
      props: { content: [textBlock('old')], role: 'user', editing: false },
      slots: { footer: () => h('button', { class: 'fake-delete' }, '删除') },
    });
    expect(w.find('.fake-delete').exists()).toBe(true);
    await w.setProps({ editing: true });
    expect(w.find('.fake-delete').exists()).toBe(false);
  });
});

describe('Bubble footer 内容响应式（hasFooterContent 依赖多层转发 slot 时的 status 变化）', () => {
  // 复现真实场景（AiChat.vue / BubbleList.vue 的实际写法）：每层都按
  // `v-if="$slots.footer"` 判断是否转发，并用 `<slot name="footer" :item="item" />`
  // 把作用域插槽再转发一层——业务模板 → AiChat → BubbleList → Bubble，一路都是这个模式。
  // 用同样写法的两层转发组件模拟这条链路，验证 status 变化后 footer 会正确出现/消失。
  const Forwarder = defineComponent({
    props: { item: { type: Object, required: true } },
    template: `
      <div>
        <template v-if="$slots.footer">
          <slot name="footer" :item="item" />
        </template>
      </div>
    `,
  });

  it('status 从 loading 变为 abort 后，经多层转发的 footer 插槽应重新出现', async () => {
    const w = mount(
      {
        components: { Forwarder, Bubble },
        props: ['status'],
        template: `
          <Forwarder :item="{ status }">
            <template #footer="{ item }">
              <Forwarder :item="item">
                <template #footer="{ item: it2 }">
                  <Bubble role="ai" :status="it2.status" :content="content">
                    <template #footer>
                      <button v-if="it2.status === 'success' || it2.status === 'abort'" class="act">
                        操作
                      </button>
                    </template>
                  </Bubble>
                </template>
              </Forwarder>
            </template>
          </Forwarder>
        `,
        data() {
          return { content: [textBlock('hi')] };
        },
      },
      { props: { status: 'loading' } },
    );
    expect(w.find('.act').exists()).toBe(false);
    await w.setProps({ status: 'abort' });
    expect(w.find('.act').exists()).toBe(true);
  });
});

describe('Bubble tool_use 块渲染', () => {
  it('渲染 tool_use 块（内置 ToolUseBlock）', () => {
    const content: ContentBlock[] = [
      {
        id: 'b1',
        type: 'tool_use',
        toolCallId: 'c1',
        toolName: 'search',
        state: 'output-available',
        input: {},
        output: 'ok',
      } as ContentBlock,
    ];
    const w = mount(Bubble, { props: { content, role: 'ai' } });
    expect(w.find('.aix-tool-use').exists()).toBe(true);
    expect(w.text()).toContain('search');
  });
});

describe('Bubble 块渲染器查表的原型链加固', () => {
  // 回归：注册表是对象字面量，继承 Object.prototype。此前用 `renderers[block.type]` 直接下标，
  // 'constructor' / 'toString' / '__proto__' 这些原型链上的键会取到真值 —— 既绕过「未注册渲染器」
  // 的开发期告警（静默），又把原型上的函数/对象当组件渲染，气泡里吐出 `[object Object]`。
  // block.type 来自流数据与持久化对话树（localStorage 可被篡改/损坏），并非不可达路径。
  // 与 ToolUseBlock 按 toolName 路由的 Object.hasOwn 加固保持一致。
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
    'type="%s" 不命中原型链上的键：跳过渲染并给出未注册告警',
    async (protoKey) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const w = mount(Bubble, {
        props: { content: [{ id: 'b1', type: protoKey, text: 'x' } as unknown as ContentBlock] },
      });
      await nextTick();
      // 不得渲染出原型对象/函数被当组件的产物
      expect(w.text()).not.toContain('[object Object]');
      expect(w.find('.aix-bubble__content').text()).toBe('');
      // 开发期护栏必须照常触发（此前被真值查表结果吞掉）
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`"${protoKey}"`));
      warn.mockRestore();
    },
  );

  it('自定义 blockRenderers 注册的自有键仍正常命中', () => {
    const Custom = defineComponent({ setup: () => () => h('div', { class: 'custom' }, 'ok') });
    const w = mount(Bubble, {
      props: {
        content: [{ id: 'b1', type: 'my-block' } as unknown as ContentBlock],
        blockRenderers: { 'my-block': Custom },
      },
    });
    expect(w.find('.custom').exists()).toBe(true);
  });
});
