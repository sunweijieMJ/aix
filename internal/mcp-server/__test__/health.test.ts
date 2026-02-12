/**
 * 健康检查测试 (简化版)
 *
 * 简化后的 MonitoringManager 只保留基本的健康检查功能:
 * - 内存使用检查
 * - 错误率检查
 */
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  formatHealthCheckResult,
  MonitoringManager,
} from '../src/utils/monitoring';

describe('Health Checker (简化版)', () => {
  const testDataDir = join(process.cwd(), 'test-tmp');

  beforeEach(async () => {
    // 清理测试目录
    await rm(testDataDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    // 清理测试目录
    await rm(testDataDir, { recursive: true, force: true });
  });

  describe('MonitoringManager 健康检查', () => {
    it('应该创建监控管理器实例', () => {
      const checker = new MonitoringManager();
      expect(checker).toBeInstanceOf(MonitoringManager);
      checker.resetMetrics();
    });

    it('应该执行完整的健康检查', async () => {
      await mkdir(testDataDir, { recursive: true });

      const checker = new MonitoringManager();
      const result = await checker.performHealthCheck();

      expect(result).toHaveProperty('status');
      expect(['healthy', 'warning', 'error']).toContain(result.status);
      expect(result).toHaveProperty('checks');
      expect(Array.isArray(result.checks)).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('total');
      expect(result.summary).toHaveProperty('passed');
      expect(result.summary).toHaveProperty('failed');
      expect(result.summary).toHaveProperty('warnings');

      checker.resetMetrics();
    });

    it('应该执行健康检查', async () => {
      const checker = new MonitoringManager();
      const result = await checker.performHealthCheck();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('checks');
      // 简化版只有内存和错误率两个检查
      expect(result.checks.length).toBe(2);
      expect(result).toHaveProperty('summary');

      // 检查内存使用
      const memoryCheck = result.checks.find((c) => c.name === '内存使用');
      expect(memoryCheck).toBeDefined();
      expect(['pass', 'warn', 'fail']).toContain(memoryCheck?.status);

      // 检查错误率
      const errorRateCheck = result.checks.find((c) => c.name === '错误率');
      expect(errorRateCheck).toBeDefined();
      expect(['pass', 'warn', 'fail']).toContain(errorRateCheck?.status);

      checker.resetMetrics();
    });

    it('应该检测高错误率', async () => {
      const checker = new MonitoringManager();

      // 模拟大量失败请求（错误率基于 requests.failed 而非 errors 数组）
      for (let i = 0; i < 20; i++) {
        checker.recordRequestStart();
        checker.recordRequestEnd(false, Date.now() - 50);
        checker.recordError('test_error', `Error ${i}`);
      }

      const result = await checker.performHealthCheck();
      const errorRateCheck = result.checks.find((c) => c.name === '错误率');

      expect(errorRateCheck).toBeDefined();
      // 高错误率应该导致警告或失败
      expect(['warn', 'fail']).toContain(errorRateCheck?.status);

      checker.resetMetrics();
    });

    it('应该在无错误时返回健康状态', async () => {
      const checker = new MonitoringManager();

      // 记录一些成功的请求但没有错误
      for (let i = 0; i < 10; i++) {
        checker.recordRequestStart();
        checker.recordRequestEnd(true, Date.now() - 50);
      }

      const result = await checker.performHealthCheck();
      const errorRateCheck = result.checks.find((c) => c.name === '错误率');

      expect(errorRateCheck).toBeDefined();
      expect(errorRateCheck?.status).toBe('pass');

      checker.resetMetrics();
    });
  });

  describe('formatHealthCheckResult', () => {
    it('应该格式化健康的检查结果', () => {
      const result = {
        status: 'healthy' as const,
        checks: [
          {
            name: '测试检查',
            status: 'pass' as const,
            message: '检查通过',
          },
        ],
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          warnings: 0,
        },
      };

      const formatted = formatHealthCheckResult(result);
      expect(formatted).toContain('✅ 健康检查 - HEALTHY');
      expect(formatted).toContain('通过: 1');
      expect(formatted).toContain('✅ 测试检查: 检查通过');
    });

    it('应该格式化有警告的检查结果', () => {
      const result = {
        status: 'warning' as const,
        checks: [
          {
            name: '测试检查',
            status: 'warn' as const,
            message: '检查有警告',
          },
        ],
        summary: {
          total: 1,
          passed: 0,
          failed: 0,
          warnings: 1,
        },
      };

      const formatted = formatHealthCheckResult(result);
      expect(formatted).toContain('⚠️ 健康检查 - WARNING');
      expect(formatted).toContain('警告: 1');
      expect(formatted).toContain('⚠️ 测试检查: 检查有警告');
    });

    it('应该格式化有错误的检查结果', () => {
      const result = {
        status: 'error' as const,
        checks: [
          {
            name: '测试检查',
            status: 'fail' as const,
            message: '检查失败',
          },
        ],
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          warnings: 0,
        },
      };

      const formatted = formatHealthCheckResult(result);
      expect(formatted).toContain('❌ 健康检查 - ERROR');
      expect(formatted).toContain('失败: 1');
      expect(formatted).toContain('❌ 测试检查: 检查失败');
    });
  });
});
