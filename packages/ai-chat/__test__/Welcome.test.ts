import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Welcome from '../src/components/Welcome.vue';

describe('Welcome', () => {
  it('渲染标题与描述', () => {
    const w = mount(Welcome, { props: { title: '你好', description: '我是助手' } });
    expect(w.text()).toContain('你好');
    expect(w.text()).toContain('我是助手');
  });

  it('icon prop 渲染 img 且 src 正确', () => {
    const w = mount(Welcome, { props: { icon: 'https://x/logo.png' } });
    const img = w.find('.aix-welcome__icon img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://x/logo.png');
  });

  it('icon 具名 slot 覆盖默认 img', () => {
    const w = mount(Welcome, {
      props: { icon: 'https://x/logo.png' },
      slots: { icon: '<span class="custom-icon">★</span>' },
    });
    expect(w.find('.aix-welcome__icon .custom-icon').exists()).toBe(true);
    expect(w.find('.aix-welcome__icon img').exists()).toBe(false);
  });

  it('extra 具名 slot：提供时渲染 .aix-welcome__extra', () => {
    const w = mount(Welcome, { slots: { extra: '<button>开始</button>' } });
    const extra = w.find('.aix-welcome__extra');
    expect(extra.exists()).toBe(true);
    expect(extra.text()).toContain('开始');
  });

  it('extra 具名 slot：不提供时该节点不存在', () => {
    const w = mount(Welcome, { props: { title: '你好' } });
    expect(w.find('.aix-welcome__extra').exists()).toBe(false);
  });

  it('align 默认 center；可设为 start 改变对齐 modifier', () => {
    const center = mount(Welcome, { props: { title: '你好' } });
    expect(center.find('.aix-welcome').classes()).toContain('aix-welcome--center');
    const start = mount(Welcome, { props: { title: '你好', align: 'start' } });
    expect(start.find('.aix-welcome').classes()).toContain('aix-welcome--start');
  });

  it('title 具名 slot 覆盖 title prop（支持富标题）', () => {
    const w = mount(Welcome, {
      props: { title: '纯文本' },
      slots: { title: '我是 <span class="accent">AI助手</span>' },
    });
    expect(w.find('.aix-welcome__title .accent').exists()).toBe(true);
    expect(w.find('.aix-welcome__title').text()).not.toContain('纯文本');
  });
});
