/** 错误码枚举 */
export type ErrorCode =
  // 模板相关
  | 'E_TEMPLATE_FETCH_FAILED'
  | 'E_NO_TEMPLATE_CONFIG'
  | 'E_INVALID_TEMPLATE_CONFIG'
  | 'E_VERSION_INCOMPATIBLE'
  // 项目相关
  | 'E_INVALID_PROJECT_NAME'
  | 'E_DIR_NOT_EMPTY'
  | 'E_DIR_WRITE_FAILED'
  // 用户操作
  | 'E_USER_CANCEL'
  // 环境
  | 'E_NODE_VERSION'
  | 'E_UNKNOWN';

/** CLI 统一错误类 */
export class CreateAppError extends Error {
  readonly code: ErrorCode;
  readonly suggestion?: string;
  readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, suggestion?: string, cause?: unknown) {
    super(message);
    this.name = 'CreateAppError';
    this.code = code;
    this.suggestion = suggestion;
    this.cause = cause;
  }
}

/** 包装未知错误为 CreateAppError */
export function wrapError(err: unknown, fallbackCode: ErrorCode = 'E_UNKNOWN'): CreateAppError {
  if (err instanceof CreateAppError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new CreateAppError(fallbackCode, message, undefined, err);
}
