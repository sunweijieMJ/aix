import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  DEFAULT_BATCH_DELAY,
  DEFAULT_BATCH_SIZE,
  DEFAULT_CONCURRENCY,
  DEFAULT_EXCLUDE,
  DEFAULT_GLOSSARY,
  DEFAULT_ID_PREFIX,
  DEFAULT_INCLUDE,
  DEFAULT_LLM_MAX_RETRIES,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_TEMPERATURE,
  DEFAULT_LLM_TIMEOUT,
  DEFAULT_LOCALE,
  DEFAULT_MODULES_DEFAULT_MODULE,
  DEFAULT_MODULES_LAYOUT,
  DEFAULT_MODULES_MANIFEST,
  DEFAULT_PATHS,
  DEFAULT_REACT,
  DEFAULT_VUE,
} from './defaults';
import type { I18nToolsConfig, LLMConfig, ResolvedConfig } from './types';

type ResolvedLLMConfig = Required<Omit<LLMConfig, 'baseURL'>> & Pick<LLMConfig, 'baseURL'>;

/**
 * 将 llm.default 与任务级配置合并，生成完整的 LLM 配置。
 * 合并优先级: 任务级字段 > llm.default > 全局默认值
 * 若合并后 apiKey 仍为空，则抛出明确错误。
 */
function resolveLLMConfig(llm: I18nToolsConfig['llm']): {
  idGeneration: ResolvedLLMConfig;
  translation: ResolvedLLMConfig;
} {
  const base = llm.default ?? {};

  const resolveTask = (
    task: Partial<LLMConfig> | undefined,
    taskName: string,
  ): ResolvedLLMConfig => {
    const merged = { ...base, ...task };
    if (!merged.apiKey) {
      throw new Error(
        `llm.${taskName}.apiKey 未配置。` + `请在 llm.default 或 llm.${taskName} 中设置 apiKey。`,
      );
    }
    return {
      apiKey: merged.apiKey,
      model: merged.model ?? DEFAULT_LLM_MODEL,
      baseURL: merged.baseURL,
      timeout: merged.timeout ?? DEFAULT_LLM_TIMEOUT,
      maxRetries: merged.maxRetries ?? DEFAULT_LLM_MAX_RETRIES,
      temperature: merged.temperature ?? DEFAULT_LLM_TEMPERATURE,
    };
  };

  return {
    idGeneration: resolveTask(llm.idGeneration, 'idGeneration'),
    translation: resolveTask(llm.translation, 'translation'),
  };
}

/**
 * 解析并校验模块化导出配置（modules）。
 *
 * 校验项：
 * - rules 必须是非空数组
 * - rule.name 必须存在、为字符串、且全局唯一
 * - rule.match 与 rule.matchKey 互斥（不可同时存在，也不可都缺失）
 *
 * 通过后填充 defaultModule / manifest / layout 的默认值。
 */
export function resolveModules(modules: I18nToolsConfig['modules']): ResolvedConfig['modules'] {
  if (!modules) return undefined;

  if (!Array.isArray(modules.rules) || modules.rules.length === 0) {
    throw new Error('modules.rules 必须是非空数组');
  }

  const names = new Set<string>();
  for (const rule of modules.rules) {
    if (!rule.name || typeof rule.name !== 'string') {
      throw new Error(`modules.rules 中存在缺失或非法的 name 字段`);
    }
    if (names.has(rule.name)) {
      throw new Error(`modules.rules 中存在重复的 name: "${rule.name}"`);
    }
    names.add(rule.name);

    const hasMatch = rule.match !== undefined;
    const hasMatchKey = rule.matchKey !== undefined;
    if (hasMatch && hasMatchKey) {
      throw new Error(`模块规则 "${rule.name}" 不能同时配置 match 与 matchKey`);
    }
    if (!hasMatch && !hasMatchKey) {
      throw new Error(`模块规则 "${rule.name}" 必须提供 match 或 matchKey 之一`);
    }
  }

  return {
    rules: modules.rules,
    defaultModule: modules.defaultModule ?? DEFAULT_MODULES_DEFAULT_MODULE,
    manifest: modules.manifest ?? DEFAULT_MODULES_MANIFEST,
    layout: modules.layout ?? DEFAULT_MODULES_LAYOUT,
  };
}

