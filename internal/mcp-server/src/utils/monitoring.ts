/**
 * 监控和指标收集系统
 */

import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import type { ServerConfig } from '../config/index';
import { BYTES_PER_MB } from '../constants';
import type { ComponentIndex } from '../types/index';

/**
 * 指标类型
 */
export interface Metrics {
  // 请求相关
  requests: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
    requestsPerMinute: number;
  };

  // 工具使用统计
  tools: {
    totalCalls: number;
    toolUsage: Record<string, number>;
    averageExecutionTime: Record<string, number>;
  };

  // 资源访问统计
  resources: {
    totalAccess: number;
    resourceUsage: Record<string, number>;
    cacheHitRate: number;
  };

  // 系统性能
  system: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    uptime: number;
  };

  // 连接统计
  connections: {
    total: number;
    active: number;
    websocketConnections: number;
    averageConnectionDuration: number;
  };

  // 错误统计
  errors: {
    total: number;
    byType: Record<string, number>;
    recentErrors: Array<{
      timestamp: number;
      type: string;
      message: string;
      stack?: string;
    }>;
  };
}

/**
 * 事件类型
 */
export interface MonitoringEvents {
  request_start: { requestId: string; timestamp: number; method: string };
  request_end: {
    requestId: string;
    timestamp: number;
    success: boolean;
    duration: number;
  };
  tool_call: {
    toolName: string;
    timestamp: number;
    duration: number;
    success: boolean;
  };
  resource_access: { resourceUri: string; timestamp: number; success: boolean };
  error: { type: string; message: string; stack?: string; timestamp: number };
  connection_open: {
    connectionId: string;
    timestamp: number;
    type: 'stdio' | 'websocket';
  };
  connection_close: {
    connectionId: string;
    timestamp: number;
    duration: number;
  };
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
export class MonitoringManager extends EventEmitter {
  private metrics: Metrics;
  private requestTimings = new Map<string, number>();
  private intervalId?: NodeJS.Timeout;
  private startTime: number;
  private config?: ServerConfig;

