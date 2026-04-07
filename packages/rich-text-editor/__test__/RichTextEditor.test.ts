import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { RichTextEditor } from '../src';

describe('RichTextEditor 组件', () => {
  describe('渲染测试', () => {
    it('应该正确渲染根元素', () => {
      const wrapper = mount(RichTextEditor);
      expect(wrapper.find('.aix-rich-text-editor').exists()).toBe(true);
    });

    it('应该渲染编辑区域容器', () => {
      const wrapper = mount(RichTextEditor);
      expect(wrapper.find('.aix-rich-text-editor__content').exists()).toBe(true);
    });
  });

  describe('Props 测试', () => {
    it('禁用状态应有对应 class', () => {
      const wrapper = mount(RichTextEditor, {
        props: { disabled: true },
      });
      expect(wrapper.find('.aix-rich-text-editor--disabled').exists()).toBe(true);
    });

    it('只读状态应有对应 class', () => {
      const wrapper = mount(RichTextEditor, {
        props: { readonly: true },
      });
      expect(wrapper.find('.aix-rich-text-editor--readonly').exists()).toBe(true);
    });

    it('height prop 应设置固定高度', () => {
      const wrapper = mount(RichTextEditor, {
        props: { height: '500px' },
      });
      const style = wrapper.find('.aix-rich-text-editor').attributes('style');
      expect(style).toContain('height: 500px');
    });

    it('minHeight 默认值应为 200px', () => {
      const wrapper = mount(RichTextEditor);
      const style = wrapper.find('.aix-rich-text-editor').attributes('style');
      expect(style).toContain('min-height: 200px');
    });

    it('不应显示字符统计（默认未启用）', () => {
      const wrapper = mount(RichTextEditor);
      expect(wrapper.find('.aix-rich-text-editor__footer').exists()).toBe(false);
    });
  });

  describe('快照测试', () => {
    it('默认状态快照', () => {
      const wrapper = mount(RichTextEditor);
      expect(wrapper.html()).toMatchSnapshot();
    });
  });
});
