/**
 * 日志系统
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import chalk from 'chalk';
import { IS_PRODUCTION } from '../config';

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

/**
 * 日志条目接口（内部使用）
 */
interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
  error?: Error;
}

/**
 * 日志配置接口（内部使用）
 */
interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  logDir?: string;
  maxFileSize?: number; // MB
  maxFiles?: number;
  format?: 'json' | 'text';
}

/**
 * 日志管理器
 */
export class Logger {
  private config: LoggerConfig;
  private buffer: LogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
      enableFile: false,
      format: 'text',
      ...config,
    };
  }

  /**
   * 记录调试日志
   */
  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * 记录信息日志
   */
  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * 记录警告日志
   */
  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * 记录错误日志
   */
  error(message: string, error?: Error | unknown, data?: unknown): void {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, {
        ...(data && typeof data === 'object' ? data : {}),
        error: error.message,
        stack: error.stack,
      });
    } else {
      this.log(LogLevel.ERROR, message, {
        ...(data && typeof data === 'object' ? data : {}),
        error,
      });
    }
  }

  /**
   * 记录致命错误日志
   */
  fatal(message: string, error?: Error | unknown, data?: unknown): void {
    if (error instanceof Error) {
      this.log(LogLevel.FATAL, message, {
        ...(data && typeof data === 'object' ? data : {}),
        error: error.message,
        stack: error.stack,
      });
    } else {
      this.log(LogLevel.FATAL, message, {
        ...(data && typeof data === 'object' ? data : {}),
        error,
      });
    }
  }

  /**
   * 创建子日志器
   */
  child(context: string): ContextLogger {
    return new ContextLogger(this, context);
  }

  /**
   * 记录日志
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    if (level < this.config.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data,
    };

    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    if (this.config.enableFile) {
      this.buffer.push(entry);
      this.scheduleFlush();
    }
  }

  /**
   * 输出到控制台
   */
  private logToConsole(entry: LogEntry): void {
    // CLI 友好模式：简化输出格式
    if (this.config.format === 'text' && !this.config.enableFile) {
      // 简化的 CLI 输出
      let output = '';
      switch (entry.level) {
        case LogLevel.DEBUG:
          output = chalk.gray(entry.message);
          break;
        case LogLevel.INFO:
          output = entry.message; // 保持原色
          break;
        case LogLevel.WARN:
          output = chalk.yellow(entry.message);
          break;
        case LogLevel.ERROR:
          output = chalk.red(entry.message);
          break;
        case LogLevel.FATAL:
          output = chalk.bgRed.white(entry.message);
          break;
      }

      if (!IS_PRODUCTION) {
        console.error(output);
      }

      if (entry.data && (entry.data as { args?: unknown[] }).args) {
        // 特殊处理从 console 迁移的参数
        const args = (entry.data as { args: unknown[] }).args;
        if (args.length > 0) {
          if (!IS_PRODUCTION) {
            args.forEach((arg) => console.error(arg));
          }
        }
      } else if (entry.data) {
        if (!IS_PRODUCTION) {
          console.error(entry.data);
        }
      }
    } else {
      // 详细的日志输出（包含时间戳）
      const timestamp = entry.timestamp.toISOString();
      const levelName = LogLevel[entry.level];
      const prefix = `[${timestamp}] [${levelName}]`;

      let output = '';
      switch (entry.level) {
        case LogLevel.DEBUG:
          output = chalk.gray(`${prefix} ${entry.message}`);
          break;
        case LogLevel.INFO:
          output = chalk.blue(`${prefix} ${entry.message}`);
          break;
        case LogLevel.WARN:
          output = chalk.yellow(`${prefix} ${entry.message}`);
          break;
        case LogLevel.ERROR:
          output = chalk.red(`${prefix} ${entry.message}`);
          break;
        case LogLevel.FATAL:
          output = chalk.bgRed.white(`${prefix} ${entry.message}`);
          break;
      }

      if (!IS_PRODUCTION) {
        console.error(output);
      }

      if (entry.data) {
        if (!IS_PRODUCTION) {
          console.error(chalk.gray('Data:'), entry.data);
        }
      }
    }
  }

  /**
   * 计划刷新缓冲区
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flush().catch(console.error);
    }, 1000);
  }

  /**
   * 刷新缓冲区到文件
   */
  async flush(): Promise<void> {
    if (
      !this.config.enableFile ||
      !this.config.logDir ||
      this.buffer.length === 0
    ) {
      return;
    }

    const entries = [...this.buffer];
    this.buffer = [];
    this.flushTimer = undefined;

    try {
      const logFile = this.getLogFileName();
      const logPath = join(this.config.logDir, logFile);

      await mkdir(dirname(logPath), { recursive: true });

      const content =
        this.config.format === 'json'
          ? entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
          : entries.map((e) => this.formatTextLog(e)).join('\n') + '\n';

      await writeFile(logPath, content, { flag: 'a' });
    } catch (error) {
      console.error('Failed to write log file:', error);
    }
  }

  /**
   * 格式化文本日志
   */
  private formatTextLog(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const levelName = LogLevel[entry.level];
    let log = `[${timestamp}] [${levelName}] ${entry.message}`;

    if (entry.context) {
      log = `[${timestamp}] [${levelName}] [${entry.context}] ${entry.message}`;
    }

    if (entry.data) {
      log += ` | ${JSON.stringify(entry.data)}`;
    }

    return log;
  }

  /**
   * 获取日志文件名
   */
  private getLogFileName(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `mcp-server-${year}-${month}-${day}.log`;
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * 获取当前日志级别
   */
  getLevel(): LogLevel {
    return this.config.level;
  }
}

