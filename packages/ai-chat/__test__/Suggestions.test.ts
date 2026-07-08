import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Suggestions from '../src/components/Suggestions.vue';
import type { SuggestionItem } from '../src/types';

const items: SuggestionItem[] = [
  { text: '它的参数怎么传？' },
  { text: 'rate-limit', label: '有限流机制吗？' },
];

describe('Suggestions', () => {
  it('渲染 chips：label 缺省取 text', () => {
    const w = mount(Suggestions, { props: { items } });
    const chips = w.findAll('.aix-suggestions__item');
    expect(chips).toHaveLength(2);
    expect(chips[0]!.text()).toBe('它的参数怎么传？');
    expect(chips[1]!.text()).toBe('有限流机制吗？');
  });

  it('点击 emit select 携带原 item', async () => {
    const w = mount(Suggestions, { props: { items } });
    await w.findAll('.aix-suggestions__item')[1]!.trigger('click');
    expect(w.emitted('select')![0]).toEqual([items[1]]);
  });

  it('默认插槽自定义单项外观', () => {
    const w = mount(Suggestions, {
      props: { items },
      slots: { default: `<template #default="{ item }"><b>自定义{{ item.text }}</b></template>` },
    });
    expect(w.find('b').text()).toBe('自定义它的参数怎么传？');
  });

  it('loading=true 时渲染 3 个骨架胶囊，不渲染真实 items', () => {
    const w = mount(Suggestions, { props: { items, loading: true } });
    expect(w.findAll('.aix-skeleton')).toHaveLength(3);
    expect(w.find('.aix-suggestions__item').exists()).toBe(false);
  });
});
