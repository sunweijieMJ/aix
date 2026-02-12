/**
 * MCP Server 配置管理
 */

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
import { validateServerConfig } from '../utils/validation';

/**
 * 获取 MCP Server 项目根目录
 * 无论代码运行在 src/ 还是 dist/ 目录下都能正确定位
 */
function getMCPServerRoot(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // tsup 构建后输出到 dist/，开发时运行在 src/config/
  const isInBuildDir =
    currentDir.includes('/dist') || currentDir.includes('\\dist');
  return isInBuildDir
    ? resolve(currentDir, '..') // dist/ → mcp-server/
    : resolve(currentDir, '../..'); // src/config/ → mcp-server/
}

const mcpServerRoot = getMCPServerRoot();
// mcp-server/ → internal/ → aix/
const workspaceRoot = resolve(mcpServerRoot, '../..');

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
 * 默认配置
 */
export const DEFAULT_CONFIG: ServerConfig = {
  // 数据相关
  dataDir: join(mcpServerRoot, 'data'),
  cacheDir: join(mcpServerRoot, 'data/.cache'),
  packagesDir: join(workspaceRoot, 'packages'),

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
   *
   * 复用 validateServerConfig 进行基础字段/数值验证，
   * 并追加路径存在性和文件系统权限检查。
   */
  async validate(): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    // 基础验证（字段、数值范围、格式）
    const baseResult = validateServerConfig(this.config);
    const errors = [...baseResult.errors];
    const warnings = [...baseResult.warnings];

    // 追加：路径存在性验证
    if (this.config.dataDir || this.config.packagesDir) {
      try {
        const { existsSync } = await import('node:fs');

        if (this.config.packagesDir && !existsSync(this.config.packagesDir)) {
          errors.push(`packagesDir 不存在: ${this.config.packagesDir}`);
        }

        if (this.config.dataDir && !existsSync(this.config.dataDir)) {
          warnings.push(`dataDir 不存在，将自动创建: ${this.config.dataDir}`);
        }
      } catch {
        warnings.push('无法验证路径存在性');
      }
    }

    // 追加：权限验证
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