/**
 * 上下文日志器
 */
export class ContextLogger {
  constructor(
    private parent: Logger,
    private context: string,
  ) {}

  debug(message: string, data?: unknown): void {
    this.parent.debug(`[${this.context}] ${message}`, data);
  }

  info(message: string, data?: unknown): void {
    this.parent.info(`[${this.context}] ${message}`, data);
  }

  warn(message: string, data?: unknown): void {
    this.parent.warn(`[${this.context}] ${message}`, data);
  }

  error(message: string, error?: Error | unknown, data?: unknown): void {
    this.parent.error(`[${this.context}] ${message}`, error, data);
  }

  fatal(message: string, error?: Error | unknown, data?: unknown): void {
    this.parent.fatal(`[${this.context}] ${message}`, error, data);
  }
}

/**
 * 默认日志器实例
 */
export const logger = new Logger();

/**
 * CLI 友好的日志器实例（简化输出格式）
 */
export const cliLogger = new Logger({
  level: LogLevel.DEBUG,
  enableConsole: true,
  enableFile: false,
  format: 'text',
});

/**
 * 检查是否为彩色输出消息（包含 chalk 样式或表情符号）
 */
function isColoredMessage(message: string): boolean {
  return (
    message.includes('\u001b[') || // ANSI 转义序列
    message.includes('🚀') ||
    message.includes('✅') ||
    message.includes('📦') ||
    message.includes('⚠️') ||
    message.includes('❌') ||
    message.includes('🔍') ||
    message.includes('🧹') ||
    message.includes('🔄') ||
    message.includes('🌐') ||
    message.includes('🏥') ||
    message.includes('📊') ||
    message.includes('💾') ||
    message.includes('🛑')
  );
}

/**
 * 输出额外参数
 */
function logAdditionalArgs(args: unknown[]): void {
  if (args.length > 0) {
    if (!IS_PRODUCTION) {
      args.forEach((arg) => console.error(arg));
    }
  }
}

/**
 * 统一的日志工具
 */
export const log = {
  /**
   * 信息输出 - 智能判断是否保持彩色输出
   */
  info: (message: string, ...args: unknown[]) => {
    if (isColoredMessage(message)) {
      if (!IS_PRODUCTION) {
        console.error(message);
      }
      logAdditionalArgs(args);
    } else {
      if (args.length > 0) {
        cliLogger.info(message, { args });
      } else {
        cliLogger.info(message);
      }
    }
  },

  /**
   * 警告输出 - 智能判断是否保持彩色输出
   */
  warn: (message: string, ...args: unknown[]) => {
    if (isColoredMessage(message)) {
      if (!IS_PRODUCTION) {
        console.error(message);
      }
      logAdditionalArgs(args);
    } else {
      if (args.length > 0) {
        cliLogger.warn(message, { args });
      } else {
        cliLogger.warn(message);
      }
    }
  },

  /**
   * 错误输出 - 智能判断是否保持彩色输出
   */
  error: (message: string, ...args: unknown[]) => {
    if (isColoredMessage(message)) {
      if (!IS_PRODUCTION) {
        console.error(message);
      }
      logAdditionalArgs(args);
    } else {
      if (args.length > 0) {
        cliLogger.error(message, undefined, { args });
      } else {
        cliLogger.error(message);
      }
    }
  },

  /**
   * 调试输出
   */
  debug: (message: string, ...args: unknown[]) => {
    if (args.length > 0) {
      cliLogger.debug(message, { args });
    } else {
      cliLogger.debug(message);
    }
  },
};

/**
 * 性能监控
 */
export class PerformanceMonitor {
  private timers = new Map<string, number>();

  /**
   * 开始计时
   */
  start(label: string): void {
    this.timers.set(label, performance.now());
  }

  /**
   * 结束计时并记录
   */
  end(label: string, logger?: Logger): number {
    const startTime = this.timers.get(label);
    if (!startTime) {
      return 0;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(label);

    if (logger) {
      logger.debug(`Performance: ${label} took ${duration.toFixed(2)}ms`);
    }

    return duration;
  }

  /**
   * 装饰器：测量异步函数执行时间
   */
  static measure(label?: string) {
    return function (
      target: any,
      propertyKey: string,
      descriptor: PropertyDescriptor,
    ) {
      const originalMethod = descriptor.value;

      descriptor.value = async function (...args: any[]) {
        const measureLabel =
          label || `${target.constructor.name}.${propertyKey}`;
        const monitor = new PerformanceMonitor();
        monitor.start(measureLabel);

        try {
          const result = await originalMethod.apply(this, args);
          monitor.end(measureLabel, logger);
          return result;
        } catch (error) {
          monitor.end(measureLabel, logger);
          throw error;
        }
      };

      return descriptor;
    };
  }
}

/**
 * 创建日志器实例
 */
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  return new Logger(config);
}
