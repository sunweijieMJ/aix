import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createJiti } from 'jiti';
import {
  BUILTIN_CN_MAPPINGS,
  DEFAULT_BUCKETS,
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
import { VUE_I18N_LIBRARIES } from '../strategies/vue/libraries/types';
import { REACT_I18N_LIBRARIES } from '../strategies/react/libraries/types';
// 直接 import 具体文件而非 utils barrel：barrel 会把 CLI 才需要的模块拖进配置加载期。
// utils/logger 只依赖 chalk，不会与 config 形成回环。
import { LoggerUtils } from '../utils/logger';

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
    // 规范成绝对路径再分发：jiti 对非绝对 specifier 以 loader 模块为基准解析（bare 名甚至
    // 当成 node_modules 包），而 pathToFileURL 内部走 process.cwd()。若不统一，同一相对
    // configPath 会因扩展名走不同分支而解析到不同文件甚至找不到（如 loadConfig('./i18n.config.ts')）。
    const absPath = path.isAbsolute(resolvedPath)
      ? resolvedPath
      : path.resolve(process.cwd(), resolvedPath);
    let configModule: { default?: unknown } & Record<string, unknown>;

    if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
      const jiti = createJiti(import.meta.url, { interopDefault: true });
      configModule = (await jiti.import(absPath)) as typeof configModule;
    } else {
      const fileUrl = pathToFileURL(absPath).href;
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
 * 枚举白名单校验：收口 loader 中多处「typo 静默走默认分支、无诊断」的手写校验。
 * loader 支持 JS 配置（运行时无 TS 字面量类型设防），故同级枚举一律 fail-fast。
 */
function validateEnum(
  value: string,
  allowed: readonly string[],
  label: string,
  opts: { context?: string; suffix?: string } = {},
): void {
  if (allowed.includes(value)) return;
  const ctx = opts.context ? `${opts.context}: ` : '';
  const list = allowed.map((s) => `'${s}'`).join(' | ');
  throw new Error(`${ctx}${label} 取值非法: '${value}'（仅支持 ${list}${opts.suffix ?? ''}）`);
}

/**
 * match 字段类型守卫：keys.prefix.rules[].match 与 buckets.rules[].match 共用同一组
 * 合法形态（string | string[] | RegExp | function）。两处共用本谓词，避免重复定义漂移。
 */
function isValidMatcher(m: unknown): boolean {
  return (
    typeof m === 'string' || Array.isArray(m) || m instanceof RegExp || typeof m === 'function'
  );
}

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
    // 单一事实源：直接引用 SSOT 常量，避免与「类型 union / 工厂 switch」各维护一份导致漂移
    const allowed = VUE_I18N_LIBRARIES;
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
    // 单一事实源：直接引用 SSOT 常量，避免与「类型 union / 工厂 switch」各维护一份导致漂移
    const allowed = REACT_I18N_LIBRARIES;
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
    const fileNameCase = p.fileNameCase ?? DEFAULT_KEYS.prefix.fileNameCase;
    // 白名单校验（与 io.format / glossary.override 等同级枚举对齐）：loader 支持 JS 配置，
    // 运行时无 TS 类型设防，typo 会静默走 id-generator 的 default 分支（as-is）而无诊断。
    // fileNameCase 允许传函数（自定义大小写转换），故仅在为字符串时校验取值。
    if (typeof fileNameCase === 'string') {
      validateEnum(fileNameCase, ['as-is', 'camel', 'kebab', 'snake'], 'fileNameCase', {
        context,
        suffix: ' 或自定义函数',
      });
    }
    const indexFile = p.indexFile ?? DEFAULT_KEYS.prefix.indexFile;
    validateEnum(indexFile, ['as-is', 'collapse-to-parent'], 'indexFile', { context });
    // 数值校验先于 Math.max：非数值（如 '2'）经 Math.max 得 NaN，slice(NaN) 静默按 0 处理，
    // 前缀段数与配置意图不符且无任何报错。
    const skip = p.skip ?? DEFAULT_KEYS.prefix.skip;
    const take = p.take ?? DEFAULT_KEYS.prefix.take;
    assertValidNumericConfig(skip, `${context}.skip`, '整数（负值按 0 处理）', (value) =>
      Number.isInteger(value),
    );
    assertValidNumericConfig(take, `${context}.take`, '整数（负值按 0 处理）', (value) =>
      Number.isInteger(value),
    );
    return {
      strategy: 'path',
      anchor: p.anchor ?? DEFAULT_KEYS.prefix.anchor,
      skip: Math.max(0, skip),
      take: Math.max(0, take),
      includeFile: p.includeFile ?? DEFAULT_KEYS.prefix.includeFile,
      fileNameCase,
      preserveHyphens: p.preserveHyphens ?? DEFAULT_KEYS.prefix.preserveHyphens,
      indexFile,
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
      if (!isValidMatcher(rule.match)) {
        throw new Error(
          `keys.prefix.rules[${i}].match 必须是 string | string[] | RegExp | function，实际 ${typeof rule.match}`,
        );
      }
      // use 缺失即报错（与 match 缺失同款）：静默补 path 默认策略会让命中该规则的文件
      // 拿到与预期完全不同的 key 前缀，且全程无诊断。
      if (rule.use === undefined || rule.use === null) {
        throw new Error(`keys.prefix.rules[${i}].use 缺失`);
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
 * 数值型配置项的统一校验：非数值 / NaN / Infinity / 不满足 predicate 时抛出带字段路径的错误。
 */
function assertValidNumericConfig(
  value: unknown,
  field: string,
  expected: string,
  predicate: (value: number) => boolean,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !predicate(value)) {
    throw new Error(`${field} 必须是${expected}，实际收到: ${String(value)}`);
  }
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

  const resolveTask = (
    task: LLMTaskConfig | undefined,
    context: 'llm.idGeneration' | 'llm.translation',
  ): ResolvedLLMTaskConfig => {
    // 过滤 task 里值为 undefined 的字段再展开：对象字面量里显式写出的 `model: undefined`
    // （常见于 `model: process.env.X`）会盖掉 shared 的同名值，让任务静默回落到内置默认，
    // 与「任务级字段 > shared」的合并语义相反。
    const taskOverrides = Object.fromEntries(
      Object.entries(task ?? {}).filter(([, value]) => value !== undefined),
    ) as LLMTaskConfig;
    const merged: LLMTaskConfig = { ...shared, ...taskOverrides };
    if (!merged.model) {
      merged.model = DEFAULT_LLM_MODEL;
    }
    const timeout = merged.timeout ?? DEFAULT_LLM_TASK.timeout;
    const maxRetries = merged.maxRetries ?? DEFAULT_LLM_TASK.maxRetries;
    const temperature = merged.temperature ?? DEFAULT_LLM_TASK.temperature;
    const concurrency = merged.concurrency ?? DEFAULT_LLM_TASK.concurrency;
    const batchSize = merged.batchSize ?? DEFAULT_LLM_TASK.batchSize;
    const throttleMs = merged.throttleMs ?? DEFAULT_LLM_TASK.throttleMs;

    assertValidNumericConfig(timeout, `${context}.timeout`, '有限正数', (value) => value > 0);
    assertValidNumericConfig(
      maxRetries,
      `${context}.maxRetries`,
      '非负整数',
      (value) => value >= 0 && Number.isInteger(value),
    );
    assertValidNumericConfig(
      temperature,
      `${context}.temperature`,
      '有限非负数',
      (value) => value >= 0,
    );
    assertValidNumericConfig(
      concurrency,
      `${context}.concurrency`,
      '正整数',
      (value) => value > 0 && Number.isInteger(value),
    );
    assertValidNumericConfig(
      batchSize,
      `${context}.batchSize`,
      '正整数',
      (value) => value > 0 && Number.isInteger(value),
    );
    assertValidNumericConfig(
      throttleMs,
      `${context}.throttleMs`,
      '有限非负数',
      (value) => value >= 0,
    );

    // headers 是可加性的（如全局 Authorization + 任务级追踪头），不能像 scalar 字段
    // 那样被任务级整体覆盖。浅合并的 { ...shared, ...task } 会让 task.headers 完全
    // 顶掉 shared.headers，导致鉴权头丢失。这里对 headers 单独做深合并。
    const mergedHeaders = { ...(shared.headers ?? {}), ...(task?.headers ?? {}) };
    return {
      apiKey: merged.apiKey ?? '',
      baseURL: merged.baseURL,
      model: merged.model,
      timeout,
      maxRetries,
      temperature,
      headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
      concurrency,
      batchSize,
      throttleMs,
      // prompt 是 LLMTaskConfig 专属字段（LLMSharedConfig 不含 prompt），
      // 故只可能来自 task；merged.prompt 即 task.prompt，无需深合并。
      prompt: {
        system: merged.prompt?.system,
        user: merged.prompt?.user,
      },
    };
  };

  return {
    idGeneration: resolveTask(llm?.idGeneration, 'llm.idGeneration'),
    translation: resolveTask(llm?.translation, 'llm.translation'),
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
 *  - by-locale 布局下 rule.name / defaultBucket 不得为保留名 'index'
 *    （导出器在 <locale>/ 目录生成 index.json 桶清单，同名桶译文会被覆盖）
 */
export function resolveBuckets(buckets: BucketsConfig | undefined): ResolvedConfig['buckets'] {
  if (!buckets) return undefined;

  if (!Array.isArray(buckets.rules) || buckets.rules.length === 0) {
    const received = Array.isArray(buckets.rules) ? '空数组' : typeof buckets.rules;
    throw new Error(`buckets.rules 必须是非空数组，实际收到: ${received}`);
  }

  const layout = buckets.layout ?? DEFAULT_BUCKETS.layout;
  validateEnum(layout, ['by-locale', 'by-bucket'], 'buckets.layout');
  // 仅 by-locale 需要保留 'index'：导出器只在该布局下生成 <locale>/index.json 桶清单
  // （writeLocaleIndexFiles 对 by-bucket 直接 return），by-bucket 用 'index' 无冲突。
  const isIndexReserved = layout === 'by-locale';

  const names = new Set<string>();
  for (const [i, rule] of buckets.rules.entries()) {
    if (!rule.name || typeof rule.name !== 'string') {
      throw new Error(`buckets.rules[${i}] 的 name 字段缺失或非字符串`);
    }
    // 'index' 是保留名：by-locale 布局下导出器会在 <locale>/ 目录写 index.json 桶清单，
    // 同名桶的译文文件会被清单原地覆盖（导出成功但该桶文案运行时全部缺失，且零告警）。
    if (isIndexReserved && rule.name === 'index') {
      throw new Error(
        `buckets.rules[${i}] 的 name 不能为保留名 "index"（by-locale 布局下与导出器生成的 <locale>/index.json 桶清单冲突），请改用其他桶名。`,
      );
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
    // 类型校验，与 prefix rules 的 match 校验对齐：JS 配置传错类型（如 matchKey: 'foo'）
    // 否则会绕过本校验、在 BucketResolver 里抛「Invalid bucket rule」或运行时 TypeError。
    if (hasMatch) {
      if (!isValidMatcher(rule.match)) {
        throw new Error(
          `桶规则 "${rule.name}" 的 match 类型非法：仅支持 string | string[] | RegExp | function`,
        );
      }
    }
    if (hasMatchKey && typeof rule.matchKey !== 'function') {
      throw new Error(`桶规则 "${rule.name}" 的 matchKey 必须是函数 ((key) => boolean)`);
    }
  }

  const defaultBucket = buckets.defaultBucket ?? DEFAULT_BUCKETS.defaultBucket;

  // 与 rule.name 同理：defaultBucket 也不能占用导出器的 index.json 保留名。
  if (isIndexReserved && defaultBucket === 'index') {
    throw new Error(
      `buckets.defaultBucket 不能为保留名 "index"（by-locale 布局下与导出器生成的 <locale>/index.json 桶清单冲突），请改用其他名称（如 "common"）。`,
    );
  }

  if (names.has(defaultBucket)) {
    throw new Error(
      `buckets.defaultBucket "${defaultBucket}" 与同名 rule 冲突。` +
        `请把 defaultBucket 改为另一个不在 rules 中的名称（如 "common"）。`,
    );
  }

  return {
    // 防御性拷贝：resolved.buckets.rules 是长生命周期快照，直接持有用户数组会让
    // 配置对象后续被改动时悄悄改变归桶行为（与本文件其它 4 处拷贝同款）。
    rules: [...buckets.rules],
    defaultBucket,
    emitManifest: buckets.emitManifest ?? DEFAULT_BUCKETS.emitManifest,
    layout,
  };
}

// =============================================================================
// 顶层 resolveConfig
// =============================================================================

/**
 * 强制安全排除集：用户提供 io.exclude 时会整体替换默认值（而非合并），易静默丢失对
 * node_modules/.git 的排除——而 generate 会提取其中中文并改写源码，破坏依赖/git 内部文件。
 * 这两项无论如何都并入，作为「绝不扫描/改写」的最小安全网。
 */
const FORCED_SAFE_EXCLUDES = ['node_modules', '.git'];

/**
 * 解析 io.exclude：
 *  - 未配置 → 默认排除集（含测试/故事/构建产物）；
 *  - 已配置 → 用户值整体替换默认，但强制并入 FORCED_SAFE_EXCLUDES；
 *  - 对「目录形态的路径式 literal」给出告警：含 '/' 的项在 FileUtils.getFrameworkFiles 里
 *    按相对路径整体匹配，`src/legacy/old.vue` 这类具体文件能命中，但 `src/legacy` 只等于
 *    「有个文件正好叫这个名字」，目录下的内容一个都排不掉。
 */
function resolveExclude(userExclude: string[] | undefined): string[] {
  if (!userExclude) return [...DEFAULT_IO.exclude];
  for (const e of userExclude) {
    if (typeof e !== 'string' || e.includes('*') || e.includes('?') || !e.includes('/')) continue;
    // 无扩展名即按目录形态处理（带扩展名的路径式 literal 作为具体文件路径正常生效）。
    if (path.extname(e) !== '') continue;
    const dir = e.replace(/\/+$/, '');
    LoggerUtils.warn(
      `配置警告：io.exclude 项 '${e}' 是目录路径但不是 glob，只会匹配同名文件本身，目录下的文件不会被排除。\n` +
        `   如需排除整个目录请改用 glob（如 '${dir}/**'）或仅写目录名（'${path.basename(dir)}'）。`,
    );
  }
  return [...new Set([...FORCED_SAFE_EXCLUDES, ...userExclude])];
}

/**
 * 解析配置：合并用户配置与默认值，将相对路径转为绝对路径。
 */
export function resolveConfig(userConfig: I18nToolsConfig): ResolvedConfig {
  // 顶层必填字段守卫：JS/TS 配置不经 TS 类型校验，缺失时下游会抛 path.resolve(undefined)
  // 或 resolveFramework 读 undefined.type 之类的晦涩原生错误。这里先给出可操作的诊断。
  // root 用空串还会被 path.resolve('') 静默当成 cwd，故一并拒绝空/纯空白。
  if (typeof userConfig.root !== 'string' || userConfig.root.trim() === '') {
    throw new Error('config.root 必填，且必须是非空字符串（项目根目录路径）。');
  }
  if (!userConfig.framework || typeof userConfig.framework !== 'object') {
    throw new Error(
      'config.framework 必填，且必须是对象（如 { type: "vue" } 或 { type: "react" }）。',
    );
  }
  const root = path.resolve(userConfig.root);

  // ---- locales ----
  const localesSource = userConfig.locales?.source ?? DEFAULT_LOCALES.source;
  // 空串/纯空白守卫：`source: ''` 因 `'' ?? default` 非 nullish 会被原样保留，下游所有
  // `<lang>.json` / `<lang>/<bucket>.json` 落盘会产出名为 `.json` 的畸形（Unix 隐藏）文件，
  // 且 source='' 时源文件读取异常。与 root/framework 的空串 fail-fast 对齐。
  if (typeof localesSource !== 'string' || localesSource.trim() === '') {
    throw new Error('locales.source 必须是非空字符串（源语种代码，如 "zh-CN"）。');
  }
  // 显式空数组 `targets: []` 与「未配置」语义不同，不能混为一谈：未配置才回落默认值，
  // 显式空数组应直接报错——否则用户清空 targets 会被悄悄塞回 'en-US'，且当 source 恰为
  // 默认目标（如 { source: 'en-US', targets: [] }）时，下面的 source-in-targets 守卫会抛出
  // 引用 'en-US' 这个用户从未配置过的语种的误导性错误。
  const userTargets = userConfig.locales?.targets;
  // 数组类型守卫：JS 配置漏写数组括号（`targets: 'en-US'`）时，字符串 length===5 会通过下面的
  // 空数组守卫，[...'en-US'] 再把它逐字符展开成 ['e','n','-','U','S']，逐项非空 / source / 去重守卫
  // 全部放行 → 为 5 个伪语种各落一份 locale（静默错误产物）。与该文件其余 fail-fast 守卫对齐。
  if (userTargets !== undefined && !Array.isArray(userTargets)) {
    throw new Error('locales.targets 必须是字符串数组（如 ["en-US"]）。');
  }
  if (userTargets && userTargets.length === 0) {
    throw new Error(
      'locales.targets 不能为空数组：请至少配置一个目标语种，或删除该字段以使用默认值',
    );
  }
  // 防御性拷贝：避免下游误把 ResolvedConfig.locales.targets 与 DEFAULT_LOCALES.targets
  // 共享同一引用，进而通过 push/splice 污染默认值。
  const localesTargets = userTargets ? [...userTargets] : [...DEFAULT_LOCALES.targets];
  // 逐项非空守卫：`targets: ['en-US', '']` 中的空串既不等于 source 也不算重复，会通过
  // 下方 source-in-targets / 去重校验，但同样落出畸形 `.json` 文件名。与 source 守卫对齐。
  const blankTarget = localesTargets.find((t) => typeof t !== 'string' || t.trim() === '');
  if (blankTarget !== undefined) {
    throw new Error(
      `locales.targets 含空/非字符串语种：实际 targets=${JSON.stringify(localesTargets)}，每个目标语种必须是非空字符串。`,
    );
  }
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
  // 数组类型守卫（同 locales.targets）：字符串误写会被 [...str] 逐字符展开成无效 glob，
  // 导致扫不到任何文件 / 排除集错乱，且全程无报错。
  if (userConfig.io?.include !== undefined && !Array.isArray(userConfig.io.include)) {
    throw new Error('io.include 必须是字符串数组（glob 列表，如 ["src/**/*.vue"]）。');
  }
  if (userConfig.io?.exclude !== undefined && !Array.isArray(userConfig.io.exclude)) {
    throw new Error('io.exclude 必须是字符串数组（glob 列表，如 ["**/*.test.ts"]）。');
  }
  const ioFormat = userConfig.io?.format ?? DEFAULT_IO.format;
  validateEnum(ioFormat, ['flat', 'nested'], 'io.format');
  const io = {
    sourceDir: path.resolve(root, userConfig.io?.sourceDir ?? DEFAULT_IO.sourceDir),
    localesDir: path.resolve(root, userConfig.io?.localesDir ?? DEFAULT_IO.localesDir),
    exportDir: userConfig.io?.exportDir ? path.resolve(root, userConfig.io.exportDir) : undefined,
    customDir: userConfig.io?.customDir ? path.resolve(root, userConfig.io.customDir) : undefined,
    // 防御性拷贝：避免与 DEFAULT_IO 共享数组引用，下游若 push/splice 会污染默认值
    // （与上方 localesTargets 的处理保持一致）。
    include: [...(userConfig.io?.include ?? DEFAULT_IO.include)],
    exclude: resolveExclude(userConfig.io?.exclude),
    format: ioFormat,
    indent: Math.max(0, userConfig.io?.indent ?? DEFAULT_IO.indent),
    prettify: userConfig.io?.prettify ?? DEFAULT_IO.prettify,
  };

  // ---- keys ----
  const userFallback = userConfig.keys?.fallback;
  const extend = userFallback?.extend ?? DEFAULT_KEYS.fallback.extend;
  const userMappings = userFallback?.mappings ?? {};
  const mappings = extend ? { ...BUILTIN_CN_MAPPINGS, ...userMappings } : { ...userMappings };

  // 数组类型守卫（同 locales.targets / io.include）：字符串误写会被 [...str] 逐字符展开成
  // 单字符前缀列表，把几乎所有 key 都当成「可能被动态引用」而跳过 prune/doctor 的孤儿判定。
  if (
    userConfig.keys?.dynamicKeyAllowlist !== undefined &&
    !Array.isArray(userConfig.keys.dynamicKeyAllowlist)
  ) {
    throw new Error('keys.dynamicKeyAllowlist 必须是数组（字符串前缀或正则，如 ["dynamic."]）。');
  }
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
            namespace:
              userConfig.keys.reuse.promoteToCommon.namespace ??
              DEFAULT_KEYS.reuse.promoteToCommon.namespace,
          }
        : { ...DEFAULT_KEYS.reuse.promoteToCommon },
    },
    // 防御性拷贝：同 io.include/exclude，避免与 DEFAULT_KEYS 共享数组引用。
    dynamicKeyAllowlist: [
      ...(userConfig.keys?.dynamicKeyAllowlist ?? DEFAULT_KEYS.dynamicKeyAllowlist),
    ],
    skip: userConfig.keys?.skip,
  };

  // ---- extract ----
  // 数组类型守卫（同 keys.dynamicKeyAllowlist）：单个正则误写成裸值时 [...value] 会抛
  // 「不可迭代」的无字段名错误，字符串误写则被逐字符展开成一串无意义的过滤项。
  if (
    userConfig.extract?.filterPatterns !== undefined &&
    !Array.isArray(userConfig.extract.filterPatterns)
  ) {
    throw new Error('extract.filterPatterns 必须是正则数组（如 [/^\\d+$/]）。');
  }

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
      names: userConfig.locales?.names ?? { ...DEFAULT_LOCALES.names },
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
      coverageThreshold,
    },
  };

  // ---- 显式校验 ----
  validateEnum(
    resolved.merge.onLlmRejected,
    ['fallback-to-source', 'warn-only'],
    'merge.onLlmRejected',
  );

  // glossary.override 的 typo 会静默绕过 PickProcessor 的 `=== 'always'` 分支、退回更弱的
  // when-empty 行为且零诊断，必须 fail-fast。
  validateEnum(String(resolved.glossary.override), ['always', 'when-empty'], 'glossary.override');

  // keys.separator 不得为空串：id-generator 用它 join/split key 段，空串会让 split('') 把
  // 固定前缀炸成逐字符，并令 ['a','bc'] 与 ['ab','c'] 这类不同段序列拼成同一 key（碰撞）。
  // 其它格式字段都已 validateEnum，唯独 separator 在 flat 路径下漏校验（nested 仅强制 '.'）。
  if (typeof resolved.keys.separator !== 'string' || resolved.keys.separator.length === 0) {
    throw new Error(
      `keys.separator 必须是非空字符串，当前收到 '${String(resolved.keys.separator)}'。\n` +
        `它用于拼接/拆分 key 段，空串会导致 key 段碰撞与前缀逐字符炸裂。`,
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
      LoggerUtils.warn(
        `配置警告：keys.prefix.strategy=${desc} 与 buckets.rules 的 glob match 规则同用时，\n` +
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
