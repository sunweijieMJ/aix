import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import BubbleActions from '../src/components/BubbleActions.vue';

describe('BubbleActions', () => {
  beforeEach(() => {
    // jsdom 默认无 clipboard，注入可断言的 writeText
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('默认渲染复制 + 重新生成两个按钮', () => {
    const w = mount(BubbleActions);
    expect(w.findAll('.aix-bubble-actions__btn')).toHaveLength(2);
  });

  it('reloadable 为 false 时隐藏重新生成按钮', () => {
    const w = mount(BubbleActions, { props: { reloadable: false } });
    expect(w.findAll('.aix-bubble-actions__btn')).toHaveLength(1);
  });

  it('点击复制：写入剪贴板、抛 copy 事件并切换为「已复制」反馈', async () => {
    const w = mount(BubbleActions, { props: { content: '要复制的文本' } });
    const copyBtn = w.findAll('.aix-bubble-actions__btn')[0];
    await copyBtn.trigger('click');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('要复制的文本');
    expect(w.emitted('copy')).toHaveLength(1);
    // 复制后按钮标题切换为「已复制」反馈
    expect(copyBtn.attributes('title')).toBe('已复制');
  });

  it('点击重新生成抛 regenerate 事件', async () => {
    const w = mount(BubbleActions);
    const reloadBtn = w.findAll('.aix-bubble-actions__btn')[1];
    await reloadBtn.trigger('click');
    expect(w.emitted('regenerate')).toHaveLength(1);
  });

  it('剪贴板不可用时静默降级、不抛 copy 事件', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const w = mount(BubbleActions, { props: { content: 'x' } });
    await w.findAll('.aix-bubble-actions__btn')[0].trigger('click');
    await Promise.resolve();
    expect(w.emitted('copy')).toBeUndefined();
  });

  it('无 content 时仍抛 copy 事件（交由使用方自定义复制）', async () => {
    const w = mount(BubbleActions);
    await w.findAll('.aix-bubble-actions__btn')[0].trigger('click');
    expect(w.emitted('copy')).toHaveLength(1);
  });

  it('默认不渲染赞/踩按钮', () => {
    const w = mount(BubbleActions);
    expect(w.find('.aix-bubble-actions__feedback').exists()).toBe(false);
  });

  it('feedbackable 时渲染赞/踩两个按钮', () => {
    const w = mount(BubbleActions, { props: { feedbackable: true } });
    expect(w.findAll('.aix-bubble-actions__feedback')).toHaveLength(2);
  });

  it('点赞 emit feedback=like；当前已 like 再点取消（emit null）', async () => {
    const w = mount(BubbleActions, { props: { feedbackable: true } });
    const [like] = w.findAll('.aix-bubble-actions__feedback');
    await like.trigger('click');
    expect(w.emitted('feedback')![0]).toEqual(['like']);

    await w.setProps({ feedback: 'like' });
    await like.trigger('click');
    expect(w.emitted('feedback')![1]).toEqual([null]);
  });

  it('点踩 emit feedback=dislike，与赞互斥', async () => {
    const w = mount(BubbleActions, { props: { feedbackable: true, feedback: 'like' } });
    const dislike = w.findAll('.aix-bubble-actions__feedback')[1];
    await dislike.trigger('click');
    expect(w.emitted('feedback')![0]).toEqual(['dislike']);
  });

  it('受控激活态反映到 aria-pressed', async () => {
    const w = mount(BubbleActions, { props: { feedbackable: true, feedback: 'like' } });
    const [like, dislike] = w.findAll('.aix-bubble-actions__feedback');
    expect(like.attributes('aria-pressed')).toBe('true');
    expect(dislike.attributes('aria-pressed')).toBe('false');
  });
});
