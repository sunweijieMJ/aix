import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import TextBlock from '../src/components/blocks/TextBlock.vue';
import { textBlock } from '../src/utils/helpers';

describe('TextBlock', () => {
  it('typing 关闭时直接渲染完整文本', () => {
    const w = mount(TextBlock, { props: { block: textBlock('完整内容'), typing: false } });
    expect(w.text()).toContain('完整内容');
  });

  describe('打字机', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('typing 开启时逐字显示，最终与 text 一致', async () => {
      const block = textBlock('');
      const w = mount(TextBlock, { props: { block, typing: true } });
      await w.setProps({ block: { ...block, text: '你好世界' } });
      await nextTick();
      vi.advanceTimersByTime(30);
      await nextTick();
      const mid = w.text();
      expect(mid.length).toBeGreaterThan(0);
      expect('你好世界'.startsWith(mid)).toBe(true);
      vi.advanceTimersByTime(300);
      await nextTick();
      expect(w.text()).toContain('你好世界');
    });

    it('高频流式更新（间隔 < interval）持续前进，不被饿死', async () => {
      const block = textBlock('');
      const w = mount(TextBlock, { props: { block, typing: true } });
      let cur = '';
      for (let i = 0; i < 12; i++) {
        cur += 'xy';
        await w.setProps({ block: { ...block, text: cur } });
        await nextTick();
        vi.advanceTimersByTime(10);
      }
      expect(w.text().length).toBeGreaterThan(0);
    });
  });

  // 回归：streaming 不能直接绑定 typing 配置 —— 流式过的消息 success 后 typing 仍为 true
  // （BubbleList 维持打字机节奏），若 streaming 据此常开，已完成消息的末块永不固化
  // （结尾代码块无高亮/复制、mermaid 不成图）且尾光标（is-streaming）永久闪烁。
  describe('streaming 推导（消息状态 ∪ 打字机未追平）', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const info = (status: 'loading' | 'updating' | 'success') => ({
      status,
      role: 'ai' as const,
      key: 'k',
    });

    it('typing 开启：流式中 is-streaming，success 且打字机追平后移除', async () => {
      const block = textBlock('');
      const w = mount(TextBlock, { props: { block, typing: true, info: info('updating') } });
      await w.setProps({ block: { ...block, text: '哈喽世界' } });
      await nextTick();
      expect(w.find('.aix-markdown').classes()).toContain('is-streaming');

      // 消息已完成但打字机尚未追平：仍视为流式（继续防闪烁 + 尾光标）
      await w.setProps({ info: info('success') });
      expect(w.find('.aix-markdown').classes()).toContain('is-streaming');

      // 打字机追平：末块固化，尾光标消失（typing 配置仍为 true）
      vi.advanceTimersByTime(600);
      await nextTick();
      expect(w.text()).toContain('哈喽世界');
      expect(w.find('.aix-markdown').classes()).not.toContain('is-streaming');
    });

    it('typing 关闭：流式中仍开启防闪烁整修，success 后立即固化', async () => {
      const block = textBlock('半截内容');
      const w = mount(TextBlock, { props: { block, typing: false, info: info('updating') } });
      expect(w.find('.aix-markdown').classes()).toContain('is-streaming');

      await w.setProps({ info: info('success') });
      expect(w.find('.aix-markdown').classes()).not.toContain('is-streaming');
    });

    it('无 info（独立使用）：打字机追平后即固化，不再永久 is-streaming', async () => {
      const block = textBlock('');
      const w = mount(TextBlock, { props: { block, typing: true } });
      await w.setProps({ block: { ...block, text: '内容' } });
      await nextTick();
      expect(w.find('.aix-markdown').classes()).toContain('is-streaming');

      vi.advanceTimersByTime(600);
      await nextTick();
      expect(w.find('.aix-markdown').classes()).not.toContain('is-streaming');
    });
  });
});
