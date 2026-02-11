/**
 * 监控管理器 - 简化版，只保留实际使用的功能
 */

const BYTES_PER_MB = 1024 * 1024;

/**
 * 最大跟踪的工具数量（防止内存泄漏）
 */
const MAX_TRACKED_TOOLS = 100;

/**
 * 指标摘要
 */
export interface MetricsSummary {
  totalRequests: number;
  successRate: string;
  averageResponseTime: string;
  totalErrors: number;
  uptime: number;
  memoryUsageMB: number;
  activeConnections: number;
}

/**
 * 健康检查结果
 */
export interface HealthCheckResult {
  status: 'healthy' | 'warning' | 'error';
  checks: HealthCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

/**
 * 单个健康检查
 */
export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: unknown;
}

/**
 * 监控管理器
 */
export class MonitoringManager {
  private startTime = Date.now();
  private requests = {
    total: 0,
    successful: 0,
    failed: 0,
    totalTime: 0,
  };
  private errors: Array<{
    type: string;
    message: string;
    timestamp: number;
  }> = [];
  private toolCalls: Record<string, { count: number; totalTime: number }> = {};

  /**
   * 记录请求开始
   */
  recordRequestStart(): void {
    this.requests.total++;
  }

  /**
   * 记录请求结束
   */
  recordRequestEnd(success: boolean, startTime: number): void {
    const duration = Date.now() - startTime;
    this.requests.totalTime += duration;

    if (success) {
      this.requests.successful++;
    } else {
      this.requests.failed++;
    }
  }

  /**
   * 记录错误
   */
  recordError(type: string, message: string): void {
    this.errors.push({
      type,
      message,
      timestamp: Date.now(),
    });

    // 只保留最近100个错误
    if (this.errors.length > 100) {
      this.errors.shift();
    }
  }

  /**
   * 记录工具调用
   */
  recordToolCall(toolName: string, startTime: number): void {
    const duration = Date.now() - startTime;

    // 检查是否已存在该工具的记录
    if (!this.toolCalls[toolName]) {
      // 检查是否达到最大工具数量限制
      if (Object.keys(this.toolCalls).length >= MAX_TRACKED_TOOLS) {
        // 找到调用次数最少的工具并移除
        let minTool = '';
        let minCount = Infinity;
        for (const [name, stats] of Object.entries(this.toolCalls)) {
          if (stats.count < minCount) {
            minCount = stats.count;
            minTool = name;
          }
        }
        if (minTool) {
          delete this.toolCalls[minTool];
        }
      }
      this.toolCalls[toolName] = { count: 0, totalTime: 0 };
    }

    this.toolCalls[toolName].count++;
    this.toolCalls[toolName].totalTime += duration;
  }

  /**
   * 获取指标摘要
   */
  getMetricsSummary(): MetricsSummary {
    const total = this.requests.total || 1;
    const successRate = ((this.requests.successful / total) * 100).toFixed(2);
    const avgResponseTime = (this.requests.totalTime / total).toFixed(2);

    return {
      totalRequests: this.requests.total,
      successRate: `${successRate}%`,
      averageResponseTime: `${avgResponseTime}ms`,
      totalErrors: this.errors.length,
      uptime: Date.now() - this.startTime,
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / BYTES_PER_MB),
      activeConnections: 0,
    };
  }

  /**
   * 执行完整健康检查
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const checks: HealthCheck[] = [];

    // 内存检查
    const memoryUsage = process.memoryUsage();
    const memoryMB = Math.round(memoryUsage.heapUsed / BYTES_PER_MB);
    checks.push({
      name: '内存使用',
      status: memoryMB < 512 ? 'pass' : memoryMB < 1024 ? 'warn' : 'fail',
      message: `${memoryMB}MB`,
    });

    // 错误率检查
    const errorRate =
      this.requests.total > 0
        ? (this.errors.length / this.requests.total) * 100
        : 0;
    checks.push({
      name: '错误率',
      status: errorRate < 5 ? 'pass' : errorRate < 10 ? 'warn' : 'fail',
      message: `${errorRate.toFixed(2)}%`,
    });

    const passed = checks.filter((c) => c.status === 'pass').length;
    const failed = checks.filter((c) => c.status === 'fail').length;
    const warnings = checks.filter((c) => c.status === 'warn').length;

    return {
      status: failed > 0 ? 'error' : warnings > 0 ? 'warning' : 'healthy',
      checks,
      summary: {
        total: checks.length,
        passed,
        failed,
        warnings,
      },
    };
  }

  /**
   * 重置指标
   */
  resetMetrics(): void {
    this.requests = { total: 0, successful: 0, failed: 0, totalTime: 0 };
    this.errors = [];
    this.toolCalls = {};
    this.startTime = Date.now();
  }

  /**
   * 停止监控
   */
  stop(): void {
    // 简化版无定时器，无需清理
  }
}

/**
 * 创建监控管理器
 */
export function createMonitoringManager(): MonitoringManager {
  return new MonitoringManager();
}

/**
 * 格式化健康检查结果输出
 */
export function formatHealthCheckResult(result: HealthCheckResult): string {
  const statusEmoji = {
    healthy: '✅',
    warning: '⚠️',
    error: '❌',
  };

  const lines = [
    `${statusEmoji[result.status]} 健康检查 - ${result.status.toUpperCase()}`,
    '',
    `通过: ${result.summary.passed} | 警告: ${result.summary.warnings} | 失败: ${result.summary.failed}`,
  ];

  for (const check of result.checks) {
    const icon =
      check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    lines.push(`  ${icon} ${check.name}: ${check.message}`);
  }

  return lines.join('\n');
}
