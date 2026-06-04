import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
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
});
