/**
 * 配置文件监听和热更新
 */
import { watch, FSWatcher } from 'chokidar';
import { createLogger } from './logger';
import { getCacheManager } from '../cache';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';

const logger = createLogger('CONFIG_WATCHER');

/**
 * 配置变更事件类型
 */
export enum ConfigChangeEvent {
  ADDED = 'config:added',
  CHANGED = 'config:changed',
  DELETED = 'config:deleted',
}

/**
 * 配置变更数据
 */
export interface IConfigChange {
  event: ConfigChangeEvent;
  path: string;
  timestamp: Date;
  data?: any;
}

/**
 * 配置监听选项
 */
export interface IConfigWatcherOptions {
  /** 监听的目录或文件 */
  paths: string[];
  /** 是否启用热更新 */
  enabled?: boolean;
  /** 忽略的文件模式 */
  ignored?: string | RegExp | Array<string | RegExp>;
  /** 防抖延迟（毫秒） */
  debounceDelay?: number;
}

/**
 * 配置文件监听器
 */
export class ConfigWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private options: IConfigWatcherOptions;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(options: IConfigWatcherOptions) {
    super();
    this.options = {
      enabled: true,
      ignored: /(^|[/\\])\../, // 忽略隐藏文件
      debounceDelay: 1000, // 默认1秒防抖
      ...options,
    };
  }

  /**
   * 启动配置监听
   */
  async start(): Promise<void> {
    if (!this.options.enabled) {
      logger.info('Config watcher is disabled');
      return;
    }

    if (this.watcher) {
      logger.warn('Config watcher is already running');
      return;
    }

    try {
      this.watcher = watch(this.options.paths, {
        ignored: this.options.ignored,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100,
        },
      });

      this.watcher
        .on('add', filePath => this.handleFileChange(ConfigChangeEvent.ADDED, filePath))
        .on('change', filePath => this.handleFileChange(ConfigChangeEvent.CHANGED, filePath))
        .on('unlink', filePath => this.handleFileChange(ConfigChangeEvent.DELETED, filePath))
        .on('error', error => logger.error('Config watcher error:', error));

      logger.info(`Config watcher started for paths: ${this.options.paths.join(', ')}`);
    } catch (error) {
      logger.error('Failed to start config watcher:', error);
      throw error;
    }
  }

  /**
   * 停止配置监听
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.debounceTimers.clear();
      logger.info('Config watcher stopped');
    }
  }

  /**
   * 处理文件变更
   */
  private handleFileChange(event: ConfigChangeEvent, filePath: string): void {
    // 防抖处理
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      try {
        logger.info(`Config file ${event}: ${filePath}`);

        const change: IConfigChange = {
          event,
          path: filePath,
          timestamp: new Date(),
        };

        // 如果是添加或修改，读取文件内容
        if (event !== ConfigChangeEvent.DELETED) {
          change.data = await this.readConfigFile(filePath);
        }

        // 清除相关缓存
        await this.clearRelatedCache(filePath);

        // 触发事件
        this.emit(event, change);
        this.emit('change', change);

        logger.debug(`Config change processed: ${filePath}`);
      } catch (error) {
        logger.error(`Failed to handle config change for ${filePath}:`, error);
      } finally {
        this.debounceTimers.delete(filePath);
      }
    }, this.options.debounceDelay);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * 读取配置文件
   */
  private async readConfigFile(filePath: string): Promise<any> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const content = await fs.readFile(filePath, 'utf-8');

      if (ext === '.json') {
        return JSON.parse(content);
      } else if (ext === '.js' || ext === '.ts') {
        // 对于 JS/TS 文件，使用动态 import
        // 添加时间戳以绕过缓存
        const fileUrl = new URL(`file://${filePath}?t=${Date.now()}`);
        const module = await import(fileUrl.href);
        return module.default || module;
      } else {
        return content;
      }
    } catch (error) {
      logger.error(`Failed to read config file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 清除相关缓存
   */
  private async clearRelatedCache(filePath: string): Promise<void> {
    try {
      const cacheManager = await getCacheManager();

      // 清除所有配置相关的缓存
      // 这里简化处理，实际应用中可以更精确地清除特定缓存
      const fileName = path.basename(filePath, path.extname(filePath));
      const cacheKey = `config:${fileName}`;

      await cacheManager.del(cacheKey);
      logger.debug(`Cache cleared for: ${cacheKey}`);
    } catch (error) {
      logger.error('Failed to clear related cache:', error);
    }
  }

  /**
   * 手动触发重新加载
   */
  async reload(filePath: string): Promise<void> {
    try {
      logger.info(`Manually reloading config: ${filePath}`);
      const data = await this.readConfigFile(filePath);
      await this.clearRelatedCache(filePath);

      const change: IConfigChange = {
        event: ConfigChangeEvent.CHANGED,
        path: filePath,
        timestamp: new Date(),
        data,
      };

      this.emit('reload', change);
      this.emit('change', change);
    } catch (error) {
      logger.error(`Failed to reload config ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * 获取监听状态
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }

  /**
   * 获取监听的路径
   */
  getWatchedPaths(): string[] {
    return this.options.paths;
  }
}

