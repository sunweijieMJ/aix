import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import type { VNode } from 'vue';
import Bubble from '../src/components/Bubble.vue';
import BubbleList from '../src/components/BubbleList.vue';
import type { ChatMessage } from '../src/types';
import { textBlock } from '../src/utils/helpers';

/**
 * 回归：Virtualizer 默认插槽必须恰好产出**一个带 key 的 vnode**。
 *
 * virtua 的 ListItem 只在插槽产出单个 vnode 时才采纳该 vnode 的 key，否则回退成 `"_" + index`：
 *
 *   R = (e, t) => { if (1 === e.length) { const k = e[0].key; if (null != k) return k; } return "_" + t; }
 *
 * 曾经的写法是「`<RowBefore v-if>` + `<Bubble :key>`」并列——`v-if` 为假时 Vue 编译出注释占位
 * vnode，插槽恒产出 2 个，于是 `:key` 从未生效、行标识实际是下标。删除中间消息或向上加载历史
 * 使下标平移时，每个 ListItem 承载的消息都换了一条，其内部气泡被卸载重建，正在内联编辑的草稿
 * （Bubble 组件内部 ref）连同折叠态一起丢失，而列表级的 editingIds 仍在——表现为「行还停在
 * 编辑态，输入的内容却被悄悄还原」。
 *
 * 本文件不 mock virtua 的 key 推导（那是三方实现），而是直接锁住我们这一侧要满足的前提条件，
 * 并覆盖它保护的那个用户可见行为。
 */

/** 捕获默认插槽每次产出的 vnode 数组，供断言「恰好一个根 vnode」 */
const slotOutputs: VNode[][] = [];

/**
 * 逐字复刻 virtua@0.49.1 的 ListItem key 推导（lib/vue/index.js 中的 `R`）：
 * 插槽恰好产出一个带 key 的 vnode 才采纳它，否则回退下标。
 * 与其在 jsdom（无布局，虚拟列表会退化成不渲染）里跑真 virtua，不如把它这条契约显式写进
 * stub —— 断言对象因此是「我们满足了这条契约」，而非三方实现细节。
 */
const deriveVirtuaKey = (nodes: VNode[], index: number): string | number => {
  if (nodes.length === 1) {
    const k = nodes[0]!.key;
    if (k != null) return k as string | number;
  }
  return `_${index}`;
};

vi.mock('virtua/vue', () => ({
  Virtualizer: defineComponent({
    name: 'VirtualizerProbe',
    props: ['data', 'keepMounted'],
    setup(props: any, { slots }: any) {
      return () =>
        (props.data as unknown[]).map((item, index) => {
          const nodes = slots.default?.({ item, index }) as VNode[];
          slotOutputs.push(nodes);
          // ListItem 等价物：行元素的 key 即上面推导出的那个，行内容原样放入
          return h('div', { key: deriveVirtuaKey(nodes, index) }, nodes);
        });
    },
  }),
}));

const msg = (id: string, text: string): ChatMessage => ({
  id,
  role: 'ai',
  status: 'success',
  content: [textBlock(text)],
});

describe('BubbleList 行 key（virtua ListItem 采纳前提）', () => {
  it('未提供 row-before 插槽时，插槽仍恰好产出一个 vnode，且 key 为消息 id', () => {
    slotOutputs.length = 0;
    mount(BubbleList, { props: { items: [msg('a', '甲'), msg('b', '乙')] } });

    expect(slotOutputs.length).toBe(2);
    for (const nodes of slotOutputs) {
      // 关键断言：长度必须为 1——多一个注释占位 vnode 就会让 virtua 回退到下标 key
      expect(nodes).toHaveLength(1);
      expect(nodes[0]!.key).not.toBeNull();
    }
    expect(slotOutputs[0]![0]!.key).toBe('a');
    expect(slotOutputs[1]![0]!.key).toBe('b');
  });

  it('提供 row-before 插槽时同样只产出一个 vnode（包裹层并入同一根）', () => {
    slotOutputs.length = 0;
    mount(BubbleList, {
      props: { items: [msg('a', '甲'), msg('b', '乙')] },
      slots: { 'row-before': ({ item }: { item: ChatMessage }) => h('span', item.id) },
    });

    expect(slotOutputs.length).toBe(2);
    for (const nodes of slotOutputs) expect(nodes).toHaveLength(1);
    expect(slotOutputs[0]![0]!.key).toBe('a');
  });

  it('row-before 无产出时不渲染包裹层（既有语义不被包裹改动破坏）', () => {
    const wrapper = mount(BubbleList, {
      props: { items: [msg('a', '甲')] },
      // 返回空数组：插槽已声明但这一条不产出内容
      slots: { 'row-before': () => [] },
    });
    expect(wrapper.find('.aix-bubble-list__row-before').exists()).toBe(false);
  });

  it('row-before 有产出时渲染包裹层', () => {
    const wrapper = mount(BubbleList, {
      props: { items: [msg('a', '甲')] },
      slots: { 'row-before': ({ item }: { item: ChatMessage }) => h('span', item.id) },
    });
    expect(wrapper.find('.aix-bubble-list__row-before').exists()).toBe(true);
  });

  it('删除中间消息后，幸存消息的 Bubble 实例不被卸载重建（草稿态得以保留）', async () => {
    const items = [msg('a', '甲'), msg('b', '乙'), msg('c', '丙')];
    const wrapper = mount(BubbleList, { props: { items } });

    const before = wrapper.findAllComponents(Bubble);
    expect(before).toHaveLength(3);
    // 取末条（曾经因下标从 2 平移到 1 而被重建的那一条）。比 DOM 元素身份而非 VTU 的 .vm：
    // .vm 是每次查询新建的代理对象，toBe 比不出底层实例是否同一个；元素被替换才真正等价于「重建」。
    const cElBefore = before[2]!.element;
    const cUidBefore = (before[2]!.vm as unknown as { $: { uid: number } }).$.uid;

    await wrapper.setProps({ items: [items[0]!, items[2]!] });
    await nextTick();

    const after = wrapper.findAllComponents(Bubble);
    expect(after).toHaveLength(2);
    // 同一条消息 c 必须复用同一个组件实例——重建即意味着其内部 ref（编辑草稿等）被清空
    expect(after[1]!.element).toBe(cElBefore);
    expect((after[1]!.vm as unknown as { $: { uid: number } }).$.uid).toBe(cUidBefore);
  });
});
