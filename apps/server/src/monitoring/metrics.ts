import { createLogger } from '../utils/logger';
import { config } from '../config';

const logger = createLogger('METRICS');

/**
 * 性能指标类型
 */
export interface PerformanceMetrics {
  timestamp: string;
  requests: {
    total: number;
    successful: number;
    failed: number;
    rate: number; // 每秒请求数
  };
  response: {
    averageTime: number;
    p50: number;
    p95: number;
    p99: number;
  };
  errors: {
    total: number;
    rate: number; // 错误率
    byType: Record<string, number>;
  };
  system: {
    cpuUsage: number;
    memoryUsage: number;
    activeConnections: number;
  };
}

/**
 * 请求指标
 */
interface RequestMetric {
  timestamp: number;
  duration: number;
  status: number;
  method: string;
  path: string;
  error?: string;
}

/**
 * 性能监控管理器
 */
export class MetricsManager {
  private static instance: MetricsManager;
  private metrics: RequestMetric[] = [];
  private readonly maxMetricsHistory = 10000; // 保留最近10000条记录
  private readonly windowSize = 60000; // 1分钟窗口
  private metricsInterval: NodeJS.Timeout | null = null;
  private currentMetrics: PerformanceMetrics | null = null;

  private constructor() {
    this.setupMetricsCollection();
  }

  static getInstance(): MetricsManager {
    if (!MetricsManager.instance) {
      MetricsManager.instance = new MetricsManager();
    }
    return MetricsManager.instance;
  }

  /**
   * 设置指标收集
   */
  private setupMetricsCollection(): void {
    if (config.monitoring.metrics.enabled) {
      // 每30秒计算一次指标
      this.metricsInterval = setInterval(() => {
        this.calculateMetrics();
      }, 30000);

      logger.info('Performance metrics collection enabled');
    }
  }

  /**
   * 记录请求指标
   */
  recordRequest(metric: Omit<RequestMetric, 'timestamp'>): void {
    const requestMetric: RequestMetric = {
      ...metric,
      timestamp: Date.now(),
    };

    this.metrics.push(requestMetric);

    // 清理旧指标
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }

