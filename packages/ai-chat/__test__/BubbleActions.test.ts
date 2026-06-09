import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markRaw } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { Refresh } from '@aix/icons';
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

  it("items: ['copy'] 时只渲染复制按钮", () => {
    const w = mount(BubbleActions, { props: { items: ['copy'] } });
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

  it('两条复制路径都失败时静默降级、不抛 copy 事件', async () => {
    // Clipboard API 写入失败，且 jsdom 无 execCommand 兜底 → copyText 返回 false
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const w = mount(BubbleActions, { props: { content: 'x' } });
    await w.findAll('.aix-bubble-actions__btn')[0].trigger('click');
    await flushPromises();
    expect(w.emitted('copy')).toBeUndefined();
  });

  it('剪贴板 API 不可用（HTTP / 旧浏览器）时经 execCommand 兜底复制并抛 copy', async () => {
    Object.assign(navigator, { clipboard: undefined });
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand?: unknown }).execCommand = exec;
    const w = mount(BubbleActions, { props: { items: ['copy'], content: 'hi' } });
    const copyBtn = w.findAll('.aix-bubble-actions__btn')[0];
    await copyBtn.trigger('click');
    await flushPromises();
    expect(exec).toHaveBeenCalledWith('copy');
    expect(w.emitted('copy')).toHaveLength(1);
    expect(copyBtn.attributes('title')).toBe('已复制');
    delete (document as unknown as { execCommand?: unknown }).execCommand;
  });

  it('无 content 时仍抛 copy 事件（交由使用方自定义复制）', async () => {
    const w = mount(BubbleActions);
    await w.findAll('.aix-bubble-actions__btn')[0].trigger('click');
    await flushPromises();
    expect(w.emitted('copy')).toHaveLength(1);
  });

  it('默认不渲染赞/踩按钮', () => {
    const w = mount(BubbleActions);
    expect(w.find('.aix-bubble-actions__feedback').exists()).toBe(false);
  });

  it('items 含 feedback 时渲染赞/踩两个按钮', () => {
    const w = mount(BubbleActions, { props: { items: ['copy', 'regenerate', 'feedback'] } });
    expect(w.findAll('.aix-bubble-actions__feedback')).toHaveLength(2);
  });

  it('点赞 emit feedback=like；当前已 like 再点取消（emit null）', async () => {
    const w = mount(BubbleActions, { props: { items: ['copy', 'regenerate', 'feedback'] } });
    const [like] = w.findAll('.aix-bubble-actions__feedback');
    await like!.trigger('click');
    expect(w.emitted('feedback')![0]).toEqual(['like']);

    await w.setProps({ feedback: 'like' });
    await like!.trigger('click');
    expect(w.emitted('feedback')![1]).toEqual([null]);
  });

  it('点踩 emit feedback=dislike，与赞互斥', async () => {
    const w = mount(BubbleActions, {
      props: { items: ['copy', 'regenerate', 'feedback'], feedback: 'like' },
    });
    const dislike = w.findAll('.aix-bubble-actions__feedback')[1];
    await dislike!.trigger('click');
    expect(w.emitted('feedback')![0]).toEqual(['dislike']);
  });

  it('受控激活态反映到 aria-pressed', async () => {
    const w = mount(BubbleActions, {
      props: { items: ['copy', 'regenerate', 'feedback'], feedback: 'like' },
    });
    const [like, dislike] = w.findAll('.aix-bubble-actions__feedback');
    expect(like!.attributes('aria-pressed')).toBe('true');
    expect(dislike!.attributes('aria-pressed')).toBe('false');
  });

  // 新增能力用例
  it('items 顺序即渲染顺序', () => {
    const w = mount(BubbleActions, {
      props: { items: ['regenerate', 'copy'], content: 'hi' },
    });
    const labels = w.findAll('button').map((b) => b.attributes('aria-label'));
    expect(labels[0]).toBe('重新生成');
    expect(labels[1]).toBe('复制');
  });

  it('feedback 预设展开为赞/踩两按钮，互斥可取消', async () => {
    const w = mount(BubbleActions, {
      props: { items: ['feedback'], feedback: null },
    });
    const btns = w.findAll('button');
    expect(btns).toHaveLength(2);
    await btns[0]!.trigger('click');
    expect(w.emitted('feedback')?.[0]).toEqual(['like']);
    await w.setProps({ feedback: 'like' });
    await btns[0]!.trigger('click');
    expect(w.emitted('feedback')?.[1]).toEqual([null]); // 再点取消
  });

  it('自定义项渲染 icon + label 并触发 onClick(ctx.message)', async () => {
    const onClick = vi.fn();
    const message = { id: 'm1', role: 'ai' as const, content: [] };
    const w = mount(BubbleActions, {
      props: {
        items: [{ key: 'share', label: '分享', icon: markRaw(Refresh), onClick }],
        message,
      },
    });
    const btn = w.find('button');
    expect(btn.attributes('aria-label')).toBe('分享');
    await btn.trigger('click');
    expect(onClick).toHaveBeenCalledWith({ message });
  });

  it('自定义项 disabled 时按钮禁用且不触发 onClick', async () => {
    const onClick = vi.fn();
    const w = mount(BubbleActions, {
      props: { items: [{ key: 'x', label: 'X', disabled: true, onClick }] },
    });
    expect(w.find('button').attributes('disabled')).toBeDefined();
    await w.find('button').trigger('click');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('默认 slot 在 items 之后渲染', () => {
    const w = mount(BubbleActions, {
      props: { items: ['copy'] },
      slots: { default: '<button class="extra">extra</button>' },
    });
    const btns = w.findAll('button');
    expect(btns[btns.length - 1]!.classes()).toContain('extra');
  });
});