/**
 * 配置文件名候选列表
 */
const CONFIG_FILE_NAMES = ['i18n.config.ts', 'i18n.config.js', 'i18n.config.mjs'];

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
 *
 * 配置文件不存在返回 null（CLI 据此提示"未找到配置文件"）；
 * 配置文件存在但加载失败（语法错误、导入失败等）会重新抛出原始错误，
 * 不再被静默吞为 null —— 否则用户会看到误导性的"找不到配置文件"提示。
 *
 * @param configPath - 配置文件路径（可选，不传则自动查找）
 */
export async function loadConfigFile(configPath?: string): Promise<I18nToolsConfig | null> {
  const resolvedPath = configPath || findConfigFile(process.cwd());

  if (!resolvedPath) {
    return null;
  }

  try {
    const fileUrl = pathToFileURL(resolvedPath).href;
    const configModule = await import(fileUrl);
    return configModule.default || configModule;
  } catch (error) {
    throw new Error(
      `加载配置文件失败: ${resolvedPath}\n${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
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
      includeDefaultMessage:
        userConfig.react?.includeDefaultMessage ?? DEFAULT_REACT.includeDefaultMessage,
    },
    locale: {
      source: userConfig.locale?.source ?? DEFAULT_LOCALE.source,
      target: userConfig.locale?.target ?? DEFAULT_LOCALE.target,
    },
    paths: {
      locale: path.resolve(rootDir, userConfig.paths.locale || DEFAULT_PATHS.locale),
      customLocale: userConfig.paths.customLocale
        ? path.resolve(rootDir, userConfig.paths.customLocale)
        : undefined,
      exportLocale: path.resolve(
        rootDir,
        userConfig.paths.exportLocale || DEFAULT_PATHS.exportLocale,
      ),
      source: path.resolve(rootDir, userConfig.paths.source || DEFAULT_PATHS.source),
      tImport: userConfig.paths.tImport || DEFAULT_PATHS.tImport,
      glossary: userConfig.paths.glossary
        ? path.resolve(rootDir, userConfig.paths.glossary)
        : undefined,
    },
    llm: resolveLLMConfig(userConfig.llm),
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
      chineseMappings: userConfig.idPrefix?.chineseMappings ?? DEFAULT_ID_PREFIX.chineseMappings,
      reuseAcrossDirectories:
        userConfig.idPrefix?.reuseAcrossDirectories ?? DEFAULT_ID_PREFIX.reuseAcrossDirectories,
    },
    glossary: {
      override: userConfig.glossary?.override ?? DEFAULT_GLOSSARY.override,
      normalize: userConfig.glossary?.normalize ?? DEFAULT_GLOSSARY.normalize,
    },
    concurrency: {
      idGeneration: userConfig.concurrency?.idGeneration ?? DEFAULT_CONCURRENCY.idGeneration,
      translation: userConfig.concurrency?.translation ?? DEFAULT_CONCURRENCY.translation,
    },
    batchSize: userConfig.batchSize ?? DEFAULT_BATCH_SIZE,
    batchDelay: userConfig.batchDelay ?? DEFAULT_BATCH_DELAY,
    format: userConfig.format ?? true,
    include: userConfig.include ?? DEFAULT_INCLUDE,
    exclude: userConfig.exclude ?? DEFAULT_EXCLUDE,
    modules: resolveModules(userConfig.modules),
  };
}

/**
 * 加载并解析配置（便捷方法）
 * @param configPath - 配置文件路径（可选）
 * @returns 已解析的配置或 null
 */
export async function loadConfig(configPath?: string): Promise<ResolvedConfig | null> {
  const userConfig = await loadConfigFile(configPath);
  if (!userConfig) {
    return null;
  }
  return resolveConfig(userConfig);
}
