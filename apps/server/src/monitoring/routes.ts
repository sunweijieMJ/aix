import Router from '@koa/router';
import { Context } from 'koa';
import os from 'os';
import { healthManager, HealthStatus } from './health';
import { metricsManager } from './metrics';
import { prometheusMetricsHandler } from './prometheus';
import { requestStatsCollector } from '../middleware/requestId';
import { createLogger } from '../utils/logger';
import { config } from '../config';

const router = new Router();
const logger = createLogger('MONITORING_ROUTES');

/**
 * GET /health
 * 快速健康检查端点
 */
router.get('/health', async (ctx: Context) => {
  try {
    const quickHealth = await healthManager.getQuickHealth();

    ctx.status = quickHealth.status === HealthStatus.HEALTHY ? 200 : 503;
    ctx.body = {
      code: quickHealth.status === HealthStatus.HEALTHY ? 0 : -1,
      message: quickHealth.status === HealthStatus.HEALTHY ? 'Service is healthy' : 'Service is unhealthy',
      result: {
        status: quickHealth.status,
        timestamp: quickHealth.timestamp,
        uptime: process.uptime(),
        version: '1.0.0',
        environment: config.env.NODE_ENV,
      },
    };

    logger.debug(`Health check: ${quickHealth.status}`);
  } catch (error) {
    logger.error('Health check failed:', error);
    ctx.status = 503;
    ctx.body = {
      code: -1,
      message: 'Health check failed',
      result: null,
    };
  }
});

/**
 * GET /health/detailed
 * 详细健康检查端点
 */
