import { ERROR_CODES, HTTP_STATUS } from '../constants';
import { DatabaseErrorType } from '../database/errorHandler';

/**
 * 导出错误码常量，方便外部使用
 */
export const ErrorCode = ERROR_CODES;

/**
 * 应用基础错误类
 * 所有自定义错误都应继承此类
 */
export class AppError extends Error {
  code: number;
  status: number;
  requestId?: string;
  traceId?: string;
  context?: Record<string, any>;
  timestamp: string;

  constructor(
    message: string,
    code: number = ERROR_CODES.GENERAL_ERROR,
    status: number = HTTP_STATUS.BAD_REQUEST,
    meta?: {
      requestId?: string;
      traceId?: string;
      context?: Record<string, any>;
    },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.requestId = meta?.requestId;
    this.traceId = meta?.traceId;
    this.context = meta?.context;
    this.timestamp = new Date().toISOString();

    // 确保 instanceof 正常工作
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * 将错误转换为 JSON 对象
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      status: this.status,
      requestId: this.requestId,
      traceId: this.traceId,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  /**
   * 设置请求追踪 ID
   */
  setRequestId(requestId: string): this {
    this.requestId = requestId;
    return this;
  }

  /**
   * 设置分布式追踪 ID
   */
  setTraceId(traceId: string): this {
    this.traceId = traceId;
    return this;
  }

  /**
   * 添加错误上下文
   */
  addContext(key: string, value: any): this {
    if (!this.context) {
      this.context = {};
    }
    this.context[key] = value;
    return this;
  }
}

/**
 * 验证错误
 * 用于表示输入验证失败
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST);
  }
}

/**
 * 资源未找到错误
 */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, ERROR_CODES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }
}

/**
 * 未授权错误
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = '未授权访问') {
    super(message, ERROR_CODES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED);
  }
}

/**
 * 数据库错误
 */
export class DatabaseError extends AppError {
  errorType: DatabaseErrorType;

  constructor(message: string = '数据库操作失败', errorType: DatabaseErrorType = DatabaseErrorType.UNKNOWN) {
    // 初始化为默认值
    const status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const code = ERROR_CODES.DATABASE_ERROR;

    // 根据错误类型调整状态码和错误码
    if (errorType === DatabaseErrorType.NOT_FOUND) {
      super(message, ERROR_CODES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    } else if (errorType === DatabaseErrorType.VALIDATION_ERROR) {
      super(message, ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST);
    } else if (errorType === DatabaseErrorType.DUPLICATE) {
      super(message, ERROR_CODES.DUPLICATE_ERROR, HTTP_STATUS.CONFLICT);
    } else {
      super(message, code, status);
    }

    this.errorType = errorType;
  }
}

/**
 * 创建错误工厂函数
 * 根据错误类型创建相应的错误实例
 */
export function createError(type: string, message: string): AppError {
  switch (type) {
    case 'validation':
      return new ValidationError(message);
    case 'notFound':
      return new NotFoundError(message);
    case 'unauthorized':
      return new UnauthorizedError(message);
    case 'database':
      return new DatabaseError(message);
    default:
      return new AppError(message);
  }
}

/**
 * 创建数据库错误
 * @param message 错误消息
 * @param errorType 数据库错误类型
 * @returns 数据库错误实例
 */
export function createDatabaseError(message: string, errorType: DatabaseErrorType): DatabaseError {
  return new DatabaseError(message, errorType);
}
