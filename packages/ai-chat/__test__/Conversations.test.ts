import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import { h } from 'vue';
import Conversations from '../src/components/Conversations.vue';
import type { ConversationsItemSlotScope } from '../src/components/Conversations.vue';
import type { ConversationItem } from '../src/types';

const items: ConversationItem[] = [
  { id: 'a', label: '关于梵高', group: '今天' },
  { id: 'b', label: 'TS 类型体操', group: '今天' },
  { id: 'c', label: '历史会话', group: '更早' },
];

describe('Conversations', () => {
  it('渲染会话项；点击新建 emit create', async () => {
    const w = mount(Conversations, { props: { items } });
    expect(w.findAll('.aix-conversations__item')).toHaveLength(3);
    expect(w.text()).toContain('关于梵高');
    await w.find('.aix-conversations__new').trigger('click');
    expect(w.emitted('create')).toHaveLength(1);
  });

  it('点击会话项更新 activeKey（v-model），激活项加 is-active', async () => {
    const w = mount(Conversations, { props: { items, activeKey: 'a' } });
    const itemEls = w.findAll('.aix-conversations__item');
    // 初始 a 激活（is-active 仍标在行上，供样式钩子使用）
    expect(itemEls[0]!.classes()).toContain('is-active');
    // 点击 b 的主操作
    await itemEls[1]!.find('.aix-conversations__label').trigger('click');
    expect(w.emitted('update:activeKey')?.[0]).toEqual(['b']);
  });

  // 非受控回归：不绑 v-model:activeKey 时由内部状态驱动（兼容 Vue 3.3 的关键，且守住「prop 不设默认值」铁律）
  it('非受控（不绑 v-model:activeKey）：点击切换选中由内部状态驱动', async () => {
    const w = mount(Conversations, { props: { items } }); // 不传 activeKey
    const itemEls = w.findAll('.aix-conversations__item');
    await itemEls[1]!.find('.aix-conversations__label').trigger('click');
    // 仍 emit
    expect(w.emitted('update:activeKey')?.[0]).toEqual(['b']);
    // 关键：非受控下内部状态保留，is-active 落到被点击项（defineModel 在 Vue 3.3 非受控下会丢失）
    expect(w.findAll('.aix-conversations__item')[1]!.classes()).toContain('is-active');
  });

  // 行为变更（2026-07）：会话行此前是 role="button" + tabindex="0"，内部却嵌着重命名 / 删除
  // 两个 <button> 和重命名 <input>——ARIA 明确禁止 button 角色包含交互式后代，屏幕阅读器
  // 对这种结构的呈现不可预期（子按钮可能读不到、或整行的可访问名被子元素文本污染）。
  // 改为：行本身退回无语义容器，主操作（选中）由原生 <button> 承担——键盘可达性交还平台，
  // 不再需要自己维护 tabindex 与 Enter/Space 处理。
  it('会话项主操作是原生 button，行本身不再声明 button 角色（ARIA 禁止嵌套交互元素）', () => {
    const w = mount(Conversations, { props: { items, activeKey: 'a' } });
    const rows = w.findAll('.aix-conversations__item');
    // 行是容器：不得再有 button 角色 / tabindex，否则它与内部的操作按钮构成非法嵌套
    expect(rows[0]!.attributes('role')).toBeUndefined();
    expect(rows[0]!.attributes('tabindex')).toBeUndefined();
    // 主操作是真 button：天然可聚焦、Enter/Space 由浏览器处理
    const label = rows[0]!.find('.aix-conversations__label');
    expect(label.element.tagName).toBe('BUTTON');
    expect(label.attributes('type')).toBe('button');
    // 激活态标注在承担该操作的元素上
    expect(label.attributes('aria-current')).toBe('true');
    expect(rows[1]!.find('.aix-conversations__label').attributes('aria-current')).toBeUndefined();
  });

  it('点击会话项主操作切换选中', async () => {
    const w = mount(Conversations, { props: { items, activeKey: 'a' } });
    const rows = w.findAll('.aix-conversations__item');
    await rows[1]!.find('.aix-conversations__label').trigger('click');
    expect(w.emitted('update:activeKey')?.[0]).toEqual(['b']);
    await rows[2]!.find('.aix-conversations__label').trigger('click');
    expect(w.emitted('update:activeKey')?.[1]).toEqual(['c']);
  });

  it('点击删除按钮 emit delete(id)', async () => {
    const w = mount(Conversations, { props: { items, activeKey: 'a' } });
    const firstItem = w.findAll('.aix-conversations__item')[0]!;
    const delBtn = firstItem.findAll('.aix-conversations__action')[1]!; // 第二个为删除
    await delBtn.trigger('click');
    expect(w.emitted('delete')?.[0]).toEqual(['a']);
  });

  it('行内重命名：编辑后回车 emit rename(id, label)，且不切换选中', async () => {
    const w = mount(Conversations, { props: { items, activeKey: 'a' } });
    const firstItem = w.findAll('.aix-conversations__item')[0]!;
    const renameBtn = firstItem.findAll('.aix-conversations__action')[0]!; // 第一个为重命名
    await renameBtn.trigger('click');
    const input = w.find('.aix-conversations__edit-input');
    expect(input.exists()).toBe(true);
    await input.setValue('梵高的向日葵');
    await input.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('rename')?.[0]).toEqual(['a', '梵高的向日葵']);
    // 重命名点击不应触发选中切换
    expect(w.emitted('update:activeKey')).toBeUndefined();
  });

  it('重命名为空白时不 emit rename：Enter 保持编辑态待修正，blur 按取消恢复原名', async () => {
    const w = mount(Conversations, { props: { items, activeKey: 'a' } });
    const renameBtn = w
      .findAll('.aix-conversations__item')[0]!
      .findAll('.aix-conversations__action')[0]!;
    await renameBtn.trigger('click');
    const input = w.find('.aix-conversations__edit-input');
    await input.setValue('   ');
    // Enter 提交空白：不 emit，且编辑态保持（不静默吞掉重命名意图）
    await input.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('rename')).toBeUndefined();
    expect(w.find('.aix-conversations__edit-input').exists()).toBe(true);
    // blur 离开：按取消处理，关闭编辑态、显示原名
    await input.trigger('blur');
    expect(w.emitted('rename')).toBeUndefined();
    expect(w.find('.aix-conversations__edit-input').exists()).toBe(false);
    expect(w.findAll('.aix-conversations__item')[0]!.text()).toContain('关于梵高');
  });

  it('编辑中条目被外部移除后编辑态清除，会话切换不被阻断', async () => {
    const w = mount(Conversations, { props: { items, activeKey: 'a' } });
    const renameBtn = w
      .findAll('.aix-conversations__item')[0]!
      .findAll('.aix-conversations__action')[0]!;
    await renameBtn.trigger('click');
    expect(w.find('.aix-conversations__edit-input').exists()).toBe(true);
    // 条目 a 随 items prop 更新被外部移除：聚焦中的 input 卸载不触发 blur，
    // editingId 不得残留，否则 select 守卫会全局阻断会话切换
    await w.setProps({ items: items.filter((it) => it.id !== 'a') });
    // 点击剩余首项（b）应正常切换选中
    await w
      .findAll('.aix-conversations__item')[0]!
      .find('.aix-conversations__label')
      .trigger('click');
    expect(w.emitted('update:activeKey')?.[0]).toEqual(['b']);
  });

  it('编辑中条目仍存在时，items 更新不丢失编辑态且 select 守卫仍生效', async () => {
    const w = mount(Conversations, { props: { items, activeKey: 'a' } });
    const renameBtn = w
      .findAll('.aix-conversations__item')[0]!
      .findAll('.aix-conversations__action')[0]!;
    await renameBtn.trigger('click');
    // items 更新但被编辑的 a 仍在：编辑态保持
    await w.setProps({ items: [...items, { id: 'd', label: '新会话', group: '今天' }] });
    expect(w.find('.aix-conversations__edit-input').exists()).toBe(true);
    // 编辑期间点击其他项的主操作仍被守卫拦截（既有行为不回归）
    await w
      .findAll('.aix-conversations__item')[1]!
      .find('.aix-conversations__label')
      .trigger('click');
    expect(w.emitted('update:activeKey')).toBeUndefined();
  });

  it('groupable=true 渲染分组标题', () => {
    const w = mount(Conversations, { props: { items, groupable: true } });
    const groups = w.findAll('.aix-conversations__group');
    expect(groups.map((g) => g.text())).toEqual(['今天', '更早']);
  });

  it('空列表显示空态', () => {
    const w = mount(Conversations, { props: { items: [] } });
    expect(w.find('.aix-conversations__empty').exists()).toBe(true);
  });

  it('searchable=false（默认）不渲染搜索框', () => {
    const w = mount(Conversations, { props: { items } });
    expect(w.find('.aix-conversations__search-input').exists()).toBe(false);
  });

  it('searchable=true：按 label 模糊匹配（大小写不敏感）过滤会话', async () => {
    const w = mount(Conversations, { props: { items, searchable: true } });
    const input = w.find('.aix-conversations__search-input');
    expect(input.exists()).toBe(true);
    await input.setValue('ts');
    const labels = w.findAll('.aix-conversations__label').map((el) => el.text());
    expect(labels).toEqual(['TS 类型体操']);
  });

  it('搜索无匹配结果时显示无匹配文案（区别于「暂无会话」空态文案）', async () => {
    const w = mount(Conversations, { props: { items, searchable: true } });
    await w.find('.aix-conversations__search-input').setValue('不存在的关键字');
    expect(w.find('.aix-conversations__empty').text()).toBe('无匹配结果');
  });

  it('groupable + searchable：先过滤再分组，未命中分组不渲染组标题', async () => {
    const w = mount(Conversations, { props: { items, searchable: true, groupable: true } });
    await w.find('.aix-conversations__search-input').setValue('历史');
    const groups = w.findAll('.aix-conversations__group');
    expect(groups.map((g) => g.text())).toEqual(['更早']);
    expect(w.findAll('.aix-conversations__item')).toHaveLength(1);
  });

  it('searchPlaceholder 自定义占位文案', () => {
    const w = mount(Conversations, {
      props: { items, searchable: true, searchPlaceholder: '搜一搜' },
    });
    expect(w.find('.aix-conversations__search-input').attributes('placeholder')).toBe('搜一搜');
  });

  it('loading=true 时列表区域渲染骨架占位，忽略 items', () => {
    const w = mount(Conversations, { props: { items, loading: true } });
    expect(w.find('.aix-skeleton').exists()).toBe(true);
    expect(w.find('.aix-conversations__item').exists()).toBe(false);
    // 顶部新建按钮不受影响
    expect(w.find('.aix-conversations__new').exists()).toBe(true);
  });
});

