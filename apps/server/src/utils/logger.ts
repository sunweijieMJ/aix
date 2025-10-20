/**
 * Winston 日志系统
 * 提供结构化日志、日志轮转、多传输目标等功能
 */
import winston from 'winston';
import path from 'path';
import { PROJECT } from '../constants/project';

/**
 * 日志级别
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  DEBUG = 'debug',
}

/**
 * 日志格式化器
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

/**
 * 控制台格式化器（彩色输出）
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, context, ...metadata }) => {
    const contextStr = context ? `[${context}]` : '';
    const metaStr = Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : '';
    return `${timestamp} ${level} ${contextStr} ${message} ${metaStr}`.trim();
  }),
);

/**
 * 创建日志传输目标
 */
function createTransports(): winston.transport[] {
  const transports: winston.transport[] = [];
  const nodeEnv = process.env.NODE_ENV || 'development';
  const logLevel = process.env.LOG_LEVEL || 'info';

  // 控制台输出（开发环境）
  if (nodeEnv !== 'production') {
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
        level: logLevel,
      }),
    );
  }

  // 文件输出（生产环境）
  if (nodeEnv === 'production') {
    const logDir = path.join(process.cwd(), 'logs');

    // 错误日志
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: logFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
      }),
    );

    // 组合日志
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        format: logFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
      }),
    );

    // HTTP 请求日志
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'http.log'),
        level: 'http',
        format: logFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      }),
    );
  }

  return transports;
}

/**
 * 创建 Winston Logger 实例
 */
const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: PROJECT.NAME_EN,
    environment: process.env.NODE_ENV || 'development',
  },
  transports: createTransports(),
  exitOnError: false,
});

/**
 * Logger 接口
 */
export interface ILogger {
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  http(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

/**
 * Logger 类 - 带上下文的日志记录器
 */
export class Logger implements ILogger {
  constructor(private context: string) {}

  private formatMeta(meta?: any): any {
    if (!meta) return { context: this.context };
    if (meta instanceof Error) {
      return {
        context: this.context,
        error: {
          name: meta.name,
          message: meta.message,
          stack: meta.stack,
        },
      };
    }
    return { context: this.context, ...meta };
  }

  error(message: string, meta?: any): void {
    winstonLogger.error(message, this.formatMeta(meta));
  }

  warn(message: string, meta?: any): void {
    winstonLogger.warn(message, this.formatMeta(meta));
  }

  info(message: string, meta?: any): void {
    winstonLogger.info(message, this.formatMeta(meta));
  }

  http(message: string, meta?: any): void {
    winstonLogger.http(message, this.formatMeta(meta));
  }

  debug(message: string, meta?: any): void {
    winstonLogger.debug(message, this.formatMeta(meta));
  }
}

/**
 * 创建带上下文的 Logger
 */
export function createLogger(context: string): ILogger {
  return new Logger(context);
}

/**
 * 全局日志实例
 */
export const logger = winstonLogger;

/**
 * 日志流 - 用于与其他中间件集成（如 Morgan）
 */
export const logStream = {
  write: (message: string) => {
    winstonLogger.http(message.trim());
  },
};

export default logger;
