/**
 * 日志系统
 *
 * 所有日志输出到 stderr，不会干扰 MCP stdio 协议（使用 stdout）
 */

import chalk from 'chalk';

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
 * 日志配置接口
 */
interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  format?: 'json' | 'text';
}

/**
 * 日志管理器
 */
export class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
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

    if (this.config.enableConsole) {
      this.logToConsole(level, message, data);
    }
  }

  /**
   * 输出到控制台（stderr，不干扰 MCP stdio 协议）
   */
  private logToConsole(level: LogLevel, message: string, data?: unknown): void {
    let output = '';
    switch (level) {
      case LogLevel.DEBUG:
        output = chalk.gray(message);
        break;
      case LogLevel.INFO:
        output = message;
        break;
      case LogLevel.WARN:
        output = chalk.yellow(message);
        break;
      case LogLevel.ERROR:
        output = chalk.red(message);
        break;
      case LogLevel.FATAL:
        output = chalk.bgRed.white(message);
        break;
    }

    console.error(output);

    if (data && (data as { args?: unknown[] }).args) {
      const args = (data as { args: unknown[] }).args;
      args.forEach((arg) => console.error(arg));
    } else if (data) {
      console.error(data);
    }
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
 * CLI 友好的日志器实例
 */
export const cliLogger = new Logger({
  level: LogLevel.DEBUG,
  enableConsole: true,
  format: 'text',
});

/**
 * 检查消息是否已经包含 ANSI 格式化（如 chalk 输出）
 */
function isPreFormatted(message: string): boolean {
  return message.includes('\u001b[');
}

/**
 * 统一的日志工具
 *
 * 对已经通过 chalk 格式化的消息直接输出到 stderr，
 * 避免 Logger 再次添加颜色导致格式混乱。
 */
export const log = {
  info: (message: string, ...args: unknown[]) => {
    if (isPreFormatted(message)) {
      console.error(message);
      args.forEach((arg) => console.error(arg));
    } else {
      if (args.length > 0) {
        cliLogger.info(message, { args });
      } else {
        cliLogger.info(message);
      }
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    if (isPreFormatted(message)) {
      console.error(message);
      args.forEach((arg) => console.error(arg));
    } else {
      if (args.length > 0) {
        cliLogger.warn(message, { args });
      } else {
        cliLogger.warn(message);
      }
    }
  },

  error: (message: string, ...args: unknown[]) => {
    if (isPreFormatted(message)) {
      console.error(message);
      args.forEach((arg) => console.error(arg));
    } else {
      if (args.length > 0) {
        cliLogger.error(message, undefined, { args });
      } else {
        cliLogger.error(message);
      }
    }
  },

  debug: (message: string, ...args: unknown[]) => {
    if (args.length > 0) {
      cliLogger.debug(message, { args });
    } else {
      cliLogger.debug(message);
    }
  },
};

/**
 * 创建日志器实例
 */
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  return new Logger(config);
}
