import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
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
});
