import fs from 'fs';
import os from 'os';
import path from 'path';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import logger from 'koa-logger';
import config, { validateConfig } from './config';
import { createCacheManager, closeCacheManager } from './cache';
import { apiCacheMiddleware, cacheControlMiddleware, cacheManagementMiddleware } from './cache/middleware';
import { closeDatabase, initDatabase } from './database/index';
import { notFoundMiddleware, responseMiddleware } from './middleware/response';
import { requestIdMiddleware, requestStatsCollector } from './middleware/requestId';
import {
  initializeMonitoring,
  metricsMiddleware,
  securityHeadersMiddleware,
  rateLimitMiddleware,
  monitoringRoutes,
} from './monitoring';
import router from './routes/index';
import { registerServices } from './services/serviceRegistry';
import { createLogger } from './utils/logger';
import { initConfigHotReload, configHotReloadManager } from './utils/configWatcher';

const appLogger = createLogger('APP');

/**
 * Koa应用实例
 */
const app = new Koa();

/**
 * 服务器端口配置
 */
const PORT = config.server.port;

/**
 * 获取本机IP地址
 */
const LOCAL_IP = (() => {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    if (!iface) continue;

    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '0.0.0.0'; // 默认IP
})();

/**
 * 显示系统环境信息
 */
function logSystemInfo(): void {
  const logger = createLogger('SYSTEM');
  logger.info('System information:');
  logger.info(`Node.js version: ${process.version}`);
  logger.info(`Platform: ${process.platform}`);
  logger.info(`Architecture: ${process.arch}`);
  logger.info(`OS: ${os.type()} ${os.release()}`);
  logger.info(`CPU: ${os.cpus()[0]?.model ?? 'Unknown'} (${os.cpus().length} cores)`);
  logger.info(`Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`);
  logger.info(`Current directory: ${process.cwd()}`);
  logger.info(`Local IP: ${LOCAL_IP}`);
}

/**
 * 初始化数据库和服务
 */