    // 实时更新错误指标
    if (metric.status >= 400) {
      logger.debug(`Error recorded: ${metric.method} ${metric.path} - ${metric.status}`);
    }
  }

  /**
   * 计算性能指标
   */
  private calculateMetrics(): void {
    try {
      const now = Date.now();
      const windowStart = now - this.windowSize;

      // 过滤出时间窗口内的指标
      const recentMetrics = this.metrics.filter(metric => metric.timestamp >= windowStart);

      if (recentMetrics.length === 0) {
        this.currentMetrics = this.createEmptyMetrics();
        return;
      }

      // 计算请求指标
      const totalRequests = recentMetrics.length;
      const successfulRequests = recentMetrics.filter(m => m.status < 400).length;
      const failedRequests = totalRequests - successfulRequests;
      const requestRate = totalRequests / (this.windowSize / 1000); // 每秒请求数

      // 计算响应时间指标
      const responseTimes = recentMetrics.map(m => m.duration).sort((a, b) => a - b);
      const averageTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const p50 = this.getPercentile(responseTimes, 0.5);
      const p95 = this.getPercentile(responseTimes, 0.95);
      const p99 = this.getPercentile(responseTimes, 0.99);

      // 计算错误指标
      const totalErrors = failedRequests;
      const errorRate = totalErrors / totalRequests;
      const errorsByType = this.groupErrorsByType(recentMetrics.filter(m => m.status >= 400));

      // 系统指标（简化版本）
      const memoryUsage = process.memoryUsage();
      const cpuUsage = this.getCurrentCPUUsage();

      this.currentMetrics = {
        timestamp: new Date().toISOString(),
        requests: {
          total: totalRequests,
          successful: successfulRequests,
          failed: failedRequests,
          rate: Math.round(requestRate * 100) / 100,
        },
        response: {
          averageTime: Math.round(averageTime * 100) / 100,
          p50: Math.round(p50 * 100) / 100,
          p95: Math.round(p95 * 100) / 100,
          p99: Math.round(p99 * 100) / 100,
        },
        errors: {
          total: totalErrors,
          rate: Math.round(errorRate * 10000) / 100, // 百分比
          byType: errorsByType,
        },
        system: {
          cpuUsage: Math.round(cpuUsage * 100) / 100,
          memoryUsage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 10000) / 100,
          activeConnections: this.getActiveConnections(),
        },
      };

      logger.debug('Metrics calculated', {
        requests: this.currentMetrics.requests.total,
        avgResponseTime: this.currentMetrics.response.averageTime,
        errorRate: this.currentMetrics.errors.rate,
      });
    } catch (error) {
      logger.error('Failed to calculate metrics:', error);
    }
  }

  /**
   * 获取百分位数
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;

    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, index)] ?? 0;
  }

  /**
   * 按类型分组错误
   */
  private groupErrorsByType(errorMetrics: RequestMetric[]): Record<string, number> {
    const groups: Record<string, number> = {};

    errorMetrics.forEach(metric => {
      const statusCode = metric.status.toString();
      const statusGroup = `${statusCode[0]}xx`; // 4xx, 5xx

      groups[statusGroup] = (groups[statusGroup] || 0) + 1;
      groups[statusCode] = (groups[statusCode] || 0) + 1;

      if (metric.error) {
        const errorType = metric.error.split(':')[0]?.trim() ?? 'Unknown';
        groups[errorType] = (groups[errorType] || 0) + 1;
      }
    });

    return groups;
  }

  /**
   * 获取当前CPU使用率（简化版本）
   */
  private getCurrentCPUUsage(): number {
    // 这里使用简化的方法，实际项目中可能需要更精确的计算
    const cpuUsage = process.cpuUsage();
    const totalUsage = cpuUsage.user + cpuUsage.system;
    return totalUsage / 1000000; // 转换为秒
  }

  /**
   * 获取活跃连接数（简化版本）
   */
  private getActiveConnections(): number {
    // 这里返回一个估算值，实际项目中需要从HTTP服务器获取真实数据
    return this.metrics.filter(m => Date.now() - m.timestamp < 5000).length;
  }

  /**
   * 创建空指标
   */
  private createEmptyMetrics(): PerformanceMetrics {
    return {
      timestamp: new Date().toISOString(),
      requests: { total: 0, successful: 0, failed: 0, rate: 0 },
      response: { averageTime: 0, p50: 0, p95: 0, p99: 0 },
      errors: { total: 0, rate: 0, byType: {} },
      system: { cpuUsage: 0, memoryUsage: 0, activeConnections: 0 },
    };
  }

  /**
   * 获取当前指标
   */
  getCurrentMetrics(): PerformanceMetrics {
    if (!this.currentMetrics) {
      this.calculateMetrics();
    }
    return this.currentMetrics || this.createEmptyMetrics();
  }

  /**
   * 获取历史指标（最近N分钟）
   */
  getHistoricalMetrics(minutes: number = 60): RequestMetric[] {
    const cutoffTime = Date.now() - minutes * 60 * 1000;
    return this.metrics.filter(metric => metric.timestamp >= cutoffTime);
  }

  /**
   * 获取错误统计
   */
  getErrorStatistics(hours: number = 24): {
    total: number;
    byStatus: Record<string, number>;
    byPath: Record<string, number>;
    timeline: Array<{ timestamp: string; count: number }>;
  } {
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
    const errorMetrics = this.metrics.filter(metric => metric.timestamp >= cutoffTime && metric.status >= 400);

    const byStatus: Record<string, number> = {};
    const byPath: Record<string, number> = {};

    errorMetrics.forEach(metric => {
      const status = metric.status.toString();
      byStatus[status] = (byStatus[status] || 0) + 1;
      byPath[metric.path] = (byPath[metric.path] || 0) + 1;
    });

    // 创建时间线（每小时一个数据点）
    const timeline: Array<{ timestamp: string; count: number }> = [];
    const hourlyBuckets: Record<string, number> = {};

    errorMetrics.forEach(metric => {
      const hour = new Date(metric.timestamp);
      hour.setMinutes(0, 0, 0);
      const hourKey = hour.toISOString();
      hourlyBuckets[hourKey] = (hourlyBuckets[hourKey] || 0) + 1;
    });

    Object.entries(hourlyBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([timestamp, count]) => {
        timeline.push({ timestamp, count });
      });

    return {
      total: errorMetrics.length,
      byStatus,
      byPath,
      timeline,
    };
  }

  /**
   * 获取响应时间统计
   */
  getResponseTimeStatistics(hours: number = 24): {
    average: number;
    percentiles: { p50: number; p95: number; p99: number };
    timeline: Array<{ timestamp: string; average: number; p95: number }>;
  } {
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
    const recentMetrics = this.metrics.filter(metric => metric.timestamp >= cutoffTime);

    if (recentMetrics.length === 0) {
      return {
        average: 0,
        percentiles: { p50: 0, p95: 0, p99: 0 },
        timeline: [],
      };
    }

    // 计算总体统计
    const responseTimes = recentMetrics.map(m => m.duration).sort((a, b) => a - b);
    const average = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;

    // 创建时间线（每小时一个数据点）
    const timeline: Array<{ timestamp: string; average: number; p95: number }> = [];
    const hourlyBuckets: Record<string, number[]> = {};

    recentMetrics.forEach(metric => {
      const hour = new Date(metric.timestamp);
      hour.setMinutes(0, 0, 0);
      const hourKey = hour.toISOString();
      if (!hourlyBuckets[hourKey]) {
        hourlyBuckets[hourKey] = [];
      }
      hourlyBuckets[hourKey].push(metric.duration);
    });

    Object.entries(hourlyBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([timestamp, times]) => {
        const hourlyAverage = times.reduce((sum, time) => sum + time, 0) / times.length;
        const sortedTimes = times.sort((a, b) => a - b);
        const hourlyP95 = this.getPercentile(sortedTimes, 0.95);

        timeline.push({
          timestamp,
          average: Math.round(hourlyAverage * 100) / 100,
          p95: Math.round(hourlyP95 * 100) / 100,
        });
      });

    return {
      average: Math.round(average * 100) / 100,
      percentiles: {
        p50: Math.round(this.getPercentile(responseTimes, 0.5) * 100) / 100,
        p95: Math.round(this.getPercentile(responseTimes, 0.95) * 100) / 100,
        p99: Math.round(this.getPercentile(responseTimes, 0.99) * 100) / 100,
      },
      timeline,
    };
  }

  /**
   * 重置指标
   */
  reset(): void {
    this.metrics = [];
    this.currentMetrics = null;
    logger.info('Performance metrics reset');
  }

  /**
   * 停止指标收集
   */
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      logger.info('Performance metrics collection stopped');
    }
  }

  /**
   * 获取指标摘要
   */
  getSummary(): {
    uptime: number;
    totalRequests: number;
    currentRPS: number;
    averageResponseTime: number;
    errorRate: number;
    memoryUsage: number;
  } {
    const currentMetrics = this.getCurrentMetrics();
    const memoryUsage = process.memoryUsage();

    return {
      uptime: process.uptime(),
      totalRequests: this.metrics.length,
      currentRPS: currentMetrics.requests.rate,
      averageResponseTime: currentMetrics.response.averageTime,
      errorRate: currentMetrics.errors.rate,
      memoryUsage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 10000) / 100,
    };
  }
}

// 导出单例实例
export const metricsManager = MetricsManager.getInstance();
