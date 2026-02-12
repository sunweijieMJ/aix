import { describe, expect, it, beforeEach } from 'vitest';
import { ConcurrencyController } from '../src/utils/performance';

describe('Performance Utils', () => {
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
});
