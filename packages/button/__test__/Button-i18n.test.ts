import { createLocale } from '@aix/hooks';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import Button from '../src/Button.vue';

describe('Button i18n', () => {
  beforeEach(() => {
    // 每个测试前重置
    createLocale('zh-CN');
  });

  it('should render with Chinese text', () => {
    const app = createApp({
      template: '<div></div>',
    });

    const { install } = createLocale('zh-CN');
    app.use({ install });

    const wrapper = mount(Button, {
      slots: {
        default: '按钮',
      },
      global: {
        plugins: [{ install }],
      },
    });

    expect(wrapper.text()).toContain('按钮');
  });

  it('should use locale from global context', () => {
    const { install } = createLocale('zh-CN');

    const wrapper = mount(Button, {
      slots: {
        default: '测试',
      },
      global: {
        plugins: [{ install }],
      },
    });

    expect(wrapper.vm).toBeTruthy();
    expect(wrapper.text()).toContain('测试');
  });

  it('should handle loading state with locale', () => {
    const { install } = createLocale('zh-CN');

    const wrapper = mount(Button, {
      props: {
        loading: true,
      },
      slots: {
        default: '加载中',
      },
      global: {
        plugins: [{ install }],
      },
    });

    expect(wrapper.find('.aix-button--loading').exists()).toBe(true);
    expect(wrapper.find('.aix-button__loading').exists()).toBe(true);
  });

  it('should switch locale correctly', async () => {
    const { localeContext, install } = createLocale('zh-CN');

    const wrapper = mount(Button, {
      slots: {
        default: '按钮',
      },
      global: {
        plugins: [{ install }],
      },
    });

    // 初始状态
    expect(wrapper.text()).toContain('按钮');

    // 切换语言
    localeContext.setLocale('en-US');
    await nextTick();

    // 语言切换后，vm 应该仍然正常工作
    expect(wrapper.vm).toBeTruthy();
  });

  it('should render different button types', () => {
    const { install } = createLocale('zh-CN');

    const types = ['primary', 'default', 'dashed', 'text', 'link'] as const;

    types.forEach((type) => {
      const wrapper = mount(Button, {
        props: { type },
        slots: {
          default: '按钮',
        },
        global: {
          plugins: [{ install }],
        },
      });

      expect(wrapper.classes()).toContain(`aix-button--${type}`);
    });
  });

  it('should render different sizes', () => {
    const { install } = createLocale('zh-CN');

    const sizes = ['small', 'medium', 'large'] as const;

    sizes.forEach((size) => {
      const wrapper = mount(Button, {
        props: { size },
        slots: {
          default: '按钮',
        },
        global: {
          plugins: [{ install }],
        },
      });

      expect(wrapper.classes()).toContain(`aix-button--${size}`);
    });
  });

  it('should handle disabled state', () => {
    const { install } = createLocale('zh-CN');

    const wrapper = mount(Button, {
      props: {
        disabled: true,
      },
      slots: {
        default: '禁用按钮',
      },
      global: {
        plugins: [{ install }],
      },
    });

    expect(wrapper.classes()).toContain('aix-button--disabled');
    expect(wrapper.element.disabled).toBe(true);
  });

  it('should emit click event', async () => {
    const { install } = createLocale('zh-CN');

    const wrapper = mount(Button, {
      props: {},
      slots: {
        default: '点击',
      },
      global: {
        plugins: [{ install }],
      },
    });

    await wrapper.trigger('click');

    expect(wrapper.emitted('click')).toBeTruthy();
    expect(wrapper.emitted('click')?.length).toBe(1);
  });

  it('should not emit click when disabled', async () => {
    const { install } = createLocale('zh-CN');

    const wrapper = mount(Button, {
      props: {
        disabled: true,
      },
      slots: {
        default: '禁用',
      },
      global: {
        plugins: [{ install }],
      },
    });

    await wrapper.trigger('click');

    expect(wrapper.emitted('click')).toBeFalsy();
  });

  it('should not emit click when loading', async () => {
    const { install } = createLocale('zh-CN');

    const wrapper = mount(Button, {
      props: {
        loading: true,
      },
      slots: {
        default: '加载中',
      },
      global: {
        plugins: [{ install }],
      },
    });

    await wrapper.trigger('click');

    expect(wrapper.emitted('click')).toBeFalsy();
  });
});
