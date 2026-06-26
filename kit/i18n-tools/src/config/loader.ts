import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createJiti } from 'jiti';
import {
  BUILTIN_CN_MAPPINGS,
  DEFAULT_BUCKETS,
  DEFAULT_CI,
  DEFAULT_EXTRACT,
  DEFAULT_GLOSSARY,
  DEFAULT_IO,
  DEFAULT_KEYS,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_TASK,
  DEFAULT_LOCALES,
  DEFAULT_MERGE,
  DEFAULT_REACT_FRAMEWORK,
  DEFAULT_VUE_FRAMEWORK,
} from './defaults';
import type {
  BucketsConfig,
  FrameworkConfig,
  I18nToolsConfig,
  LLMConfig,
  LLMTaskConfig,
  PrefixStrategyConfig,
  ResolvedConfig,
  ResolvedLLMTaskConfig,
  ResolvedNestedPrefixStrategy,
  ResolvedPrefixStrategy,
} from './types';

// =============================================================================
// 配置文件加载与解析
// =============================================================================

/**
 * 配置文件候选列表。
 *
 * 扩展：ts/mts/cts 由 jiti 转译；mjs/cjs/js 走原生 dynamic import。
 * 优先级按数组顺序——同目录同时存在多个文件时取首个。
 */
const CONFIG_FILE_NAMES = [
  'i18n.config.ts',
  'i18n.config.mts',
  'i18n.config.cts',
  'i18n.config.mjs',
  'i18n.config.cjs',
  'i18n.config.js',
];

/**
 * 查找配置文件
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
 * 加载配置文件。
 *
 * 配置文件不存在返回 null；加载失败抛出原始错误（不再静默吞为 null）。
 *
 * Why jiti：Node ESM 不识别 TypeScript，jiti 转译 .ts/.mts/.cts 后才能 import。
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

// =============================================================================
// 子模块解析
// =============================================================================

/**
 * 解析 framework 配置 + 与 library 做联合校验。
 *
 * - type='vue' 时，library 必须 ∈ {vue-i18n, vue-i18next}
 * - type='react' 时，library 必须 ∈ {react-intl, react-i18next}
 * - 未知 type 留给抽象层扩展，但当前不接受（loader 严校验）
 */
function resolveFramework(framework: FrameworkConfig): ResolvedConfig['framework'] {
  if (framework.type === 'vue') {
    const library = framework.library ?? DEFAULT_VUE_FRAMEWORK.library;
    const allowed: ReadonlyArray<typeof library> = ['vue-i18n', 'vue-i18next'];
    if (!allowed.includes(library)) {
      throw new Error(
        `framework.library 与 type='vue' 不匹配：实际 '${library}'，期望 ${allowed.map((s) => `'${s}'`).join(' | ')}`,
      );
    }
    return {
      type: 'vue',
      library,
      namespace: framework.namespace ?? DEFAULT_VUE_FRAMEWORK.namespace,
      tImport: framework.tImport ?? DEFAULT_VUE_FRAMEWORK.tImport,
      includeDefaultMessage: DEFAULT_VUE_FRAMEWORK.includeDefaultMessage,
    };
  }

  if (framework.type === 'react') {
    const library = framework.library ?? DEFAULT_REACT_FRAMEWORK.library;
    const allowed: ReadonlyArray<typeof library> = ['react-intl', 'react-i18next'];
    if (!allowed.includes(library)) {
      throw new Error(
        `framework.library 与 type='react' 不匹配：实际 '${library}'，期望 ${allowed.map((s) => `'${s}'`).join(' | ')}`,
      );
    }
    return {
      type: 'react',
      library,
      namespace: framework.namespace ?? DEFAULT_REACT_FRAMEWORK.namespace,
      tImport: framework.tImport ?? DEFAULT_REACT_FRAMEWORK.tImport,
      includeDefaultMessage:
        framework.includeDefaultMessage ?? DEFAULT_REACT_FRAMEWORK.includeDefaultMessage,
    };
  }

  // exhaustiveness：当用户传入未知 type 时显式拒绝
  const exhaustive: never = framework;
  throw new Error(`不支持的 framework.type: ${JSON.stringify(exhaustive)}`);
}

