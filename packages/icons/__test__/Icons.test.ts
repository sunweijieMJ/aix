import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AttachFile from '../src/File/AttachFile.vue';
import Add from '../src/General/Add.vue';
import Movie from '../src/Video/Movie.vue';

// 所有抽样图标共享相同的 Props 接口和默认值，统一测试
const iconComponents = [
  { name: 'Add', component: Add, category: 'General' },
  { name: 'Movie', component: Movie, category: 'Video' },
  { name: 'AttachFile', component: AttachFile, category: 'File' },
] as const;

describe('Icons 图标组件', () => {
  describe('基础渲染', () => {
    it.each(iconComponents)('$name ($category) 应该渲染 SVG 元素', ({ component }) => {
      const wrapper = mount(component);
      const svg = wrapper.find('svg');

      expect(svg.exists()).toBe(true);
      expect(svg.attributes('viewBox')).toBe('0 0 24 24');
      expect(svg.attributes('xmlns')).toBe('http://www.w3.org/2000/svg');
    });

    it.each(iconComponents)(
      '$name ($category) 应该包含 path 且 fill 为 currentColor',
      ({ component }) => {
        const wrapper = mount(component);
        const path = wrapper.find('path');

        expect(path.exists()).toBe(true);
        expect(path.attributes('fill')).toBe('currentColor');
      },
    );
  });

  describe('Props 默认值', () => {
    it.each(iconComponents)('$name ($category) 默认 width 应为 1em', ({ component }) => {
      const wrapper = mount(component);
      const svg = wrapper.find('svg');

      expect(svg.attributes('width')).toBe('1em');
    });

    it.each(iconComponents)('$name ($category) 默认 height 应为 1em', ({ component }) => {
      const wrapper = mount(component);
      const svg = wrapper.find('svg');

      expect(svg.attributes('height')).toBe('1em');
    });

    it.each(iconComponents)('$name ($category) 默认 color 应为 currentColor', ({ component }) => {
      const wrapper = mount(component);
      const svg = wrapper.find('svg');

      expect(svg.element.style.color.toLowerCase()).toBe('currentcolor');
    });
  });

  describe('Props 自定义', () => {
    it('应该支持自定义字符串类型的 width 和 height', () => {
      const wrapper = mount(Add, {
        props: { width: '24px', height: '24px' },
      });
      const svg = wrapper.find('svg');

      expect(svg.attributes('width')).toBe('24px');
      expect(svg.attributes('height')).toBe('24px');
    });

    it('应该支持数字类型的 width 和 height', () => {
      const wrapper = mount(Add, {
        props: { width: 32, height: 32 },
      });
      const svg = wrapper.find('svg');

      expect(svg.attributes('width')).toBe('32');
      expect(svg.attributes('height')).toBe('32');
    });

    it('应该支持自定义 color', () => {
      const wrapper = mount(Add, {
        props: { color: '#ff0000' },
      });
      const svg = wrapper.find('svg');

      expect(svg.element.style.color).toBe('rgb(255, 0, 0)');
    });

    it('应该同时支持自定义 width、height 和 color', () => {
      const wrapper = mount(Movie, {
        props: { width: '2em', height: '2em', color: 'blue' },
      });
      const svg = wrapper.find('svg');

      expect(svg.attributes('width')).toBe('2em');
      expect(svg.attributes('height')).toBe('2em');
      expect(svg.element.style.color).toBe('blue');
    });
  });

  describe('$attrs 透传', () => {
    it('应该透传 class 属性', () => {
      const wrapper = mount(Add, {
        attrs: { class: 'custom-icon' },
      });
      const svg = wrapper.find('svg');

      expect(svg.classes()).toContain('custom-icon');
    });

    it('应该透传 id 属性', () => {
      const wrapper = mount(Add, {
        attrs: { id: 'icon-add' },
      });
      const svg = wrapper.find('svg');

      expect(svg.attributes('id')).toBe('icon-add');
    });

    it('应该透传 aria-label 属性', () => {
      const wrapper = mount(Movie, {
        attrs: { 'aria-label': '电影图标' },
      });
      const svg = wrapper.find('svg');

      expect(svg.attributes('aria-label')).toBe('电影图标');
    });

    it('应该透传 data-* 属性', () => {
      const wrapper = mount(AttachFile, {
        attrs: { 'data-testid': 'attach-icon', 'data-type': 'file' },
      });
      const svg = wrapper.find('svg');

      expect(svg.attributes('data-testid')).toBe('attach-icon');
      expect(svg.attributes('data-type')).toBe('file');
    });
  });

  describe('分类抽样验证', () => {
    it('General 分类: Add 图标应正确渲染', () => {
      const wrapper = mount(Add);

      expect(wrapper.find('svg').exists()).toBe(true);
      expect(wrapper.find('path').exists()).toBe(true);
      expect(wrapper.find('svg').attributes('viewBox')).toBe('0 0 24 24');
    });

    it('Video 分类: Movie 图标应正确渲染', () => {
      const wrapper = mount(Movie);

      expect(wrapper.find('svg').exists()).toBe(true);
      expect(wrapper.find('path').exists()).toBe(true);
      expect(wrapper.find('svg').attributes('viewBox')).toBe('0 0 24 24');
    });

    it('File 分类: AttachFile 图标应正确渲染', () => {
      const wrapper = mount(AttachFile);

      expect(wrapper.find('svg').exists()).toBe(true);
      expect(wrapper.find('path').exists()).toBe(true);
      expect(wrapper.find('svg').attributes('viewBox')).toBe('0 0 24 24');
    });
  });
});
