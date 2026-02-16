/**
 * 认证相关 Schema
 */
import { z } from 'zod';

// 登录请求 Schema
export const LoginRequestSchema = z.object({
  username: z.string().min(3).max(50).openapi({
    example: 'admin',
    description: '用户名（3-50个字符）',
  }),
  password: z.string().min(6).openapi({
    example: 'admin123',
    description: '密码（最少6个字符）',
  }),
});

// 用户信息 Schema
export const UserSchema = z.object({
  id: z.string().openapi({ example: '1' }),
  username: z.string().openapi({ example: 'admin' }),
  email: z.string().email().openapi({ example: 'admin@example.com' }),
  role: z.enum(['admin', 'user']).openapi({ example: 'admin' }),
});

// 登录响应 Schema
export const LoginResponseSchema = z.object({
  token: z.string().openapi({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT Token',
  }),
  user: UserSchema,
});
