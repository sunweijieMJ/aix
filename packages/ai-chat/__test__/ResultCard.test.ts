import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ResultCard from '../src/components/ResultCard.vue';

describe('ResultCard', () => {
  it('渲染标题与默认内容 slot', () => {
    const w = mount(ResultCard, {
      props: { title: '单项选择题' },
      slots: { default: '<p class="c">题干内容</p>' },
    });
    expect(w.find('.aix-result-card__title').text()).toBe('单项选择题');
    expect(w.find('.aix-result-card__body .c').text()).toBe('题干内容');
  });

  it('editable=false 不显示编辑按钮', () => {
    const w = mount(ResultCard, { props: { title: 'x' } });
    expect(w.find('.aix-result-card__edit').exists()).toBe(false);
  });

  it('editable=true 显示编辑按钮，点击 emit edit', async () => {
    const w = mount(ResultCard, { props: { title: 'x', editable: true } });
    const edit = w.find('.aix-result-card__edit');
    expect(edit.exists()).toBe(true);
    await edit.trigger('click');
    expect(w.emitted('edit')).toHaveLength(1);
  });

  it('actions slot：提供时渲染操作区，不提供则无', () => {
    const withActions = mount(ResultCard, {
      props: { title: 'x' },
      slots: { actions: '<button class="del">删除</button>' },
    });
    expect(withActions.find('.aix-result-card__actions .del').exists()).toBe(true);
    const noActions = mount(ResultCard, { props: { title: 'x' } });
    expect(noActions.find('.aix-result-card__actions').exists()).toBe(false);
  });

  it('无 title/editable/slot 时不渲染头部', () => {
    const w = mount(ResultCard, { slots: { default: '正文' } });
    expect(w.find('.aix-result-card__head').exists()).toBe(false);
  });
});
