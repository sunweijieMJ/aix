/**
 * MonitoringManager 测试 (简化版)
 *
 * 简化后的 MonitoringManager 只保留基本的请求、工具调用和错误跟踪功能
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MonitoringManager } from '../src/utils/monitoring';

describe('MonitoringManager (简化版)', () => {
  let monitoring: MonitoringManager;

  beforeEach(() => {
    monitoring = new MonitoringManager();
  });

  afterEach(() => {
    monitoring.stop();
  });

  describe('constructor', () => {
    it('should create monitoring manager instance', () => {
      expect(monitoring).toBeInstanceOf(MonitoringManager);
    });

    it('should initialize with default metrics', () => {
      const summary = monitoring.getMetricsSummary();
      expect(summary.totalRequests).toBe(0);
      expect(summary.totalErrors).toBe(0);
    });
  });

  describe('request tracking', () => {
    it('should record request start and end', () => {
      const startTime = Date.now();

      monitoring.recordRequestStart();
      monitoring.recordRequestEnd(true, startTime);

      const summary = monitoring.getMetricsSummary();
      expect(summary.totalRequests).toBe(1);
      expect(summary.successRate).toBe('100.00%');
    });

    it('should record failed requests', () => {
      const startTime = Date.now();

      monitoring.recordRequestStart();
      monitoring.recordRequestEnd(false, startTime);

      const summary = monitoring.getMetricsSummary();
      expect(summary.totalRequests).toBe(1);
      expect(summary.successRate).toBe('0.00%');
    });
  });

  describe('tool tracking', () => {
    it('should record tool calls without error', () => {
      const toolName = 'test-tool';
      const startTime = Date.now();

      // recordToolCall 不会抛出错误
      expect(() => {
        monitoring.recordToolCall(toolName, startTime - 50);
      }).not.toThrow();
    });

    it('should handle multiple tool calls', () => {
      const toolName1 = 'tool-1';
      const toolName2 = 'tool-2';
      const startTime = Date.now();

      // 多次调用不会抛出错误
      expect(() => {
        monitoring.recordToolCall(toolName1, startTime - 100);
        monitoring.recordToolCall(toolName1, startTime - 150);
        monitoring.recordToolCall(toolName2, startTime - 200);
      }).not.toThrow();
    });
  });

  describe('error tracking', () => {
    it('should record errors', () => {
      const errorType = 'validation_error';
      const errorMessage = 'Test error message';

      monitoring.recordError(errorType, errorMessage);

      const summary = monitoring.getMetricsSummary();
      expect(summary.totalErrors).toBe(1);
    });

    it('should limit errors to 100', () => {
      // Record 150 errors
      for (let i = 0; i < 150; i++) {
        monitoring.recordError('test_error', `Error ${i}`);
      }

      const summary = monitoring.getMetricsSummary();
      // 简化版只保留最近 100 个错误
      expect(summary.totalErrors).toBeLessThanOrEqual(100);
    });
  });

  describe('metrics summary', () => {
    it('should provide metrics summary', () => {
      // Record some activity
      monitoring.recordRequestStart();
      monitoring.recordRequestEnd(true, Date.now() - 100);
      monitoring.recordError('test_error', 'Test error');

      const summary = monitoring.getMetricsSummary();
      expect(summary.totalRequests).toBe(1);
      expect(summary.successRate).toBe('100.00%');
      expect(summary.averageResponseTime).toContain('ms');
      expect(summary.totalErrors).toBe(1);
      expect(summary.uptime).toBeGreaterThanOrEqual(0);
      expect(summary.memoryUsageMB).toBeGreaterThan(0);
      // 简化版活跃连接始终为 0
      expect(summary.activeConnections).toBe(0);
    });

    it('should calculate success rate correctly', () => {
      monitoring.recordRequestStart();
      monitoring.recordRequestEnd(true, Date.now() - 100);
      monitoring.recordRequestStart();
      monitoring.recordRequestEnd(false, Date.now() - 100);

      const summary = monitoring.getMetricsSummary();
      expect(summary.totalRequests).toBe(2);
      expect(summary.successRate).toBe('50.00%'); // 1 success out of 2 requests
    });
  });

  describe('reset metrics', () => {
    it('should reset all metrics', () => {
      // Record some activity
      monitoring.recordRequestStart();
      monitoring.recordToolCall('tool-1', Date.now() - 100);
      monitoring.recordError('test_error', 'Test error');

      let summary = monitoring.getMetricsSummary();
      expect(summary.totalRequests).toBe(1);
      expect(summary.totalErrors).toBe(1);

      monitoring.resetMetrics();

      summary = monitoring.getMetricsSummary();
      expect(summary.totalRequests).toBe(0);
      expect(summary.totalErrors).toBe(0);
    });
  });
});
