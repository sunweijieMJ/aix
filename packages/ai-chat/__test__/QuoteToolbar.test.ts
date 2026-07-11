import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, it, expect, afterEach } from 'vitest';
import { nextTick } from 'vue';
import QuoteToolbar from '../src/components/quote/QuoteToolbar.vue';
import type { ResolvedQuoteAction } from '../src/types';

const getAnchorRect = () => new DOMRect(10, 10, 100, 20);

let mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.forEach((w) => w.unmount());
  mounted = [];
});

const mountToolbar = (items: ResolvedQuoteAction[]) => {
  const w = mount(QuoteToolbar, {
    props: { items, getAnchorRect },
    attachTo: document.body,
  });
  mounted.push(w);
  return w;
};

const tabbables = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('.aix-quote-toolbar__btn')).filter(
    (b) => b.tabIndex === 0,
  );

// 回归：focusIndex 初始 0 且从不随 items 变化重置——items 缩短后越界时所有按钮
// tabindex=-1（Tab 无法进入工具条）；首项 disabled 时 tabindex=0 落在不可聚焦元素上
describe('QuoteToolbar roving tabindex', () => {
  it('items 缩短使 focusIndex 越界后，仍有按钮 tabindex=0 可 Tab 进入', async () => {
    const w = mountToolbar([
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ]);
    // 箭头把 roving 移到最后一项
    document
      .querySelector('.aix-quote-toolbar')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await nextTick();
    // items 动态缩短为 1 项：旧 focusIndex=1 越界
    await w.setProps({ items: [{ key: 'a', label: 'A' }] });
    await nextTick();
    expect(tabbables()).toHaveLength(1);
  });

  it('首项 disabled 时 tabindex=0 落在首个可用项上', async () => {
    mountToolbar([
      { key: 'a', label: 'A', disabled: true },
      { key: 'b', label: 'B' },
    ]);
    await nextTick();
    const on = tabbables();
    expect(on).toHaveLength(1);
    expect(on[0]!.disabled).toBe(false);
  });

  it('箭头导航跳过 disabled 项', async () => {
    mountToolbar([
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B', disabled: true },
      { key: 'c', label: 'C' },
    ]);
    await nextTick();
    document
      .querySelector('.aix-quote-toolbar')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await nextTick();
    const on = tabbables();
    expect(on).toHaveLength(1);
    expect(on[0]!.getAttribute('aria-label')).toBe('C');
  });
});
