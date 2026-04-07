import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, inject, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import ThemeScope from '../src/vue/ThemeScope';
import { THEME_INJECTION_KEY, createTheme } from '../src/vue/theme-context';
import { darkAlgorithm, generateThemeTokens } from '../src/core/define-theme';
import type { ThemeContext } from '../src/vue/theme-context';

// 子组件：捕获 inject 的 ThemeContext
const ContextCapture = defineComponent({
  setup() {
    const ctx = inject(THEME_INJECTION_KEY);
    return { ctx };
  },
  render() {
    return h('span', 'child');
  },
});

describe('ThemeScope', () => {
  afterEach(() => {
    // 清理注入的 style 标签
    document.querySelectorAll('style[id*="aix-"]').forEach((el) => el.remove());
    document.documentElement.removeAttribute('data-theme');
  });

  it('should render slot content', () => {
    const { install } = createTheme({ persist: false });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      slots: {
        default: '<span class="inner">hello</span>',
      },
    });
    expect(wrapper.find('.inner').text()).toBe('hello');
    wrapper.unmount();
  });

  it('should provide scoped ThemeContext to children', () => {
    const { install } = createTheme({ persist: false });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      props: {
        config: { seed: { colorPrimary: 'rgb(255 0 0)' } },
      },
      slots: {
        default: h(ContextCapture),
      },
    });

    const child = wrapper.findComponent(ContextCapture);
    const ctx = child.vm.ctx as ThemeContext;

    expect(ctx).toBeDefined();
    expect(ctx.mode).toBe('light');
    // getToken 应返回 scoped 的 colorPrimary（经过 seed 派生，不是原始 rgb(255 0 0)）
    const primaryColor = ctx.getToken('colorPrimary');
    expect(primaryColor).toBeDefined();
    expect(typeof primaryColor).toBe('string');
    wrapper.unmount();
  });

  it('should resolve dark mode from algorithm', () => {
    const { install } = createTheme({ persist: false });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      props: {
        config: { algorithm: darkAlgorithm },
      },
      slots: {
        default: h(ContextCapture),
      },
    });

    const child = wrapper.findComponent(ContextCapture);
    const ctx = child.vm.ctx as ThemeContext;
    expect(ctx.mode).toBe('dark');
    wrapper.unmount();
  });

  it('should respect explicit mode prop', () => {
    const { install } = createTheme({ persist: false });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      props: {
        mode: 'dark',
      },
      slots: {
        default: h(ContextCapture),
      },
    });

    const child = wrapper.findComponent(ContextCapture);
    const ctx = child.vm.ctx as ThemeContext;
    expect(ctx.mode).toBe('dark');
    wrapper.unmount();
  });

  it('should generate unique scope class per instance', () => {
    const { install } = createTheme({ persist: false });
    const wrapper1 = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      slots: { default: '<span>1</span>' },
    });
    const wrapper2 = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      slots: { default: '<span>2</span>' },
    });

    const class1 = wrapper1
      .find('div')
      .classes()
      .find((c) => c.startsWith('aix-scope-'));
    const class2 = wrapper2
      .find('div')
      .classes()
      .find((c) => c.startsWith('aix-scope-'));

    expect(class1).toBeDefined();
    expect(class2).toBeDefined();
    expect(class1).not.toBe(class2);
    wrapper1.unmount();
    wrapper2.unmount();
  });

  it('should inherit parent mode when no mode/algorithm specified', () => {
    const { install, themeContext } = createTheme({
      persist: false,
      initialMode: 'dark',
    });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      slots: {
        default: h(ContextCapture),
      },
    });

    const child = wrapper.findComponent(ContextCapture);
    const ctx = child.vm.ctx as ThemeContext;
    // 当不指定 config/mode 时，从父级 context 继承 mode
    expect(ctx.mode).toBe(themeContext.mode);
    wrapper.unmount();
  });

  it('should update DOM when props change', async () => {
    const { install } = createTheme({ persist: false });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      props: {
        mode: 'light' as const,
      },
      slots: {
        default: h(ContextCapture),
      },
    });

    await wrapper.setProps({ mode: 'dark' });
    await nextTick();

    const child = wrapper.findComponent(ContextCapture);
    const ctx = child.vm.ctx as ThemeContext;
    expect(ctx.mode).toBe('dark');
    wrapper.unmount();
  });

  it('scoped context mutating methods should be no-ops', () => {
    const { install } = createTheme({ persist: false });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      slots: {
        default: h(ContextCapture),
      },
    });

    const child = wrapper.findComponent(ContextCapture);
    const ctx = child.vm.ctx as ThemeContext;

    // 所有写操作是 no-op，不应抛错
    expect(() => ctx.setMode('dark')).not.toThrow();
    expect(() => ctx.toggleMode()).not.toThrow();
    expect(() => ctx.applyTheme({})).not.toThrow();
    expect(() => ctx.reset()).not.toThrow();
    expect(() => ctx.setToken('colorPrimary', 'red')).not.toThrow();
    expect(() => ctx.setTokens({ colorPrimary: 'red' })).not.toThrow();
    expect(() => ctx.setTransition({ duration: 100 })).not.toThrow();
    expect(() => ctx.setComponentTheme('button', {})).not.toThrow();
    expect(() => ctx.removeComponentTheme('button')).not.toThrow();

    // mode 不应被 setMode 改变
    expect(ctx.mode).toBe('light');
    wrapper.unmount();
  });

  it('should clean up style tags on unmount', () => {
    const { install } = createTheme({ persist: false });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      props: {
        config: { seed: { colorPrimary: 'rgb(255 0 0)' } },
      },
      slots: { default: '<span>test</span>' },
    });

    // 获取 scope class 以定位 style 标签
    const scopeClass = wrapper
      .find('div')
      .classes()
      .find((c) => c.startsWith('aix-scope-'));
    expect(scopeClass).toBeDefined();

    // 卸载
    wrapper.unmount();

    // 对应的 style 标签应已移除
    const remainingStyles = document.querySelectorAll(`style[id*="${scopeClass}"]`);
    expect(remainingStyles.length).toBe(0);
  });

  it('should inject style tag with scoped selector', () => {
    const { install } = createTheme({ persist: false });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      props: {
        config: { seed: { colorPrimary: 'rgb(255 0 0)' } },
      },
      slots: { default: '<span>test</span>' },
    });

    const scopeClass = wrapper
      .find('div')
      .classes()
      .find((c) => c.startsWith('aix-scope-'));
    // 检查注入的 style 标签包含 scoped 选择器
    const styleEl = document.getElementById(`aix-theme-overrides-${scopeClass}`);
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain(`.${scopeClass}`);
    wrapper.unmount();
  });

  // ========== 新增测试：inherit 继承机制 ==========

  it('should inherit parent seed when inherit=true (default)', () => {
    const { install } = createTheme({
      persist: false,
      initialConfig: { seed: { colorPrimary: 'rgb(255 0 0)' } },
    });

    // 子级只设 fontSize，不设 colorPrimary
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      props: {
        config: { seed: { fontSize: 12 } },
      },
      slots: {
        default: h(ContextCapture),
      },
    });

    const child = wrapper.findComponent(ContextCapture);
    const ctx = child.vm.ctx as ThemeContext;

    // 应继承父级的 colorPrimary seed 派生结果（不是默认 cyan）
    const parentTokens = generateThemeTokens({
      seed: { colorPrimary: 'rgb(255 0 0)', fontSize: 12 },
    });
    expect(ctx.getToken('colorPrimary')).toBe(parentTokens.colorPrimary);
    wrapper.unmount();
  });

  it('should NOT inherit parent seed when inherit=false', () => {
    const { install } = createTheme({
      persist: false,
      initialConfig: { seed: { colorPrimary: 'rgb(255 0 0)' } },
    });

    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      props: {
        inherit: false,
        config: { seed: { fontSize: 12 } },
      },
      slots: {
        default: h(ContextCapture),
      },
    });

    const child = wrapper.findComponent(ContextCapture);
    const ctx = child.vm.ctx as ThemeContext;

    // 不继承父级，colorPrimary 应为默认值（cyan）
    const defaultTokens = generateThemeTokens({ seed: { fontSize: 12 } });
    expect(ctx.getToken('colorPrimary')).toBe(defaultTokens.colorPrimary);
    wrapper.unmount();
  });

  // ========== 新增测试：transparent 布局透明 ==========

  it('should have aix-scope-transparent class when transparent=true (default)', () => {
    const { install } = createTheme({ persist: false });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      slots: { default: '<span>test</span>' },
    });

    const container = wrapper.find('div');
    expect(container.classes()).toContain('aix-scope-transparent');
    wrapper.unmount();
  });

  it('should NOT have aix-scope-transparent class when transparent=false', () => {
    const { install } = createTheme({ persist: false });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      props: { transparent: false },
      slots: { default: '<span>test</span>' },
    });

    const container = wrapper.find('div');
    expect(container.classes()).not.toContain('aix-scope-transparent');
    wrapper.unmount();
  });

  // ========== 新增测试：tag 自定义标签 ==========

  it('should render custom tag when tag prop is provided', () => {
    const { install } = createTheme({ persist: false });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      props: { tag: 'span' },
      slots: { default: '<em>test</em>' },
    });

    expect(wrapper.find('span').exists()).toBe(true);
    expect(wrapper.find('div').exists()).toBe(false);
    wrapper.unmount();
  });

  // ========== 新增测试：components 组件覆盖 ==========

  it('should inject component override style tag', () => {
    const { install } = createTheme({ persist: false });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      props: {
        config: {
          components: {
            button: {
              token: { colorPrimary: 'rgb(0 255 0)' },
            },
          },
        },
      },
      slots: { default: '<span>test</span>' },
    });

    const scopeClass = wrapper
      .find('div')
      .classes()
      .find((c) => c.startsWith('aix-scope-'));

    // 应存在组件覆盖 style 标签
    const componentStyleEl = document.getElementById(`aix-component-overrides-${scopeClass}`);
    expect(componentStyleEl).not.toBeNull();
    expect(componentStyleEl?.textContent).toContain('.aix-button');
    wrapper.unmount();
  });

  // ========== 新增测试：差异化注入 ==========

  it('should only inject diff tokens, not all tokens', () => {
    const { install } = createTheme({ persist: false });
    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      props: {
        config: { seed: { colorPrimary: 'rgb(255 0 0)' } },
      },
      slots: { default: '<span>test</span>' },
    });

    const scopeClass = wrapper
      .find('div')
      .classes()
      .find((c) => c.startsWith('aix-scope-'));
    const styleEl = document.getElementById(`aix-theme-overrides-${scopeClass}`);
    expect(styleEl).not.toBeNull();

    const cssText = styleEl?.textContent || '';
    // 应包含 primary 相关变量（因为 seed 改了 colorPrimary）
    expect(cssText).toContain('--aix-colorPrimary');

    // 不应包含未变化的无关 token（如 tokenSpacing、shadow 等）
    expect(cssText).not.toContain('--aix-tokenSpacing1');
    expect(cssText).not.toContain('--aix-shadowXS');
    wrapper.unmount();
  });

  // ========== 新增测试：scoped context 暴露 mergedConfig ==========

  it('should expose merged config via scoped context', () => {
    const { install } = createTheme({
      persist: false,
      initialConfig: {
        seed: { colorPrimary: 'rgb(255 0 0)' },
        components: {
          button: { token: { colorPrimary: 'rgb(0 0 255)' } },
        },
      },
    });

    const wrapper = mount(ThemeScope, {
      global: { plugins: [{ install }] },
      props: {
        config: {
          seed: { fontSize: 12 },
          components: {
            input: { token: { colorBorder: 'rgb(200 200 200)' } },
          },
        },
      },
      slots: { default: h(ContextCapture) },
    });

    const child = wrapper.findComponent(ContextCapture);
    const ctx = child.vm.ctx as ThemeContext;

    // config 应是合并后的结果
    expect(ctx.config.seed?.colorPrimary).toBe('rgb(255 0 0)');
    expect(ctx.config.seed?.fontSize).toBe(12);
    // components 应合并双方
    expect(ctx.config.components?.button).toBeDefined();
    expect(ctx.config.components?.input).toBeDefined();
    wrapper.unmount();
  });
});
