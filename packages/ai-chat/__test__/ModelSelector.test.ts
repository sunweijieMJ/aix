import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import ModelSelector from '../src/components/ModelSelector.vue';
import type { ModelOption } from '../src/types';

const options: ModelOption[] = [
  { value: 'Qwen3-Max' },
  { value: 'DeepSeek-V3' },
  { value: 'GPT-4o' },
];

describe('ModelSelector', () => {
  it('显示当前选中模型，默认不展开菜单', () => {
    const w = mount(ModelSelector, { props: { options, modelValue: 'Qwen3-Max' } });
    expect(w.find('.aix-model-selector__label').text()).toBe('Qwen3-Max');
    expect(w.find('.aix-model-selector__menu').exists()).toBe(false);
  });

  it('未选中时显示 placeholder', () => {
    const w = mount(ModelSelector, { props: { options, placeholder: '选择模型' } });
    expect(w.find('.aix-model-selector__label').text()).toBe('选择模型');
  });

  it('label 缺省回退 value；有 label 时显示 label', () => {
    const w = mount(ModelSelector, {
      props: { options: [{ value: 'm1', label: '模型一' }], modelValue: 'm1' },
    });
    expect(w.find('.aix-model-selector__label').text()).toBe('模型一');
  });

  it('点击展开菜单并列出全部选项', async () => {
    const w = mount(ModelSelector, { props: { options, modelValue: 'Qwen3-Max' } });
    await w.find('.aix-model-selector__trigger').trigger('click');
    const opts = w.findAll('.aix-model-selector__option');
    expect(opts).toHaveLength(3);
    expect(opts[0].classes()).toContain('is-active'); // 当前项高亮
  });

  it('选择某项：emit update:modelValue 并收起菜单', async () => {
    const w = mount(ModelSelector, { props: { options, modelValue: 'Qwen3-Max' } });
    await w.find('.aix-model-selector__trigger').trigger('click');
    await w.findAll('.aix-model-selector__option')[1].trigger('click');
    expect(w.emitted('update:modelValue')![0]).toEqual(['DeepSeek-V3']);
    expect(w.find('.aix-model-selector__menu').exists()).toBe(false);
  });

  it('placement=top 时菜单加 --top 修饰', async () => {
    const w = mount(ModelSelector, { props: { options, placement: 'top' } });
    await w.find('.aix-model-selector__trigger').trigger('click');
    expect(w.find('.aix-model-selector__menu').classes()).toContain(
      'aix-model-selector__menu--top',
    );
  });

  it('点击组件外部关闭已展开的菜单', async () => {
    // 需挂到真实 DOM，document click 监听与 root.contains 判定才生效
    const w = mount(ModelSelector, {
      props: { options, modelValue: 'Qwen3-Max' },
      attachTo: document.body,
    });
    await w.find('.aix-model-selector__trigger').trigger('click');
    expect(w.find('.aix-model-selector__menu').exists()).toBe(true);
    // 派发一次 target 在组件外部（body）的 click
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await w.vm.$nextTick();
    expect(w.find('.aix-model-selector__menu').exists()).toBe(false);
    w.unmount();
  });

  describe('键盘可达性', () => {
    it('触发按钮带 aria-haspopup，aria-expanded 随展开态变化', async () => {
      const w = mount(ModelSelector, { props: { options, modelValue: 'Qwen3-Max' } });
      const trigger = w.find('.aix-model-selector__trigger');
      expect(trigger.attributes('aria-haspopup')).toBe('listbox');
      expect(trigger.attributes('aria-expanded')).toBe('false');
      await trigger.trigger('click');
      expect(trigger.attributes('aria-expanded')).toBe('true');
    });

    it('触发按钮按 ArrowDown 展开菜单，并高亮当前选中项（roving tabindex）', async () => {
      const w = mount(ModelSelector, {
        props: { options, modelValue: 'DeepSeek-V3' },
        attachTo: document.body,
      });
      await w.find('.aix-model-selector__trigger').trigger('keydown', { key: 'ArrowDown' });
      expect(w.find('.aix-model-selector__menu').exists()).toBe(true);
      const opts = w.findAll('.aix-model-selector__option');
      // 当前选中项（索引 1）为高亮项：tabindex=0，其余为 -1
      expect(opts[1].attributes('tabindex')).toBe('0');
      expect(opts[0].attributes('tabindex')).toBe('-1');
      expect(opts[2].attributes('tabindex')).toBe('-1');
      w.unmount();
    });

    it('菜单内 ArrowDown 下移、ArrowUp 从首项循环到末项', async () => {
      const w = mount(ModelSelector, {
        props: { options, modelValue: 'Qwen3-Max' },
        attachTo: document.body,
      });
      // 展开后初始高亮为选中项（索引 0）
      await w.find('.aix-model-selector__trigger').trigger('keydown', { key: 'ArrowDown' });
      const menu = w.find('.aix-model-selector__menu');
      // 0 → 1
      await menu.trigger('keydown', { key: 'ArrowDown' });
      expect(w.findAll('.aix-model-selector__option')[1].attributes('tabindex')).toBe('0');
      // 1 → 2 → 0（继续下移到末项再循环回首项）
      await menu.trigger('keydown', { key: 'ArrowDown' });
      await menu.trigger('keydown', { key: 'ArrowDown' });
      expect(w.findAll('.aix-model-selector__option')[0].attributes('tabindex')).toBe('0');
      // 0 → 2（首项上移循环到末项）
      await menu.trigger('keydown', { key: 'ArrowUp' });
      expect(w.findAll('.aix-model-selector__option')[2].attributes('tabindex')).toBe('0');
      w.unmount();
    });

    it('Home/End 跳到首/末项', async () => {
      const w = mount(ModelSelector, {
        props: { options, modelValue: 'DeepSeek-V3' },
        attachTo: document.body,
      });
      await w.find('.aix-model-selector__trigger').trigger('keydown', { key: 'ArrowDown' });
      const menu = w.find('.aix-model-selector__menu');
      await menu.trigger('keydown', { key: 'End' });
      expect(w.findAll('.aix-model-selector__option')[2].attributes('tabindex')).toBe('0');
      await menu.trigger('keydown', { key: 'Home' });
      expect(w.findAll('.aix-model-selector__option')[0].attributes('tabindex')).toBe('0');
      w.unmount();
    });

    it('Escape 关闭菜单并把焦点交还触发按钮', async () => {
      const w = mount(ModelSelector, {
        props: { options, modelValue: 'Qwen3-Max' },
        attachTo: document.body,
      });
      await w.find('.aix-model-selector__trigger').trigger('keydown', { key: 'ArrowDown' });
      expect(w.find('.aix-model-selector__menu').exists()).toBe(true);
      await w.find('.aix-model-selector__menu').trigger('keydown', { key: 'Escape' });
      await w.vm.$nextTick();
      expect(w.find('.aix-model-selector__menu').exists()).toBe(false);
      expect(document.activeElement).toBe(w.find('.aix-model-selector__trigger').element);
      w.unmount();
    });

    it('Tab 离开时关闭菜单', async () => {
      const w = mount(ModelSelector, {
        props: { options, modelValue: 'Qwen3-Max' },
        attachTo: document.body,
      });
      await w.find('.aix-model-selector__trigger').trigger('keydown', { key: 'ArrowDown' });
      await w.find('.aix-model-selector__menu').trigger('keydown', { key: 'Tab' });
      await w.vm.$nextTick();
      expect(w.find('.aix-model-selector__menu').exists()).toBe(false);
      w.unmount();
    });

    it('选项原生 Enter（click）选中并收起菜单', async () => {
      const w = mount(ModelSelector, {
        props: { options, modelValue: 'Qwen3-Max' },
        attachTo: document.body,
      });
      await w.find('.aix-model-selector__trigger').trigger('keydown', { key: 'ArrowDown' });
      await w.findAll('.aix-model-selector__option')[2].trigger('click');
      expect(w.emitted('update:modelValue')![0]).toEqual(['GPT-4o']);
      expect(w.find('.aix-model-selector__menu').exists()).toBe(false);
      w.unmount();
    });
  });
});
