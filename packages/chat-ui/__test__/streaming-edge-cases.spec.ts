/**
 * @fileoverview 流式渲染边界条件测试
 * 测试流式内容处理的各种边界情况
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import {
  useStreaming,
  safeEncodeURIComponent,
} from '../src/composables/useStreaming';
import { useTyping } from '../src/composables/useTyping';

describe('useStreaming 边界条件测试', () => {
  describe('特殊字符在首位的处理', () => {
    it('should handle special char at position 0 (link)', async () => {
      const content = ref('[');
      const { status } = useStreaming(content, {
        config: { hasNextChunk: true },
      });

      await nextTick();

      // 不完整的链接开始应该被缓存
      expect(status.value).toBe('streaming');
    });

    it('should handle special char at position 0 (image)', async () => {
      const content = ref('![');
      const { status } = useStreaming(content, {
        config: { hasNextChunk: true },
      });

      await nextTick();

      expect(status.value).toBe('streaming');
    });

    it('should handle code fence at position 0', async () => {
      const content = ref('```');
      const { status } = useStreaming(content, {
        config: { hasNextChunk: true },
      });

      await nextTick();

      expect(status.value).toBe('streaming');
    });
  });

  describe('不完整 Markdown 处理', () => {
    it('should handle incomplete link', async () => {
      const content = ref('Check [this](');
      const { status } = useStreaming(content, {
        config: { hasNextChunk: true },
      });

      await nextTick();

      // 不完整链接应该被缓存
      expect(status.value).toBe('streaming');
    });

    it('should handle incomplete image', async () => {
      const content = ref('Image: ![alt](');
      const { status } = useStreaming(content, {
        config: { hasNextChunk: true },
      });

      await nextTick();
      expect(status.value).toBe('streaming');
    });

    it('should handle incomplete code block', async () => {
      const content = ref('```javascript\nconst x = 1;');
      const { processedContent } = useStreaming(content, {
        config: { hasNextChunk: true },
      });

      await nextTick();

      // 未闭合的代码块应该自动补全闭合标记
      expect(processedContent.value).toContain('```');
    });

    it('should handle incomplete inline code', async () => {
      const content = ref('Use `console.log');
      const { status } = useStreaming(content, {
        config: { hasNextChunk: true },
      });

      await nextTick();
      expect(status.value).toBe('streaming');
    });

    it('should handle incomplete emphasis', async () => {
      const content = ref('This is **bold');
      const { status } = useStreaming(content, {
        config: { hasNextChunk: true },
      });

      await nextTick();
      expect(status.value).toBe('streaming');
    });
  });

  describe('流式完成处理', () => {
    it('should complete streaming when hasNextChunk becomes false', async () => {
      const content = ref('Hello');
      const config = ref({ hasNextChunk: true });

      const { status, processedContent } = useStreaming(content, {
        config: config.value,
      });

      await nextTick();
      expect(status.value).toBe('streaming');

      // 模拟流式完成
      config.value = { hasNextChunk: false };
      content.value = 'Hello World';
      await nextTick();

      // 等待 watch 触发
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(processedContent.value).toBe('Hello World');
    });

    it('should reset cache on streaming complete', async () => {
      const content = ref('```js\ncode');
      const { processedContent, reset } = useStreaming(content, {
        config: { hasNextChunk: true },
      });

      await nextTick();

      reset();
      await nextTick();

      expect(processedContent.value).toBe('');
    });
  });

  describe('快速连续更新', () => {
    it('should handle rapid content updates', async () => {
      const content = ref('');
      const { processedContent } = useStreaming(content, {
        config: { hasNextChunk: true },
      });

      // 模拟快速连续更新
      for (let i = 0; i < 10; i++) {
        content.value += `chunk${i} `;
        await nextTick();
      }

      // 最终内容应该包含所有 chunks
      expect(processedContent.value).toContain('chunk9');
    });
  });

  describe('Unicode 代理对处理', () => {
    it('should handle complete surrogate pairs', () => {
      const emoji = '😀'; // 完整的代理对
      const result = safeEncodeURIComponent(emoji);
      expect(result).toBe(encodeURIComponent(emoji));
    });

    it('should handle string with emojis', () => {
      const text = 'Hello 🌍 World 🎉';
      const result = safeEncodeURIComponent(text);
      expect(decodeURIComponent(result)).toBe(text);
    });

    it('should handle mixed content', () => {
      const text = 'Code: 代码 Emoji: 🚀';
      const result = safeEncodeURIComponent(text);
      expect(decodeURIComponent(result)).toBe(text);
    });
  });
});

describe('useTyping 边界条件测试', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('快速内容变化', () => {
    it('should handle rapid content changes with keepPrefix', () => {
      const content = ref('Hello');
      const { displayContent } = useTyping(content, {
        config: { keepPrefix: true, interval: 16 },
      });

      // 快速更新内容
      content.value = 'Hello World';
      vi.advanceTimersByTime(100);

      content.value = 'Hello World!';
      vi.advanceTimersByTime(100);

      // 应该保持公共前缀
      expect(displayContent.value.startsWith('Hello')).toBe(true);
    });

    it('should find longest common prefix correctly', () => {
      const content = ref('abc');
      const { displayContent, complete } = useTyping(content, {
        config: { keepPrefix: true },
      });

      complete(); // 立即完成第一次

      content.value = 'abcdef';
      vi.advanceTimersByTime(50);

      // 公共前缀 'abc' 应该被保留
      expect(displayContent.value.startsWith('abc')).toBe(true);
    });
  });

  describe('禁用状态', () => {
    it('should skip animation when disabled', () => {
      const content = ref('Hello World');
      const enabled = ref(false);
      const { displayContent, isComplete } = useTyping(content, {
        enabled,
      });

      // 禁用时应该直接显示完整内容
      expect(displayContent.value).toBe('Hello World');
      expect(isComplete.value).toBe(true);
    });

    it('should complete immediately when enabled changes to false', async () => {
      const content = ref('Hello World');
      const enabled = ref(true);
      const { displayContent } = useTyping(content, {
        enabled,
        config: { interval: 16 },
      });

      vi.advanceTimersByTime(50); // 开始打字

      enabled.value = false;
      // 等待 Vue 的 watch 触发
      await nextTick();
      vi.advanceTimersByTime(10);

      // 应该立即完成
      expect(displayContent.value).toBe('Hello World');
    });
  });

  describe('控制方法', () => {
    it('should stop typing on stop()', () => {
      const content = ref('Hello World This is a long text');
      const { stop, isTyping, displayContent } = useTyping(content, {
        config: { interval: 16 },
      });

      vi.advanceTimersByTime(50);
      stop();
      const stoppedContent = displayContent.value;

      vi.advanceTimersByTime(100);
      // 停止后内容不应该再变化
      expect(displayContent.value).toBe(stoppedContent);
      expect(isTyping.value).toBe(false);
    });

    it('should complete immediately on complete()', () => {
      const content = ref('Hello World');
      const { complete, displayContent, isComplete } = useTyping(content, {
        config: { interval: 16 },
      });

      complete();

      expect(displayContent.value).toBe('Hello World');
      expect(isComplete.value).toBe(true);
    });

    it('should reset state on reset()', () => {
      const content = ref('Hello');
      const { reset, displayContent, isComplete } = useTyping(content);

      vi.advanceTimersByTime(100);

      reset();

      expect(displayContent.value).toBe('');
      expect(isComplete.value).toBe(false);
    });
  });

  describe('空内容处理', () => {
    it('should handle empty content', () => {
      const content = ref('');
      const { displayContent, isComplete } = useTyping(content);

      expect(displayContent.value).toBe('');
      expect(isComplete.value).toBe(true);
    });

    it('should handle content becoming empty', async () => {
      const content = ref('Hello');
      const { displayContent } = useTyping(content, {
        config: { interval: 16 },
      });

      vi.advanceTimersByTime(50);

      content.value = '';
      // 等待 Vue 的 watch 触发
      await nextTick();
      vi.advanceTimersByTime(50);

      expect(displayContent.value).toBe('');
    });
  });

  describe('随机步长', () => {
    it('should support random step range', () => {
      const content = ref('Hello World This is a test');
      const { displayContent } = useTyping(content, {
        config: { step: [1, 3], interval: 16 },
      });

      vi.advanceTimersByTime(200);

      // 内容应该逐步增加
      expect(displayContent.value.length).toBeGreaterThan(0);
      expect(displayContent.value.length).toBeLessThanOrEqual(
        content.value.length,
      );
    });
  });

  describe('回调函数', () => {
    it('should call onTyping callback', () => {
      const onTyping = vi.fn();
      const content = ref('Hello');
      useTyping(content, {
        onTyping,
        config: { interval: 16 },
      });

      vi.advanceTimersByTime(50);

      expect(onTyping).toHaveBeenCalled();
    });

    it('should call onComplete callback when done', () => {
      const onComplete = vi.fn();
      const content = ref('Hi');
      const { complete } = useTyping(content, {
        onComplete,
      });

      complete();

      expect(onComplete).toHaveBeenCalled();
    });
  });
});
