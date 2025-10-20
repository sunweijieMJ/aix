import config from '../config';

/** API路由前缀 */
export const API_PREFIX = config.server.apiPrefix;

/** 数据库配置 */
export const DATABASE_CONFIG = {
  /** 数据库类型 */
  DB_TYPE: config.database.type,
} as const;

/** HTTP状态码 */
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

/** 响应错误码 */
export const ERROR_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: -1,
  VALIDATION_ERROR: -2,
  NOT_FOUND: -3,
  UNAUTHORIZED: -4,
  FORBIDDEN: -5,
  DATABASE_ERROR: -6,
  DUPLICATE_ERROR: -7,
  INTERNAL_ERROR: -500,
  INVALID_INPUT: -400,
} as const;

/** 默认配置 */
export const DEFAULT_CONFIG = {
  /** 默认端口 */
  PORT: 31100,
  /** 默认排序值 */
  SORT_ORDER: 0,
} as const;
