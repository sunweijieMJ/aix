/**
 * Zod 验证中间件
 * 用于验证请求体、查询参数等数据
 */
import { Context, Next } from 'koa';
import { z, ZodError } from 'zod';
import { createLogger } from '../utils/logger';

const logger = createLogger('ZOD_VALIDATOR');

/**
 * 验证选项
 */
interface ValidationOptions {
  /** 验证请求体 */
  body?: z.ZodType<any>;
  /** 验证查询参数 */
  query?: z.ZodType<any>;
  /** 验证路径参数 */
  params?: z.ZodType<any>;
  /** 是否在验证失败时记录日志 */
  logErrors?: boolean;
}

/**
 * 创建 Zod 验证中间件
 * @param schema Zod schema 对象或验证选项
 * @returns Koa 中间件函数
 *
 * @example
 * // 简单用法：只验证请求体
 * router.post('/users', validate(userCreateSchema), async (ctx) => {
 *   // ctx.request.body 已经验证通过且类型安全
 * });
 *
 * @example
 * // 完整用法：验证多个部分
 * router.post('/users/:id', validate({
 *   body: userUpdateSchema,
 *   params: z.object({ id: z.string().uuid() }),
 *   query: z.object({ force: z.boolean().optional() })
 * }), async (ctx) => {
 *   // 所有数据都已验证
 * });
 */
export function validate(schemaOrOptions: z.ZodType<any> | ValidationOptions) {
  return async (ctx: Context, next: Next) => {
    // 如果直接传入 schema，视为验证请求体
    const options: ValidationOptions =
      schemaOrOptions instanceof z.ZodType
        ? { body: schemaOrOptions, logErrors: true }
        : { logErrors: true, ...schemaOrOptions };

    try {
      // 验证请求体
      if (options.body) {
        ctx.request.body = await options.body.parseAsync(ctx.request.body);
      }

      // 验证查询参数
      if (options.query) {
        ctx.query = (await options.query.parseAsync(ctx.query)) as any;
      }

      // 验证路径参数
      if (options.params) {
        ctx.params = await options.params.parseAsync(ctx.params);
      }

      await next();
    } catch (error) {
      if (error instanceof ZodError) {
        // 格式化 Zod 验证错误
        const formattedErrors = formatZodError(error);

        if (options.logErrors !== false) {
          logger.warn('Validation failed', {
            path: ctx.path,
            method: ctx.method,
            errors: formattedErrors,
          });
        }

        ctx.status = 400;
        ctx.body = {
          code: -400,
          message: 'Validation failed',
          result: {
            errors: formattedErrors,
          },
        };
        return;
      }

      // 其他错误继续抛出
      throw error;
    }
  };
}

/**
 * 格式化 Zod 错误信息
 * @param error ZodError 对象
 * @returns 格式化后的错误数组
 */
function formatZodError(error: ZodError) {
  return error.issues.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));
}

/**
 * 辅助函数：创建字符串验证
 */
export const zodHelpers = {
  /** 用户名验证（3-50个字符） */
  username: () =>
    z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_-]+$/, {
        message: 'Username can only contain letters, numbers, underscores and hyphens',
      }),

  /** 邮箱验证 */
  email: () => z.string().email({ message: 'Invalid email address' }),

  /** 密码验证（8-64个字符，至少包含大小写字母和数字） */
  password: () =>
    z
      .string()
      .min(8, { message: 'Password must be at least 8 characters' })
      .max(64, { message: 'Password must be at most 64 characters' })
      .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
      .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
      .regex(/[0-9]/, { message: 'Password must contain at least one number' }),

  /** UUID 验证 */
  uuid: () => z.string().uuid({ message: 'Invalid UUID format' }),

  /** 分页参数验证 */
  pagination: () =>
    z.object({
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    }),

  /** 用户角色验证 */
  role: () =>
    z.enum(['admin', 'user', 'guest'], {
      message: 'Role must be admin, user or guest',
    }),
};