async function initializeDatabase(): Promise<void> {
  try {
    // 检查数据目录
    const deployDir = path.join(process.cwd(), 'deploy');
    const dataDir = path.join(deployDir, 'data');

    const logger = createLogger('DATABASE_INIT');
    logger.info(`Checking deploy directory: ${deployDir}`);
    if (!fs.existsSync(deployDir)) {
      logger.info('Creating deploy directory');
      fs.mkdirSync(deployDir, { recursive: true });
    }

    logger.info(`Checking data directory: ${dataDir}`);
    if (!fs.existsSync(dataDir)) {
      logger.info('Creating data directory');
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 初始化数据库
    await initDatabase();
    logger.info('Database initialized successfully');

    // 初始化缓存系统
    await createCacheManager();
    logger.info('Cache system initialized successfully');

    // 初始化监控系统
    await initializeMonitoring();
    logger.info('Monitoring system initialized successfully');

    // 注册服务
    registerServices();
    logger.info('Services registered successfully');

    // 初始化配置热更新
    await initConfigHotReload();
    logger.info('Config hot reload initialized successfully');
  } catch (error) {
    const logger = createLogger('ERROR');
    logger.error('Failed to initialize database', error);
    if (error instanceof Error) {
      logger.error(`Error message: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

/**
 * 配置中间件
 */
function setupMiddleware(): void {
  // 请求追踪 ID 中间件（应该在最前面）
  app.use(
    requestIdMiddleware({
      header: 'X-Request-ID',
      setResponseHeader: true,
      setContextState: true,
    }),
  );

  // 请求统计中间件
  app.use(requestStatsCollector.middleware());

  // HTTP请求日志
  if (config.env.NODE_ENV === 'development') {
    app.use(logger());
  }

  // 安全头中间件
  app.use(securityHeadersMiddleware());

  // 限流中间件
  app.use(
    rateLimitMiddleware({
      max: config.security.rateLimit.max,
      window: config.security.rateLimit.windowMs,
      message: 'Too many requests, please try again later',
    }),
  );

  // CORS支持
  if (config.security.cors.enabled) {
    app.use(cors());
  }

  // 请求体解析
  app.use(bodyParser());

  // 性能监控中间件
  app.use(metricsMiddleware());

  // 缓存控制中间件
  app.use(cacheControlMiddleware());

  // API缓存中间件（仅对API路径启用）
  // 注意：认证相关接口必须排除，避免缓存导致安全问题
  app.use(
    apiCacheMiddleware({
      enabled: true,
      defaultTtl: config.cache.ttl,
      keyPrefix: 'api_cache',
      excludePaths: [
        '/health',
        '/metrics',
        '/api/cache',
        /^\/monitoring/,
        /^\/local\/v\d+\/auth/, // 排除所有auth相关接口
      ],
    }),
  );

  // 缓存管理API中间件
  app.use(cacheManagementMiddleware());

  // 统一响应处理
  app.use(responseMiddleware);

  appLogger.info('Middleware configured successfully');
}

/**
 * 配置路由
 */
function setupRoutes(): void {
  // 注册监控路由（在主路由之前，避免被API前缀影响）
  app.use(monitoringRoutes.routes());
  app.use(monitoringRoutes.allowedMethods());

  // 注册主路由
  app.use(router.routes());
  app.use(router.allowedMethods());

  // 404处理
  app.use(notFoundMiddleware);

  const logger = createLogger('ROUTES');
  logger.info('Routes configured successfully');
}

/**
 * 启动HTTP服务器
 * @returns HTTP服务器实例
 */
function startServer(): import('http').Server {
  const logger = createLogger('SERVER');
  const server = app.listen(Number(PORT), '0.0.0.0', () => {
    logger.info(`Server is running on http://${LOCAL_IP}:${PORT}`);
    logger.info(`Config API: http://${LOCAL_IP}:${PORT}/local/v1/config`);
  });

  return server;
}

/**
 * 优雅关闭处理
 * @param server - HTTP服务器实例
 */
function setupGracefulShutdown(server: import('http').Server): void {
  /**
   * 处理SIGTERM信号
   */
  const logger = createLogger('SHUTDOWN');
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    server.close(async () => {
      await configHotReloadManager.stopAll();
      await closeCacheManager();
      closeDatabase();
      logger.info('Server shutdown completed');
      process.exit(0);
    });
  });

  /**
   * 处理SIGINT信号
   */
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    server.close(async () => {
      await configHotReloadManager.stopAll();
      await closeCacheManager();
      closeDatabase();
      logger.info('Server shutdown completed');
      process.exit(0);
    });
  });

  /**
   * 处理未捕获的异常
   */
  process.on('uncaughtException', async error => {
    logger.error('Uncaught Exception', error);
    server.close(async () => {
      await closeCacheManager();
      closeDatabase();
      process.exit(1);
    });
  });

  /**
   * 处理未处理的Promise拒绝
   */
  process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled Rejection at Promise', { reason, promise });
    server.close(async () => {
      await closeCacheManager();
      closeDatabase();
      process.exit(1);
    });
  });
}

/**
 * 应用程序主入口
 */
async function main(): Promise<void> {
  try {
    // Winston日志系统会自动配置，无需手动设置
    const logger = createLogger('APP');
    logger.info('Starting Koa API Server...');

    // 验证配置
    validateConfig();
    logger.info(`Environment: ${config.env.NODE_ENV}`);

    // 记录系统信息
    logSystemInfo();

    // 初始化数据库和服务
    await initializeDatabase();

    // 配置中间件
    setupMiddleware();

    // 配置路由
    setupRoutes();

    // 启动服务器
    const server = startServer();

    // 设置优雅关闭
    setupGracefulShutdown(server);

    appLogger.info('Koa API Server started successfully');
  } catch (error) {
    appLogger.error('Failed to start server', error);
    if (error instanceof Error) {
      appLogger.error(`Error details: ${error.message}`);
      appLogger.error(`Error stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

// 启动应用
main().catch(err => {
  appLogger.error('Unhandled error in main function', err);
  process.exit(1);
});

export default app;
