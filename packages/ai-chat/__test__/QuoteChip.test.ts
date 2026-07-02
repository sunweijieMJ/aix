import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import QuoteChip from '../src/components/QuoteChip.vue';
import type { Quote } from '../src/types';

const quote: Quote = {
  id: 'q1',
  anchor: { source: { messageId: 'ai-1' }, exact: '这是一段被引用的很长很长的文本内容' },
  intent: 'explain',
};

describe('QuoteChip', () => {
  it('渲染 intent 标签与 exact 文本', () => {
    const w = mount(QuoteChip, { props: { quote } });
    expect(w.text()).toContain('解释');
    expect(w.text()).toContain('这是一段被引用的');
  });

  it('点击主体 emit locate(quote)，点 × emit remove', async () => {
    const w = mount(QuoteChip, { props: { quote } });
    await w.find('.aix-quote-chip__body').trigger('click');
    expect(w.emitted('locate')).toEqual([[quote]]);
    await w.find('.aix-quote-chip__remove').trigger('click');
    expect(w.emitted('remove')).toHaveLength(1);
  });

  it('自定义 intent 原样展示，无 intent 不渲染标签', () => {
    const w1 = mount(QuoteChip, { props: { quote: { ...quote, intent: '错题本' } } });
    expect(w1.text()).toContain('错题本');
    const w2 = mount(QuoteChip, { props: { quote: { ...quote, intent: undefined } } });
    expect(w2.find('.aix-quote-chip__intent').exists()).toBe(false);
  });
});
