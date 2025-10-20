/**
 * 环境变量管理
 */
import dotenv from 'dotenv';
import path from 'path';

// 根据NODE_ENV加载对应的环境文件
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = path.join(process.cwd(), `.env.${nodeEnv}`);

// 加载环境变量
dotenv.config({ path: envFile });
dotenv.config(); // 加载默认.env文件作为备选

/**
 * 环境变量类型定义
 */
export interface IEnvironmentVariables {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  HOST: string;
  API_PREFIX: string;

  // 数据库配置
  DB_TYPE: 'postgresql';
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;

  // 缓存配置
  CACHE_TYPE: 'memory' | 'redis';
  CACHE_TTL: number;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD: string;
  REDIS_DB: number;
  REDIS_KEY_PREFIX: string;

  // 日志配置
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  LOG_FILE_ENABLED: boolean;
  LOG_DIR: string;

  // 安全配置
  CORS_ORIGINS: string[];
  ENABLE_HELMET: boolean;
  RATE_LIMIT_MAX: number;
  RATE_LIMIT_WINDOW: number;

  // 监控配置
  HEALTH_CHECK_ENABLED: boolean;
  METRICS_ENABLED: boolean;

  // JWT配置
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
}

/**
 * 解析环境变量
 */
function parseEnvVar<T>(key: string, defaultValue: T, parser?: (value: string) => T): T {
  const value = process.env[key];

  if (value === undefined) {
    return defaultValue;
  }

  if (parser) {
    try {
      return parser(value);
    } catch {
      console.warn(`Failed to parse environment variable ${key}: ${value}. Using default: ${defaultValue}`);
      return defaultValue;
    }
  }

  return value as unknown as T;
}

/**
 * 环境变量配置
 */
export const env: IEnvironmentVariables = {
  NODE_ENV: parseEnvVar('NODE_ENV', 'development', v => {
    if (!['development', 'production', 'test'].includes(v)) {
      throw new Error(`Invalid NODE_ENV: ${v}`);
    }
    return v as 'development' | 'production' | 'test';
  }),

  PORT: parseEnvVar('PORT', 3001, v => {
    const port = parseInt(v, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid PORT: ${v}`);
    }
    return port;
  }),

  HOST: parseEnvVar('HOST', '0.0.0.0'),
  API_PREFIX: parseEnvVar('API_PREFIX', '/local/v1'),

  // 数据库配置
  DB_TYPE: parseEnvVar('DB_TYPE', 'postgresql', v => {
    if (v !== 'postgresql') {
      throw new Error(`Invalid DB_TYPE: ${v}. Only postgresql is supported.`);
    }
    return v as 'postgresql';
  }),

  DB_HOST: parseEnvVar('DB_HOST', 'localhost'),
  DB_PORT: parseEnvVar('DB_PORT', 5432, v => parseInt(v, 10)),
  DB_NAME: parseEnvVar('DB_NAME', 'base_node'),
  DB_USER: parseEnvVar('DB_USER', 'postgres'),
  DB_PASSWORD: parseEnvVar('DB_PASSWORD', ''),

  // 缓存配置
  CACHE_TYPE: parseEnvVar('CACHE_TYPE', 'memory', v => {
    if (!['memory', 'redis'].includes(v)) {
      throw new Error(`Invalid CACHE_TYPE: ${v}`);
    }
    return v as 'memory' | 'redis';
  }),
  CACHE_TTL: parseEnvVar('CACHE_TTL', 3600, v => parseInt(v, 10)),
  REDIS_HOST: parseEnvVar('REDIS_HOST', 'localhost'),
  REDIS_PORT: parseEnvVar('REDIS_PORT', 6379, v => parseInt(v, 10)),
  REDIS_PASSWORD: parseEnvVar('REDIS_PASSWORD', ''),
  REDIS_DB: parseEnvVar('REDIS_DB', 0, v => parseInt(v, 10)),
  REDIS_KEY_PREFIX: parseEnvVar('REDIS_KEY_PREFIX', 'node:'),

  // 日志配置
  LOG_LEVEL: parseEnvVar('LOG_LEVEL', 'info', v => {
    if (!['debug', 'info', 'warn', 'error'].includes(v)) {
      throw new Error(`Invalid LOG_LEVEL: ${v}`);
    }
    return v as 'debug' | 'info' | 'warn' | 'error';
  }),

  LOG_FILE_ENABLED: parseEnvVar('LOG_FILE_ENABLED', true, v => v.toLowerCase() === 'true'),
  LOG_DIR: parseEnvVar('LOG_DIR', './logs'),

  // 安全配置
  CORS_ORIGINS: parseEnvVar('CORS_ORIGINS', ['*'], v => {
    try {
      return JSON.parse(v);
    } catch {
      return v.split(',').map(origin => origin.trim());
    }
  }),

  ENABLE_HELMET: parseEnvVar('ENABLE_HELMET', true, v => v.toLowerCase() === 'true'),
  RATE_LIMIT_MAX: parseEnvVar('RATE_LIMIT_MAX', 100, v => parseInt(v, 10)),
  RATE_LIMIT_WINDOW: parseEnvVar('RATE_LIMIT_WINDOW', 60000, v => parseInt(v, 10)),

  // 监控配置
  HEALTH_CHECK_ENABLED: parseEnvVar('HEALTH_CHECK_ENABLED', true, v => v.toLowerCase() === 'true'),
  METRICS_ENABLED: parseEnvVar('METRICS_ENABLED', true, v => v.toLowerCase() === 'true'),

  // JWT配置
  JWT_SECRET: parseEnvVar('JWT_SECRET', 'default-secret-key-change-in-production'),
  JWT_EXPIRES_IN: parseEnvVar('JWT_EXPIRES_IN', '24h'),
};

/**
 * 验证配置
 */
export function validateConfig(): void {
  const requiredVars: Array<keyof IEnvironmentVariables> = [
    'NODE_ENV',
    'PORT',
    'HOST',
    'API_PREFIX',
    'DB_TYPE',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
  ];

  const missingVars = requiredVars.filter(key => {
    const value = env[key];
    return value === undefined || value === null || value === '';
  });

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

export default env;
