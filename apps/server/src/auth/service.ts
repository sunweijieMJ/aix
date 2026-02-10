/**
 * 认证服务
 */
import { createLogger } from '../utils/logger';
import { JWTUtil } from './jwt';
import { PasswordUtil } from './password';
import { AppError, ErrorCode } from '../utils/errors';
import type { IUser, ILoginRequest, ILoginResponse, IRegisterRequest } from './types';
import { UserRole } from './types';
import { getPostgresAdapter } from '../database';

const logger = createLogger('AUTH_SERVICE');

/**
 * 认证服务类
 */
export class AuthService {
  /**
   * 用户登录
   */
  async login(credentials: ILoginRequest): Promise<ILoginResponse> {
    try {
      // 查询用户
      const pgAdapter = getPostgresAdapter();
      const userRecord = await pgAdapter.getUserByUsername(credentials.username);

      if (!userRecord) {
        throw new AppError('Invalid username or password', ErrorCode.INVALID_INPUT, 400);
      }

      // 验证密码
      const isValid = await PasswordUtil.verify(credentials.password, userRecord.passwordHash || '');
      if (!isValid) {
        throw new AppError('Invalid username or password', ErrorCode.INVALID_INPUT, 400);
      }

      // 生成 JWT token
      const token = JWTUtil.sign({
        userId: userRecord.id,
        username: userRecord.username,
        role: userRecord.role,
      });

      // 移除密码字段
      const { passwordHash: _passwordHash, ...user } = userRecord;

      logger.info(`User logged in: ${user.username}`);

      return {
        token,
        user,
        expiresIn: JWTUtil.getExpiresIn(),
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Login failed', error);
      throw new AppError('Login failed', ErrorCode.INTERNAL_ERROR, 500);
    }
  }

  /**
   * 用户注册
   */
  async register(data: IRegisterRequest): Promise<IUser> {
    try {
      // 验证密码强度
      const passwordCheck = PasswordUtil.validateStrength(data.password);
      if (!passwordCheck.valid) {
        throw new AppError(passwordCheck.message || 'Weak password', ErrorCode.INVALID_INPUT, 400);
      }

      // 检查用户名是否已存在
      const pgAdapter = getPostgresAdapter();
      const existingUser = await pgAdapter.getUserByUsername(data.username);
      if (existingUser) {
        throw new AppError('Username already exists', ErrorCode.DUPLICATE_ERROR, 400);
      }

      // 检查邮箱是否已存在
      const existingEmail = await pgAdapter.getUserByEmail(data.email);
      if (existingEmail) {
        throw new AppError('Email already exists', ErrorCode.DUPLICATE_ERROR, 400);
      }

      // 加密密码
      const passwordHash = await PasswordUtil.hash(data.password);

      // 创建用户
      const userRecord = await pgAdapter.createUser({
        username: data.username,
        name: data.name,
        email: data.email,
        passwordHash,
        role: (data.role || UserRole.USER) as string,
      });

      // 移除密码字段
      const { passwordHash: _passwordHash2, ...user } = userRecord;

      logger.info(`User registered: ${user.username}`);

      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Registration failed', error);
      throw new AppError('Registration failed', ErrorCode.INTERNAL_ERROR, 500);
    }
  }

  /**
   * 刷新 token
   */
  async refreshToken(oldToken: string): Promise<{ token: string; expiresIn: number }> {
    try {
      const newToken = JWTUtil.refresh(oldToken);
      if (!newToken) {
        throw new AppError('Invalid or expired token', ErrorCode.UNAUTHORIZED, 401);
      }

      logger.debug('Token refreshed');

      return {
        token: newToken,
        expiresIn: JWTUtil.getExpiresIn(),
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Token refresh failed', error);
      throw new AppError('Token refresh failed', ErrorCode.INTERNAL_ERROR, 500);
    }
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(userId: number): Promise<IUser> {
    try {
      const pgAdapter = getPostgresAdapter();
      const userRecord = await pgAdapter.getUserById(userId);

      if (!userRecord) {
        throw new AppError('User not found', ErrorCode.NOT_FOUND, 404);
      }

      // 移除密码字段
      const { passwordHash: _passwordHash3, ...user } = userRecord;

      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Failed to get user info', error);
      throw new AppError('Failed to get user info', ErrorCode.INTERNAL_ERROR, 500);
    }
  }
}
