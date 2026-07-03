import { mount } from '@vue/test-utils';
import { describe, it, expect, afterEach } from 'vitest';
import TriggerMenu from '../src/components/TriggerMenu.vue';
import type { TriggerItem } from '../src/types';

const items: TriggerItem[] = [
  { value: 'a', label: '张三', description: '数学老师' },
  { value: 'b', label: '李四' },
];
const anchor = () => new DOMRect(0, 0, 10, 10);
const base = { items, loading: false, activeIndex: 0, menuId: 'm1', getAnchorRect: anchor };

// 菜单 Teleport 到 body（脱出 transform 祖先包含块），wrapper.find 查不到传送内容，
// 一律用 document 查询；每例后卸载防止传送节点跨用例残留污染断言
let wrappers: ReturnType<typeof mount>[] = [];
const mountMenu = (props: typeof base) => {
  const w = mount(TriggerMenu, { props });
  wrappers.push(w);
  return w;
};
afterEach(() => {
  wrappers.forEach((w) => w.unmount());
  wrappers = [];
});

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];

describe('TriggerMenu', () => {
  it('渲染 listbox 与 option（id 约定 menuId-option-i），active 项带 is-active/aria-selected', () => {
    mountMenu({ ...base, activeIndex: 1 });
    expect(q('[role="listbox"]')?.id).toBe('m1');
    const opts = qa('[role="option"]');
    expect(opts.length).toBe(2);
    const [opt0, opt1] = opts;
    expect(opt0?.id).toBe('m1-option-0');
    expect(opt1?.classList).toContain('is-active');
    expect(opt1?.getAttribute('aria-selected')).toBe('true');
    expect(q('[role="listbox"]')?.textContent).toContain('数学老师');
  });

  it('点击项 emit select；mouseenter emit update:activeIndex', async () => {
    const w = mountMenu(base);
    const opt1 = qa('[role="option"]')[1]!;
    opt1.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await Promise.resolve();
    expect(w.emitted('update:activeIndex')).toBeDefined();
    expect(w.emitted('update:activeIndex')![0]).toEqual([1]);
    opt1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(w.emitted('select')).toBeDefined();
    expect(w.emitted('select')![0]).toEqual([items[1]]);
  });

  it('loading 显示加载态；空 items 显示空态', () => {
    mountMenu({ ...base, loading: true });
    expect(q('[role="listbox"]')?.textContent).toContain('加载中');
    wrappers.forEach((w) => w.unmount());
    wrappers = [];
    mountMenu({ ...base, items: [] });
    expect(q('[role="listbox"]')?.textContent).toContain('无匹配结果');
    expect(qa('[role="option"]')).toHaveLength(0);
  });

  it('传送到 body：菜单不在组件宿主内、卸载后不残留', () => {
    const w = mountMenu(base);
    const menu = q('[role="listbox"]');
    expect(menu?.parentElement).toBe(document.body);
    expect(w.element.contains(menu)).toBe(false);
    w.unmount();
    wrappers = [];
    expect(q('[role="listbox"]')).toBeNull();
  });
});