/**
 * 解析非嵌套子策略（path / fixed / custom）。
 *
 * 单独抽出便于 rules.use / rules.fallback 递归调用，同时强制类型禁止再嵌套 rules。
 */
function resolveNestedPrefixStrategy(
  prefix: PrefixStrategyConfig | undefined,
  context: string,
): ResolvedNestedPrefixStrategy {
  if (!prefix || prefix.strategy === 'path') {
    const p = prefix ?? { strategy: 'path' as const };
    return {
      strategy: 'path',
      anchor: p.anchor ?? DEFAULT_KEYS.prefix.anchor,
      skip: Math.max(0, p.skip ?? DEFAULT_KEYS.prefix.skip),
      take: Math.max(0, p.take ?? DEFAULT_KEYS.prefix.take),
      includeFile: p.includeFile ?? DEFAULT_KEYS.prefix.includeFile,
      fileNameCase: p.fileNameCase ?? DEFAULT_KEYS.prefix.fileNameCase,
      preserveHyphens: p.preserveHyphens ?? DEFAULT_KEYS.prefix.preserveHyphens,
      indexFile: p.indexFile ?? DEFAULT_KEYS.prefix.indexFile,
      transform: p.transform,
    };
  }

  if (prefix.strategy === 'fixed') {
    if (!prefix.value || typeof prefix.value !== 'string') {
      throw new Error(`${context}: strategy='fixed' 必须提供非空的 value 字段`);
    }
    return { strategy: 'fixed', value: prefix.value };
  }

  if (prefix.strategy === 'custom') {
    if (typeof prefix.resolve !== 'function') {
      throw new Error(`${context}: strategy='custom' 必须提供 resolve 函数`);
    }
    return { strategy: 'custom', resolve: prefix.resolve };
  }

  if (prefix.strategy === 'rules') {
    throw new Error(`${context}: 不允许嵌套 strategy='rules'（仅顶层支持，避免无限套娃）`);
  }

  const exhaustive: never = prefix;
  throw new Error(`${context}: 未知的 strategy ${JSON.stringify(exhaustive)}`);
}

/**
 * 解析前缀策略。strategy 字段做状态校验，避免隐式状态机。
 *
 * 顶层支持 path / fixed / custom / rules；其中 rules.use 和 rules.fallback 不允许再嵌套 rules。
 */
function resolvePrefixStrategy(prefix: PrefixStrategyConfig | undefined): ResolvedPrefixStrategy {
  if (prefix && prefix.strategy === 'rules') {
    if (!Array.isArray(prefix.rules) || prefix.rules.length === 0) {
      const received = Array.isArray(prefix.rules) ? '空数组' : typeof prefix.rules;
      throw new Error(`keys.prefix.rules 必须是非空数组，实际收到: ${received}`);
    }
    const resolvedRules = prefix.rules.map((rule, i) => {
      if (rule.match === undefined || rule.match === null) {
        throw new Error(`keys.prefix.rules[${i}].match 缺失`);
      }
      const m = rule.match;
      const okType =
        typeof m === 'string' || Array.isArray(m) || m instanceof RegExp || typeof m === 'function';
      if (!okType) {
        throw new Error(
          `keys.prefix.rules[${i}].match 必须是 string | string[] | RegExp | function，实际 ${typeof m}`,
        );
      }
      return {
        match: rule.match,
        use: resolveNestedPrefixStrategy(rule.use, `keys.prefix.rules[${i}].use`),
      };
    });
    return {
      strategy: 'rules',
      rules: resolvedRules,
      fallback: prefix.fallback
        ? resolveNestedPrefixStrategy(prefix.fallback, 'keys.prefix.fallback')
        : undefined,
    };
  }

  return resolveNestedPrefixStrategy(prefix, 'keys.prefix');
}

/**
 * 解析 LLM 配置：把 shared 与 task 合并、补默认值。
 *
 * 合并优先级：任务级字段 > shared > 全局默认值。
 *
 * apiKey 缺失时不再在此抛错，而是返回一个 `apiKey: ''` 的占位 task：
 *   - 不调 LLM 的命令（restore / pick / merge / export / doctor 等）可以正常运行；
 *   - 真正调 LLM 的命令在 `LLMClient.chatCompletion` 入口做 lazy 校验，给出精确错误。
 * 这样避免「用户只想跑 doctor 也被强制配置 apiKey」的体验问题。
 */
