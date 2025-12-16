/**
 * @fileoverview 可配置的日志系统
 * 提供统一的日志接口，支持开关控制和自定义日志处理器
 */

/**
 * 日志级别
 */
export enum LogLevel {
  None = 0,
  Error = 1,
  Warn = 2,
  Info = 3,
  Debug = 4,
}

/**
 * 日志配置
 */
export interface LoggerConfig {
  /** 日志级别 */
  level: LogLevel;
  /** 是否启用日志 */
  enabled: boolean;
  /** 日志前缀 */
  prefix: string;
  /** 自定义日志处理器 */
  handler?: LogHandler;
}

/**
 * 自定义日志处理器
 */
export interface LogHandler {
  debug?: (message: string, ...args: unknown[]) => void;
  info?: (message: string, ...args: unknown[]) => void;
  warn?: (message: string, ...args: unknown[]) => void;
  error?: (message: string, ...args: unknown[]) => void;
}

/** 全局日志配置 */
const globalConfig: LoggerConfig = {
  level: LogLevel.Warn,
  enabled: true,
  prefix: '[chat-sdk]',
};

/**
 * 配置全局日志
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  Object.assign(globalConfig, config);
}

/**
 * 获取当前日志配置
 */
export function getLoggerConfig(): LoggerConfig {
  return { ...globalConfig };
}

/**
 * 创建日志方法
 */
function createLogMethod(
  level: LogLevel,
  consoleFn: (...args: unknown[]) => void,
  handlerKey: keyof LogHandler,
) {
  return (message: string, ...args: unknown[]): void => {
    if (!globalConfig.enabled || globalConfig.level < level) {
      return;
    }

    const formattedMessage = `${globalConfig.prefix} ${message}`;

    if (globalConfig.handler?.[handlerKey]) {
      globalConfig.handler[handlerKey]!(formattedMessage, ...args);
    } else {
      consoleFn(formattedMessage, ...args);
    }
  };
}

/**
 * 日志工具
 */
export const logger = {
  debug: createLogMethod(LogLevel.Debug, console.debug, 'debug'),
  info: createLogMethod(LogLevel.Info, console.info, 'info'),
  warn: createLogMethod(LogLevel.Warn, console.warn, 'warn'),
  error: createLogMethod(LogLevel.Error, console.error, 'error'),
};

/**
 * 静默模式 - 禁用所有日志
 */
export function silentMode(): void {
  globalConfig.enabled = false;
}

/**
 * 启用日志
 */
export function enableLogs(level: LogLevel = LogLevel.Warn): void {
  globalConfig.enabled = true;
  globalConfig.level = level;
}
