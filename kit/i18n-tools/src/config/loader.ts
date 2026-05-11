import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createJiti } from 'jiti';
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
  DEFAULT_OUTPUT_FORMAT,
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
    const received = Array.isArray(modules.rules) ? '空数组' : typeof modules.rules;
    throw new Error(`modules.rules 必须是非空数组，实际收到: ${received}`);
  }

  const names = new Set<string>();
  for (const [i, rule] of modules.rules.entries()) {
    if (!rule.name || typeof rule.name !== 'string') {
      throw new Error(`modules.rules[${i}] 的 name 字段缺失或非字符串`);
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

  const defaultModule = modules.defaultModule ?? DEFAULT_MODULES_DEFAULT_MODULE;

  // defaultModule 与 rule.name 重名会造成 writeModularLocaleFile 把未命中 key
  // 与命中该 rule 的 key 写入同一桶文件，语义模糊且难以追踪，禁用之。
  if (names.has(defaultModule)) {
    throw new Error(
      `modules.defaultModule "${defaultModule}" 与同名 rule 冲突。` +
        `请把 defaultModule 改为另一个不在 rules 中的名称（如 "common"）。`,
    );
  }

  return {
    rules: modules.rules,
    defaultModule,
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
 * Why jiti：Node ESM 运行时不识别 TypeScript 语法，直接 `import()` 一个 `.ts`
 * 文件会抛 `Unknown file extension ".ts"`。`i18n.config.ts` 是 README 推荐的首选
 * 命名，必须通过 jiti（或同类 TS loader）才能在生产 dist/cli.js 下加载。
 *
 * @param configPath - 配置文件路径（可选，不传则自动查找）
 */
export async function loadConfigFile(configPath?: string): Promise<I18nToolsConfig | null> {
  const resolvedPath = configPath || findConfigFile(process.cwd());

  if (!resolvedPath) {
    return null;
  }

  try {
    const ext = path.extname(resolvedPath);
    let configModule: { default?: unknown } & Record<string, unknown>;

    if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
      // .ts 系列必须经 jiti 转译；jiti 自己处理 module URL 解析
      const jiti = createJiti(import.meta.url, { interopDefault: true });
      configModule = (await jiti.import(resolvedPath)) as typeof configModule;
    } else {
      const fileUrl = pathToFileURL(resolvedPath).href;
      configModule = await import(fileUrl);
    }

    return (configModule.default ?? configModule) as I18nToolsConfig;
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

  const resolved: ResolvedConfig = {
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
      exportLocale: userConfig.paths.exportLocale
        ? path.resolve(rootDir, userConfig.paths.exportLocale)
        : undefined,
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
      maxDepth: userConfig.idPrefix?.maxDepth ?? DEFAULT_ID_PREFIX.maxDepth,
      promoteToCommon: userConfig.idPrefix?.promoteToCommon
        ? {
            // 阈值 < 2 等同禁用：单点使用本身不构成"跨模块复用"
            threshold: Math.max(0, userConfig.idPrefix.promoteToCommon.threshold ?? 0),
            namespace: userConfig.idPrefix.promoteToCommon.namespace ?? 'common',
          }
        : { threshold: 0, namespace: 'common' },
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
    extraction: {
      rejectPatterns: userConfig.extraction?.rejectPatterns ?? [],
    },
    modules: resolveModules(userConfig.modules),
    output: {
      format: userConfig.output?.format ?? DEFAULT_OUTPUT_FORMAT,
    },
  };

  const resolvedSeparator = resolved.idPrefix.separator;

  if (resolved.output.format === 'nested' && resolvedSeparator !== '.') {
    throw new Error(
      `配置错误：output.format='nested' 要求 idPrefix.separator='.'，` +
        `当前 separator='${resolvedSeparator}'。\n` +
        `vue-i18n 用 '.' 遍历嵌套 key，使用其他分隔符会导致运行时 t() 查找失败。\n` +
        `请将 idPrefix.separator 改为 '.'，并重新执行 generate 以更新所有 key。`,
    );
  }

  // 交叉校验：idPrefix.value 固定前缀 + 模块 glob match 规则会导致虚拟路径反推不准
  // 详见 LanguageFileManager.buildKeyModuleMap：从 key split 出虚拟路径依赖目录式 prefix，
  // 若用户用固定 value 覆盖了目录前缀，glob match 规则将命中错误的模块。
  if (resolved.modules && resolved.idPrefix.value) {
    const hasGlobMatch = resolved.modules.rules.some(
      (rule) => rule.match !== undefined && typeof rule.match !== 'function',
    );
    if (hasGlobMatch) {
      console.warn(
        `⚠️  配置警告：idPrefix.value='${resolved.idPrefix.value}' 与 modules.rules 的 glob match 规则同用时，\n` +
          `   模块归属反推依赖目录式 key 结构，固定前缀会导致路径不匹配。\n` +
          `   建议改用 matchKey（基于 key 字面匹配）或 match 传函数形式精确归类。`,
      );
    }
  }

  return resolved;
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
