/**
 * 认证和权限中间件
 */
import { Context, Next } from 'koa';
import { createLogger } from '../utils/logger';
import { JWTUtil } from './jwt';
import { tokenBlacklist } from './blacklist';
import { AppError, ErrorCode } from '../utils/errors';
import type { Permission } from './types';
import { UserRole, ROLE_PERMISSIONS } from './types';

const logger = createLogger('AUTH_MIDDLEWARE');

/**
 * JWT 认证中间件
 * 验证请求中的 JWT token 并将用户信息附加到 ctx.state
 */
export async function authMiddleware(ctx: Context, next: Next): Promise<void> {
  try {
    // 从 Authorization header 获取 token
    const authHeader = ctx.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', ErrorCode.UNAUTHORIZED, 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // 检查token是否在黑名单中
    const isBlacklisted = await tokenBlacklist.isBlacklisted(token);
    if (isBlacklisted) {
      throw new AppError('Token has been revoked', ErrorCode.UNAUTHORIZED, 401);
    }

    // 验证 token
    const verifyResult = JWTUtil.verify(token);
    if (!verifyResult.valid || !verifyResult.payload) {
      throw new AppError(verifyResult.error || 'Invalid token', ErrorCode.UNAUTHORIZED, 401);
    }

    // 将用户信息附加到 context
    ctx.state.user = verifyResult.payload;
    ctx.state.userId = verifyResult.payload.userId;
    ctx.state.userRole = verifyResult.payload.role;

    logger.debug(`User authenticated: ${verifyResult.payload.username} (${verifyResult.payload.role})`);

    await next();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('Authentication failed', error);
    throw new AppError('Authentication failed', ErrorCode.UNAUTHORIZED, 401);
  }
}

/**
 * 可选认证中间件
 * 如果提供token则验证，但不强制要求token
 */
export async function optionalAuthMiddleware(ctx: Context, next: Next): Promise<void> {
  try {
    const authHeader = ctx.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const verifyResult = JWTUtil.verify(token);

      if (verifyResult.valid && verifyResult.payload) {
        ctx.state.user = verifyResult.payload;
        ctx.state.userId = verifyResult.payload.userId;
        ctx.state.userRole = verifyResult.payload.role;
        logger.debug(`Optional auth: User authenticated: ${verifyResult.payload.username}`);
      }
    }
  } catch {
    // 可选认证失败不抛出错误
    logger.debug('Optional authentication skipped or failed');
  }

  await next();
}

/**
 * 权限检查中间件工厂
 * @param requiredPermissions 需要的权限列表
 * @param requireAll 是否需要所有权限（true）或至少一个权限（false）
 */
export function requirePermissions(requiredPermissions: Permission | Permission[], requireAll: boolean = false) {
  return async (ctx: Context, next: Next): Promise<void> => {
    // 确保已经通过认证
    if (!ctx.state.user || !ctx.state.userRole) {
      throw new AppError('Authentication required', ErrorCode.UNAUTHORIZED, 401);
    }

    const userRole: UserRole = ctx.state.userRole;
    const userPermissions = ROLE_PERMISSIONS[userRole] || [];
    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

    // 检查权限
    const hasPermission = requireAll
      ? permissions.every(perm => userPermissions.includes(perm))
      : permissions.some(perm => userPermissions.includes(perm));

    if (!hasPermission) {
      logger.warn(`Permission denied for user ${ctx.state.user.username}: required ${permissions.join(', ')}`);
      throw new AppError('Insufficient permissions', ErrorCode.FORBIDDEN, 403);
    }

    logger.debug(`Permission granted: ${permissions.join(', ')}`);
    await next();
  };
}

/**
 * 角色检查中间件工厂
 * @param allowedRoles 允许的角色列表
 */
export function requireRoles(allowedRoles: UserRole | UserRole[]) {
  return async (ctx: Context, next: Next): Promise<void> => {
    // 确保已经通过认证
    if (!ctx.state.user || !ctx.state.userRole) {
      throw new AppError('Authentication required', ErrorCode.UNAUTHORIZED, 401);
    }

    const userRole: UserRole = ctx.state.userRole;
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!roles.includes(userRole)) {
      logger.warn(`Role denied for user ${ctx.state.user.username}: required ${roles.join(', ')}, got ${userRole}`);
      throw new AppError('Insufficient role', ErrorCode.FORBIDDEN, 403);
    }

    logger.debug(`Role granted: ${userRole}`);
    await next();
  };
}

/**
 * 仅管理员中间件
 */
export const requireAdmin = requireRoles(UserRole.ADMIN);

/**
 * 用户或管理员中间件
 */
export const requireUser = requireRoles([UserRole.USER, UserRole.ADMIN]);
