/**
 * MCP Server 配置管理
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BYTES_PER_MB,
  DEFAULT_CACHE_TTL,
  DEFAULT_EXTRACTION_TIMEOUT,
  DEFAULT_IGNORE_PATTERNS,
  DEFAULT_MAX_CACHE_SIZE,
  DEFAULT_MAX_CONCURRENT_EXTRACTION,
  SERVER_NAME,
  SERVER_VERSION,
} from '../constants';
import { log } from '../utils/logger';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

/**
 * 是否为生产环境
 */
export const IS_PRODUCTION = isProduction;
const projectRoot = resolve(__dirname, '../../..');

/**
 * 服务器配置接口
 */
export interface ServerConfig {
  // 数据相关
  dataDir: string;
  cacheDir: string;
  packagesDir: string;

  // 缓存配置
  cacheTTL: number;
  enableCache: boolean;
  maxCacheSize: number; // MB

  // 性能配置
  maxConcurrentExtraction: number;
  extractionTimeout: number; // ms

  // 服务器配置
  serverName: string;
  serverVersion: string;
  verbose: boolean;

  // 功能开关
  features: {
    enablePrompts: boolean;
    enableExamples: boolean;
    enableChangelog: boolean;
    enableDependencyAnalysis: boolean;
  };

  // 忽略列表
  ignorePackages: string[];
  ignorePatterns: string[];
}

/**
 * 获取适合当前环境的路径
 */
function getEnvironmentPaths() {
  const mcpServerDir = resolve(__dirname, '../..');

  // 开发环境
  if (!isProduction) {
    return {
      dataDir: join(mcpServerDir, 'data'),
      cacheDir: join(mcpServerDir, 'data/.cache'),
      packagesDir: join(projectRoot, '../packages'),
    };
  }

  // 生产环境
  return {
    dataDir: join(mcpServerDir, 'data'),
    cacheDir: join(mcpServerDir, 'data/.cache'),
    packagesDir: join(__dirname, '../../../../packages'),
  };
}

const environmentPaths = getEnvironmentPaths();

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: ServerConfig = {
  // 数据相关
  dataDir: environmentPaths.dataDir,
  cacheDir: environmentPaths.cacheDir,
  packagesDir: environmentPaths.packagesDir,

  // 缓存配置
  cacheTTL: DEFAULT_CACHE_TTL,
  enableCache: true,
  maxCacheSize: DEFAULT_MAX_CACHE_SIZE / BYTES_PER_MB, // Convert bytes to MB

  // 性能配置
  maxConcurrentExtraction: DEFAULT_MAX_CONCURRENT_EXTRACTION,
  extractionTimeout: DEFAULT_EXTRACTION_TIMEOUT,

  // 服务器配置
  serverName: SERVER_NAME,
  serverVersion: SERVER_VERSION,
  verbose: false,

  // 功能开关
  features: {
    enablePrompts: true,
    enableExamples: true,
    enableChangelog: true,
    enableDependencyAnalysis: true,
  },

  // 忽略列表
  ignorePackages: [],
  ignorePatterns: [...DEFAULT_IGNORE_PATTERNS],
};

/**
 * 配置管理器
 */
export class ConfigManager {
  private config: ServerConfig;

  constructor(customConfig?: Partial<ServerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...customConfig };

