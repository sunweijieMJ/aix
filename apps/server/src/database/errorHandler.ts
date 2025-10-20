import { DatabaseError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('DATABASE_ERROR_HANDLER');

/**
 * 数据库错误类型
 */
export enum DatabaseErrorType {
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  INITIALIZATION_ERROR = 'INITIALIZATION_ERROR',
  READ_ERROR = 'READ_ERROR',
  WRITE_ERROR = 'WRITE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  DUPLICATE = 'DUPLICATE',
  TRANSACTION_ERROR = 'TRANSACTION_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * 数据库错误处理选项
 */
interface DatabaseErrorHandlerOptions {
  operation: string;
  errorType?: DatabaseErrorType;
  message?: string;
  originalError?: any;
}

/**
 * 处理数据库错误
 * @param options 错误处理选项
 * @throws DatabaseError 包装后的数据库错误
 */
export function handleDatabaseError(options: DatabaseErrorHandlerOptions): never {
  const { operation, errorType = DatabaseErrorType.UNKNOWN, message, originalError } = options;

  // 构建错误消息
  const errorMessage = message || originalError?.message || '未知数据库错误';
  const fullMessage = `${operation} 失败: ${errorMessage}`;

  // 记录错误
  logger.error(fullMessage, originalError);

  // 记录堆栈信息
  if (originalError?.stack) {
    logger.debug(`错误堆栈: ${originalError.stack}`);
  }

  // 抛出包装后的错误
  throw new DatabaseError(fullMessage, errorType);
}
