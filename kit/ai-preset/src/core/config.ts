/**
 * 用户配置管理
 *
 * 负责 .ai-preset/config.json 的读写
 */

import path from 'node:path';
import type { InitConfig, UserConfig } from '../types.js';
import { CONFIG_FILENAME, LOCK_DIR } from '../types.js';
import { existsSync, readFile, writeFile } from '../utils/fs.js';

/** 完整配置文件结构（config.json 中的内容） */
export interface PersistedConfig {
  /** 目标平台 */
  platforms: string[];
  /** 框架 */
  framework?: string;
  /** 领域模块 */
  domains: string[];
  /** 排除的规则 ID */
  exclude?: string[];
  /** 追加的自定义规则路径 */
  include?: string[];
  /** 变量 */
  variables: Record<string, string>;
}

/**
 * 读取 .ai-preset/config.json
 */
export async function readConfig(projectRoot: string): Promise<PersistedConfig | null> {
  const configPath = path.join(projectRoot, LOCK_DIR, CONFIG_FILENAME);
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = await readFile(configPath);
    return JSON.parse(raw) as PersistedConfig;
  } catch {
    return null;
  }
}

/**
 * 写入 .ai-preset/config.json
 */
export async function writeConfig(projectRoot: string, config: PersistedConfig): Promise<void> {
  const configPath = path.join(projectRoot, LOCK_DIR, CONFIG_FILENAME);
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * 从 InitConfig 构建持久化配置
 */
export function initConfigToPersisted(
  initConfig: InitConfig,
  userConfig?: UserConfig,
): PersistedConfig {
  return {
    platforms: [...initConfig.platforms],
    framework: initConfig.framework,
    domains: [...initConfig.domains],
    exclude: userConfig?.exclude,
    include: userConfig?.include,
    variables: { ...initConfig.variables },
  };
}

/**
 * 从持久化配置还原为 InitConfig + UserConfig
 */
export function persistedToInitConfig(
  persisted: PersistedConfig,
  projectName: string,
): { initConfig: InitConfig; userConfig: UserConfig } {
  return {
    initConfig: {
      platforms: persisted.platforms as InitConfig['platforms'],
      framework: persisted.framework as InitConfig['framework'],
      domains: (persisted.domains || []) as InitConfig['domains'],
      projectName,
      variables: persisted.variables || {},
    },
    userConfig: {
      exclude: persisted.exclude,
      include: persisted.include,
      variables: persisted.variables,
    },
  };
}