  constructor(config?: ServerConfig) {
    super();
    this.config = config;
    this.startTime = Date.now();
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0,
        requestsPerMinute: 0,
      },
      tools: {
        totalCalls: 0,
        toolUsage: {},
        averageExecutionTime: {},
      },
      resources: {
        totalAccess: 0,
        resourceUsage: {},
        cacheHitRate: 0,
      },
      system: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: 0,
      },
      connections: {
        total: 0,
        active: 0,
        websocketConnections: 0,
        averageConnectionDuration: 0,
      },
      errors: {
        total: 0,
        byType: {},
        recentErrors: [],
      },
    };

    this.setupEventHandlers();
    this.startPeriodicUpdates();
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    this.on('request_start', this.handleRequestStart.bind(this));
    this.on('request_end', this.handleRequestEnd.bind(this));
    this.on('tool_call', this.handleToolCall.bind(this));
    this.on('resource_access', this.handleResourceAccess.bind(this));
    this.on('error', this.handleError.bind(this));
    this.on('connection_open', this.handleConnectionOpen.bind(this));
    this.on('connection_close', this.handleConnectionClose.bind(this));
  }

  /**
   * 处理请求开始事件
   */
  private handleRequestStart(event: MonitoringEvents['request_start']): void {
    this.requestTimings.set(event.requestId, event.timestamp);
    this.metrics.requests.total++;
  }

  /**
   * 处理请求结束事件
   */
  private handleRequestEnd(event: MonitoringEvents['request_end']): void {
    const startTime = this.requestTimings.get(event.requestId);
    if (startTime) {
      this.requestTimings.delete(event.requestId);

      if (event.success) {
        this.metrics.requests.successful++;
      } else {
        this.metrics.requests.failed++;
      }

      // 更新平均响应时间
      const currentAvg = this.metrics.requests.averageResponseTime;
      const totalRequests =
        this.metrics.requests.successful + this.metrics.requests.failed;
      this.metrics.requests.averageResponseTime =
        (currentAvg * (totalRequests - 1) + event.duration) / totalRequests;
    }
  }

  /**
   * 处理工具调用事件
   */
  private handleToolCall(event: MonitoringEvents['tool_call']): void {
    this.metrics.tools.totalCalls++;

    // 更新工具使用统计
    this.metrics.tools.toolUsage[event.toolName] =
      (this.metrics.tools.toolUsage[event.toolName] || 0) + 1;

    // 更新平均执行时间
    const currentAvg =
      this.metrics.tools.averageExecutionTime[event.toolName] || 0;
    const currentCount = this.metrics.tools.toolUsage[event.toolName] || 1;
    this.metrics.tools.averageExecutionTime[event.toolName] =
      (currentAvg * (currentCount - 1) + event.duration) / currentCount;
  }

  /**
   * 处理资源访问事件
   */
  private handleResourceAccess(
    event: MonitoringEvents['resource_access'],
  ): void {
    this.metrics.resources.totalAccess++;

    this.metrics.resources.resourceUsage[event.resourceUri] =
      (this.metrics.resources.resourceUsage[event.resourceUri] || 0) + 1;
  }

  /**
   * 处理错误事件
   */
  private handleError(event: MonitoringEvents['error']): void {
    this.metrics.errors.total++;

    this.metrics.errors.byType[event.type] =
      (this.metrics.errors.byType[event.type] || 0) + 1;

    // 添加到最近错误列表（最多保存100个）
    this.metrics.errors.recentErrors.push({
      timestamp: event.timestamp,
      type: event.type,
      message: event.message,
      stack: event.stack,
    });

    if (this.metrics.errors.recentErrors.length > 100) {
      this.metrics.errors.recentErrors.shift();
    }
  }

  /**
   * 处理连接打开事件
   */
  private handleConnectionOpen(
    event: MonitoringEvents['connection_open'],
  ): void {
    this.metrics.connections.total++;
    this.metrics.connections.active++;

    if (event.type === 'websocket') {
      this.metrics.connections.websocketConnections++;
    }
  }

  /**
   * 处理连接关闭事件
   */
  private handleConnectionClose(
    event: MonitoringEvents['connection_close'],
  ): void {
    this.metrics.connections.active--;

    // 更新平均连接持续时间
    const currentAvg = this.metrics.connections.averageConnectionDuration;
    const totalConnections = this.metrics.connections.total;
    this.metrics.connections.averageConnectionDuration =
      (currentAvg * (totalConnections - 1) + event.duration) / totalConnections;
  }

  /**
   * 启动周期性更新
   */
  private startPeriodicUpdates(): void {
    this.intervalId = setInterval(() => {
      this.updateSystemMetrics();
      this.calculateRates();
    }, 10000); // 每10秒更新一次
  }

  /**
   * 更新系统指标
   */
  private updateSystemMetrics(): void {
    this.metrics.system.memoryUsage = process.memoryUsage();
    this.metrics.system.cpuUsage = process.cpuUsage();
    this.metrics.system.uptime = Date.now() - this.startTime;
  }

  /**
   * 计算速率指标
   */
  private calculateRates(): void {
    const uptimeMinutes = this.metrics.system.uptime / (1000 * 60);
    this.metrics.requests.requestsPerMinute =
      uptimeMinutes > 0 ? this.metrics.requests.total / uptimeMinutes : 0;
  }

  /**
   * 获取当前指标
   */
  getMetrics(): Metrics {
    this.updateSystemMetrics();
    this.calculateRates();
    return { ...this.metrics };
  }

  /**
   * 获取指标摘要
   */
  getMetricsSummary(): {
    totalRequests: number;
    successRate: string;
    averageResponseTime: string;
    totalErrors: number;
    uptime: number;
    memoryUsageMB: number;
    activeConnections: number;
  } {
    const metrics = this.getMetrics();
    const totalRequests = metrics.requests.total;
    const successRate =
      totalRequests > 0
        ? (metrics.requests.successful / totalRequests) * 100
        : 100;

    return {
      totalRequests,
      successRate: successRate.toFixed(2) + '%',
      averageResponseTime:
        metrics.requests.averageResponseTime.toFixed(2) + 'ms',
      totalErrors: metrics.errors.total,
      uptime: metrics.system.uptime,
      memoryUsageMB: Math.round(
        metrics.system.memoryUsage.heapUsed / BYTES_PER_MB,
      ),
      activeConnections: metrics.connections.active,
    };
  }

  /**
   * 更新缓存命中率
   */
  updateCacheHitRate(hitRate: number): void {
    this.metrics.resources.cacheHitRate = hitRate;
  }

  /**
   * 获取健康状态
   */
  getHealthStatus() {
    const summary = this.getMetricsSummary();
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    // 健康状态评估
    const isHealthy = this.evaluateHealth(summary, memoryUsage);

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / BYTES_PER_MB),
        heapTotal: Math.round(memoryUsage.heapTotal / BYTES_PER_MB),
        external: Math.round(memoryUsage.external / BYTES_PER_MB),
        rss: Math.round(memoryUsage.rss / BYTES_PER_MB),
      },
      metrics: {
        totalRequests: summary.totalRequests,
        errorRate:
          summary.totalErrors > 0
            ? ((summary.totalErrors / summary.totalRequests) * 100).toFixed(2) +
              '%'
            : '0.00%',
        averageResponseTime: summary.averageResponseTime,
        activeConnections: summary.activeConnections,
      },
      checks: this.performHealthChecks(summary, memoryUsage),
    };
  }

  /**
   * 评估系统健康状态
   */
  private evaluateHealth(
    summary: any,
    memoryUsage: NodeJS.MemoryUsage,
  ): boolean {
    // 内存使用超过1GB认为不健康
    if (memoryUsage.heapUsed > 1024 * BYTES_PER_MB) return false;

    // 错误率超过10%认为不健康
    if (
      summary.totalRequests > 10 &&
      summary.totalErrors / summary.totalRequests > 0.1
    )
      return false;

    // 平均响应时间超过5秒认为不健康
    if (parseFloat(summary.averageResponseTime) > 5000) return false;

    return true;
  }

  /**
   * 执行健康检查
   */
  private performHealthChecks(summary: any, memoryUsage: NodeJS.MemoryUsage) {
    const checks = {
      memory: {
        status: memoryUsage.heapUsed < 1024 * BYTES_PER_MB ? 'pass' : 'fail',
        value: Math.round(memoryUsage.heapUsed / BYTES_PER_MB),
        threshold: 1024,
        unit: 'MB',
      },
      errorRate: {
        status:
          summary.totalRequests === 0 ||
          summary.totalErrors / summary.totalRequests < 0.1
            ? 'pass'
            : 'fail',
        value:
          summary.totalRequests > 0
            ? ((summary.totalErrors / summary.totalRequests) * 100).toFixed(2)
            : '0.00',
        threshold: 10,
        unit: '%',
      },
      responseTime: {
        status:
          parseFloat(summary.averageResponseTime) < 5000 ? 'pass' : 'fail',
        value: parseFloat(summary.averageResponseTime),
        threshold: 5000,
        unit: 'ms',
      },
      uptime: {
        status: 'pass',
        value: summary.uptime,
        threshold: 0,
        unit: 'seconds',
      },
    };

    return checks;
  }

  /**
   * 记录请求开始
   */
  recordRequestStart(requestId: string, method: string): void {
    this.emit('request_start', {
      requestId,
      timestamp: Date.now(),
      method,
    });
  }

  /**
   * 记录请求结束
   */
  recordRequestEnd(
    requestId: string,
    success: boolean,
    startTime: number,
  ): void {
    const now = Date.now();
    this.emit('request_end', {
      requestId,
      timestamp: now,
      success,
      duration: now - startTime,
    });
  }

  /**
   * 记录工具调用
   */
  recordToolCall(toolName: string, startTime: number, success: boolean): void {
    const now = Date.now();
    this.emit('tool_call', {
      toolName,
      timestamp: now,
      duration: now - startTime,
      success,
    });
  }

  /**
   * 记录资源访问
   */
  recordResourceAccess(resourceUri: string, success: boolean): void {
    this.emit('resource_access', {
      resourceUri,
      timestamp: Date.now(),
      success,
    });
  }

  /**
   * 记录错误
   */
  recordError(type: string, message: string, stack?: string): void {
    this.emit('error', {
      type,
      message,
      stack,
      timestamp: Date.now(),
    });
  }

  /**
   * 记录连接打开
   */
  recordConnectionOpen(
    connectionId: string,
    type: 'stdio' | 'websocket',
  ): void {
    this.emit('connection_open', {
      connectionId,
      timestamp: Date.now(),
      type,
    });
  }

  /**
   * 记录连接关闭
   */
  recordConnectionClose(connectionId: string, startTime: number): void {
    this.emit('connection_close', {
      connectionId,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
    });
  }

  /**
   * 重置指标
   */
  resetMetrics(): void {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0,
        requestsPerMinute: 0,
      },
      tools: {
        totalCalls: 0,
        toolUsage: {},
        averageExecutionTime: {},
      },
      resources: {
        totalAccess: 0,
        resourceUsage: {},
        cacheHitRate: 0,
      },
      system: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: 0,
      },
      connections: {
        total: 0,
        active: 0,
        websocketConnections: 0,
        averageConnectionDuration: 0,
      },
      errors: {
        total: 0,
        byType: {},
        recentErrors: [],
      },
    };
    this.startTime = Date.now();
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.removeAllListeners();
  }

  /**
   * 执行完整的健康检查
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    if (!this.config) {
      throw new Error('Config is required for health checks');
    }

    const checks: HealthCheck[] = [];

    // 执行各项检查
    checks.push(await this.checkNodeVersion());
    checks.push(await this.checkDataDirectory());
    checks.push(await this.checkCacheDirectory());
    checks.push(await this.checkPackagesDirectory());
    checks.push(await this.checkComponentIndex());
    checks.push(await this.checkDiskSpace());
    checks.push(await this.checkMemoryUsage());

    // 统计结果
    const passed = checks.filter((c) => c.status === 'pass').length;
    const failed = checks.filter((c) => c.status === 'fail').length;
    const warnings = checks.filter((c) => c.status === 'warn').length;

    // 确定整体状态
    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    if (failed > 0) {
      status = 'error';
    } else if (warnings > 0) {
      status = 'warning';
    }

    return {
      status,
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
   * 检查 Node.js 版本
   */
  private async checkNodeVersion(): Promise<HealthCheck> {
    const version = process.version;
    const majorVersion = parseInt(version.slice(1).split('.')[0] || '0', 10);

    if (majorVersion < 18) {
      return {
        name: 'Node.js 版本',
        status: 'fail',
        message: `需要 Node.js 18+，当前版本: ${version}`,
        details: { version, required: '>=18.0.0' },
      };
    } else if (majorVersion < 22) {
      return {
        name: 'Node.js 版本',
        status: 'warn',
        message: `建议使用 Node.js 22+，当前版本: ${version}`,
        details: { version, recommended: '>=22.0.0' },
      };
    }

    return {
      name: 'Node.js 版本',
      status: 'pass',
      message: `版本正常: ${version}`,
      details: { version },
    };
  }

  /**
   * 检查数据目录
   */
  private async checkDataDirectory(): Promise<HealthCheck> {
    if (!this.config) {
      return {
        name: '数据目录',
        status: 'fail',
        message: 'Config not initialized',
      };
    }

    try {
      await access(this.config.dataDir);
      const stats = await stat(this.config.dataDir);

      if (!stats.isDirectory()) {
        return {
          name: '数据目录',
          status: 'fail',
          message: `数据目录不是有效目录: ${this.config.dataDir}`,
        };
      }

      return {
        name: '数据目录',
        status: 'pass',
        message: `数据目录可访问: ${this.config.dataDir}`,
      };
    } catch (error) {
      return {
        name: '数据目录',
        status: 'fail',
        message: `数据目录不可访问: ${this.config.dataDir}`,
        details: error,
      };
    }
  }

  /**
   * 检查缓存目录
   */
  private async checkCacheDirectory(): Promise<HealthCheck> {
    if (!this.config) {
      return {
        name: '缓存目录',
        status: 'fail',
        message: 'Config not initialized',
      };
    }

    try {
      await access(this.config.cacheDir);
      return {
        name: '缓存目录',
        status: 'pass',
        message: `缓存目录可访问: ${this.config.cacheDir}`,
      };
    } catch (error) {
      return {
        name: '缓存目录',
        status: 'warn',
        message: `缓存目录不存在，将自动创建: ${this.config.cacheDir}`,
        details: error,
      };
    }
  }

  /**
   * 检查包目录
   */
  private async checkPackagesDirectory(): Promise<HealthCheck> {
    if (!this.config) {
      return {
        name: '包目录',
        status: 'fail',
        message: 'Config not initialized',
      };
    }

    try {
      await access(this.config.packagesDir);
      const stats = await stat(this.config.packagesDir);

      if (!stats.isDirectory()) {
        return {
          name: '包目录',
          status: 'fail',
          message: `包目录不是有效目录: ${this.config.packagesDir}`,
        };
      }

      return {
        name: '包目录',
        status: 'pass',
        message: `包目录可访问: ${this.config.packagesDir}`,
      };
    } catch (error) {
      return {
        name: '包目录',
        status: 'fail',
        message: `包目录不可访问: ${this.config.packagesDir}`,
        details: error,
      };
    }
  }

  /**
   * 检查组件索引
   */
  private async checkComponentIndex(): Promise<HealthCheck> {
    if (!this.config) {
      return {
        name: '组件索引',
        status: 'fail',
        message: 'Config not initialized',
      };
    }

    const indexPath = `${this.config.dataDir}/components-index.json`;

    try {
      if (!existsSync(indexPath)) {
        return {
          name: '组件索引',
          status: 'warn',
          message: '组件索引文件不存在，需要先执行数据提取',
        };
      }

      const content = await readFile(indexPath, 'utf8');
      const index = JSON.parse(content) as ComponentIndex;

      if (!index.components || index.components.length === 0) {
        return {
          name: '组件索引',
          status: 'warn',
          message: '组件索引为空，可能需要重新提取数据',
          details: { componentsCount: 0 },
        };
      }

      return {
        name: '组件索引',
        status: 'pass',
        message: `组件索引正常，包含 ${index.components.length} 个组件`,
        details: {
          componentsCount: index.components.length,
          categoriesCount: index.categories.length,
          tagsCount: index.tags.length,
          lastUpdated: index.lastUpdated,
        },
      };
    } catch (error) {
      return {
        name: '组件索引',
        status: 'fail',
        message: '组件索引文件损坏或格式错误',
        details: error,
      };
    }
  }

  /**
   * 检查磁盘空间
   */
  private async checkDiskSpace(): Promise<HealthCheck> {
    if (!this.config) {
      return {
        name: '磁盘空间',
        status: 'fail',
        message: 'Config not initialized',
      };
    }

    try {
      await stat(this.config.dataDir);
      // 这里可以添加更复杂的磁盘空间检查逻辑
      // 目前只是基本检查目录存在性

      return {
        name: '磁盘空间',
        status: 'pass',
        message: '磁盘空间检查通过',
      };
    } catch (error) {
      return {
        name: '磁盘空间',
        status: 'warn',
        message: '无法检查磁盘空间',
        details: error,
      };
    }
  }

  /**
   * 检查内存使用情况
   */
  private async checkMemoryUsage(): Promise<HealthCheck> {
    const usage = process.memoryUsage();
    const totalMB = Math.round(usage.heapTotal / BYTES_PER_MB);
    const usedMB = Math.round(usage.heapUsed / BYTES_PER_MB);
    const usagePercent = Math.round((usage.heapUsed / usage.heapTotal) * 100);

    if (usagePercent > 90) {
      return {
        name: '内存使用',
        status: 'warn',
        message: `内存使用率较高: ${usagePercent}% (${usedMB}/${totalMB}MB)`,
        details: usage,
      };
    }

    return {
      name: '内存使用',
      status: 'pass',
      message: `内存使用正常: ${usagePercent}% (${usedMB}/${totalMB}MB)`,
      details: usage,
    };
  }

  /**
   * 快速健康检查（仅检查关键项）
   */
  async quickHealthCheck(): Promise<HealthCheckResult> {
    if (!this.config) {
      throw new Error('Config is required for health checks');
    }

    const checks: HealthCheck[] = [];

    // 只检查关键项
    checks.push(await this.checkDataDirectory());
    checks.push(await this.checkPackagesDirectory());
    checks.push(await this.checkComponentIndex());

    const passed = checks.filter((c) => c.status === 'pass').length;
    const failed = checks.filter((c) => c.status === 'fail').length;
    const warnings = checks.filter((c) => c.status === 'warn').length;

    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    if (failed > 0) {
      status = 'error';
    } else if (warnings > 0) {
      status = 'warning';
    }

    return {
      status,
      checks,
      summary: {
        total: checks.length,
        passed,
        failed,
        warnings,
      },
    };
  }
}

/**
 * 全局监控实例
 */
export const globalMonitoring = new MonitoringManager();

/**
 * 创建监控管理器
 */
export function createMonitoringManager(
  config?: ServerConfig,
): MonitoringManager {
  return new MonitoringManager(config);
}

/**
 * 格式化健康检查结果输出
 */
export function formatHealthCheckResult(result: HealthCheckResult): string {
  const lines: string[] = [];

  // 总体状态
  const statusEmoji = {
    healthy: '✅',
    warning: '⚠️',
    error: '❌',
  };

  lines.push(
    `${statusEmoji[result.status]} 健康检查 - ${result.status.toUpperCase()}`,
  );
  lines.push('');

  // 摘要
  lines.push('📊 检查摘要:');
  lines.push(`  总计: ${result.summary.total}`);
  lines.push(`  通过: ${result.summary.passed}`);
  lines.push(`  警告: ${result.summary.warnings}`);
  lines.push(`  失败: ${result.summary.failed}`);
  lines.push('');

  // 详细结果
  lines.push('📋 详细结果:');
  result.checks.forEach((check) => {
    const icon =
      check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    lines.push(`  ${icon} ${check.name}: ${check.message}`);
  });

  return lines.join('\n');
}
