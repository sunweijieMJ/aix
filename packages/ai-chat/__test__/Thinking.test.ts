import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Thinking from '../src/components/Thinking.vue';

describe('Thinking', () => {
  it('点击标题切换展开状态', async () => {
    const w = mount(Thinking, { props: { content: '推理过程' } });
    expect(w.find('.aix-thinking__body').exists()).toBe(false);
    await w.find('.aix-thinking__header').trigger('click');
    expect(w.find('.aix-thinking__body').text()).toContain('推理过程');
  });

  it('expanded 为 true 时初始即展开', () => {
    const w = mount(Thinking, { props: { content: '推理过程', expanded: true } });
    const body = w.find('.aix-thinking__body');
    expect(body.exists()).toBe(true);
    expect(body.text()).toContain('推理过程');
  });

  it('expanded 变化时同步展开/折叠（父可自动控制，如 reasoning 流式中→完成）', async () => {
    const w = mount(Thinking, { props: { content: '推理过程', expanded: false } });
    expect(w.find('.aix-thinking__body').exists()).toBe(false);
    await w.setProps({ expanded: true });
    expect(w.find('.aix-thinking__body').exists()).toBe(true);
    await w.setProps({ expanded: false });
    expect(w.find('.aix-thinking__body').exists()).toBe(false);
  });

  it('title prop 覆盖默认标题', () => {
    const w = mount(Thinking, { props: { title: '自定义标题' } });
    expect(w.find('.aix-thinking__header').text()).toContain('自定义标题');
  });

  it('不传 title 时回退到 i18n 文案 thinking', () => {
    const w = mount(Thinking, {});
    expect(w.find('.aix-thinking__header').text()).toContain('思考中…');
  });

  it('默认 slot 覆盖 content', () => {
    const w = mount(Thinking, {
      props: { content: 'prop 内容', expanded: true },
      slots: { default: '<span>slot 内容</span>' },
    });
    const body = w.find('.aix-thinking__body');
    expect(body.text()).toContain('slot 内容');
    expect(body.text()).not.toContain('prop 内容');
  });

  it('折叠按钮带 aria-expanded 反映展开态', async () => {
    const wrapper = mount(Thinking, { props: { content: 'x' } });
    const btn = wrapper.find('.aix-thinking__header');
    expect(btn.attributes('aria-expanded')).toBe('false');
    await btn.trigger('click');
    expect(btn.attributes('aria-expanded')).toBe('true');
  });
});
