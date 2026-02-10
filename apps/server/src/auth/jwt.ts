/**
 * JWT 工具类
 */
import jwt from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { createLogger } from '../utils/logger';
import { config } from '../config';
import type { IJWTPayload, ITokenVerifyResult } from './types';

const logger = createLogger('JWT');

/**
 * JWT 配置
 */
const JWT_SECRET: string = config.env.JWT_SECRET || 'default-secret-key-change-in-production';
const JWT_EXPIRES_IN: StringValue | number = (config.env.JWT_EXPIRES_IN || '24h') as StringValue;

if (config.env.NODE_ENV === 'production' && JWT_SECRET === 'default-secret-key-change-in-production') {
  logger.warn('⚠️  Using default JWT secret in production! Please set JWT_SECRET environment variable.');
}

/**
 * JWT 工具类
 */
export class JWTUtil {
  /**
   * 生成 JWT Token
   */
  static sign(payload: IJWTPayload): string {
    try {
      const token = jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        issuer: 'base-node-server',
      });
      logger.debug(`JWT token generated for user: ${payload.username}`);
      return token;
    } catch (error) {
      logger.error('Failed to generate JWT token', error);
      throw new Error('Failed to generate token', { cause: error });
    }
  }

  /**
   * 验证 JWT Token
   */
  static verify(token: string): ITokenVerifyResult {
    try {
      const payload = jwt.verify(token, JWT_SECRET, {
        issuer: 'base-node-server',
      }) as IJWTPayload;

      logger.debug(`JWT token verified for user: ${payload.username}`);
      return {
        valid: true,
        payload,
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.warn('JWT token expired');
        return {
          valid: false,
          error: 'Token expired',
        };
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid JWT token');
        return {
          valid: false,
          error: 'Invalid token',
        };
      } else {
        logger.error('JWT verification failed', error);
        return {
          valid: false,
          error: 'Verification failed',
        };
      }
    }
  }

  /**
   * 解码 JWT Token（不验证）
   */
  static decode(token: string): IJWTPayload | null {
    try {
      const payload = jwt.decode(token) as IJWTPayload | null;
      return payload;
    } catch (error) {
      logger.error('Failed to decode JWT token', error);
      return null;
    }
  }

  /**
   * 刷新 JWT Token
   */
  static refresh(token: string): string | null {
    const verifyResult = this.verify(token);
    if (!verifyResult.valid || !verifyResult.payload) {
      return null;
    }

    // 生成新token（移除旧的iat和exp）
    const payload = verifyResult.payload;
    const newPayload: IJWTPayload = {
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
    };
    return this.sign(newPayload);
  }

  /**
   * 获取token过期时间（秒）
   */
  static getExpiresIn(): number {
    // 如果是数字，直接返回（假设单位为秒）
    if (typeof JWT_EXPIRES_IN === 'number') {
      return JWT_EXPIRES_IN;
    }

    // 处理字符串格式
    const timeStr = JWT_EXPIRES_IN;
    const match = timeStr.match(/^(\d+)([smhd])$/);

    if (!match) {
      return 24 * 60 * 60; // 默认24小时
    }

    const value = parseInt(match[1] ?? '0');
    const unit = match[2] ?? 'h';

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        return 24 * 60 * 60;
    }
  }
}