function resolveLLM(llm: LLMConfig | undefined): ResolvedConfig['llm'] {
  const shared = llm?.shared ?? {};

  const resolveTask = (task: LLMTaskConfig | undefined): ResolvedLLMTaskConfig => {
    const merged: LLMTaskConfig = { ...shared, ...task };
    if (!merged.model) {
      merged.model = DEFAULT_LLM_MODEL;
    }
    // headers 是可加性的（如全局 Authorization + 任务级追踪头），不能像 scalar 字段
    // 那样被任务级整体覆盖。浅合并的 { ...shared, ...task } 会让 task.headers 完全
    // 顶掉 shared.headers，导致鉴权头丢失。这里对 headers 单独做深合并。
    const mergedHeaders = { ...(shared.headers ?? {}), ...(task?.headers ?? {}) };
    return {
      apiKey: merged.apiKey ?? '',
      baseURL: merged.baseURL,
      model: merged.model,
      timeout: merged.timeout ?? DEFAULT_LLM_TASK.timeout,
      maxRetries: merged.maxRetries ?? DEFAULT_LLM_TASK.maxRetries,
      temperature: merged.temperature ?? DEFAULT_LLM_TASK.temperature,
      headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
      concurrency: Math.max(1, merged.concurrency ?? DEFAULT_LLM_TASK.concurrency),
      batchSize: Math.max(1, merged.batchSize ?? DEFAULT_LLM_TASK.batchSize),
      throttleMs: Math.max(0, merged.throttleMs ?? DEFAULT_LLM_TASK.throttleMs),
      // prompt 是 LLMTaskConfig 专属字段（LLMSharedConfig 不含 prompt），
      // 故只可能来自 task；merged.prompt 即 task.prompt，无需深合并。
      prompt: {
        system: merged.prompt?.system,
        user: merged.prompt?.user,
      },
    };
  };

  return {
    idGeneration: resolveTask(llm?.idGeneration),
    translation: resolveTask(llm?.translation),
  };
}

/**
 * 解析并校验分桶配置（buckets）。
 *
 * 校验项：
 *  - rules 必须是非空数组
 *  - rule.name 必须存在且全局唯一
 *  - rule.match 与 rule.matchKey 互斥
 *  - defaultBucket 不能与任一 rule.name 重名
 */
export function resolveBuckets(buckets: BucketsConfig | undefined): ResolvedConfig['buckets'] {
  if (!buckets) return undefined;

  if (!Array.isArray(buckets.rules) || buckets.rules.length === 0) {
    const received = Array.isArray(buckets.rules) ? '空数组' : typeof buckets.rules;
    throw new Error(`buckets.rules 必须是非空数组，实际收到: ${received}`);
  }

  const names = new Set<string>();
  for (const [i, rule] of buckets.rules.entries()) {
    if (!rule.name || typeof rule.name !== 'string') {
      throw new Error(`buckets.rules[${i}] 的 name 字段缺失或非字符串`);
    }
    if (names.has(rule.name)) {
      throw new Error(`buckets.rules 中存在重复的 name: "${rule.name}"`);
    }
    names.add(rule.name);

    const hasMatch = rule.match !== undefined;
    const hasMatchKey = rule.matchKey !== undefined;
    if (hasMatch && hasMatchKey) {
      throw new Error(`桶规则 "${rule.name}" 不能同时配置 match 与 matchKey`);
    }
    if (!hasMatch && !hasMatchKey) {
      throw new Error(`桶规则 "${rule.name}" 必须提供 match 或 matchKey 之一`);
    }
  }

  const defaultBucket = buckets.defaultBucket ?? DEFAULT_BUCKETS.defaultBucket;

  if (names.has(defaultBucket)) {
    throw new Error(
      `buckets.defaultBucket "${defaultBucket}" 与同名 rule 冲突。` +
        `请把 defaultBucket 改为另一个不在 rules 中的名称（如 "common"）。`,
    );
  }

  return {
    rules: buckets.rules,
    defaultBucket,
    emitManifest: buckets.emitManifest ?? DEFAULT_BUCKETS.emitManifest,
    layout: buckets.layout ?? DEFAULT_BUCKETS.layout,
  };
}

