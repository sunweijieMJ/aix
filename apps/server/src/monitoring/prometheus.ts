/**
 * Prometheus Metrics 导出
 * 提供标准的 Prometheus 格式指标
 */
import { Context } from 'koa';
import { metricsManager } from './metrics';
import { healthManager } from './health';
import { createLogger } from '../utils/logger';
import { getCacheManager } from '../cache';
import { getPool } from '../database/pgConnection';

const logger = createLogger('PROMETHEUS');

/**
 * Prometheus 指标类型
 */
interface PrometheusMetric {
  name: string;
  type: 'gauge' | 'counter' | 'histogram' | 'summary';
  help: string;
  value: number | string;
  labels?: Record<string, string>;
}

/**
 * 格式化 Prometheus 指标
 */
function formatMetric(metric: PrometheusMetric): string {
  const { name, type, help, value, labels } = metric;
  let output = `# HELP ${name} ${help}\n`;
  output += `# TYPE ${name} ${type}\n`;

  if (labels && Object.keys(labels).length > 0) {
    const labelStr = Object.entries(labels)
      .map(([key, val]) => `${key}="${val}"`)
      .join(',');
    output += `${name}{${labelStr}} ${value}\n`;
  } else {
    output += `${name} ${value}\n`;
  }

  return output;
}

/**
 * 收集所有 Prometheus 指标
 */
