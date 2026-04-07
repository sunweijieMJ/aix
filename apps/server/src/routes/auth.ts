/**
 * 认证路由（OpenAPI 版本）
 */
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { ApiResponseSchema, ErrorResponseSchema } from '../schemas/common';
import { LoginRequestSchema, LoginResponseSchema, UserSchema } from '../schemas/auth';
import { AppError } from '../utils/response';
import { env } from '../utils/env';
import { authMiddleware } from '../middleware/auth';
import type { JWTPayload } from '../types';

// 扩展 Hono Context 类型，添加 user 变量
type Variables = {
  user: JWTPayload;
};

const auth = new OpenAPIHono<{ Variables: Variables }>();

/**
 * ⚠️  WARNING: Mock data for development only
 * TODO: Replace with real database (Prisma/Drizzle) in production
 *
 * Production check: Ensure this mock data is removed before deployment
 */
if (env.NODE_ENV === 'production') {
  console.error('🚨 FATAL: Mock user data detected in production environment!');
  console.error('Please implement real database authentication before deploying.');
  process.exit(1);
}

// 模拟用户数据库（仅开发环境）
const users = new Map([
  [
    'admin',
    {
      id: '1',
      username: 'admin',
      email: 'admin@example.com',
      // Password: admin123 (bcrypt hash - for development only)
      password: '$2b$10$XnXlZ8c2oWCpJONaZdRPm.3sYImkFRJqVLaCF6yL65YHgGYib1a/m',
      role: 'admin' as const,
      createdAt: '2026-01-01T00:00:00.000Z', // Fixed timestamp for consistency
    },
  ],
]);

// 登录路由定义
const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  tags: ['Authentication'],
  summary: '用户登录',
  description: '使用用户名和密码登录，获取 JWT Token',
  request: {
    body: {
      content: {
        'application/json': {
          schema: LoginRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Login successful',
      content: {
        'application/json': {
          schema: ApiResponseSchema(LoginResponseSchema),
        },
      },
    },
    401: {
      description: 'Invalid credentials',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// @ts-expect-error - OpenAPIHono handler 严格类型与 errorHandler 不兼容，但运行时正常
auth.openapi(loginRoute, async (c) => {
  const { username, password } = c.req.valid('json');

  const user = users.get(username);
  if (!user) {
    throw new AppError(401, 'Invalid username or password');
  }

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw new AppError(401, 'Invalid username or password');
  }

  // @ts-expect-error - jsonwebtoken 类型定义问题
  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );

  return c.json({
    code: 200,
    message: 'Success',
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    },
  });
});

// 获取用户信息路由定义
const getMeRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Authentication'],
  summary: '获取当前用户信息',
  description: '通过 JWT Token 获取当前登录用户的信息',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'User information',
      content: {
        'application/json': {
          schema: ApiResponseSchema(UserSchema),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// 应用认证中间件到 /me 路由
auth.use('/me', authMiddleware);

auth.openapi(getMeRoute, async (c) => {
  // 认证中间件已验证 token，直接从 context 获取用户信息
  const payload = c.get('user');
  const user = users.get(payload.username);

  if (!user) {
    throw new AppError(401, 'User not found');
  }

  return c.json({
    code: 200,
    message: 'Success',
    data: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  });
});

auth.openapi(getMeRoute, async (c) => {
  // 认证中间件已验证 token，直接从 context 获取用户信息
  const payload = c.get('user');
  const user = users.get(payload.username);

  if (!user) {
    throw new AppError(401, 'User not found');
  }

  return c.json({
    code: 200,
    message: 'Success',
    data: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  });
});

export default auth;
