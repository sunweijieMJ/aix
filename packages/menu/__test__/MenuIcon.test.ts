import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { h } from 'vue';
import { Menu, MenuGroup, MenuItem, SubMenu } from '../src';
import { IconStub, cleanupBody, groupLi, itemLi, mountMenu, subMenuLi } from './helpers';

let wrapper: VueWrapper | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  cleanupBody();
});

describe('图标来源', () => {
  it('字符串图标按字体图标类名渲染为 i，带业务 class 与 font 修饰类', () => {
    wrapper = mountMenu({
      props: { items: [{ key: 'a', label: 'A', icon: 'iconfont icon-home' }] },
    });
    const icon = itemLi(wrapper.element, 'A').querySelector('.aix-menu-item-content__icon > i')!;
    expect(icon.classList).toContain('aix-menu-item-icon--font');
    expect(icon.classList).toContain('iconfont');
    expect(icon.classList).toContain('icon-home');
  });

  it('含路径分隔符或 data 协议的字符串按图片地址渲染为 img', () => {
    wrapper = mountMenu({
      props: {
        items: [
          { key: 'a', label: 'A', icon: 'https://cdn.example.com/a.svg' },
          { key: 'b', label: 'B', icon: 'data:image/svg+xml;base64,PHN2Zy8+' },
          { key: 'c', label: 'C', icon: '/static/c.png' },
        ],
      },
    });
    const cases: Array<[string, string]> = [
      ['A', 'https://cdn.example.com/a.svg'],
      ['B', 'data:image/svg+xml;base64,PHN2Zy8+'],
      ['C', '/static/c.png'],
    ];
    for (const [label, src] of cases) {
      const img = itemLi(wrapper.element, label).querySelector<HTMLImageElement>(
        '.aix-menu-item-content__icon > img',
      )!;
      expect(img.classList).toContain('aix-menu-item-icon--img');
      expect(img.getAttribute('src')).toBe(src);
      expect(img.getAttribute('alt')).toBe('');
    }
  });

  it('组件图标仍按组件渲染', () => {
    wrapper = mountMenu({ props: { items: [{ key: 'a', label: 'A', icon: IconStub }] } });
    expect(itemLi(wrapper.element, 'A').querySelector('.icon-stub')).not.toBeNull();
  });

  it('SubMenu 触发项与弹层宽度判定同样接受字符串图标', () => {
    wrapper = mountMenu({
      props: {
        items: [
          {
            key: 'sub',
            label: 'Sub',
            icon: 'icon-folder',
            children: [{ key: 's1', label: 'S1', icon: 'icon-file' }],
          },
        ],
      },
    });
    expect(subMenuLi(wrapper.element, 'Sub').querySelector('i.icon-folder')).not.toBeNull();
  });
});

describe('分组图标', () => {
  it('数据驱动分组的 icon 渲染在标题文字之前', () => {
    wrapper = mountMenu({
      props: {
        items: [
          {
            key: 'g',
            type: 'group',
            label: 'G',
            icon: 'icon-g',
            children: [{ key: 'g1', label: 'G1' }],
          },
          { key: 'h', type: 'group', label: 'H', children: [{ key: 'h1', label: 'H1' }] },
        ],
      },
    });
    const title = groupLi(wrapper.element, 'G').querySelector('.aix-menu-group__title')!;
    const iconBox = title.querySelector('.aix-menu-group__icon')!;
    expect(iconBox.getAttribute('aria-hidden')).toBe('true');
    expect(iconBox.querySelector('i.icon-g')).not.toBeNull();
    expect(
      iconBox.compareDocumentPosition(title.querySelector('.aix-menu-group__title-text')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(groupLi(wrapper.element, 'H').querySelector('.aix-menu-group__icon')).toBeNull();
  });

  it('复合组件写法下 MenuGroup 的 icon prop 与 icon 插槽都能渲染标题图标', () => {
    wrapper = mount(Menu, {
      attachTo: document.body,
      slots: {
        default: () => [
          h(MenuGroup, { groupKey: 'a', title: 'A', icon: IconStub }, () => [
            h(MenuItem, { itemKey: 'a1', label: 'A1' }),
          ]),
          h(
            MenuGroup,
            { groupKey: 'b', title: 'B' },
            {
              default: () => [h(MenuItem, { itemKey: 'b1', label: 'B1' })],
              icon: () => h('i', { class: 'slot-group-icon' }),
            },
          ),
          h(SubMenu, { itemKey: 's', label: 'S', icon: 'icon-s' }, () => [
            h(MenuItem, { itemKey: 's1', label: 'S1' }),
          ]),
        ],
      },
    });
    expect(
      groupLi(wrapper.element, 'A').querySelector('.aix-menu-group__icon .icon-stub'),
    ).not.toBeNull();
    expect(
      groupLi(wrapper.element, 'B').querySelector('.aix-menu-group__icon .slot-group-icon'),
    ).not.toBeNull();
    expect(subMenuLi(wrapper.element, 'S').querySelector('i.icon-s')).not.toBeNull();
  });
});
