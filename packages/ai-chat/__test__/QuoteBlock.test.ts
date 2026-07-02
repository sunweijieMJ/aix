import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import QuoteBlock from '../src/components/blocks/QuoteBlock.vue';
import Bubble from '../src/components/Bubble.vue';
import { QUOTE_LOCATE_KEY } from '../src/composables/useQuoteMenu';
import type { QuoteBlock as QuoteBlockType } from '../src/types';

const block: QuoteBlockType = {
  id: 'qb1',
  type: 'quote',
  quotes: [
    { id: 'q1', anchor: { source: { messageId: 'ai-1' }, exact: '引文一' }, intent: 'explain' },
    { id: 'q2', anchor: { source: { messageId: 'ai-2' }, exact: '引文二' } },
  ],
};

describe('QuoteBlock', () => {
  it('逐条渲染引用文本', () => {
    const w = mount(QuoteBlock, { props: { block } });
    const rows = w.findAll('.aix-quote-block__item');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('引文一');
  });

  it('点击某条引用调用注入的 locate；未注入时点击不抛错', async () => {
    const locate = vi.fn();
    const w = mount(QuoteBlock, {
      props: { block },
      global: { provide: { [QUOTE_LOCATE_KEY as symbol]: locate } },
    });
    await w.findAll('.aix-quote-block__item')[1]!.trigger('click');
    expect(locate).toHaveBeenCalledWith(block.quotes[1]);

    const w2 = mount(QuoteBlock, { props: { block } });
    await expect(w2.find('.aix-quote-block__item').trigger('click')).resolves.not.toThrow();
  });

  it('注入 locate 时条目可键盘聚焦并触发 locate；未注入时不可聚焦', async () => {
    const locate = vi.fn();
    const w = mount(QuoteBlock, {
      props: { block },
      global: { provide: { [QUOTE_LOCATE_KEY as symbol]: locate } },
    });
    const item = w.findAll('.aix-quote-block__item')[0]!;
    expect(item.attributes('role')).toBe('button');
    expect(item.attributes('tabindex')).toBe('0');

    await item.trigger('keydown.enter');
    expect(locate).toHaveBeenCalledWith(block.quotes[0]);

    locate.mockClear();
    await item.trigger('keydown.space');
    expect(locate).toHaveBeenCalledWith(block.quotes[0]);

    const w2 = mount(QuoteBlock, { props: { block } });
    const item2 = w2.find('.aix-quote-block__item');
    expect(item2.attributes('role')).toBeUndefined();
    expect(item2.attributes('tabindex')).toBeUndefined();
  });

  it('Bubble 对 quote 块走内置注册表渲染（不再 console.warn 未注册）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const w = mount(Bubble, { props: { itemKey: 'u1', role: 'user', content: [block] } });
    expect(w.find('.aix-quote-block').exists()).toBe(true);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('"quote"'));
    warn.mockRestore();
  });
});
