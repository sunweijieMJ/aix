/**
 * Auth 模块 Zod 验证 schemas
 */
import { z } from 'zod';
import { zodHelpers } from '../middleware/zodValidator';

/**
 * 用户注册 schema
 */
export const registerSchema = z.object({
  username: zodHelpers.username(),
  name: z.string().min(1).max(100).optional(),
  email: zodHelpers.email(),
  password: zodHelpers.password(),
  role: zodHelpers.role().optional(),
});

/**
 * 用户登录 schema
 */
export const loginSchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

/**
 * Token 刷新 schema
 */
export const refreshTokenSchema = z.object({
  token: z.string().min(1, { message: 'Token is required' }),
});

/**
 * 导出类型
 */
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
