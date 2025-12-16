/**
 * @fileoverview RetryEngine 测试
 */

import { describe, it, expect, vi } from 'vitest';
import { RetryEngine, createRetryEngine } from '../src/core/RetryEngine';

describe('core/RetryEngine', () => {
  describe('initialization', () => {
    it('should initialize with default config', () => {
      const engine = new RetryEngine();
      const state = engine.getState();

      expect(state.retryCount).toBe(0);
      expect(state.isRetrying).toBe(false);
    });

    it('should use custom config', () => {
      const engine = new RetryEngine({
        maxRetries: 5,
        initialDelay: 2000,
      });
      const state = engine.getState();

      expect(state.nextDelay).toBe(2000);
    });
  });

  describe('execute', () => {
    it('should return result on success', async () => {
      const engine = new RetryEngine();
      const fn = vi.fn().mockResolvedValue('success');

      const result = await engine.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const engine = new RetryEngine({
        maxRetries: 3,
        initialDelay: 1, // 使用最小延迟加速测试
        exponentialBackoff: false,
      });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('HTTP 500'))
        .mockResolvedValue('success');

      const result = await engine.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const engine = new RetryEngine({
        maxRetries: 2,
        initialDelay: 1,
        exponentialBackoff: false,
      });

      const error = new Error('HTTP 500');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(engine.execute(fn)).rejects.toThrow('HTTP 500');
      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const engine = new RetryEngine({ maxRetries: 3 });
      const error = new Error('HTTP 401 Unauthorized');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(engine.execute(fn)).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry abort errors', async () => {
      const engine = new RetryEngine({ maxRetries: 3 });
      const error = new Error('Aborted');
      error.name = 'AbortError';
      const fn = vi.fn().mockRejectedValue(error);

      await expect(engine.execute(fn)).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('exponential backoff', () => {
    it('should calculate exponential delays', async () => {
      const engine = new RetryEngine({
        maxRetries: 3,
        initialDelay: 10,
        backoffFactor: 2,
        exponentialBackoff: true,
      });

      const delays: number[] = [];
      engine.subscribe((state) => {
        if (state.isRetrying) {
          delays.push(state.nextDelay);
        }
      });

      const fn = vi.fn().mockRejectedValue(new Error('HTTP 500'));

      await engine.execute(fn).catch(() => {});

      // Check exponential growth pattern
      expect(delays[0]).toBe(10); // 10 * 2^0
      expect(delays[1]).toBe(20); // 10 * 2^1
      expect(delays[2]).toBe(40); // 10 * 2^2
    });

    it('should respect maxDelay', async () => {
      const engine = new RetryEngine({
        maxRetries: 5,
        initialDelay: 100,
        backoffFactor: 10,
        maxDelay: 500,
        exponentialBackoff: true,
      });

      let maxObservedDelay = 0;
      engine.subscribe((state) => {
        if (state.isRetrying && state.nextDelay > maxObservedDelay) {
          maxObservedDelay = state.nextDelay;
        }
      });

      const fn = vi.fn().mockRejectedValue(new Error('HTTP 500'));

      await engine.execute(fn).catch(() => {});

      expect(maxObservedDelay).toBeLessThanOrEqual(500);
    });

    it('should use fixed delay when exponentialBackoff is false', async () => {
      const engine = new RetryEngine({
        maxRetries: 3,
        initialDelay: 10,
        exponentialBackoff: false,
      });

      const delays: number[] = [];
      engine.subscribe((state) => {
        if (state.isRetrying) {
          delays.push(state.nextDelay);
        }
      });

      const fn = vi.fn().mockRejectedValue(new Error('HTTP 500'));

      await engine.execute(fn).catch(() => {});

      expect(delays.every((d) => d === 10)).toBe(true);
    });
  });

  describe('callbacks', () => {
    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      const engine = new RetryEngine({
        maxRetries: 2,
        initialDelay: 1,
        exponentialBackoff: false,
        onRetry,
      });

      const fn = vi.fn().mockRejectedValue(new Error('HTTP 500'));

      await engine.execute(fn).catch(() => {});

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(1, 1, expect.any(Error));
      expect(onRetry).toHaveBeenCalledWith(2, 1, expect.any(Error));
    });
  });

  describe('custom shouldRetry', () => {
    it('should use custom shouldRetry function', async () => {
      const shouldRetry = vi.fn().mockReturnValue(false);
      const engine = new RetryEngine({
        maxRetries: 3,
        shouldRetry,
      });

      const fn = vi.fn().mockRejectedValue(new Error('Custom error'));

      await expect(engine.execute(fn)).rejects.toThrow();

      expect(shouldRetry).toHaveBeenCalled();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('state management', () => {
    it('should track retry count', async () => {
      const engine = new RetryEngine({
        maxRetries: 2,
        initialDelay: 1,
        exponentialBackoff: false,
      });

      let maxRetryCount = 0;
      engine.subscribe((state) => {
        if (state.retryCount > maxRetryCount) {
          maxRetryCount = state.retryCount;
        }
      });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('HTTP 500'))
        .mockResolvedValue('success');

      await engine.execute(fn);

      expect(maxRetryCount).toBe(1);
    });

    it('should reset state on success', async () => {
      const engine = new RetryEngine({
        maxRetries: 2,
        initialDelay: 1,
        exponentialBackoff: false,
      });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('HTTP 500'))
        .mockResolvedValue('success');

      await engine.execute(fn);

      const state = engine.getState();
      expect(state.retryCount).toBe(0);
      expect(state.isRetrying).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset state', () => {
      const engine = new RetryEngine({ initialDelay: 100 });

      engine.reset();

      const state = engine.getState();
      expect(state.retryCount).toBe(0);
      expect(state.isRetrying).toBe(false);
      expect(state.nextDelay).toBe(100);
    });
  });

  describe('destroy', () => {
    it('should clean up', () => {
      const engine = new RetryEngine();
      const listener = vi.fn();

      engine.subscribe(listener);
      engine.destroy();

      expect(engine.listenerCount).toBe(0);
    });
  });

  describe('createRetryEngine helper', () => {
    it('should create engine instance', () => {
      const engine = createRetryEngine({ maxRetries: 5 });
      expect(engine).toBeInstanceOf(RetryEngine);
    });
  });
});
