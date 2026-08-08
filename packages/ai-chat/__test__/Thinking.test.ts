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

  it('icon 插槽渲染在标题前，拿得到 open 作用域', async () => {
    const w = mount(Thinking, {
      props: { content: 'x' },
      slots: { icon: (sp: { open: boolean }) => `[icon:${sp.open}]` },
    });
    expect(w.find('.aix-thinking__header').text()).toContain('[icon:false]');
    await w.find('.aix-thinking__header').trigger('click');
    expect(w.find('.aix-thinking__header').text()).toContain('[icon:true]');
  });

  it('不提供 icon 插槽时无副作用（不占位、不渲染任何内置内容）', () => {
    const w = mount(Thinking, { props: { content: 'x' } });
    // 无内置图标形态可断言存在性，只需确认标题文案不受影响即可回归
    expect(w.find('.aix-thinking__header').text()).toContain('思考中…');
  });
});

// ============ variant：外观形态（批次3-3.2） ============
describe('Thinking — variant 外观形态', () => {
  it('默认 card：根节点带 --card 修饰类（既有接入方行为不变）', () => {
    const w = mount(Thinking, { props: { content: 'x' } });
    expect(w.find('.aix-thinking--card').exists()).toBe(true);
  });

  it('capsule / plain 各自落到对应修饰类，且互斥', () => {
    const capsule = mount(Thinking, { props: { content: 'x', variant: 'capsule' } });
    expect(capsule.find('.aix-thinking--capsule').exists()).toBe(true);
    expect(capsule.find('.aix-thinking--card').exists()).toBe(false);

    const plain = mount(Thinking, { props: { content: 'x', variant: 'plain' } });
    expect(plain.find('.aix-thinking--plain').exists()).toBe(true);
    expect(plain.find('.aix-thinking--card').exists()).toBe(false);
  });

  it('换形态不影响折叠行为（头部仍可点开收起）', async () => {
    const w = mount(Thinking, { props: { content: '思考内容', variant: 'capsule' } });
    expect(w.find('.aix-thinking__body').exists()).toBe(false);
    await w.find('.aix-thinking__header').trigger('click');
    expect(w.find('.aix-thinking__body').text()).toContain('思考内容');
  });
});