router.get('/health/detailed', async (ctx: Context) => {
  try {
    const startTime = Date.now();
    const health = await healthManager.performHealthCheck();
    const checkDuration = Date.now() - startTime;

    ctx.status = health.status === HealthStatus.HEALTHY ? 200 : health.status === HealthStatus.DEGRADED ? 200 : 503;

    ctx.body = {
      code: health.status === HealthStatus.HEALTHY ? 0 : -1,
      message: `System status: ${health.status}`,
      result: {
        ...health,
        checkDuration,
      },
    };

    logger.debug(`Detailed health check completed in ${checkDuration}ms: ${health.status}`);
  } catch (error) {
    logger.error('Detailed health check failed:', error);
    ctx.status = 503;
    ctx.body = {
      code: -1,
      message: 'Detailed health check failed',
      result: {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
    };
  }
});

/**
 * GET /health/ready
 * 就绪性探针
 */
router.get('/health/ready', async (ctx: Context) => {
  try {
    const health = await healthManager.getQuickHealth();
    const isReady = health.status !== HealthStatus.UNHEALTHY;

    ctx.status = isReady ? 200 : 503;
    ctx.body = {
      code: isReady ? 0 : -1,
      message: isReady ? 'Service is ready' : 'Service is not ready',
      result: {
        ready: isReady,
        status: health.status,
        timestamp: health.timestamp,
      },
    };
  } catch (error) {
    logger.error('Readiness check failed:', error);
    ctx.status = 503;
    ctx.body = {
      code: -1,
      message: 'Readiness check failed',
      result: { ready: false },
    };
  }
});

/**
 * GET /health/live
 * 存活性探针
 */
router.get('/health/live', async (ctx: Context) => {
  // 存活性检查应该尽可能简单，只检查服务是否在运行
  ctx.status = 200;
  ctx.body = {
    code: 0,
    message: 'Service is alive',
    result: {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid,
    },
  };
});

/**
 * GET /metrics
 * 性能指标端点（JSON格式）
 */
router.get('/metrics', async (ctx: Context) => {
  try {
    if (!config.monitoring.metrics.enabled) {
      ctx.status = 404;
      ctx.body = {
        code: -1,
        message: 'Metrics collection is disabled',
        result: null,
      };
      return;
    }

    const metrics = metricsManager.getCurrentMetrics();

    ctx.body = {
      code: 0,
      message: 'Current performance metrics',
      result: metrics,
    };

    logger.debug('Metrics served');
  } catch (error) {
    logger.error('Failed to get metrics:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to retrieve metrics',
      result: null,
    };
  }
});

/**
 * GET /metrics/prometheus
 * Prometheus 格式指标端点
 */
router.get('/metrics/prometheus', prometheusMetricsHandler);

/**
 * GET /metrics/summary
 * 指标摘要端点
 */
router.get('/metrics/summary', async (ctx: Context) => {
  try {
    const summary = metricsManager.getSummary();

    ctx.body = {
      code: 0,
      message: 'Metrics summary',
      result: summary,
    };
  } catch (error) {
    logger.error('Failed to get metrics summary:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to retrieve metrics summary',
      result: null,
    };
  }
});

/**
 * GET /metrics/errors
 * 错误统计端点
 */
router.get('/metrics/errors', async (ctx: Context) => {
  try {
    const hours = parseInt(ctx.query.hours as string) || 24;
    const errorStats = metricsManager.getErrorStatistics(hours);

    ctx.body = {
      code: 0,
      message: `Error statistics for the last ${hours} hours`,
      result: errorStats,
    };
  } catch (error) {
    logger.error('Failed to get error statistics:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to retrieve error statistics',
      result: null,
    };
  }
});

/**
 * GET /metrics/response-time
 * 响应时间统计端点
 */
router.get('/metrics/response-time', async (ctx: Context) => {
  try {
    const hours = parseInt(ctx.query.hours as string) || 24;
    const responseTimeStats = metricsManager.getResponseTimeStatistics(hours);

    ctx.body = {
      code: 0,
      message: `Response time statistics for the last ${hours} hours`,
      result: responseTimeStats,
    };
  } catch (error) {
    logger.error('Failed to get response time statistics:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to retrieve response time statistics',
      result: null,
    };
  }
});

/**
 * POST /metrics/reset
 * 重置指标端点
 */
router.post('/metrics/reset', async (ctx: Context) => {
  try {
    // 在生产环境中可能需要添加认证
    if (config.env.NODE_ENV === 'production') {
      ctx.status = 403;
      ctx.body = {
        code: -1,
        message: 'Metrics reset is not allowed in production',
        result: null,
      };
      return;
    }

    metricsManager.reset();

    ctx.body = {
      code: 0,
      message: 'Metrics reset successfully',
      result: {
        resetAt: new Date().toISOString(),
      },
    };

    logger.info('Metrics reset by request');
  } catch (error) {
    logger.error('Failed to reset metrics:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to reset metrics',
      result: null,
    };
  }
});

/**
 * GET /system/info
 * 系统信息端点
 */
router.get('/system/info', async (ctx: Context) => {
  try {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const systemInfo = {
      application: {
        name: 'Base Node Server',
        version: '1.0.0',
        environment: config.env.NODE_ENV,
        startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        uptime: process.uptime(),
      },
      system: {
        platform: process.platform,
        architecture: process.arch,
        nodeVersion: process.version,
        pid: process.pid,
        ppid: process.ppid,
      },
      resources: {
        memory: {
          ...memoryUsage,
          totalSystem: os.totalmem(),
          freeSystem: os.freemem(),
        },
        cpu: {
          usage: cpuUsage,
          cores: os.cpus().length,
          loadAverage: os.loadavg(),
        },
      },
      configuration: {
        database: {
          type: config.database.type,
          host: config.database.host,
          port: config.database.port,
          database: config.database.database,
        },
        cache: {
          type: config.cache.type,
          ttl: config.cache.ttl,
        },
        server: {
          port: config.server.port,
          host: config.server.host,
          apiPrefix: config.server.apiPrefix,
        },
      },
    };

    ctx.body = {
      code: 0,
      message: 'System information',
      result: systemInfo,
    };
  } catch (error) {
    logger.error('Failed to get system info:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to retrieve system information',
      result: null,
    };
  }
});

/**
 * GET /monitoring/dashboard
 * 监控仪表板（HTML页面）
 */
router.get('/monitoring/dashboard', async (ctx: Context) => {
  try {
    const dashboardHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Base Node Server - Monitoring Dashboard</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
        }
        .header {
          background: #2d3748;
          color: white;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 20px;
        }
        .metric-card {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metric-title {
          font-size: 1.2em;
          font-weight: 600;
          margin-bottom: 10px;
          color: #2d3748;
        }
        .metric-value {
          font-size: 2em;
          font-weight: 700;
          margin-bottom: 5px;
        }
        .metric-description {
          color: #666;
          font-size: 0.9em;
        }
        .status-healthy { color: #10b981; }
        .status-degraded { color: #f59e0b; }
        .status-unhealthy { color: #ef4444; }
        .refresh-btn {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          margin-bottom: 20px;
        }
        .refresh-btn:hover {
          background: #2563eb;
        }
        .auto-refresh {
          display: inline-block;
          margin-left: 10px;
          font-size: 0.9em;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🛠️ Base Node Server</h1>
          <p>实时监控仪表板</p>
        </div>

        <button class="refresh-btn" onclick="refreshData()">刷新数据</button>
        <span class="auto-refresh">自动刷新: <span id="countdown">30</span>s</span>

        <div class="metrics-grid" id="metricsGrid">
          <!-- 指标卡片将通过JavaScript动态加载 -->
        </div>
      </div>

      <script>
        let countdownTimer;
        let autoRefreshTimer;

        // 初始化
        refreshData();
        startAutoRefresh();

        async function fetchData(url) {
          try {
            const response = await fetch('${config.server.apiPrefix}' + url);
            const data = await response.json();
            return data.result;
          } catch (error) {
            console.error('Failed to fetch data:', error);
            return null;
          }
        }

        async function refreshData() {
          const [health, metrics, summary] = await Promise.all([
            fetchData('/health/detailed'),
            fetchData('/metrics'),
            fetchData('/metrics/summary')
          ]);

          updateMetricsGrid(health, metrics, summary);
        }

        function updateMetricsGrid(health, metrics, summary) {
          const grid = document.getElementById('metricsGrid');

          grid.innerHTML = \`
            <div class="metric-card">
              <div class="metric-title">系统状态</div>
              <div class="metric-value status-\${health?.status || 'unhealthy'}">\${health?.status || 'unknown'}</div>
              <div class="metric-description">运行时间: \${formatUptime(health?.uptime || 0)}</div>
            </div>

            <div class="metric-card">
              <div class="metric-title">请求速率</div>
              <div class="metric-value">\${metrics?.requests?.rate || 0} RPS</div>
              <div class="metric-description">总请求: \${summary?.totalRequests || 0}</div>
            </div>

            <div class="metric-card">
              <div class="metric-title">响应时间</div>
              <div class="metric-value">\${metrics?.response?.averageTime || 0}ms</div>
              <div class="metric-description">P95: \${metrics?.response?.p95 || 0}ms</div>
            </div>

            <div class="metric-card">
              <div class="metric-title">错误率</div>
              <div class="metric-value">\${metrics?.errors?.rate || 0}%</div>
              <div class="metric-description">错误总数: \${metrics?.errors?.total || 0}</div>
            </div>

            <div class="metric-card">
              <div class="metric-title">内存使用</div>
              <div class="metric-value">\${summary?.memoryUsage || 0}%</div>
              <div class="metric-description">进程内存使用率</div>
            </div>

            <div class="metric-card">
              <div class="metric-title">数据库状态</div>
              <div class="metric-value status-\${health?.components?.database?.status || 'unhealthy'}">\${health?.components?.database?.status || 'unknown'}</div>
              <div class="metric-description">\${health?.components?.database?.message || 'No information'}</div>
            </div>
          \`;
        }

        function formatUptime(seconds) {
          const days = Math.floor(seconds / 86400);
          const hours = Math.floor((seconds % 86400) / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);

          if (days > 0) return \`\${days}天 \${hours}小时\`;
          if (hours > 0) return \`\${hours}小时 \${minutes}分钟\`;
          return \`\${minutes}分钟\`;
        }

        function startAutoRefresh() {
          let countdown = 30;

          countdownTimer = setInterval(() => {
            countdown--;
            document.getElementById('countdown').textContent = countdown;

            if (countdown <= 0) {
              countdown = 30;
              refreshData();
            }
          }, 1000);
        }

        function stopAutoRefresh() {
          if (countdownTimer) {
            clearInterval(countdownTimer);
          }
          if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
          }
        }

        // 页面卸载时清理定时器
        window.addEventListener('beforeunload', stopAutoRefresh);
      </script>
    </body>
    </html>
    `;

    ctx.type = 'text/html';
    ctx.body = dashboardHtml;
  } catch (error) {
    logger.error('Failed to serve monitoring dashboard:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to serve monitoring dashboard',
      result: null,
    };
  }
});

/**
 * GET /monitoring/requests
 * 获取请求统计信息
 */
router.get('/monitoring/requests', async (ctx: Context) => {
  try {
    const stats = requestStatsCollector.getStats();

    ctx.body = {
      code: 0,
      message: 'Request statistics retrieved successfully',
      result: stats,
    };

    logger.debug('Request statistics retrieved');
  } catch (error) {
    logger.error('Failed to get request statistics:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to get request statistics',
      result: null,
    };
  }
});

/**
 * POST /monitoring/requests/reset
 * 重置请求统计
 */
router.post('/monitoring/requests/reset', async (ctx: Context) => {
  try {
    requestStatsCollector.reset();

    ctx.body = {
      code: 0,
      message: 'Request statistics reset successfully',
      result: null,
    };

    logger.info('Request statistics reset');
  } catch (error) {
    logger.error('Failed to reset request statistics:', error);
    ctx.status = 500;
    ctx.body = {
      code: -1,
      message: 'Failed to reset request statistics',
      result: null,
    };
  }
});

export default router;
