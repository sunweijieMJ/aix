/**
 * JWT 认证中间件
 */
import type { MiddlewareHandler } from 'hono';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/response';
import { env } from '../utils/env';
import type { JWTPayload } from '../types';

// 定义中间件的 Variables 类型
type Variables = {
  user: JWTPayload;
};

/**
 * JWT 认证中间件
 * 验证 Authorization header 中的 Bearer token
 * 将解析后的用户信息存储到 c.set('user', payload)
 */
export const authMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Unauthorized: Missing or invalid Authorization header');
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    // 将用户信息存储到 context，后续路由可以通过 c.get('user') 获取
    c.set('user', payload);
    await next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'Token expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AppError(401, 'Invalid token');
    }
    throw new AppError(401, 'Authentication failed');
  }
};
