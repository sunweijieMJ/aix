import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Conversations from '../src/components/Conversations.vue';
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
    // 初始 a 激活
    expect(itemEls[0].classes()).toContain('is-active');
    // 点击 b
    await itemEls[1].trigger('click');
    expect(w.emitted('update:activeKey')?.[0]).toEqual(['b']);
  });

  it('点击删除按钮 emit delete(id)', async () => {
    const w = mount(Conversations, { props: { items, activeKey: 'a' } });
    const firstItem = w.findAll('.aix-conversations__item')[0];
    const delBtn = firstItem.findAll('.aix-conversations__action')[1]; // 第二个为删除
    await delBtn.trigger('click');
    expect(w.emitted('delete')?.[0]).toEqual(['a']);
  });

  it('行内重命名：编辑后回车 emit rename(id, label)，且不切换选中', async () => {
    const w = mount(Conversations, { props: { items, activeKey: 'a' } });
    const firstItem = w.findAll('.aix-conversations__item')[0];
    const renameBtn = firstItem.findAll('.aix-conversations__action')[0]; // 第一个为重命名
    await renameBtn.trigger('click');
    const input = w.find('.aix-conversations__edit-input');
    expect(input.exists()).toBe(true);
    await input.setValue('梵高的向日葵');
    await input.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('rename')?.[0]).toEqual(['a', '梵高的向日葵']);
    // 重命名点击不应触发选中切换
    expect(w.emitted('update:activeKey')).toBeUndefined();
  });

  it('重命名为空白时不 emit rename', async () => {
    const w = mount(Conversations, { props: { items, activeKey: 'a' } });
    const renameBtn = w
      .findAll('.aix-conversations__item')[0]
      .findAll('.aix-conversations__action')[0];
    await renameBtn.trigger('click');
    const input = w.find('.aix-conversations__edit-input');
    await input.setValue('   ');
    await input.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('rename')).toBeUndefined();
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
});
