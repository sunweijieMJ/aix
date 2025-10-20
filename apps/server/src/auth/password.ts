/**
 * 密码加密和验证工具
 */
import bcrypt from 'bcrypt';
import { createLogger } from '../utils/logger';

const logger = createLogger('PASSWORD');

// 加密轮次
const SALT_ROUNDS = 10;

/**
 * 密码工具类
 */
export class PasswordUtil {
  /**
   * 加密密码
   */
  static async hash(password: string): Promise<string> {
    try {
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      logger.debug('Password hashed successfully');
      return hash;
    } catch (error) {
      logger.error('Failed to hash password', error);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * 验证密码
   */
  static async verify(password: string, hash: string): Promise<boolean> {
    try {
      const isValid = await bcrypt.compare(password, hash);
      logger.debug(`Password verification: ${isValid ? 'success' : 'failed'}`);
      return isValid;
    } catch (error) {
      logger.error('Failed to verify password', error);
      return false;
    }
  }

  /**
   * 验证密码强度
   */
  static validateStrength(password: string): { valid: boolean; message?: string } {
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters' };
    }

    if (password.length > 128) {
      return { valid: false, message: 'Password must be less than 128 characters' };
    }

    // 至少包含一个数字
    if (!/\d/.test(password)) {
      return { valid: false, message: 'Password must contain at least one number' };
    }

    // 至少包含一个大写字母
    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }

    // 至少包含一个小写字母
    if (!/[a-z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }

    return { valid: true };
  }
}
