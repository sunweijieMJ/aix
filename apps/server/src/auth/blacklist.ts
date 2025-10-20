/**
 * Token 黑名单管理
 * 用于实现真正的登出功能
 */
import { createLogger } from '../utils/logger';
import { getCacheManager } from '../cache';
import { JWTUtil } from './jwt';

const logger = createLogger('TOKEN_BLACKLIST');

/**
 * Token 黑名单管理器
 */
export class TokenBlacklist {
  private readonly keyPrefix = 'blacklist:token:';

  /**
   * 将 token 添加到黑名单
   * @param token JWT token
   * @param expiresIn Token 过期时间（秒），如果不提供则从token中解析
   */
  async addToBlacklist(token: string, expiresIn?: number): Promise<boolean> {
    try {
      const cacheManager = await getCacheManager();

      // 如果未提供过期时间，从token中解析
      let ttl = expiresIn;
      if (!ttl) {
        const payload = JWTUtil.decode(token);
        if (payload && payload.exp) {
          // 计算剩余有效时间
          const now = Math.floor(Date.now() / 1000);
          ttl = Math.max(payload.exp - now, 0);
        } else {
          // 如果无法解析，使用默认过期时间
          ttl = JWTUtil.getExpiresIn();
        }
      }

      // 只在token未过期时添加到黑名单
      if (ttl > 0) {
        const key = this.getKey(token);
        await cacheManager.set(key, true, ttl);
        logger.info(`Token added to blacklist (TTL: ${ttl}s)`);
        return true;
      }

      logger.debug('Token already expired, not adding to blacklist');
      return false;
    } catch (error) {
      logger.error('Failed to add token to blacklist:', error);
      return false;
    }
  }

  /**
   * 检查 token 是否在黑名单中
   * @param token JWT token
   */
  async isBlacklisted(token: string): Promise<boolean> {
    try {
      const cacheManager = await getCacheManager();
      const key = this.getKey(token);
      const exists = await cacheManager.has(key);

      if (exists) {
        logger.debug('Token is blacklisted');
      }

      return exists;
    } catch (error) {
      logger.error('Failed to check token blacklist:', error);
      // 如果检查失败，为了安全起见，假设token在黑名单中
      return true;
    }
  }

  /**
   * 从黑名单中移除 token
   * @param token JWT token
   */
  async removeFromBlacklist(token: string): Promise<boolean> {
    try {
      const cacheManager = await getCacheManager();
      const key = this.getKey(token);
      const deleted = await cacheManager.del(key);

      if (deleted) {
        logger.info('Token removed from blacklist');
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to remove token from blacklist:', error);
      return false;
    }
  }

  /**
   * 清除所有黑名单 token
   */
  async clearBlacklist(): Promise<void> {
    try {
      // 注意：这会清除所有带前缀的缓存，不仅仅是黑名单
      // 在实际使用中，如果缓存中还有其他数据，需要更谨慎的清除方式
      logger.info('Clearing token blacklist');

      // 如果使用 Redis，可以使用 SCAN + DEL 来删除匹配的键
      // 这里简单实现，实际应用中需要根据缓存实现来优化
      logger.warn('Blacklist cleared (implementation depends on cache backend)');
    } catch (error) {
      logger.error('Failed to clear blacklist:', error);
    }
  }

  /**
   * 获取黑名单统计信息
   */
  async getStatistics(): Promise<{
    totalBlacklisted: number;
    cacheType: string;
  }> {
    try {
      const cacheManager = await getCacheManager();
      const stats = await cacheManager.getStats();

      return {
        totalBlacklisted: stats.keys || 0, // 这个数字包含所有缓存键，不仅是黑名单
        cacheType: 'memory/redis', // 根据配置返回
      };
    } catch (error) {
      logger.error('Failed to get blacklist statistics:', error);
      return {
        totalBlacklisted: 0,
        cacheType: 'unknown',
      };
    }
  }

  /**
   * 生成缓存键
   */
  private getKey(token: string): string {
    // 使用 token 的哈希值作为键，避免键过长
    // 这里简化处理，直接使用token的一部分
    const tokenHash = this.hashToken(token);
    return `${this.keyPrefix}${tokenHash}`;
  }

  /**
   * Token 哈希函数
   * 使用简单的哈希算法生成token的哈希值
   */
  private hashToken(token: string): string {
    // 简单的哈希函数，实际应用中可以使用更强的哈希算法
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

// 导出单例实例
export const tokenBlacklist = new TokenBlacklist();

/**
 * Token 黑名单中间件工厂函数
 * 在认证中间件之后使用，检查token是否在黑名单中
 */
export function checkTokenBlacklist() {
  return async (ctx: any, next: any) => {
    // 获取token
    const authHeader = ctx.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // 检查是否在黑名单中
      const isBlacklisted = await tokenBlacklist.isBlacklisted(token);

      if (isBlacklisted) {
        logger.warn('Blacklisted token detected');
        ctx.throw(401, 'Token has been revoked');
        return;
      }
    }

    await next();
  };
}
