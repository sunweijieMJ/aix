/** 错误码枚举 */
export type ErrorCode =
  // 模板相关
  | 'E_TEMPLATE_FETCH_FAILED'
  | 'E_NO_TEMPLATE_CONFIG'
  | 'E_INVALID_TEMPLATE_CONFIG'
  | 'E_VERSION_INCOMPATIBLE'
  | 'E_TEMPLATE_SYNTAX'
  | 'E_UNKNOWN_FEATURE'
  /** --param 的 key 不在模板 params 声明中、格式不是 key=value、或值为空 */
  | 'E_INVALID_PARAM'
  /** CLI 选项取值不合法（如 `--pm bun`），区别于 `--param` 的 E_INVALID_PARAM */
  | 'E_INVALID_OPTION'
  /** 用户级配置（`~/.config/create-app/templates.json`）存在但内容不合法 */
  | 'E_INVALID_USER_CONFIG'
  /** config.ts 声明的 substitution 在模板中零命中（真源改名后未同步） */
  | 'E_SUBSTITUTION_MISS'
  /** config.ts 的 features.dirs / files 指向模板中不存在的路径（清单腐化） */
  | 'E_STALE_MANIFEST_PATH'
  // 项目相关
  | 'E_INVALID_PROJECT_NAME'
  | 'E_DIR_NOT_EMPTY'
  | 'E_DIR_WRITE_FAILED'
  // 用户操作
  | 'E_USER_CANCEL'
  /** stdin 非 TTY（CI / 管道 / `< /dev/null`）但仍有必填项要靠问答补齐 */
  | 'E_NON_INTERACTIVE'
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
