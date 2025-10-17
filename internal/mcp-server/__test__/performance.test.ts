import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BatchProcessor,
  ConcurrencyController,
  LargeFileProcessor,
  OptimizedCache,
} from '../src/utils/performance';

describe('Performance Utils', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), 'test-perf');
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('LargeFileProcessor', () => {
    let processor: LargeFileProcessor;

    beforeEach(() => {
      processor = new LargeFileProcessor(1024, 512); // 1KB max, 512B chunks
    });

    it('should read small files normally', async () => {
      const testFile = join(testDir, 'small.txt');
      const content = 'Hello World';
      await writeFile(testFile, content);

      const result = await processor.safeReadFile(testFile);
      expect(result).toBe(content);
    });

    it('should reject files that are too large', async () => {
      const testFile = join(testDir, 'large.txt');
      const largeContent = 'x'.repeat(2048); // 2KB
      await writeFile(testFile, largeContent);

      const result = await processor.safeReadFile(testFile);
      expect(result).toBeNull();
    });

    it('should check if file is too large', async () => {
      const testFile = join(testDir, 'large.txt');
      const largeContent = 'x'.repeat(2048);
      await writeFile(testFile, largeContent);

      const isTooLarge = await processor.isFileTooLarge(testFile);
      expect(isTooLarge).toBe(true);
    });
  });

  describe('ConcurrencyController', () => {
    let controller: ConcurrencyController;

    beforeEach(() => {
      controller = new ConcurrencyController(2); // Max 2 concurrent
    });

    it('should execute tasks concurrently', async () => {
      const results: number[] = [];
      const tasks = [1, 2, 3, 4, 5].map((n) =>
        controller.execute(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          results.push(n);
          return n;
        }),
      );

      const taskResults = await Promise.all(tasks);
      expect(taskResults).toEqual([1, 2, 3, 4, 5]);
      expect(results).toHaveLength(5);
    });

    it('should limit concurrency', async () => {
      const startTimes: number[] = [];
      const tasks = [1, 2, 3, 4].map((n) =>
        controller.execute(async () => {
          startTimes.push(Date.now());
          await new Promise((resolve) => setTimeout(resolve, 50));
          return n;
        }),
      );

      await Promise.all(tasks);

      // 前两个任务应该几乎同时开始，后两个应该稍后开始
      expect(startTimes).toHaveLength(4);
      const firstBatch = startTimes.slice(0, 2);
      const secondBatch = startTimes.slice(2);

      expect(Math.abs(firstBatch[0]! - firstBatch[1]!)).toBeLessThan(20);
      expect(secondBatch[0]! - firstBatch[0]!).toBeGreaterThan(40);
    });

    it('should provide status information', async () => {
      const status = controller.getStatus();
      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('queued');
      expect(status).toHaveProperty('maxConcurrent');
      expect(status.maxConcurrent).toBe(2);
    });
  });

  describe('OptimizedCache', () => {
    let cache: OptimizedCache<string>;

    beforeEach(() => {
      cache = new OptimizedCache<string>(1024, 1000); // 1KB max, 1s TTL
    });

    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should expire items after TTL', async () => {
      const shortCache = new OptimizedCache<string>(1024, 50); // 50ms TTL
      shortCache.set('key1', 'value1');

      expect(shortCache.get('key1')).toBe('value1');

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(shortCache.get('key1')).toBeNull();
    });

    it('should delete items', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');
      expect(cache.get('key1')).toBeNull();
    });

    it('should provide cache statistics', () => {
      cache.set('key1', 'value1');
      const stats = cache.getStats();

      expect(stats).toHaveProperty('entries');
      expect(stats).toHaveProperty('currentSize');
      expect(stats).toHaveProperty('maxSize');
      expect(stats.entries).toBe(1);
    });

    it('should clear all items', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.getStats().entries).toBe(0);
    });
  });

  describe('BatchProcessor', () => {
    it('should process items in batches', async () => {
      const processor = new BatchProcessor<number, number>(
        3, // batch size
        async (batch: number[]) => batch.map((x) => x * 2),
      );

      const items = [1, 2, 3, 4, 5, 6, 7];
      const results = await processor.process(items);

      expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
    });

    it('should handle empty input', async () => {
      const processor = new BatchProcessor<number, number>(
        3,
        async (batch: number[]) => batch.map((x) => x * 2),
      );

      const results = await processor.process([]);
      expect(results).toEqual([]);
    });

    it('should handle single batch', async () => {
      const processor = new BatchProcessor<number, number>(
        5,
        async (batch: number[]) => batch.map((x) => x * 2),
      );

      const results = await processor.process([1, 2, 3]);
      expect(results).toEqual([2, 4, 6]);
    });
  });
});
