import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../src';

describe('Button 组件', () => {
  describe('渲染测试', () => {
    it('应该正确渲染默认按钮', () => {
      const wrapper = mount(Button, {
        slots: {
          default: '点击我',
        },
      });

      expect(wrapper.text()).toBe('点击我');
      expect(wrapper.classes()).toContain('aix-button');
      expect(wrapper.classes()).toContain('aix-button--default');
      expect(wrapper.classes()).toContain('aix-button--medium');
    });

    it('应该正确渲染插槽内容', () => {
      const wrapper = mount(Button, {
        slots: {
          default: '<span class="custom-content">自定义内容</span>',
        },
      });

      expect(wrapper.find('.custom-content').exists()).toBe(true);
      expect(wrapper.find('.custom-content').text()).toBe('自定义内容');
    });
  });

  describe('类型属性测试', () => {
    it('应该支持 primary 类型', () => {
      const wrapper = mount(Button, {
        props: { type: 'primary' },
      });

      expect(wrapper.classes()).toContain('aix-button--primary');
    });

    it('应该支持 dashed 类型', () => {
      const wrapper = mount(Button, {
        props: { type: 'dashed' },
      });

      expect(wrapper.classes()).toContain('aix-button--dashed');
    });

    it('应该支持 text 类型', () => {
      const wrapper = mount(Button, {
        props: { type: 'text' },
      });

      expect(wrapper.classes()).toContain('aix-button--text');
    });

    it('应该支持 link 类型', () => {
      const wrapper = mount(Button, {
        props: { type: 'link' },
      });

      expect(wrapper.classes()).toContain('aix-button--link');
    });
  });

  describe('尺寸属性测试', () => {
    it('应该支持 small 尺寸', () => {
      const wrapper = mount(Button, {
        props: { size: 'small' },
      });

      expect(wrapper.classes()).toContain('aix-button--small');
    });

    it('应该支持 medium 尺寸（默认）', () => {
      const wrapper = mount(Button);

      expect(wrapper.classes()).toContain('aix-button--medium');
    });

    it('应该支持 large 尺寸', () => {
      const wrapper = mount(Button, {
        props: { size: 'large' },
      });

      expect(wrapper.classes()).toContain('aix-button--large');
    });
  });

  describe('禁用状态测试', () => {
    it('应该正确应用禁用状态', () => {
      const wrapper = mount(Button, {
        props: { disabled: true },
      });

      expect(wrapper.classes()).toContain('aix-button--disabled');
      expect(wrapper.attributes('disabled')).toBeDefined();
    });

    it('禁用状态下不应该触发点击事件', async () => {
      const onClick = vi.fn();
      const wrapper = mount(Button, {
        props: {
          disabled: true,
        },
        attrs: {
          onClick,
        },
      });

      await wrapper.trigger('click');
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('加载状态测试', () => {
    it('应该正确显示加载状态', () => {
      const wrapper = mount(Button, {
        props: { loading: true },
      });

      expect(wrapper.classes()).toContain('aix-button--loading');
      expect(wrapper.find('.aix-button__loading').exists()).toBe(true);
      expect(wrapper.find('.aix-button__loading-icon').exists()).toBe(true);
    });

    it('加载状态下应该禁用按钮', () => {
      const wrapper = mount(Button, {
        props: { loading: true },
      });

      expect(wrapper.attributes('disabled')).toBeDefined();
    });

    it('加载状态下不应该触发点击事件', async () => {
      const onClick = vi.fn();
      const wrapper = mount(Button, {
        props: {
          loading: true,
        },
        attrs: {
          onClick,
        },
      });

      await wrapper.trigger('click');
      expect(onClick).not.toHaveBeenCalled();
    });

    it('加载状态下应该显示加载图标和内容', () => {
      const wrapper = mount(Button, {
        props: { loading: true },
        slots: {
          default: '提交',
        },
      });

      expect(wrapper.find('.aix-button__loading').exists()).toBe(true);
      expect(wrapper.find('.aix-button__content').text()).toBe('提交');
    });
  });

  describe('点击事件测试', () => {
    it('应该正确触发点击事件', async () => {
      const onClick = vi.fn();
      const wrapper = mount(Button, {
        attrs: {
          onClick,
        },
      });

      await wrapper.trigger('click');
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('点击事件应该传递 MouseEvent 对象', async () => {
      let event: MouseEvent | null = null;
      const wrapper = mount(Button, {
        attrs: {
          onClick: (e: MouseEvent) => {
            event = e;
          },
        },
      });

      await wrapper.trigger('click');
      expect(event).toBeInstanceOf(MouseEvent);
    });

    it('多次点击应该触发多次事件', async () => {
      const onClick = vi.fn();
      const wrapper = mount(Button, {
        attrs: {
          onClick,
        },
      });

      await wrapper.trigger('click');
      await wrapper.trigger('click');
      await wrapper.trigger('click');

      expect(onClick).toHaveBeenCalledTimes(3);
    });
  });

  describe('组合状态测试', () => {
    it('应该同时支持 type 和 size', () => {
      const wrapper = mount(Button, {
        props: {
          type: 'primary',
          size: 'large',
        },
      });

      expect(wrapper.classes()).toContain('aix-button--primary');
      expect(wrapper.classes()).toContain('aix-button--large');
    });

    it('禁用和加载状态可以同时存在', () => {
      const wrapper = mount(Button, {
        props: {
          disabled: true,
          loading: true,
        },
      });

      expect(wrapper.classes()).toContain('aix-button--disabled');
      expect(wrapper.classes()).toContain('aix-button--loading');
      expect(wrapper.attributes('disabled')).toBeDefined();
    });

    it('不同类型和尺寸的组合应该正确渲染', () => {
      const combinations = [
        { type: 'primary', size: 'small' },
        { type: 'dashed', size: 'medium' },
        { type: 'text', size: 'large' },
        { type: 'link', size: 'small' },
      ] as const;

      combinations.forEach(({ type, size }) => {
        const wrapper = mount(Button, {
          props: { type, size },
        });

        expect(wrapper.classes()).toContain(`aix-button--${type}`);
        expect(wrapper.classes()).toContain(`aix-button--${size}`);
      });
    });
  });

  describe('Props 默认值测试', () => {
    it('应该使用正确的默认 props 值', () => {
      const wrapper = mount(Button);

      expect(wrapper.classes()).toContain('aix-button--default');
      expect(wrapper.classes()).toContain('aix-button--medium');
      expect(wrapper.classes()).not.toContain('aix-button--disabled');
      expect(wrapper.classes()).not.toContain('aix-button--loading');
    });
  });

  describe('无障碍性测试', () => {
    it('button 元素应该存在', () => {
      const wrapper = mount(Button);
      expect(wrapper.element.tagName).toBe('BUTTON');
    });

    it('禁用状态应该设置 disabled 属性', () => {
      const wrapper = mount(Button, {
        props: { disabled: true },
      });

      expect(wrapper.element.getAttribute('disabled')).not.toBeNull();
    });
  });

  describe('样式类测试', () => {
    it('所有按钮都应该有基础类名', () => {
      const types = ['primary', 'default', 'dashed', 'text', 'link'] as const;

      types.forEach((type) => {
        const wrapper = mount(Button, {
          props: { type },
        });

        expect(wrapper.classes()).toContain('aix-button');
      });
    });

    it('应该正确应用内容包裹类', () => {
      const wrapper = mount(Button, {
        slots: { default: 'Content' },
      });

      expect(wrapper.find('.aix-button__content').exists()).toBe(true);
      expect(wrapper.find('.aix-button__content').text()).toBe('Content');
    });
  });

  describe('边缘情况测试', () => {
    it('空内容时应该正常渲染', () => {
      const wrapper = mount(Button);
      expect(wrapper.exists()).toBe(true);
    });

    it('长文本内容应该正常显示', () => {
      const longText = '这是一段很长很长很长很长很长的按钮文字内容';
      const wrapper = mount(Button, {
        slots: { default: longText },
      });

      expect(wrapper.text()).toBe(longText);
    });

    it('包含 HTML 的插槽应该正确渲染', () => {
      const wrapper = mount(Button, {
        slots: {
          default: '<strong>Bold</strong> <em>Italic</em>',
        },
      });

      expect(wrapper.find('strong').exists()).toBe(true);
      expect(wrapper.find('em').exists()).toBe(true);
    });
  });
});
