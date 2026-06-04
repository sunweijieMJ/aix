import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Sender from '../src/components/Sender.vue';

describe('Sender', () => {
  it('Enter 提交并清空，emit submit', async () => {
    const w = mount(Sender);
    const ta = w.find('textarea');
    await ta.setValue('你好');
    await ta.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('submit')![0]).toEqual(['你好']);
    expect((ta.element as HTMLTextAreaElement).value).toBe('');
  });

  it('Shift+Enter 不提交', async () => {
    const w = mount(Sender);
    const ta = w.find('textarea');
    await ta.setValue('多行');
    await ta.trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(w.emitted('submit')).toBeUndefined();
  });

  it('loading 时点击发送按钮 emit cancel', async () => {
    const w = mount(Sender, { props: { loading: true } });
    await w.find('.aix-sender__send').trigger('click');
    expect(w.emitted('cancel')).toBeTruthy();
  });

  it('shiftEnter 模式：普通 Enter 不提交，Shift+Enter 才提交', async () => {
    const w = mount(Sender, { props: { submitType: 'shiftEnter' } });
    const ta = w.find('textarea');
    await ta.setValue('草稿');
    await ta.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('submit')).toBeUndefined();
    await ta.trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(w.emitted('submit')![0]).toEqual(['草稿']);
  });

  it('IME 组词中按 Enter 不提交（isComposing 守卫）', async () => {
    const w = mount(Sender);
    const ta = w.find('textarea');
    await ta.setValue('pinyin');
    await ta.trigger('keydown', { key: 'Enter', isComposing: true });
    expect(w.emitted('submit')).toBeUndefined();
  });

  it('暴露的 focus() 使 textarea 获得焦点', () => {
    const w = mount(Sender, { attachTo: document.body });
    (w.vm as unknown as { focus: () => void }).focus();
    expect(w.find('textarea').element).toBe(document.activeElement);
    w.unmount();
  });

  it('暴露的 clear() 清空内容并 emit update:modelValue 为空串', async () => {
    const w = mount(Sender);
    const ta = w.find('textarea');
    await ta.setValue('待清空');
    (w.vm as unknown as { clear: () => void }).clear();
    await w.vm.$nextTick();
    expect((ta.element as HTMLTextAreaElement).value).toBe('');
    const events = w.emitted('update:modelValue')!;
    expect(events[events.length - 1]).toEqual(['']);
  });

  it('modelValue 受控同步：setProps 后 textarea 值更新', async () => {
    const w = mount(Sender, { props: { modelValue: 'a' } });
    const ta = w.find('textarea');
    expect((ta.element as HTMLTextAreaElement).value).toBe('a');
    await w.setProps({ modelValue: 'b' });
    expect((ta.element as HTMLTextAreaElement).value).toBe('b');
  });

  it('disabled 时 Enter 与点击发送均不 emit submit', async () => {
    const w = mount(Sender, { props: { disabled: true } });
    const ta = w.find('textarea');
    await ta.setValue('内容');
    await ta.trigger('keydown', { key: 'Enter' });
    await w.find('.aix-sender__send').trigger('click');
    expect(w.emitted('submit')).toBeUndefined();
  });

  it('未提供 toolbar slot 时不渲染工具栏行（向后兼容）', () => {
    const w = mount(Sender);
    expect(w.find('.aix-sender__toolbar').exists()).toBe(false);
    expect(w.classes()).not.toContain('is-has-toolbar');
  });

  it('提供 toolbar / prefix slot 时渲染对应区域', () => {
    const w = mount(Sender, {
      slots: {
        toolbar: '<button class="ins">灵感</button>',
        prefix: '<span class="pre">+</span>',
      },
    });
    expect(w.find('.aix-sender__toolbar .ins').exists()).toBe(true);
    expect(w.find('.aix-sender__prefix .pre').exists()).toBe(true);
    expect(w.classes()).toContain('is-has-toolbar');
    // 工具栏存在不影响发送
    expect(w.find('.aix-sender__send').exists()).toBe(true);
  });

  it('header / footer slot：提供时渲染于输入行上 / 下方，未提供则不渲染', () => {
    const empty = mount(Sender);
    expect(empty.find('.aix-sender__header').exists()).toBe(false);
    expect(empty.find('.aix-sender__footer').exists()).toBe(false);

    const w = mount(Sender, {
      slots: {
        header: '<div class="att">附件预览</div>',
        footer: '<span class="cnt">0/2000</span>',
      },
    });
    expect(w.find('.aix-sender__header .att').exists()).toBe(true);
    expect(w.find('.aix-sender__footer .cnt').exists()).toBe(true);
  });

  it('textarea 带 aria-label（默认取 placeholder 文案）', () => {
    const wrapper = mount(Sender);
    expect(wrapper.find('textarea').attributes('aria-label')).toBeTruthy();
  });
});
