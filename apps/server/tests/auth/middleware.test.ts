/**
 * 认证中间件测试
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Context, Next } from 'koa';
import {
  authMiddleware,
  optionalAuthMiddleware,
  requirePermissions,
  requireRoles,
  requireAdmin,
} from '../../src/auth/middleware';
import { UserRole, Permission } from '../../src/auth/types';
import { AppError } from '../../src/utils/errors';

// Mock JWT工具
vi.mock('../../src/auth/jwt', () => ({
  JWTUtil: {
    verify: vi.fn(),
  },
}));

import { JWTUtil } from '../../src/auth/jwt';

/**
 * 创建类型安全的 ctx.throw mock（完全符合 Koa Context 的 throw 方法签名）
 */
function createThrowMock() {
  return vi.fn((...args: unknown[]): never => {
    // 处理不同的重载
    if (args.length === 1 && typeof args[0] === 'number') {
      // throw(status: number): never
      throw new Error(`${args[0]}`);
    } else if (typeof args[0] === 'string') {
      // throw(message: string, code?: number, properties?: {}): never
      const message = args[0];
      const code = args[1] || 500;
      throw new Error(`${code}: ${message}`);
    } else if (typeof args[0] === 'number' && typeof args[1] === 'string') {
      // 反转参数：状态码和消息
      throw new Error(`${args[0]}: ${args[1]}`);
    } else {
      // throw(...properties: Array<number | string | {}>): never
      throw new Error(args.join(' '));
    }
  });
}

