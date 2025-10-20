/**
 * 缓存模块类型定义
 */

/**
 * 缓存类型
 */
export type CacheType = 'memory' | 'redis';

/**
 * 缓存配置接口
 */
export interface ICacheConfig {
  /** 缓存类型 */
  type: CacheType;
  /** 默认TTL（秒） */
  defaultTtl: number;
  /** 检查周期（秒） - 仅用于内存缓存 */
  checkPeriod?: number;
  /** Redis配置 */
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
}

/**
 * 缓存操作接口
 */
export interface ICacheManager {
  /**
   * 设置缓存
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl TTL（秒）
   */
  set<T>(key: string, value: T, ttl?: number): Promise<boolean>;

  /**
   * 获取缓存
   * @param key 缓存键
   */
  get<T>(key: string): Promise<T | undefined>;

  /**
   * 删除缓存
   * @param key 缓存键
   */
  del(key: string): Promise<boolean>;

  /**
   * 检查缓存是否存在
   * @param key 缓存键
   */
  has(key: string): Promise<boolean>;

  /**
   * 清空所有缓存
   */
  clear(): Promise<void>;

  /**
   * 获取缓存统计信息
   */
  getStats(): Promise<ICacheStats>;

  /**
   * 关闭缓存连接
   */
  close(): Promise<void>;

  /**
   * 批量设置缓存
   */
  mset?(data: Array<{ key: string; value: any; ttl?: number }>): Promise<boolean>;

  /**
   * 批量获取缓存
   */
  mget?<T>(keys: string[]): Promise<Record<string, T | undefined>>;

  /**
   * 批量删除缓存
   */
  mdel?(keys: string[]): Promise<number>;

  /**
   * 获取匹配模式的所有键
   * @param pattern 匹配模式（支持通配符 * 和 ?）
   * @returns 匹配的键数组
   */
  keys?(pattern: string): Promise<string[]>;
}

/**
 * 缓存统计信息
 */
export interface ICacheStats {
  keys: number;
  hits: number;
  misses: number;
  hitRate: number;
  size?: number;
  info?: Record<string, any>;
}
