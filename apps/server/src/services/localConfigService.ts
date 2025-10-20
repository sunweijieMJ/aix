import { ICreateLocalConfigParams, ILocalConfig, IUpdateLocalConfigParams } from '../types';
import { DataTransformer } from '../utils/dataTransformer';
import { NotFoundError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { getPostgresAdapter } from '../database';
import { getCacheManager } from '../cache';

/**
 * 本地配置服务接口
 */
export interface IConfigService {
  /**
   * 获取所有JSON配置
   * @returns 所有配置项列表
   */
  getAll(): Promise<ILocalConfig[]>;

  /**
   * 根据路径获取配置
   * @param path 配置路径
   * @returns 配置项或null
   */
  getByPath(path: string): Promise<ILocalConfig | null>;

  /**
   * 创建或更新配置
   * @param path 配置路径
   * @param value 配置值
   * @returns 创建或更新后的配置项
   */
  upsert(path: string, value: any): Promise<ILocalConfig>;

  /**
   * 创建配置
   * @param params 创建参数
   * @returns 创建的配置项
   */
  create(params: ICreateLocalConfigParams): Promise<ILocalConfig>;

  /**
   * 更新配置
   * @param path 配置路径
   * @param params 更新参数
   * @returns 更新后的配置项或null
   */
  update(path: string, params: IUpdateLocalConfigParams): Promise<ILocalConfig | null>;

  /**
   * 删除配置
   * @param path 配置路径
   * @returns 是否删除成功
   */
  delete(path: string): Promise<boolean>;

  /**
   * 批量删除配置
   * @param paths 配置路径列表
   * @returns 删除的配置数量
   */
  deleteBatch(paths: string[]): Promise<number>;

  /**
   * 清空所有配置
   * @returns 删除的配置数量
   */
  clear(): Promise<number>;
}

/**
 * JSON配置服务类
 * 提供基于路径的配置管理功能
 * 使用PostgreSQL数据库存储
 */
export class ConfigService implements IConfigService {
  private readonly logger = createLogger('CONFIG_SERVICE');
  private readonly cacheKeyPrefix = 'config:';
  private readonly cacheTTL = 300; // 5分钟缓存

  /**
   * 获取PostgreSQL适配器
   */
  private get pgAdapter() {
    return getPostgresAdapter();
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(path: string): string {
    return `${this.cacheKeyPrefix}${path}`;
  }

  /**
   * 清除指定配置的缓存
   */
  private async clearCache(path: string): Promise<void> {
    const cacheManager = await getCacheManager();
    await cacheManager.del(this.getCacheKey(path));
    // 同时清除全部配置列表的缓存
    await cacheManager.del(`${this.cacheKeyPrefix}all`);
  }

  /**
   * 获取所有JSON配置
   * @returns 所有配置项列表
   */
  async getAll(): Promise<ILocalConfig[]> {
    try {
      const cacheManager = await getCacheManager();
      const cacheKey = `${this.cacheKeyPrefix}all`;

      // 尝试从缓存获取
      const cachedConfigs = await cacheManager.get<ILocalConfig[]>(cacheKey);
      if (cachedConfigs) {
        this.logger.debug(`从缓存获取所有配置 (${cachedConfigs.length}个)`);
        return cachedConfigs;
      }

      // 缓存未命中，从数据库查询
      const configs = await this.pgAdapter.getAllLocalConfigs();
      const parsedConfigs = configs.map(config => this.parseConfigValue(config));

      // 存入缓存
      await cacheManager.set(cacheKey, parsedConfigs, this.cacheTTL);
      this.logger.info(`获取到${configs.length}个配置项并缓存`);

      return parsedConfigs;
    } catch (error) {
      this.logger.error('获取所有配置失败:', error);
      throw error;
    }
  }

  /**
   * 根据路径获取配置
   * @param path 配置路径
   * @returns 配置项或null
   */
  async getByPath(path: string): Promise<ILocalConfig | null> {
    try {
      const cacheManager = await getCacheManager();
      const cacheKey = this.getCacheKey(path);

      // 尝试从缓存获取
      const cachedConfig = await cacheManager.get<ILocalConfig>(cacheKey);
      if (cachedConfig) {
        this.logger.debug(`从缓存获取配置: ${path}`);
        return cachedConfig;
      }

      // 缓存未命中，从数据库查询
      const config = await this.pgAdapter.getLocalConfigByPath(path);
      if (!config) {
        return null;
      }

      const parsedConfig = this.parseConfigValue(config);

      // 存入缓存
      await cacheManager.set(cacheKey, parsedConfig, this.cacheTTL);
      this.logger.debug(`获取配置并缓存: ${path}`);

      return parsedConfig;
    } catch (error) {
      this.logger.error(`获取配置 ${path} 失败:`, error);
      throw error;
    }
  }

  /**
   * 创建或更新配置
   * @param path 配置路径
   * @param value 配置值
   * @returns 创建或更新后的配置项
   */
  async upsert(path: string, value: any): Promise<ILocalConfig> {
    try {
      // 检查是否已存在
      const existingConfig = await this.pgAdapter.getLocalConfigByPath(path);

      let config: ILocalConfig | null;
      const stringifiedValue = DataTransformer.stringifyJsonField(value);

      if (existingConfig) {
        // 更新现有配置
        config = await this.pgAdapter.updateLocalConfig(existingConfig.id, {
          value: stringifiedValue,
        });
        if (!config) {
          throw new Error(`更新配置 ${path} 失败`);
        }
        this.logger.info(`更新配置 ${path}`);
      } else {
        // 创建新配置
        config = await this.pgAdapter.createLocalConfig({
          path,
          value: stringifiedValue,
        });
        this.logger.info(`创建配置 ${path}`);
      }

      // 清除缓存
      await this.clearCache(path);

      return this.parseConfigValue(config);
    } catch (error) {
      this.logger.error(`更新或创建配置 ${path} 失败:`, error);
      throw error;
    }
  }

  /**
   * 创建配置
   * @param params 创建参数
   * @returns 创建的配置项
   */
  async create(params: ICreateLocalConfigParams): Promise<ILocalConfig> {
    return this.upsert(params.path, params.value);
  }

  /**
   * 更新配置
   * @param path 配置路径
   * @param params 更新参数
   * @returns 更新后的配置项或null
   */
  async update(path: string, params: IUpdateLocalConfigParams): Promise<ILocalConfig | null> {
    const config = await this.getByPath(path);
    if (!config) {
      throw new NotFoundError(`配置 ${path} 不存在`);
    }

    return this.upsert(path, params.value);
  }

  /**
   * 删除配置
   * @param path 配置路径
   * @returns 是否删除成功
   */
  async delete(path: string): Promise<boolean> {
    try {
      const config = await this.pgAdapter.getLocalConfigByPath(path);
      if (!config) {
        this.logger.warn(`尝试删除不存在的配置 ${path}`);
        return false;
      }

      const deleted = await this.pgAdapter.deleteLocalConfig(config.id);
      if (deleted) {
        // 清除缓存
        await this.clearCache(path);
        this.logger.info(`删除配置 ${path}`);
      }
      return deleted;
    } catch (error) {
      this.logger.error(`删除配置 ${path} 失败:`, error);
      throw error;
    }
  }

  /**
   * 批量删除配置
   * @param paths 配置路径列表
   * @returns 删除的配置数量
   */
  async deleteBatch(paths: string[]): Promise<number> {
    try {
      if (paths.length === 0) {
        return 0;
      }

      // 使用单次SQL批量删除，避免N+1问题
      const deletedCount = await this.pgAdapter.deleteLocalConfigsByPaths(paths);

      // 批量清除缓存
      const cacheManager = await getCacheManager();
      for (const path of paths) {
        await cacheManager.del(this.getCacheKey(path));
      }
      await cacheManager.del(`${this.cacheKeyPrefix}all`);

      this.logger.info(`批量删除了 ${deletedCount} 个配置`);
      return deletedCount;
    } catch (error) {
      this.logger.error(`批量删除配置失败:`, error);
      throw error;
    }
  }

  /**
   * 清空所有配置
   * @returns 删除的配置数量
   */
  async clear(): Promise<number> {
    try {
      // 使用单次SQL清空所有配置，避免N+1问题
      const deletedCount = await this.pgAdapter.clearAllLocalConfigs();

      // 清除所有配置相关缓存
      const cacheManager = await getCacheManager();
      await cacheManager.del(`${this.cacheKeyPrefix}all`);
      // 注意: 这里无法精确清除每个path的缓存，但由于是清空操作，影响有限
      // 如果使用Redis，可以通过pattern删除所有config:*的键

      this.logger.info(`清空了 ${deletedCount} 个配置`);
      return deletedCount;
    } catch (error) {
      this.logger.error('清空所有配置失败:', error);
      throw error;
    }
  }

  /**
   * 解析配置值
   * @param config 配置对象
   * @returns 解析后的配置对象
   */
  private parseConfigValue(config: ILocalConfig): ILocalConfig {
    return {
      ...config,
      value: DataTransformer.parseJsonField(config.value),
    };
  }
}
