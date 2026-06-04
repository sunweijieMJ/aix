import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Prompts from '../src/components/Prompts.vue';

describe('Prompts', () => {
  it('渲染条目并在点击时 emit select', async () => {
    const items = [{ key: 'a', label: '提示A' }];
    const w = mount(Prompts, { props: { items } });
    expect(w.text()).toContain('提示A');
    await w.find('.aix-prompts__item').trigger('click');
    expect(w.emitted('select')![0]).toEqual([items[0]]);
  });

  it('纯 label 列表为紧凑模式（无 is-rich）', () => {
    const w = mount(Prompts, { props: { items: [{ key: 'a', label: '提示A' }] } });
    expect(w.find('.aix-prompts').classes()).not.toContain('is-rich');
    expect(w.find('.aix-prompts__desc').exists()).toBe(false);
  });

  it('含 icon/description 时为富卡片：渲染图标/标题/描述并加 is-rich', () => {
    const items = [{ key: 's', icon: '📋', label: '单选题', description: '生成1道单选题' }];
    const w = mount(Prompts, { props: { items } });
    expect(w.find('.aix-prompts').classes()).toContain('is-rich');
    expect(w.find('.aix-prompts__icon').text()).toContain('📋');
    expect(w.find('.aix-prompts__label').text()).toBe('单选题');
    expect(w.find('.aix-prompts__desc').text()).toBe('生成1道单选题');
  });

  it('icon 为图片地址时渲染 img', () => {
    const items = [{ key: 's', icon: 'https://x/i.png', label: '卡片' }];
    const w = mount(Prompts, { props: { items } });
    const img = w.find('.aix-prompts__icon img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://x/i.png');
  });

  it('富卡片点击 emit select 携带完整 item', async () => {
    const items = [{ key: 's', icon: '📋', label: '单选题', description: '生成1道单选题' }];
    const w = mount(Prompts, { props: { items } });
    await w.find('.aix-prompts__item').trigger('click');
    expect(w.emitted('select')![0]).toEqual([items[0]]);
  });
});
