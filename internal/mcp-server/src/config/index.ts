/**
 * MCP Server 配置管理
 */

import { join, resolve } from 'node:path';
import { SERVER_NAME, SERVER_VERSION } from '../constants';
import { getMcpServerRoot } from '../utils/repo-root';
import { validateServerConfig } from '../utils/validation';

const mcpServerRoot = getMcpServerRoot();
// mcp-server/ → internal/ → aix/
const workspaceRoot = resolve(mcpServerRoot, '../..');

/**
 * 服务器配置接口
 *
 * 只保留真正被消费的字段。此前这里还有 cacheDir / cacheTTL / maxCacheSize /
 * enableCache / ignorePatterns / features 六项，全部零消费——
 * 留着只会让人以为改了它们能改变行为。
 */
export interface ServerConfig {
  /** 数据目录 */
  dataDir: string;
  /** 组件包目录 */
  packagesDir: string;

  /** 服务器名称 */
  serverName: string;
  /** 服务器版本 */
  serverVersion: string;
  /** 详细输出 */
  verbose: boolean;

  /** 提取时忽略的包 */
  ignorePackages: string[];
}

/**
 * 从环境变量读取配置覆盖
 *
 * MCP 客户端（Claude Desktop / Cursor 等）配置里通常只能设 args 和 env，
 * 提供 env 入口能省掉拼命令行参数。
 */
function readEnvOverrides(): Partial<ServerConfig> {
  const overrides: Partial<ServerConfig> = {};

  if (process.env.MCP_DATA_DIR) overrides.dataDir = resolve(process.env.MCP_DATA_DIR);
  if (process.env.MCP_PACKAGES_DIR) overrides.packagesDir = resolve(process.env.MCP_PACKAGES_DIR);
  if (process.env.MCP_VERBOSE === 'true') overrides.verbose = true;

  return overrides;
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: ServerConfig = {
  dataDir: join(mcpServerRoot, 'data'),
  packagesDir: join(workspaceRoot, 'packages'),

  serverName: SERVER_NAME,
  serverVersion: SERVER_VERSION,
  verbose: false,

  ignorePackages: [],
};

/**
 * 配置管理器
 *
 * 优先级：显式传入 > 环境变量 > 默认值
 */
export class ConfigManager {
  private config: ServerConfig;

  constructor(customConfig?: Partial<ServerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...readEnvOverrides(), ...customConfig };
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
   * 复用 validateServerConfig 进行基础字段验证，
   * 并追加路径存在性和文件系统权限检查。
   */
  async validate(): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    // 基础验证（字段、格式）
    const baseResult = validateServerConfig(this.config);
    const errors = [...baseResult.errors];
    const warnings = [...baseResult.warnings];

    const { existsSync } = await import('node:fs');
    const { access, constants } = await import('node:fs/promises');

    // 数据目录缺失只是警告：服务会以空数据启动并提示运行 extract
    if (!existsSync(this.config.dataDir)) {
      warnings.push(`dataDir 不存在: ${this.config.dataDir}，请先运行 extract`);
    } else {
      try {
        await access(this.config.dataDir, constants.R_OK);
      } catch {
        errors.push(`dataDir 没有读取权限: ${this.config.dataDir}`);
      }
    }

    // packagesDir 只在提取时需要，服务运行时缺失不影响查询
    if (!existsSync(this.config.packagesDir)) {
      warnings.push(`packagesDir 不存在: ${this.config.packagesDir}`);
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
export function createConfigManager(customConfig?: Partial<ServerConfig>): ConfigManager {
  return new ConfigManager(customConfig);
}