/**
 * 会话列表项定制：此前本组件零插槽，业务想加「置顶徽标 / 时间戳 / 更多菜单」只能整个重写。
 * 三个插槽都走 `$slots.x` 显式二选一（而非 <slot> 原生 fallback），避免消费方按条件
 * 只为部分会话渲染自定义内容时被 renderSlot 的「全 Comment 即未提供」判定强行套回内置 UI。
 */
describe('Conversations — 列表项插槽', () => {
  const slotItems: ConversationItem[] = [
    { id: 'c1', label: '会话一' },
    { id: 'c2', label: '会话二' },
  ];

  it('#item 替换整行内容，作用域含 item / active 与三个动作句柄', async () => {
    const w = mount(Conversations, {
      props: { items: slotItems, activeKey: 'c2' },
      slots: {
        item: (s: ConversationsItemSlotScope) =>
          h(
            'button',
            { class: ['row', s.active && 'is-on'], onClick: s.select },
            `${s.item.label}|${s.active}`,
          ),
      },
    });
    const rows = w.findAll('.row');
    expect(rows.map((r) => r.text())).toEqual(['会话一|false', '会话二|true']);
    // 内置标题按钮与操作区整体让位
    expect(w.find('.aix-conversations__label').exists()).toBe(false);
    // 行容器与 is-active 仍由组件持有
    expect(w.findAll('.aix-conversations__item').length).toBe(2);
    expect(w.findAll('.aix-conversations__item')[1]!.classes()).toContain('is-active');

    await rows[0]!.trigger('click');
    expect(w.emitted('update:activeKey')?.at(-1)).toEqual(['c1']);
  });

  it('#item 作用域的 rename() 进入内置内联重命名态，remove() 抛 delete', async () => {
    const w = mount(Conversations, {
      props: { items: slotItems },
      slots: {
        item: (s: ConversationsItemSlotScope) => [
          h('button', { class: 'r', onClick: s.rename }),
          h('button', { class: 'd', onClick: s.remove }),
        ],
      },
    });
    await w.findAll('.d')[1]!.trigger('click');
    expect(w.emitted('delete')?.at(-1)).toEqual(['c2']);

    await w.findAll('.r')[0]!.trigger('click');
    const input = w.find('.aix-conversations__edit-input');
    expect(input.exists()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe('会话一');
    // 重命名态优先于 #item：该行不再渲染自定义内容
    expect(w.findAll('.r').length).toBe(1);
  });

  it('#item-actions 只替换操作区，内置标题按钮保留', async () => {
    const w = mount(Conversations, {
      props: { items: slotItems },
      slots: {
        'item-actions': (s: ConversationsItemSlotScope) =>
          h('button', { class: 'pin' }, `pin-${s.item.id}`),
      },
    });
    expect(w.findAll('.aix-conversations__label').length).toBe(2);
    expect(w.findAll('.pin').map((b) => b.text())).toEqual(['pin-c1', 'pin-c2']);
    // 内置重命名 / 删除按钮让位，但操作区容器（hover 显隐载体）保留
    expect(w.find('.aix-conversations__action').exists()).toBe(false);
    expect(w.findAll('.aix-conversations__actions').length).toBe(2);
  });

  it('#empty 用 searching 区分「无会话」与「搜索无结果」', async () => {
    const w = mount(Conversations, {
      props: { items: [], searchable: true },
      slots: { empty: (s: { searching: boolean }) => h('i', { class: 'em' }, String(s.searching)) },
    });
    expect(w.find('.em').text()).toBe('false');

    await w.setProps({ items: slotItems });
    await w.find('.aix-conversations__search-input').setValue('不存在的会话');
    expect(w.find('.em').text()).toBe('true');
  });

  it('不提供任何插槽时行为与此前完全一致（零破坏性）', () => {
    const w = mount(Conversations, { props: { items: slotItems } });
    expect(w.findAll('.aix-conversations__label').map((b) => b.text())).toEqual([
      '会话一',
      '会话二',
    ]);
    expect(w.findAll('.aix-conversations__action').length).toBe(4);
  });
});
