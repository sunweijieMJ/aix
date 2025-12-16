import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import {
  useStreaming,
  safeEncodeURIComponent,
} from '../src/composables/useStreaming';

describe('useStreaming', () => {
  describe('processedContent', () => {
    it('should return content as-is when no streaming config', () => {
      const content = ref('Hello world');
      const { processedContent } = useStreaming(content);

      expect(processedContent.value).toBe('Hello world');
    });

    it('should process streaming content with hasNextChunk', async () => {
      const content = ref('Hello');
      const config = ref({ hasNextChunk: true });
      const { processedContent, status } = useStreaming(content, {
        config: config.value,
      });

      expect(status.value).toBe('streaming');
      expect(processedContent.value).toBeDefined();
    });

    it('should handle content updates', async () => {
      const content = ref('He');
      const { processedContent } = useStreaming(content);

      expect(processedContent.value).toBe('He');

      content.value = 'Hello';
      await nextTick();
      expect(processedContent.value).toBe('Hello');

      content.value = 'Hello world';
      await nextTick();
      expect(processedContent.value).toBe('Hello world');
    });
  });

  describe('status', () => {
    it('should be idle initially with empty content', () => {
      const content = ref('');
      const { status } = useStreaming(content);

      expect(status.value).toBe('idle');
    });

    it('should be complete when content exists and not streaming', () => {
      const content = ref('Hello world');
      const { status } = useStreaming(content);

      expect(status.value).toBe('complete');
    });

    it('should be streaming when hasNextChunk is true', async () => {
      const content = ref('Hello');
      const config = { hasNextChunk: true };
      const { status, isStreaming } = useStreaming(content, { config });

      expect(status.value).toBe('streaming');
      expect(isStreaming.value).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset state', async () => {
      const content = ref('Hello world');
      const { processedContent, status, reset } = useStreaming(content);

      expect(processedContent.value).toBe('Hello world');

      reset();

      expect(status.value).toBe('idle');
      expect(processedContent.value).toBe('');
    });
  });

  describe('safeEncodeURIComponent', () => {
    it('should encode normal strings', () => {
      expect(safeEncodeURIComponent('hello')).toBe('hello');
      expect(safeEncodeURIComponent('hello world')).toBe('hello%20world');
    });

    it('should handle unicode characters', () => {
      const result = safeEncodeURIComponent('你好');
      expect(result).toBeDefined();
    });

    it('should handle emoji', () => {
      const result = safeEncodeURIComponent('Hello 🎉');
      expect(result).toBeDefined();
    });

    it('should handle empty string', () => {
      expect(safeEncodeURIComponent('')).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const content = ref('');
      const { processedContent, status } = useStreaming(content);

      expect(processedContent.value).toBe('');
      expect(status.value).toBe('idle');
    });

    it('should handle content with only whitespace', () => {
      const content = ref('   \n\t  ');
      const { processedContent } = useStreaming(content);

      expect(processedContent.value).toBe('   \n\t  ');
    });

    it('should handle rapid content updates', async () => {
      const content = ref('');
      const { processedContent } = useStreaming(content);

      for (let i = 0; i < 100; i++) {
        content.value += 'x';
      }
      await nextTick();

      expect(processedContent.value).toBe('x'.repeat(100));
    });
  });

  describe('performance', () => {
    it('should handle large content', () => {
      const largeContent = 'x'.repeat(100000);
      const content = ref(largeContent);

      const start = performance.now();
      const { processedContent } = useStreaming(content);
      const end = performance.now();

      expect(processedContent.value.length).toBe(100000);
      expect(end - start).toBeLessThan(1000);
    });
  });

  describe('onStatusChange callback', () => {
    it('should call onStatusChange when status changes', async () => {
      const statusChanges: string[] = [];
      const content = ref('');

      useStreaming(content, {
        onStatusChange: (status) => statusChanges.push(status),
      });

      content.value = 'Hello';
      await nextTick();

      expect(statusChanges.length).toBeGreaterThan(0);
    });
  });
});
