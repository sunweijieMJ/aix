import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import QuoteMenu from '../src/components/QuoteMenu.vue';
import type { ResolvedQuoteAction } from '../src/types';

const items: ResolvedQuoteAction[] = [
  { key: 'explain', label: '解释' },
  { key: 'copy', label: '复制' },
];
const getRect = () => new DOMRect(10, 10, 100, 20);

// Teleport 内容挂在 body 上，不随测试用例结束自动清理；显式记录并在 afterEach 卸载，
// 避免上一条用例遗留的 .aix-quote-toolbar/.aix-quote-sheet 污染下一条用例的 body 查询
// （与 ModelSelector.test.ts 的 attachTo + unmount 约定保持一致）。
let mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.forEach((w) => w.unmount());
  mounted = [];
});

const mountMenu = (props: Record<string, unknown> = {}) => {
  const w = mount(QuoteMenu, {
    props: { items, source: 'pointer', mode: 'selecting', getRect, ...props },
    attachTo: document.body,
  });
  mounted.push(w);
  return w;
};

describe('QuoteMenu 按 source 选皮肤', () => {
  it('pointer → toolbar 皮肤（role=toolbar，Teleport 到 body）', () => {
    mountMenu();
    const toolbar = document.body.querySelector('.aix-quote-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar!.getAttribute('role')).toBe('toolbar');
    expect(toolbar!.querySelectorAll('button')).toHaveLength(2);
  });

  it('longpress → sheet 皮肤', () => {
    mountMenu({ source: 'longpress', mode: 'menu', point: { x: 5, y: 5 }, getRect: undefined });
    expect(document.body.querySelector('.aix-quote-sheet')).not.toBeNull();
    expect(document.body.querySelector('.aix-quote-toolbar')).toBeNull();
  });

  it('点击按钮 emit invoke(key)；Escape emit close', async () => {
    const w = mountMenu();
    const btns = document.body.querySelectorAll<HTMLButtonElement>('.aix-quote-toolbar button');
    btns[1]!.click();
    expect(w.emitted('invoke')).toEqual([['copy']]);
    document.body
      .querySelector('.aix-quote-toolbar')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('toolbar roving tabindex：仅一个按钮 tabindex=0，方向键移动', async () => {
    mountMenu();
    const toolbar = document.body.querySelector('.aix-quote-toolbar')!;
    const tabs = () =>
      Array.from(toolbar.querySelectorAll('button')).map((b) => b.getAttribute('tabindex'));
    expect(tabs()).toEqual(['0', '-1']);
    toolbar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await vi.waitFor(() => expect(tabs()).toEqual(['-1', '0']));
  });

  it('自定义 sheet 组件替换单端皮肤（quote.sheet 深度换肤口）', () => {
    const FakeSheet = defineComponent({
      props: ['items'],
      setup: (p: { items: ResolvedQuoteAction[] }) => () =>
        h('div', { class: 'fake-sheet' }, p.items.length),
    });
    mountMenu({ source: 'longpress', mode: 'menu', point: { x: 0, y: 0 }, sheet: FakeSheet });
    expect(document.body.querySelector('.fake-sheet')).not.toBeNull();
  });

  it('longpress/sheet 皮肤：点击 sheet 外部 → emit close（无 PC 侧选区折叠即关的天然闭合路径）', () => {
    const w = mountMenu({
      source: 'longpress',
      mode: 'menu',
      point: { x: 5, y: 5 },
      getRect: undefined,
    });
    expect(document.body.querySelector('.aix-quote-sheet')).not.toBeNull();
    // useClickOutside 内部监听 document 的 capture 阶段 pointerdown
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('longpress/sheet 皮肤：点击 sheet 内部按钮不应 emit close', () => {
    const w = mountMenu({
      source: 'longpress',
      mode: 'menu',
      point: { x: 5, y: 5 },
      getRect: undefined,
    });
    const sheet = document.body.querySelector('.aix-quote-sheet')!;
    sheet.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(w.emitted('close')).toBeUndefined();
  });
});