// =============================================================================
// 顶层 resolveConfig
// =============================================================================

/**
 * 解析配置：合并用户配置与默认值，将相对路径转为绝对路径。
 */
export function resolveConfig(userConfig: I18nToolsConfig): ResolvedConfig {
  const root = path.resolve(userConfig.root);

  // ---- locales ----
  const localesSource = userConfig.locales?.source ?? DEFAULT_LOCALES.source;
  // 防御性拷贝：避免下游误把 ResolvedConfig.locales.targets 与 DEFAULT_LOCALES.targets
  // 共享同一引用，进而通过 push/splice 污染默认值。
  const localesTargets =
    userConfig.locales?.targets && userConfig.locales.targets.length > 0
      ? [...userConfig.locales.targets]
      : [...DEFAULT_LOCALES.targets];
  if (localesTargets.includes(localesSource)) {
    throw new Error(
      `locales.targets 不能包含 source 语种 '${localesSource}'：实际 targets=${JSON.stringify(localesTargets)}`,
    );
  }
  const duplicateTargets = localesTargets.filter((t, i) => localesTargets.indexOf(t) !== i);
  if (duplicateTargets.length > 0) {
    throw new Error(`locales.targets 存在重复语种: ${[...new Set(duplicateTargets)].join(', ')}`);
  }

  // ---- io ----
  const io = {
    sourceDir: path.resolve(root, userConfig.io?.sourceDir ?? DEFAULT_IO.sourceDir),
    localesDir: path.resolve(root, userConfig.io?.localesDir ?? DEFAULT_IO.localesDir),
    exportDir: userConfig.io?.exportDir ? path.resolve(root, userConfig.io.exportDir) : undefined,
    customDir: userConfig.io?.customDir ? path.resolve(root, userConfig.io.customDir) : undefined,
    // 防御性拷贝：避免与 DEFAULT_IO 共享数组引用，下游若 push/splice 会污染默认值
    // （与上方 localesTargets 的处理保持一致）。
    include: [...(userConfig.io?.include ?? DEFAULT_IO.include)],
    exclude: [...(userConfig.io?.exclude ?? DEFAULT_IO.exclude)],
    format: userConfig.io?.format ?? DEFAULT_IO.format,
    indent: Math.max(0, userConfig.io?.indent ?? DEFAULT_IO.indent),
    prettify: userConfig.io?.prettify ?? DEFAULT_IO.prettify,
  };

  // ---- keys ----
  const userFallback = userConfig.keys?.fallback;
  const extend = userFallback?.extend ?? DEFAULT_KEYS.fallback.extend;
  const userMappings = userFallback?.mappings ?? {};
  const mappings = extend ? { ...BUILTIN_CN_MAPPINGS, ...userMappings } : { ...userMappings };

  const keys: ResolvedConfig['keys'] = {
    separator: userConfig.keys?.separator ?? DEFAULT_KEYS.separator,
    prefix: resolvePrefixStrategy(userConfig.keys?.prefix),
    fallback: { extend, mappings },
    reuse: {
      acrossDirectories:
        userConfig.keys?.reuse?.acrossDirectories ?? DEFAULT_KEYS.reuse.acrossDirectories,
      promoteToCommon: userConfig.keys?.reuse?.promoteToCommon
        ? {
            // 阈值 < 2 等同禁用：单点使用本身不构成"跨模块复用"
            threshold: Math.max(0, userConfig.keys.reuse.promoteToCommon.threshold ?? 0),
            namespace: userConfig.keys.reuse.promoteToCommon.namespace ?? 'common',
          }
        : { threshold: 0, namespace: 'common' },
    },
    // 防御性拷贝：同 io.include/exclude，避免与 DEFAULT_KEYS 共享数组引用。
    dynamicKeyAllowlist: [
      ...(userConfig.keys?.dynamicKeyAllowlist ?? DEFAULT_KEYS.dynamicKeyAllowlist),
    ],
    skip: userConfig.keys?.skip,
  };

  // ---- ci ----
  const coverageThreshold = userConfig.ci?.coverageThreshold;
  if (coverageThreshold !== undefined) {
    if (
      typeof coverageThreshold !== 'number' ||
      !Number.isFinite(coverageThreshold) ||
      coverageThreshold < 0 ||
      coverageThreshold > 100
    ) {
      throw new Error(
        `ci.coverageThreshold 必须是 [0, 100] 区间的数字，实际收到: ${JSON.stringify(coverageThreshold)}`,
      );
    }
  }

  const resolved: ResolvedConfig = {
    root,
    framework: resolveFramework(userConfig.framework),
    locales: {
      source: localesSource,
      targets: localesTargets,
      names: userConfig.locales?.names ?? {},
    },
    io,
    keys,
    extract: {
      // 防御性拷贝：同上，避免与 DEFAULT_EXTRACT 共享数组引用。
      filterPatterns: [...(userConfig.extract?.filterPatterns ?? DEFAULT_EXTRACT.filterPatterns)],
    },
    glossary: {
      file: userConfig.glossary?.file ? path.resolve(root, userConfig.glossary.file) : undefined,
      override: userConfig.glossary?.override ?? DEFAULT_GLOSSARY.override,
      normalize: userConfig.glossary?.normalize ?? DEFAULT_GLOSSARY.normalize,
    },
    llm: resolveLLM(userConfig.llm),
    buckets: resolveBuckets(userConfig.buckets),
    merge: {
      onLlmRejected: userConfig.merge?.onLlmRejected ?? DEFAULT_MERGE.onLlmRejected,
    },
    ci: {
      coverageThreshold: coverageThreshold ?? DEFAULT_CI.coverageThreshold,
    },
  };

  // ---- 显式校验 ----
  const validRejected = ['fallback-to-source', 'warn-only'];
  if (!validRejected.includes(resolved.merge.onLlmRejected)) {
    throw new Error(
      `merge.onLlmRejected 必须是 ${validRejected.map((s) => `'${s}'`).join(' | ')} 之一，` +
        `当前收到 '${resolved.merge.onLlmRejected}'。`,
    );
  }

  // io.format='nested' 要求 separator='.'：vue-i18n 用 '.' 遍历嵌套 key
  if (resolved.io.format === 'nested' && resolved.keys.separator !== '.') {
    throw new Error(
      `io.format='nested' 要求 keys.separator='.'，` +
        `当前 separator='${resolved.keys.separator}'。\n` +
        `vue-i18n 用 '.' 遍历嵌套 key，使用其他分隔符会导致运行时 t() 查找失败。\n` +
        `请将 keys.separator 改为 '.'，并重新执行 generate 以更新所有 key。`,
    );
  }

  // 交叉校验：非 path 前缀策略（fixed/custom/rules）+ buckets glob match
  // 会导致 LanguageFileManager.buildKeyBucketMap 用 anchor='src' 反推的虚拟路径不准。
  if (resolved.buckets && resolved.keys.prefix.strategy !== 'path') {
    const hasGlobMatch = resolved.buckets.rules.some(
      (rule) => rule.match !== undefined && typeof rule.match !== 'function',
    );
    if (hasGlobMatch) {
      const desc =
        resolved.keys.prefix.strategy === 'fixed'
          ? `'fixed'（value='${resolved.keys.prefix.value}'）`
          : `'${resolved.keys.prefix.strategy}'`;
      console.warn(
        `⚠️  配置警告：keys.prefix.strategy=${desc} 与 buckets.rules 的 glob match 规则同用时，\n` +
          `   桶归属反推依赖单一 anchor 的目录式 key 结构，非 path 策略会导致路径不匹配。\n` +
          `   建议把 buckets 规则改用 matchKey（基于 key 字面匹配）或 match 传函数形式精确归类。`,
      );
    }
  }

  return resolved;
}

/**
 * 加载并解析配置（便捷方法）
 */
export async function loadConfig(configPath?: string): Promise<ResolvedConfig | null> {
  const userConfig = await loadConfigFile(configPath);
  if (!userConfig) {
    return null;
  }
  return resolveConfig(userConfig);
}
