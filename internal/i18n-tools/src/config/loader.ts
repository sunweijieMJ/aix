import fs from 'fs';
import path from 'path';
import {
  DEFAULT_BATCH_DELAY,
  DEFAULT_BATCH_SIZE,
  DEFAULT_CONCURRENCY,
  DEFAULT_EXCLUDE,
  DEFAULT_ID_PREFIX,
  DEFAULT_INCLUDE,
  DEFAULT_LLM_MAX_RETRIES,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_TEMPERATURE,
  DEFAULT_LLM_TIMEOUT,
  DEFAULT_LOCALE,
  DEFAULT_PATHS,
  DEFAULT_REACT,
  DEFAULT_VUE,
} from './defaults';
import type { I18nToolsConfig, ResolvedConfig } from './types';

/**
 * 配置文件名候选列表
 */
const CONFIG_FILE_NAMES = [
  'i18n.config.ts',
  'i18n.config.js',
  'i18n.config.mjs',
];

/**
 * 查找配置文件
 * @param startDir - 起始搜索目录
 * @returns 配置文件路径或 null
 */
export function findConfigFile(startDir: string): string | null {
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = path.join(startDir, fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * 加载配置文件
 * @param configPath - 配置文件路径（可选，不传则自动查找）
 * @returns 用户配置
 */
export async function loadConfigFile(
  configPath?: string,
): Promise<I18nToolsConfig | null> {
  const resolvedPath = configPath || findConfigFile(process.cwd());

  if (!resolvedPath) {
    return null;
  }

  try {
    // 动态导入配置文件
    const configModule = await import(resolvedPath);
    return configModule.default || configModule;
  } catch (error) {
    console.error(`Failed to load config file: ${resolvedPath}`, error);
    return null;
  }
}

/**
 * 解析配置：合并用户配置与默认值，将相对路径转为绝对路径
 * @param userConfig - 用户配置
 * @returns 已解析的完整配置
 */
export function resolveConfig(userConfig: I18nToolsConfig): ResolvedConfig {
  const rootDir = path.resolve(userConfig.rootDir);

  return {
    rootDir,
    framework: userConfig.framework,
    vue: {
      library: userConfig.vue?.library ?? DEFAULT_VUE.library,
      namespace: userConfig.vue?.namespace ?? DEFAULT_VUE.namespace,
    },
    react: {
      library: userConfig.react?.library ?? DEFAULT_REACT.library,
      namespace: userConfig.react?.namespace ?? DEFAULT_REACT.namespace,
    },
    locale: {
      source: userConfig.locale?.source ?? DEFAULT_LOCALE.source,
      target: userConfig.locale?.target ?? DEFAULT_LOCALE.target,
    },
    paths: {
      locale: path.resolve(
        rootDir,
        userConfig.paths.locale || DEFAULT_PATHS.locale,
      ),
      customLocale: path.resolve(
        rootDir,
        userConfig.paths.customLocale || DEFAULT_PATHS.customLocale,
      ),
      exportLocale: path.resolve(
        rootDir,
        userConfig.paths.exportLocale || DEFAULT_PATHS.exportLocale,
      ),
      source: path.resolve(
        rootDir,
        userConfig.paths.source || DEFAULT_PATHS.source,
      ),
      tImport: userConfig.paths.tImport || DEFAULT_PATHS.tImport,
    },
    llm: {
      idGeneration: {
        apiKey: userConfig.llm.idGeneration.apiKey,
        model: userConfig.llm.idGeneration.model ?? DEFAULT_LLM_MODEL,
        baseURL: userConfig.llm.idGeneration.baseURL,
        timeout: userConfig.llm.idGeneration.timeout ?? DEFAULT_LLM_TIMEOUT,
        maxRetries:
          userConfig.llm.idGeneration.maxRetries ?? DEFAULT_LLM_MAX_RETRIES,
        temperature:
          userConfig.llm.idGeneration.temperature ?? DEFAULT_LLM_TEMPERATURE,
      },
      translation: {
        apiKey: userConfig.llm.translation.apiKey,
        model: userConfig.llm.translation.model ?? DEFAULT_LLM_MODEL,
        baseURL: userConfig.llm.translation.baseURL,
        timeout: userConfig.llm.translation.timeout ?? DEFAULT_LLM_TIMEOUT,
        maxRetries:
          userConfig.llm.translation.maxRetries ?? DEFAULT_LLM_MAX_RETRIES,
        temperature:
          userConfig.llm.translation.temperature ?? DEFAULT_LLM_TEMPERATURE,
      },
    },
    prompts: {
      idGeneration: {
        system: userConfig.prompts?.idGeneration?.system,
        user: userConfig.prompts?.idGeneration?.user,
      },
      translation: {
        system: userConfig.prompts?.translation?.system,
        user: userConfig.prompts?.translation?.user,
      },
    },
    idPrefix: {
      anchor: userConfig.idPrefix?.anchor ?? DEFAULT_ID_PREFIX.anchor,
      value: userConfig.idPrefix?.value ?? DEFAULT_ID_PREFIX.value,
      separator: userConfig.idPrefix?.separator ?? DEFAULT_ID_PREFIX.separator,
      chineseMappings:
        userConfig.idPrefix?.chineseMappings ??
        DEFAULT_ID_PREFIX.chineseMappings,
    },
    concurrency: {
      idGeneration:
        userConfig.concurrency?.idGeneration ??
        DEFAULT_CONCURRENCY.idGeneration,
      translation:
        userConfig.concurrency?.translation ?? DEFAULT_CONCURRENCY.translation,
    },
    batchSize: userConfig.batchSize ?? DEFAULT_BATCH_SIZE,
    batchDelay: userConfig.batchDelay ?? DEFAULT_BATCH_DELAY,
    format: userConfig.format ?? true,
    include: userConfig.include ?? DEFAULT_INCLUDE,
    exclude: userConfig.exclude ?? DEFAULT_EXCLUDE,
  };
}

/**
 * 加载并解析配置（便捷方法）
 * @param configPath - 配置文件路径（可选）
 * @returns 已解析的配置或 null
 */
export async function loadConfig(
  configPath?: string,
): Promise<ResolvedConfig | null> {
  const userConfig = await loadConfigFile(configPath);
  if (!userConfig) {
    return null;
  }
  return resolveConfig(userConfig);
}
