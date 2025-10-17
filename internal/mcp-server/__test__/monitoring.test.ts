import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MonitoringManager } from '../src/utils/monitoring';

describe('MonitoringManager', () => {
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
      const metrics = monitoring.getMetrics();
      expect(metrics.requests.total).toBe(0);
      expect(metrics.tools.totalCalls).toBe(0);
      expect(metrics.errors.total).toBe(0);
      expect(metrics.connections.total).toBe(0);
    });
  });

  describe('request tracking', () => {
    it('should record request start and end', () => {
      const requestId = 'test-request-1';
      const startTime = Date.now();

      monitoring.recordRequestStart(requestId, 'test-method');

      const metrics1 = monitoring.getMetrics();
      expect(metrics1.requests.total).toBe(1);

      monitoring.recordRequestEnd(requestId, true, startTime);

      const metrics2 = monitoring.getMetrics();
      expect(metrics2.requests.successful).toBe(1);
      expect(metrics2.requests.failed).toBe(0);
    });

    it('should record failed requests', () => {
      const requestId = 'test-request-2';
      const startTime = Date.now();

      monitoring.recordRequestStart(requestId, 'test-method');
      monitoring.recordRequestEnd(requestId, false, startTime);

      const metrics = monitoring.getMetrics();
      expect(metrics.requests.successful).toBe(0);
      expect(metrics.requests.failed).toBe(1);
    });

    it('should calculate average response time', () => {
      const requestId1 = 'test-request-1';
      const requestId2 = 'test-request-2';
      const startTime1 = Date.now();
      const startTime2 = Date.now();

      monitoring.recordRequestStart(requestId1, 'test-method');
      monitoring.recordRequestEnd(requestId1, true, startTime1 - 100); // 100ms duration

      monitoring.recordRequestStart(requestId2, 'test-method');
      monitoring.recordRequestEnd(requestId2, true, startTime2 - 200); // 200ms duration

      const metrics = monitoring.getMetrics();
      expect(metrics.requests.averageResponseTime).toBeGreaterThan(0);
    });
  });

  describe('tool tracking', () => {
    it('should record tool calls', () => {
      const toolName = 'test-tool';
      const startTime = Date.now();

      monitoring.recordToolCall(toolName, startTime - 50, true);

      const metrics = monitoring.getMetrics();
      expect(metrics.tools.totalCalls).toBe(1);
      expect(metrics.tools.toolUsage[toolName]).toBe(1);
      expect(metrics.tools.averageExecutionTime[toolName]).toBeGreaterThan(0);
    });

    it('should track multiple tool calls', () => {
      const toolName1 = 'tool-1';
      const toolName2 = 'tool-2';
      const startTime = Date.now();

      monitoring.recordToolCall(toolName1, startTime - 100, true);
      monitoring.recordToolCall(toolName1, startTime - 150, true);
      monitoring.recordToolCall(toolName2, startTime - 200, true);

      const metrics = monitoring.getMetrics();
      expect(metrics.tools.totalCalls).toBe(3);
      expect(metrics.tools.toolUsage[toolName1]).toBe(2);
      expect(metrics.tools.toolUsage[toolName2]).toBe(1);
    });

    it('should calculate average execution time per tool', () => {
      const toolName = 'test-tool';
      const startTime = Date.now();

      monitoring.recordToolCall(toolName, startTime - 100, true); // 100ms
      monitoring.recordToolCall(toolName, startTime - 200, true); // 200ms

      const metrics = monitoring.getMetrics();
      expect(metrics.tools.averageExecutionTime[toolName]).toBe(150); // (100 + 200) / 2
    });
  });

  describe('resource tracking', () => {
    it('should record resource access', () => {
      const resourceUri = 'component-source://test-package/Button.tsx';

      monitoring.recordResourceAccess(resourceUri, true);

      const metrics = monitoring.getMetrics();
      expect(metrics.resources.totalAccess).toBe(1);
      expect(metrics.resources.resourceUsage[resourceUri]).toBe(1);
    });

    it('should track multiple resource accesses', () => {
      const resourceUri1 = 'component-source://package1/Button.tsx';
      const resourceUri2 = 'component-readme://package2/README.md';

      monitoring.recordResourceAccess(resourceUri1, true);
      monitoring.recordResourceAccess(resourceUri1, true);
      monitoring.recordResourceAccess(resourceUri2, true);

      const metrics = monitoring.getMetrics();
      expect(metrics.resources.totalAccess).toBe(3);
      expect(metrics.resources.resourceUsage[resourceUri1]).toBe(2);
      expect(metrics.resources.resourceUsage[resourceUri2]).toBe(1);
    });
  });

  describe('error tracking', () => {
    it('should record errors', () => {
      const errorType = 'validation_error';
      const errorMessage = 'Test error message';

      monitoring.recordError(errorType, errorMessage);

      const metrics = monitoring.getMetrics();
      expect(metrics.errors.total).toBe(1);
      expect(metrics.errors.byType[errorType]).toBe(1);
      expect(metrics.errors.recentErrors).toHaveLength(1);
      expect(metrics.errors.recentErrors[0]?.type).toBe(errorType);
      expect(metrics.errors.recentErrors[0]?.message).toBe(errorMessage);
    });

    it('should limit recent errors to 100', () => {
      // Record 150 errors
      for (let i = 0; i < 150; i++) {
        monitoring.recordError('test_error', `Error ${i}`);
      }

      const metrics = monitoring.getMetrics();
      expect(metrics.errors.total).toBe(150);
      expect(metrics.errors.recentErrors).toHaveLength(100);
      // Should have the most recent 100 errors
      expect(metrics.errors.recentErrors[99]?.message).toBe('Error 149');
    });
  });

  describe('connection tracking', () => {
    it('should record connection open and close', () => {
      const connectionId = 'conn-1';
      const startTime = Date.now();

      monitoring.recordConnectionOpen(connectionId, 'websocket');

      let metrics = monitoring.getMetrics();
      expect(metrics.connections.total).toBe(1);
      expect(metrics.connections.active).toBe(1);
      expect(metrics.connections.websocketConnections).toBe(1);

      monitoring.recordConnectionClose(connectionId, startTime - 1000); // 1 second duration

      metrics = monitoring.getMetrics();
      expect(metrics.connections.active).toBe(0);
      expect(metrics.connections.averageConnectionDuration).toBeGreaterThan(0);
    });

    it('should track different connection types', () => {
      monitoring.recordConnectionOpen('ws-1', 'websocket');
      monitoring.recordConnectionOpen('stdio-1', 'stdio');

      const metrics = monitoring.getMetrics();
      expect(metrics.connections.total).toBe(2);
      expect(metrics.connections.websocketConnections).toBe(1);
    });
  });

  describe('cache hit rate', () => {
    it('should update cache hit rate', () => {
      monitoring.updateCacheHitRate(0.85);

      const metrics = monitoring.getMetrics();
      expect(metrics.resources.cacheHitRate).toBe(0.85);
    });
  });

  describe('metrics summary', () => {
    it('should provide metrics summary', () => {
      // Record some activity
      monitoring.recordRequestStart('req-1', 'test');
      monitoring.recordRequestEnd('req-1', true, Date.now() - 100);
      monitoring.recordError('test_error', 'Test error');
      monitoring.recordConnectionOpen('conn-1', 'websocket');

      const summary = monitoring.getMetricsSummary();
      expect(summary.totalRequests).toBe(1);
      expect(summary.successRate).toBe('100.00%');
      expect(summary.averageResponseTime).toContain('ms');
      expect(summary.totalErrors).toBe(1);
      expect(summary.uptime).toBeGreaterThanOrEqual(0);
      expect(summary.memoryUsageMB).toBeGreaterThan(0);
      expect(summary.activeConnections).toBe(1);
    });

    it('should calculate success rate correctly', () => {
      monitoring.recordRequestStart('req-1', 'test');
      monitoring.recordRequestEnd('req-1', true, Date.now() - 100);
      monitoring.recordRequestStart('req-2', 'test');
      monitoring.recordRequestEnd('req-2', false, Date.now() - 100);

      const summary = monitoring.getMetricsSummary();
      expect(summary.totalRequests).toBe(2);
      expect(summary.successRate).toBe('50.00%'); // 1 success out of 2 requests
    });
  });

  describe('reset metrics', () => {
    it('should reset all metrics', () => {
      // Record some activity
      monitoring.recordRequestStart('req-1', 'test');
      monitoring.recordToolCall('tool-1', Date.now() - 100, true);
      monitoring.recordError('test_error', 'Test error');

      let metrics = monitoring.getMetrics();
      expect(metrics.requests.total).toBe(1);
      expect(metrics.tools.totalCalls).toBe(1);
      expect(metrics.errors.total).toBe(1);

      monitoring.resetMetrics();

      metrics = monitoring.getMetrics();
      expect(metrics.requests.total).toBe(0);
      expect(metrics.tools.totalCalls).toBe(0);
      expect(metrics.errors.total).toBe(0);
    });
  });

  describe('periodic updates', () => {
    it('should update system metrics', () => {
      const metrics1 = monitoring.getMetrics();
      const uptime1 = metrics1.system.uptime;

      // Wait a bit and check again
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const metrics2 = monitoring.getMetrics();
          expect(metrics2.system.uptime).toBeGreaterThan(uptime1);
          expect(metrics2.system.memoryUsage).toBeDefined();
          expect(metrics2.system.cpuUsage).toBeDefined();
          resolve();
        }, 50);
      });
    });
  });

  describe('event emitters', () => {
    it('should emit events for monitoring events', () => {
      const events: string[] = [];

      monitoring.on('request_start', () => events.push('request_start'));
      monitoring.on('request_end', () => events.push('request_end'));
      monitoring.on('tool_call', () => events.push('tool_call'));
      monitoring.on('error', () => events.push('error'));

      monitoring.recordRequestStart('req-1', 'test');
      monitoring.recordRequestEnd('req-1', true, Date.now());
      monitoring.recordToolCall('tool-1', Date.now(), true);
      monitoring.recordError('test_error', 'Test error');

      expect(events).toContain('request_start');
      expect(events).toContain('request_end');
      expect(events).toContain('tool_call');
      expect(events).toContain('error');
    });
  });
});