/**
 * 配置热更新管理器
 */
export class ConfigHotReloadManager {
  private watchers: Map<string, ConfigWatcher> = new Map();
  private reloadHandlers: Map<string, Array<(change: IConfigChange) => void>> = new Map();

  /**
   * 注册配置监听
   */
  async registerWatcher(name: string, options: IConfigWatcherOptions): Promise<ConfigWatcher> {
    if (this.watchers.has(name)) {
      logger.warn(`Watcher ${name} is already registered`);
      return this.watchers.get(name)!;
    }

    const watcher = new ConfigWatcher(options);

    // 监听所有变更事件
    watcher.on('change', (change: IConfigChange) => {
      this.handleConfigChange(name, change);
    });

    await watcher.start();
    this.watchers.set(name, watcher);

    logger.info(`Config watcher registered: ${name}`);
    return watcher;
  }

  /**
   * 取消注册配置监听
   */
  async unregisterWatcher(name: string): Promise<void> {
    const watcher = this.watchers.get(name);
    if (watcher) {
      await watcher.stop();
      this.watchers.delete(name);
      this.reloadHandlers.delete(name);
      logger.info(`Config watcher unregistered: ${name}`);
    }
  }

  /**
   * 注册重载处理函数
   */
  onReload(watcherName: string, handler: (change: IConfigChange) => void): void {
    if (!this.reloadHandlers.has(watcherName)) {
      this.reloadHandlers.set(watcherName, []);
    }
    this.reloadHandlers.get(watcherName)!.push(handler);
  }

  /**
   * 处理配置变更
   */
  private handleConfigChange(watcherName: string, change: IConfigChange): void {
    const handlers = this.reloadHandlers.get(watcherName) || [];

    handlers.forEach(handler => {
      try {
        handler(change);
      } catch (error) {
        logger.error(`Error in reload handler for ${watcherName}:`, error);
      }
    });
  }

  /**
   * 获取所有监听器
   */
  getWatchers(): Map<string, ConfigWatcher> {
    return this.watchers;
  }

  /**
   * 停止所有监听器
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.watchers.values()).map(watcher => watcher.stop());
    await Promise.all(stopPromises);
    this.watchers.clear();
    this.reloadHandlers.clear();
    logger.info('All config watchers stopped');
  }
}

// 创建全局配置热更新管理器
export const configHotReloadManager = new ConfigHotReloadManager();

/**
 * 初始化配置热更新
 */
export async function initConfigHotReload(): Promise<void> {
  try {
    const configDir = path.join(process.cwd(), 'config');

    // 注册配置目录监听
    await configHotReloadManager.registerWatcher('app-config', {
      paths: [configDir],
      enabled: process.env.NODE_ENV !== 'test',
    });

    // 注册重载处理器
    configHotReloadManager.onReload('app-config', change => {
      logger.info(`Configuration reloaded: ${change.path}`, {
        event: change.event,
        timestamp: change.timestamp.toISOString(),
      });
    });

    logger.info('Config hot reload initialized');
  } catch (error) {
    logger.error('Failed to initialize config hot reload:', error);
  }
}
