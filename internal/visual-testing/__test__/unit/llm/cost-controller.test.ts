/**
 * LLMCostController 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMCostController } from '../../../src/core/llm/cost-controller';
import type { CompareResult } from '../../../src/types/comparison';

/** 创建 mock CompareResult */
function mockCompareResult(
  overrides: Partial<CompareResult> = {},
): CompareResult {
  return {
    match: false,
    mismatchPercentage: 10,
    mismatchPixels: 1000,
    totalPixels: 10000,
    diffPath: '/tmp/diff.png',
    sizeDiff: null,
    diffRegions: [],
    ...overrides,
  };
}

describe('LLMCostController', () => {
  let controller: LLMCostController;

  beforeEach(() => {
    controller = new LLMCostController({
      maxCallsPerRun: 5,
      diffThreshold: 5,
      cacheEnabled: true,
      cacheTTL: 3600,
    });
  });

  describe('shouldAnalyze', () => {
    it('should return false for matching images', () => {
      const result = mockCompareResult({ match: true, mismatchPercentage: 0 });
      expect(controller.shouldAnalyze(result)).toBe(false);
    });

    it('should return true for significant diffs above threshold', () => {
      const result = mockCompareResult({ mismatchPercentage: 10 });
      expect(controller.shouldAnalyze(result)).toBe(true);
    });

    it('should return false when diff is below threshold', () => {
      const result = mockCompareResult({ mismatchPercentage: 3 });
      expect(controller.shouldAnalyze(result)).toBe(false);
    });

    it('should return false when maxCallsPerRun is reached', () => {
      const result = mockCompareResult({ mismatchPercentage: 10 });

      // shouldAnalyze 采用预留模式，每次返回 true 时自动递增 callCount
      for (let i = 0; i < 5; i++) {
        expect(controller.shouldAnalyze(result)).toBe(true);
      }

      // 第 6 次应返回 false（额度已满）
      expect(controller.shouldAnalyze(result)).toBe(false);
    });

    it('should return true when diff equals threshold', () => {
      const result = mockCompareResult({ mismatchPercentage: 5 });
      expect(controller.shouldAnalyze(result)).toBe(true);
    });

    it('should analyze with lower threshold', () => {
      controller = new LLMCostController({
        maxCallsPerRun: 50,
        diffThreshold: 1,
        cacheEnabled: false,
        cacheTTL: 3600,
      });

      const result = mockCompareResult({ mismatchPercentage: 3 });
      expect(controller.shouldAnalyze(result)).toBe(true);
    });
  });

  describe('call counting', () => {
    it('should track call count via shouldAnalyze reservation', () => {
      const result = mockCompareResult({ mismatchPercentage: 10 });

      expect(controller.getCostStats().callCount).toBe(0);
      expect(controller.getRemainingCalls()).toBe(5);

      // shouldAnalyze 成功时预留额度（callCount++）
      controller.shouldAnalyze(result);
      expect(controller.getCostStats().callCount).toBe(1);
      expect(controller.getRemainingCalls()).toBe(4);

      controller.shouldAnalyze(result);
      controller.shouldAnalyze(result);
      expect(controller.getCostStats().callCount).toBe(3);
      expect(controller.getRemainingCalls()).toBe(2);
    });

    it('should release reserved call on cache hit', () => {
      const result = mockCompareResult({ mismatchPercentage: 10 });

      controller.shouldAnalyze(result);
      expect(controller.getCostStats().callCount).toBe(1);

      // 缓存命中时释放预留
      controller.releaseCall();
      expect(controller.getCostStats().callCount).toBe(0);
      expect(controller.getRemainingCalls()).toBe(5);
    });

    it('should reset call count', () => {
      const result = mockCompareResult({ mismatchPercentage: 10 });

      controller.shouldAnalyze(result);
      controller.shouldAnalyze(result);
      expect(controller.getCostStats().callCount).toBe(2);

      controller.reset();
      expect(controller.getCostStats().callCount).toBe(0);
      expect(controller.getRemainingCalls()).toBe(5);
    });

    it('should not allow negative remaining calls', () => {
      const result = mockCompareResult({ mismatchPercentage: 10 });

      // 消耗所有 5 个额度
      for (let i = 0; i < 5; i++) {
        controller.shouldAnalyze(result);
      }
      expect(controller.getRemainingCalls()).toBe(0);
    });
  });

  describe('shouldCall', () => {
    it('should return true when calls are available', () => {
      expect(controller.shouldCall()).toBe(true);
    });

    it('should reserve call count like shouldAnalyze', () => {
      controller.shouldCall();
      expect(controller.getCostStats().callCount).toBe(1);
      expect(controller.getRemainingCalls()).toBe(4);
    });

    it('should return false when maxCallsPerRun is reached', () => {
      for (let i = 0; i < 5; i++) {
        expect(controller.shouldCall()).toBe(true);
      }
      expect(controller.shouldCall()).toBe(false);
    });

    it('should share call count with shouldAnalyze', () => {
      const result = mockCompareResult({ mismatchPercentage: 10 });

      // 用 shouldAnalyze 消耗 3 个
      controller.shouldAnalyze(result);
      controller.shouldAnalyze(result);
      controller.shouldAnalyze(result);

      // shouldCall 也只剩 2 个
      expect(controller.shouldCall()).toBe(true);
      expect(controller.shouldCall()).toBe(true);
      expect(controller.shouldCall()).toBe(false);
    });

    it('should respect maxBudget', () => {
      controller = new LLMCostController({
        maxCallsPerRun: 100,
        diffThreshold: 5,
        cacheEnabled: false,
        cacheTTL: 3600,
        maxBudget: 0.01,
      });

      // 模拟一次高成本调用使预算超限
      controller.shouldCall();
      controller.recordCall({
        prompt_tokens: 10000,
        completion_tokens: 10000,
      });

      // 预算超限后 shouldCall 应返回 false
      expect(controller.shouldCall()).toBe(false);
    });
  });

  describe('cache stats', () => {
    it('should return cache statistics', () => {
      const stats = controller.getCacheStats();
      expect(stats).toHaveProperty('items');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
    });
  });
});
