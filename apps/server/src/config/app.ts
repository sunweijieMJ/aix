/**
 * 应用配置管理
 */
import env, { validateConfig } from './env';
import { createLogger } from '../utils/logger';

const logger = createLogger('CONFIG');

/**
 * 数据库配置
 */
export interface IDatabaseConfig {
  type: 'postgresql';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  options: {
    synchronize: boolean;
    logging: boolean;
    maxConnections: number;
    acquireTimeoutMillis: number;
    timeout: number;
  };
}

/**
 * 应用缓存配置
 */
export interface IAppCacheConfig {
  type: 'memory' | 'redis';
  ttl: number;
  memory?: {
    maxKeys: number;
    checkperiod: number;
  };
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
}

/**
 * 安全配置
 */
export interface ISecurityConfig {
  cors: {
    enabled: boolean;
    origins: string[];
    credentials: boolean;
    maxAge: number;
  };
  helmet: {
    enabled: boolean;
    options: {
      contentSecurityPolicy: boolean;
      crossOriginEmbedderPolicy: boolean;
    };
  };
  rateLimit: {
    enabled: boolean;
    max: number;
    windowMs: number;
    message: string;
  };
}

/**
 * 监控配置
 */
export interface IMonitoringConfig {
  healthCheck: {
    enabled: boolean;
    path: string;
    interval: number;
  };
  metrics: {
    enabled: boolean;
    path: string;
    collectDefaultMetrics: boolean;
  };
}

/**
 * 应用配置接口
 */
export interface IAppConfig {
  env: typeof env;
  server: {
    port: number;
    host: string;
    apiPrefix: string;
  };
  database: IDatabaseConfig;
  cache: IAppCacheConfig;
  security: ISecurityConfig;
  monitoring: IMonitoringConfig;
  logging: {
    level: string;
    fileEnabled: boolean;
    dir: string;
  };
}

/**
 * 创建数据库配置
 */
function createDatabaseConfig(): IDatabaseConfig {
  return {
    type: env.DB_TYPE,
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    options: {
      synchronize: env.NODE_ENV !== 'production',
      logging: env.NODE_ENV === 'development',
      maxConnections: 10,
      acquireTimeoutMillis: 30000,
      timeout: 30000,
    },
  };
}

/**
 * 创建缓存配置
 */
function createCacheConfig(): IAppCacheConfig {
  const config: IAppCacheConfig = {
    type: env.CACHE_TYPE,
    ttl: env.CACHE_TTL,
  };

  if (env.CACHE_TYPE === 'memory') {
    config.memory = {
      maxKeys: 10000,
      checkperiod: Math.max(60, Math.floor(env.CACHE_TTL / 10)),
    };
  } else if (env.CACHE_TYPE === 'redis') {
    config.redis = {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      db: env.REDIS_DB,
      keyPrefix: env.REDIS_KEY_PREFIX,
    };
  }

  return config;
}

/**
 * 创建应用配置
 */
function createAppConfig(): IAppConfig {
  // 验证环境变量配置
  validateConfig();

  return {
    env,

    server: {
      port: env.PORT,
      host: env.HOST,
      apiPrefix: env.API_PREFIX,
    },

    database: createDatabaseConfig(),

    cache: createCacheConfig(),

    security: {
      cors: {
        enabled: true,
        origins: env.CORS_ORIGINS,
        credentials: true,
        maxAge: 86400, // 24小时
      },
      helmet: {
        enabled: env.ENABLE_HELMET,
        options: {
          contentSecurityPolicy: false, // 避免与前端冲突
          crossOriginEmbedderPolicy: false,
        },
      },
      rateLimit: {
        enabled: env.NODE_ENV === 'production',
        max: env.RATE_LIMIT_MAX,
        windowMs: env.RATE_LIMIT_WINDOW,
        message: 'Too many requests from this IP, please try again later.',
      },
    },

    monitoring: {
      healthCheck: {
        enabled: env.HEALTH_CHECK_ENABLED,
        path: '/health',
        interval: 30000, // 30秒检查间隔
      },
      metrics: {
        enabled: env.METRICS_ENABLED,
        path: '/metrics',
        collectDefaultMetrics: true,
      },
    },

    logging: {
      level: env.LOG_LEVEL,
      fileEnabled: env.LOG_FILE_ENABLED,
      dir: env.LOG_DIR,
    },
  };
}

// 创建并导出配置实例
export const config = createAppConfig();

// 启动时打印配置信息
logger.info('Application configuration loaded:', {
  environment: config.env.NODE_ENV,
  port: config.server.port,
  database: config.database.type,
  cache: config.cache.type,
});

export default config;