    // 如果 dataDir 被自定义，确保 cacheDir 也相应更新
    if (customConfig?.dataDir && !customConfig?.cacheDir) {
      this.config.cacheDir = join(customConfig.dataDir, '.cache');
    }
  }

  /**
   * 从文件加载配置
   */
  async loadFromFile(configPath: string): Promise<void> {
    try {
      const content = await readFile(configPath, 'utf8');
      const fileConfig = JSON.parse(content) as Partial<ServerConfig>;
      this.config = { ...this.config, ...fileConfig };
    } catch (error) {
      log.warn(`无法加载配置文件 ${configPath}:`, error);
    }
  }

  /**
   * 获取配置
   */
  get<K extends keyof ServerConfig>(key: K): ServerConfig[K] {
    return this.config[key];
  }

  /**
   * 设置配置
   */
  set<K extends keyof ServerConfig>(key: K, value: ServerConfig[K]): void {
    this.config[key] = value;
  }

  /**
   * 获取完整配置
   */
  getAll(): ServerConfig {
    return { ...this.config };
  }

  /**
   * 合并配置
   */
  merge(partialConfig: Partial<ServerConfig>): void {
    this.config = { ...this.config, ...partialConfig };
  }

  /**
   * 验证配置
   */
  async validate(): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 必需字段验证
    if (!this.config.dataDir) {
      errors.push('dataDir 不能为空');
    }
    if (!this.config.packagesDir) {
      errors.push('packagesDir 不能为空');
    }
    if (!this.config.cacheDir) {
      errors.push('cacheDir 不能为空');
    }

    // 数值范围验证
    if (this.config.cacheTTL < 0) {
      errors.push('cacheTTL 必须大于等于 0');
    }
    if (this.config.maxCacheSize < 0) {
      errors.push('maxCacheSize 必须大于等于 0');
    }
    if (this.config.maxConcurrentExtraction < 1) {
      errors.push('maxConcurrentExtraction 必须大于 0');
    }
    if (this.config.extractionTimeout < 1000) {
      errors.push('extractionTimeout 必须大于等于 1000ms');
    }

    // 数值合理性警告
    if (this.config.maxCacheSize > 500) {
      warnings.push(
        `maxCacheSize 设置过大 (${this.config.maxCacheSize}MB)，建议不超过 500MB`,
      );
    }
    if (this.config.cacheTTL > 24 * 60 * 60 * 1000) {
      warnings.push(
        `cacheTTL 设置过长 (${this.config.cacheTTL}ms)，建议不超过 24 小时`,
      );
    }
    if (this.config.maxConcurrentExtraction > 10) {
      warnings.push(
        `maxConcurrentExtraction 设置过大 (${this.config.maxConcurrentExtraction})，可能导致性能问题`,
      );
    }

    // 路径存在性验证
    if (this.config.dataDir || this.config.packagesDir) {
      try {
        const { existsSync } = await import('node:fs');

        // 检查 packagesDir
        if (this.config.packagesDir && !existsSync(this.config.packagesDir)) {
          errors.push(`packagesDir 不存在: ${this.config.packagesDir}`);
        }

        // 检查 dataDir（如果不存在会自动创建，所以只警告）
        if (this.config.dataDir && !existsSync(this.config.dataDir)) {
          warnings.push(`dataDir 不存在，将自动创建: ${this.config.dataDir}`);
        }
      } catch {
        warnings.push('无法验证路径存在性');
      }
    }

    // 权限验证
    try {
      const { access, constants } = await import('node:fs/promises');
      const { existsSync } = await import('node:fs');

      if (this.config.dataDir && existsSync(this.config.dataDir)) {
        try {
          await access(this.config.dataDir, constants.W_OK);
        } catch {
          errors.push(`dataDir 没有写入权限: ${this.config.dataDir}`);
        }
      }

      if (this.config.packagesDir && existsSync(this.config.packagesDir)) {
        try {
          await access(this.config.packagesDir, constants.R_OK);
        } catch {
          errors.push(`packagesDir 没有读取权限: ${this.config.packagesDir}`);
        }
      }
    } catch {
      warnings.push('无法验证文件系统权限');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

/**
 * 创建配置管理器实例
 */
export function createConfigManager(
  customConfig?: Partial<ServerConfig>,
): ConfigManager {
  return new ConfigManager(customConfig);
}

/**
 * 环境变量配置映射
 */
export function getConfigFromEnv(): Partial<ServerConfig> {
  const config: Partial<ServerConfig> = {};

  if (process.env.MCP_DATA_DIR) {
    config.dataDir = process.env.MCP_DATA_DIR;
  }

  if (process.env.MCP_CACHE_DIR) {
    config.cacheDir = process.env.MCP_CACHE_DIR;
  }

  if (process.env.MCP_PACKAGES_DIR) {
    config.packagesDir = process.env.MCP_PACKAGES_DIR;
  }

  if (process.env.MCP_CACHE_TTL) {
    config.cacheTTL = parseInt(process.env.MCP_CACHE_TTL, 10);
  }

  if (process.env.MCP_VERBOSE === 'true') {
    config.verbose = true;
  }

  return config;
}