export async function collectPrometheusMetrics(): Promise<string> {
  const metrics: PrometheusMetric[] = [];

  try {
    // 1. 应用级别指标
    const uptime = process.uptime();
    metrics.push({
      name: 'nodejs_process_uptime_seconds',
      type: 'counter',
      help: 'Process uptime in seconds',
      value: uptime,
    });

    // 2. 内存指标
    const memUsage = process.memoryUsage();
    metrics.push(
      {
        name: 'nodejs_memory_heap_used_bytes',
        type: 'gauge',
        help: 'Heap memory used in bytes',
        value: memUsage.heapUsed,
      },
      {
        name: 'nodejs_memory_heap_total_bytes',
        type: 'gauge',
        help: 'Total heap memory in bytes',
        value: memUsage.heapTotal,
      },
      {
        name: 'nodejs_memory_rss_bytes',
        type: 'gauge',
        help: 'Resident set size in bytes',
        value: memUsage.rss,
      },
      {
        name: 'nodejs_memory_external_bytes',
        type: 'gauge',
        help: 'External memory in bytes',
        value: memUsage.external,
      },
    );

    // 3. CPU 指标
    const cpuUsage = process.cpuUsage();
    metrics.push(
      {
        name: 'nodejs_cpu_user_microseconds',
        type: 'counter',
        help: 'User CPU time spent in microseconds',
        value: cpuUsage.user,
      },
      {
        name: 'nodejs_cpu_system_microseconds',
        type: 'counter',
        help: 'System CPU time spent in microseconds',
        value: cpuUsage.system,
      },
    );

    // 4. HTTP 请求指标
    const currentMetrics = metricsManager.getCurrentMetrics();
    metrics.push(
      {
        name: 'http_requests_total',
        type: 'counter',
        help: 'Total HTTP requests',
        value: currentMetrics.requests.total,
      },
      {
        name: 'http_requests_successful_total',
        type: 'counter',
        help: 'Total successful HTTP requests',
        value: currentMetrics.requests.successful,
      },
      {
        name: 'http_requests_failed_total',
        type: 'counter',
        help: 'Total failed HTTP requests',
        value: currentMetrics.requests.failed,
      },
      {
        name: 'http_request_rate_per_second',
        type: 'gauge',
        help: 'HTTP request rate per second',
        value: currentMetrics.requests.rate,
      },
    );

    // 5. HTTP 响应时间指标
    metrics.push(
      {
        name: 'http_response_time_average_milliseconds',
        type: 'gauge',
        help: 'Average HTTP response time in milliseconds',
        value: currentMetrics.response.averageTime,
      },
      {
        name: 'http_response_time_p50_milliseconds',
        type: 'gauge',
        help: 'P50 HTTP response time in milliseconds',
        value: currentMetrics.response.p50,
      },
      {
        name: 'http_response_time_p95_milliseconds',
        type: 'gauge',
        help: 'P95 HTTP response time in milliseconds',
        value: currentMetrics.response.p95,
      },
      {
        name: 'http_response_time_p99_milliseconds',
        type: 'gauge',
        help: 'P99 HTTP response time in milliseconds',
        value: currentMetrics.response.p99,
      },
    );

    // 6. 错误率指标
    metrics.push(
      {
        name: 'http_errors_total',
        type: 'counter',
        help: 'Total HTTP errors',
        value: currentMetrics.errors.total,
      },
      {
        name: 'http_error_rate_percent',
        type: 'gauge',
        help: 'HTTP error rate in percent',
        value: currentMetrics.errors.rate,
      },
    );

    // 7. 数据库连接池指标
    const pool = getPool();
    metrics.push(
      {
        name: 'postgresql_pool_total_connections',
        type: 'gauge',
        help: 'Total PostgreSQL connections in pool',
        value: pool.totalCount,
      },
      {
        name: 'postgresql_pool_idle_connections',
        type: 'gauge',
        help: 'Idle PostgreSQL connections in pool',
        value: pool.idleCount,
      },
      {
        name: 'postgresql_pool_waiting_count',
        type: 'gauge',
        help: 'Waiting PostgreSQL connection requests',
        value: pool.waitingCount,
      },
    );

    // 8. 缓存指标
    const cacheManager = await getCacheManager();
    const cacheStats = await cacheManager.getStats();
    metrics.push(
      {
        name: 'cache_keys_total',
        type: 'gauge',
        help: 'Total number of cache keys',
        value: cacheStats.keys,
      },
      {
        name: 'cache_hits_total',
        type: 'counter',
        help: 'Total cache hits',
        value: cacheStats.hits,
      },
      {
        name: 'cache_misses_total',
        type: 'counter',
        help: 'Total cache misses',
        value: cacheStats.misses,
      },
      {
        name: 'cache_hit_rate_percent',
        type: 'gauge',
        help: 'Cache hit rate in percent',
        value: cacheStats.hitRate,
      },
    );

    // 9. 健康状态指标
    const health = await healthManager.getQuickHealth();
    const healthValue = health.status === 'healthy' ? 1 : health.status === 'degraded' ? 0.5 : 0;
    metrics.push({
      name: 'application_health_status',
      type: 'gauge',
      help: 'Application health status (1=healthy, 0.5=degraded, 0=unhealthy)',
      value: healthValue,
    });

    // 10. 系统级别指标
    metrics.push(
      {
        name: 'nodejs_active_handles_total',
        type: 'gauge',
        help: 'Number of active handles',
        value: (process as any)._getActiveHandles?.().length || 0,
      },
      {
        name: 'nodejs_active_requests_total',
        type: 'gauge',
        help: 'Number of active requests',
        value: (process as any)._getActiveRequests?.().length || 0,
      },
    );

    // 格式化所有指标
    return metrics.map(m => formatMetric(m)).join('\n');
  } catch (error) {
    logger.error('Failed to collect Prometheus metrics:', error);
    throw error;
  }
}

/**
 * Prometheus metrics 端点处理器
 */
export async function prometheusMetricsHandler(ctx: Context): Promise<void> {
  try {
    const metricsText = await collectPrometheusMetrics();
    ctx.type = 'text/plain; version=0.0.4; charset=utf-8';
    ctx.body = metricsText;
    logger.debug('Prometheus metrics exported');
  } catch (error) {
    logger.error('Failed to export Prometheus metrics:', error);
    ctx.status = 500;
    ctx.body = '# Error collecting metrics\n';
  }
}
