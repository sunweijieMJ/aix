import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import { h, nextTick } from 'vue';
import Bubble from '../src/components/Bubble.vue';
import ThoughtChain from '../src/components/ThoughtChain.vue';
import type { ThoughtChainItem } from '../src/types';
import { textBlock } from '../src/utils/helpers';

/**
 * 两条 a11y 回归，共同点是「只做了交互的一半」：
 * ① Bubble 进入内联编辑时显式把焦点送进 textarea，退出时却不归还，activeElement 落回 body；
 * ② ThoughtChain 条目头部无条件渲染成带 aria-expanded 的 button，而箭头与正文都由 hasBody 守卫。
 */

describe('Bubble 退出内联编辑归还焦点', () => {
  const mountBubble = (editing: boolean) =>
    mount(Bubble, {
      props: { itemKey: 'm1', role: 'user', content: [textBlock('原文')], editing },
      attachTo: document.body,
    });

  it('退出编辑后焦点不落在 body（旧铅笔键已随 footer 卸载时退回气泡根）', async () => {
    const wrapper = mountBubble(true);
    await nextTick();
    // 进入编辑：焦点在 textarea（既有行为）
    expect(document.activeElement).toBe(wrapper.find('textarea').element);

    await wrapper.setProps({ editing: false });
    await nextTick();

    expect(document.activeElement).not.toBe(document.body);
    expect(wrapper.element.contains(document.activeElement)).toBe(true);
    wrapper.unmount();
  });

  it('归还焦点用的 tabindex 是临时的，失焦后即摘除（不常驻改变点击聚焦行为）', async () => {
    const wrapper = mountBubble(true);
    await nextTick();
    await wrapper.setProps({ editing: false });
    await nextTick();

    const root = wrapper.element as HTMLElement;
    expect(root.getAttribute('tabindex')).toBe('-1');
    root.dispatchEvent(new FocusEvent('blur'));
    expect(root.getAttribute('tabindex')).toBeNull();
    wrapper.unmount();
  });

  it('挂载时 editing 为 false 不抢焦点（immediate 首次触发不算“退出”）', async () => {
    const probe = document.createElement('button');
    document.body.appendChild(probe);
    probe.focus();
    expect(document.activeElement).toBe(probe);

    const wrapper = mountBubble(false);
    await nextTick();
    expect(document.activeElement).toBe(probe);

    wrapper.unmount();
    probe.remove();
  });

  it('焦点已被别处接管时不抢回来', async () => {
    const wrapper = mountBubble(true);
    await nextTick();
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    await wrapper.setProps({ editing: false });
    outside.focus(); // 退出的同一轮里，焦点被别处拿走
    await nextTick();

    expect(document.activeElement).toBe(outside);
    outside.remove();
    wrapper.unmount();
  });
});

describe('ThoughtChain 条目头部仅在有正文时可交互', () => {
  const item = (extra: Partial<ThoughtChainItem> = {}): ThoughtChainItem => ({
    key: 'k1',
    title: '解析意图',
    status: 'done',
    ...extra,
  });

  it('无 content / result 时渲染为纯展示 div，不输出 aria-expanded', () => {
    const wrapper = mount(ThoughtChain, { props: { items: [item()] } });
    const head = wrapper.find('.aix-thought-chain__head');
    expect(head.exists()).toBe(true);
    expect(head.element.tagName).toBe('DIV');
    expect(head.attributes('aria-expanded')).toBeUndefined();
    expect(head.classes()).not.toContain('is-collapsible');
  });

  it('有 content 时仍是 button 且带 aria-expanded（既有行为不回归）', async () => {
    const wrapper = mount(ThoughtChain, { props: { items: [item({ content: '正文' })] } });
    const head = wrapper.find('.aix-thought-chain__head');
    expect(head.element.tagName).toBe('BUTTON');
    expect(head.attributes('aria-expanded')).toBe('true');
    expect(head.classes()).toContain('is-collapsible');

    await head.trigger('click');
    expect(wrapper.find('.aix-thought-chain__head').attributes('aria-expanded')).toBe('false');
  });

  it('只有 result 也算有正文', () => {
    const wrapper = mount(ThoughtChain, {
      props: { items: [item({ result: { title: '检索结果', chips: [] } })] },
    });
    expect(wrapper.find('.aix-thought-chain__head').element.tagName).toBe('BUTTON');
  });

  it('无正文条目点击不抛错、也不出现正文容器', async () => {
    const wrapper = mount(ThoughtChain, { props: { items: [item()] } });
    await wrapper.find('.aix-thought-chain__head').trigger('click');
    expect(wrapper.find('.aix-thought-chain__body').exists()).toBe(false);
  });

  it('自定义 item-content 插槽使条目获得正文', () => {
    const wrapper = mount(ThoughtChain, {
      props: { items: [item()] },
      slots: { 'item-content': () => h('span', '卡片') },
    });
    expect(wrapper.find('.aix-thought-chain__head').element.tagName).toBe('BUTTON');
  });
});

describe('Bubble 焦点归还的时序边界', () => {
  it('同一 tick 内 true→false→true 时不抢焦点，且 returnFocusEl 不被清空', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const wrapper = mount(Bubble, {
      props: { itemKey: 'm1', role: 'user', content: [textBlock('原文')], editing: false },
      attachTo: document.body,
    });
    // 进入编辑：此刻 opener 持有焦点，应被记为归还目标
    await wrapper.setProps({ editing: true });
    await nextTick();
    expect(document.activeElement).toBe(wrapper.find('textarea').element);

    // 同一 tick 内退出又立刻进入
    wrapper.setProps({ editing: false });
    await wrapper.setProps({ editing: true });
    await nextTick();
    // 仍在编辑态：焦点应在 textarea，而不是被归还逻辑抢走
    expect(document.activeElement).toBe(wrapper.find('textarea').element);

    // 真正退出：归还目标未被上一轮清掉，焦点回到 opener
    await wrapper.setProps({ editing: false });
    await nextTick();
    expect(document.activeElement).toBe(opener);

    wrapper.unmount();
    opener.remove();
  });

  it('归还给进入编辑前持有焦点的元素（它仍在文档内时）', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const wrapper = mount(Bubble, {
      props: { itemKey: 'm1', role: 'user', content: [textBlock('原文')], editing: false },
      attachTo: document.body,
    });
    await wrapper.setProps({ editing: true });
    await nextTick();
    await wrapper.setProps({ editing: false });
    await nextTick();

    expect(document.activeElement).toBe(opener);
    // 走了 prev 分支就不该给根挂 tabindex
    expect((wrapper.element as HTMLElement).getAttribute('tabindex')).toBeNull();

    wrapper.unmount();
    opener.remove();
  });
});