describe('Auth Middleware', () => {
  let ctx: Partial<Context>;
  let next: Next;

  beforeEach(() => {
    ctx = {
      headers: {},
      state: {},
      throw: createThrowMock(),
    };
    next = vi.fn(async () => {});
    vi.clearAllMocks();
  });

  describe('authMiddleware', () => {
    it('should pass with valid token', async () => {
      ctx.headers = { authorization: 'Bearer valid-token' };
      vi.mocked(JWTUtil.verify).mockReturnValue({
        valid: true,
        payload: {
          userId: 1,
          username: 'testuser',
          role: UserRole.USER,
        },
      });

      await authMiddleware(ctx as Context, next);

      expect(next).toHaveBeenCalled();
      expect(ctx.state?.user).toBeDefined();
      expect(ctx.state?.userId).toBe(1);
      expect(ctx.state?.userRole).toBe(UserRole.USER);
    });

    it('should reject request without authorization header', async () => {
      await expect(authMiddleware(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with malformed authorization header', async () => {
      ctx.headers = { authorization: 'InvalidFormat token' };

      await expect(authMiddleware(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', async () => {
      ctx.headers = { authorization: 'Bearer invalid-token' };
      vi.mocked(JWTUtil.verify).mockReturnValue({
        valid: false,
        error: 'Invalid token',
      });

      await expect(authMiddleware(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with expired token', async () => {
      ctx.headers = { authorization: 'Bearer expired-token' };
      vi.mocked(JWTUtil.verify).mockReturnValue({
        valid: false,
        error: 'Token expired',
      });

      await expect(authMiddleware(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle token without Bearer prefix', async () => {
      ctx.headers = { authorization: 'token-without-bearer' };

      await expect(authMiddleware(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuthMiddleware', () => {
    it('should pass with valid token', async () => {
      ctx.headers = { authorization: 'Bearer valid-token' };
      vi.mocked(JWTUtil.verify).mockReturnValue({
        valid: true,
        payload: {
          userId: 1,
          username: 'testuser',
          role: UserRole.USER,
        },
      });

      await optionalAuthMiddleware(ctx as Context, next);

      expect(next).toHaveBeenCalled();
      expect(ctx.state?.user).toBeDefined();
      expect(ctx.state?.userId).toBe(1);
    });

    it('should pass without token', async () => {
      await optionalAuthMiddleware(ctx as Context, next);

      expect(next).toHaveBeenCalled();
      expect(ctx.state?.user).toBeUndefined();
    });

    it('should pass with invalid token (not throw)', async () => {
      ctx.headers = { authorization: 'Bearer invalid-token' };
      vi.mocked(JWTUtil.verify).mockReturnValue({
        valid: false,
        error: 'Invalid token',
      });

      await optionalAuthMiddleware(ctx as Context, next);

      expect(next).toHaveBeenCalled();
      expect(ctx.state?.user).toBeUndefined();
    });
  });

  describe('requirePermissions', () => {
    beforeEach(() => {
      ctx.state = {
        user: { userId: 1, username: 'testuser', role: UserRole.USER },
        userId: 1,
        userRole: UserRole.USER,
      };
    });

    it('should pass when user has required permission', async () => {
      const middleware = requirePermissions(Permission.CONFIG_READ);
      await middleware(ctx as Context, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject when user lacks required permission', async () => {
      const middleware = requirePermissions(Permission.USER_DELETE);

      await expect(middleware(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should pass when user has any of required permissions', async () => {
      const middleware = requirePermissions([Permission.CONFIG_READ, Permission.USER_DELETE], false);
      await middleware(ctx as Context, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject when user has none of required permissions', async () => {
      const middleware = requirePermissions([Permission.USER_DELETE, Permission.SYSTEM_MANAGE], false);

      await expect(middleware(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should pass when user has all required permissions (requireAll=true)', async () => {
      ctx.state!.userRole = UserRole.ADMIN;
      const middleware = requirePermissions([Permission.CONFIG_READ, Permission.CONFIG_WRITE], true);

      await middleware(ctx as Context, next);
      expect(next).toHaveBeenCalled();
    });

    it('should reject when user missing one of required permissions (requireAll=true)', async () => {
      const middleware = requirePermissions([Permission.CONFIG_READ, Permission.USER_DELETE], true);

      await expect(middleware(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject when user not authenticated', async () => {
      ctx.state = {};
      const middleware = requirePermissions(Permission.CONFIG_READ);

      await expect(middleware(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireRoles', () => {
    beforeEach(() => {
      ctx.state = {
        user: { userId: 1, username: 'testuser', role: UserRole.USER },
        userId: 1,
        userRole: UserRole.USER,
      };
    });

    it('should pass when user has required role', async () => {
      const middleware = requireRoles(UserRole.USER);
      await middleware(ctx as Context, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject when user lacks required role', async () => {
      const middleware = requireRoles(UserRole.ADMIN);

      await expect(middleware(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should pass when user has one of allowed roles', async () => {
      const middleware = requireRoles([UserRole.USER, UserRole.ADMIN]);
      await middleware(ctx as Context, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject when user has none of allowed roles', async () => {
      ctx.state!.userRole = UserRole.GUEST;
      const middleware = requireRoles([UserRole.USER, UserRole.ADMIN]);

      await expect(middleware(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject when user not authenticated', async () => {
      ctx.state = {};
      const middleware = requireRoles(UserRole.USER);

      await expect(middleware(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should pass for admin user', async () => {
      ctx.state = {
        user: { userId: 1, username: 'admin', role: UserRole.ADMIN },
        userId: 1,
        userRole: UserRole.ADMIN,
      };

      await requireAdmin(ctx as Context, next);
      expect(next).toHaveBeenCalled();
    });

    it('should reject for non-admin user', async () => {
      ctx.state = {
        user: { userId: 1, username: 'user', role: UserRole.USER },
        userId: 1,
        userRole: UserRole.USER,
      };

      await expect(requireAdmin(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject for guest user', async () => {
      ctx.state = {
        user: { userId: 1, username: 'guest', role: UserRole.GUEST },
        userId: 1,
        userRole: UserRole.GUEST,
      };

      await expect(requireAdmin(ctx as Context, next)).rejects.toThrow(AppError);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Integration: Multiple Middleware', () => {
    it('should chain auth and permission middleware', async () => {
      ctx.headers = { authorization: 'Bearer valid-token' };
      vi.mocked(JWTUtil.verify).mockReturnValue({
        valid: true,
        payload: {
          userId: 1,
          username: 'testuser',
          role: UserRole.USER,
        },
      });

      // 先通过认证
      await authMiddleware(ctx as Context, async () => {
        // 然后检查权限
        const permMiddleware = requirePermissions(Permission.CONFIG_READ);
        await permMiddleware(ctx as Context, next);
      });

      expect(next).toHaveBeenCalled();
    });

    it('should chain auth and role middleware', async () => {
      ctx.headers = { authorization: 'Bearer admin-token' };
      vi.mocked(JWTUtil.verify).mockReturnValue({
        valid: true,
        payload: {
          userId: 1,
          username: 'admin',
          role: UserRole.ADMIN,
        },
      });

      // 先通过认证
      await authMiddleware(ctx as Context, async () => {
        // 然后检查角色
        await requireAdmin(ctx as Context, next);
      });

      expect(next).toHaveBeenCalled();
    });
  });
});
