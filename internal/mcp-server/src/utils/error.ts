import { log } from './logger';

/**
 * 自定义错误类
 */

/**
 * MCP Server 基础错误类
 */
export class MCPError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    message: string,
    code: string,
    statusCode = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = 'MCPError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // 保持原型链
    Object.setPrototypeOf(this, MCPError.prototype);
  }
}

/**
 * 组件未找到错误
 */
export class ComponentNotFoundError extends MCPError {
  constructor(componentName: string) {
    super(`组件 "${componentName}" 未找到`, 'COMPONENT_NOT_FOUND', 404, {
      componentName,
    });
    this.name = 'ComponentNotFoundError';
  }
}

/**
 * 工具未找到错误
 */
export class ToolNotFoundError extends MCPError {
  constructor(toolName: string) {
    super(`工具 "${toolName}" 未找到`, 'TOOL_NOT_FOUND', 404, { toolName });
    this.name = 'ToolNotFoundError';
  }
}

/**
 * 数据提取错误
 */
export class ExtractionError extends MCPError {
  constructor(message: string, details?: unknown) {
    super(`数据提取失败: ${message}`, 'EXTRACTION_ERROR', 500, details);
    this.name = 'ExtractionError';
  }
}

/**
 * 解析错误
 */
export class ParseError extends MCPError {
  constructor(message: string, filePath?: string) {
    super(`解析失败: ${message}`, 'PARSE_ERROR', 400, { filePath });
    this.name = 'ParseError';
  }
}

/**
 * 缓存错误
 */
export class CacheError extends MCPError {
  constructor(message: string, operation?: string) {
    super(`缓存操作失败: ${message}`, 'CACHE_ERROR', 500, { operation });
    this.name = 'CacheError';
  }
}

/**
 * 验证错误
 */
export class ValidationError extends MCPError {
  constructor(message: string, field?: string) {
    super(`验证失败: ${message}`, 'VALIDATION_ERROR', 400, { field });
    this.name = 'ValidationError';
  }
}

/**
 * 配置错误
 */
export class ConfigError extends MCPError {
  constructor(message: string, configKey?: string) {
    super(`配置错误: ${message}`, 'CONFIG_ERROR', 500, { configKey });
    this.name = 'ConfigError';
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends MCPError {
  constructor(operation: string, timeout: number) {
    super(`操作超时: ${operation} (${timeout}ms)`, 'TIMEOUT_ERROR', 408, {
      operation,
      timeout,
    });
    this.name = 'TimeoutError';
  }
}

/**
 * 错误处理器
 */
export class ErrorHandler {
  /**
   * 处理错误并返回格式化的响应
   */
  static handle(error: unknown): {
    error: {
      message: string;
      code: string;
      statusCode: number;
      details?: unknown;
    };
  } {
    if (error instanceof MCPError) {
      return {
        error: {
          message: error.message,
          code: error.code,
          statusCode: error.statusCode,
          details: error.details,
        },
      };
    }

    if (error instanceof Error) {
      return {
        error: {
          message: error.message,
          code: 'UNKNOWN_ERROR',
          statusCode: 500,
        },
      };
    }

    return {
      error: {
        message: '未知错误',
        code: 'UNKNOWN_ERROR',
        statusCode: 500,
      },
    };
  }

  /**
   * 记录错误日志
   */
  static log(error: unknown, context?: string): void {
    const timestamp = new Date().toISOString();

    if (error instanceof MCPError) {
      log.error(
        `[${timestamp}] ${context || 'Error'}: ${error.code} - ${error.message}`,
      );
      if (error.details) {
        log.error('Details:', error.details);
      }
    } else if (error instanceof Error) {
      log.error(`[${timestamp}] ${context || 'Error'}:`, error.message);
      log.error('Stack:', error.stack);
    } else {
      log.error(`[${timestamp}] ${context || 'Error'}:`, error);
    }
  }

  /**
   * 包装异步函数以处理错误
   */
  static wrap<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context?: string,
  ): T {
    return (async (...args: Parameters<T>) => {
      try {
        return await fn(...args);
      } catch (error) {
        ErrorHandler.log(error, context);
        throw error;
      }
    }) as T;
  }

  /**
   * 重试机制
   */
  static async retry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    delay = 1000,
    backoff = 2,
  ): Promise<T> {
    let lastError: unknown;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (i < maxRetries - 1) {
          const waitTime = delay * Math.pow(backoff, i);
          log.info(`重试 ${i + 1}/${maxRetries}，等待 ${waitTime}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError;
  }
}

/**
 * 断言函数
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new ValidationError(message);
  }
}

/**
 * 断言非空
 */
export function assertNotNull<T>(
  value: T | null | undefined,
  name: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new ValidationError(`${name} 不能为空`);
  }
}
