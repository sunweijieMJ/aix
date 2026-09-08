/**
 * 配置文件的查找、加载与校验。
 *
 * 配置写错（语法坏掉、字段类型不对）一律报错而不是静默忽略：静默忽略会让人以为配置生效了，
 * 然后把包发到默认通道去。报错要说清「实际是什么」，否则改配置的人还得自己去猜哪里写错了。
 *
 * 只支持 ts / js，不支持 JSON：hooks 是代码，JSON 表达不了。
 * ts 走 jiti 转译，业务仓库不需要装 tsx。
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createJiti } from 'jiti';
import type { ManifestExportsContext, ResolvedConfig } from './types';

/**
 * 本工具的内置发布目标。
 *
 * 原则不变：发布目标是一个常量，不去解析 .npmrc / 问 npm config —— 一个只往私有仓库发包的
 * 工具，目标地址随各人机器上的配置变化没有好处，反而让「这次发到哪」变得要先查配置才知道。
 * 做成共用工具后这条原则保持，只是常量从代码搬到了配置项的默认值。
 */
export const DEFAULT_REGISTRY = 'http://npm-registry.zhihuishu.com:4873/';

/** 没有任何声明时的默认标签 */
export const DEFAULT_TAG = 'latest';

/** 主线标签：latest 的「预发布转正」只认这些序列 */
export const DEFAULT_MAINLINE_TAGS = ['beta', 'dev', 'rc'];

/** 构建后默认从仓库根复制进 dist 的文件 */
export const DEFAULT_COPY = ['README.md'];

/**
 * 配置文件候选列表。
 *
 * 扩展：ts/mts/cts 由 jiti 转译；mjs/cjs/js 走原生 dynamic import。
 * 优先级按数组顺序 —— 同目录同时存在多个文件时取首个。
 */
export const CONFIG_FILE_NAMES = [
  'publish.config.ts',
  'publish.config.mts',
  'publish.config.cts',
  'publish.config.mjs',
  'publish.config.cjs',
  'publish.config.js',
];

/**
 * 从 startDir 起逐级向上找第一个配置文件，返回绝对路径；找不到返回 null。
 *
 * 向上找是为了在子目录里也能跑：配置文件所在目录就是仓库根，
 * 之后所有相对路径（distDir、manifest.copy、构建命令的 cwd）都以它为基准。
 */
export const findConfigFile = (startDir: string): string | null => {
  let current = path.resolve(startDir);

  for (;;) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const filePath = path.join(current, fileName);
      if (fs.existsSync(filePath)) return filePath;
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
};

/** 加载配置文件模块，取它的 default 导出 */
const importConfig = async (absPath: string): Promise<unknown> => {
  const ext = path.extname(absPath);
  let mod: { default?: unknown } & Record<string, unknown>;

  if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
    // Node ESM 不识别 TypeScript，jiti 转译后才能 import
    const jiti = createJiti(import.meta.url, { interopDefault: true });
    mod = (await jiti.import(absPath)) as typeof mod;
  } else {
    mod = (await import(pathToFileURL(absPath).href)) as typeof mod;
  }

  return mod.default ?? mod;
};

// ============ 校验 ============

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

// 报错要说清「实际是什么」，否则改配置的人还得自己去猜哪里写错了
const describe = (value: unknown): string =>
  Array.isArray(value)
    ? '数组'
    : value === null
      ? 'null'
      : typeof value === 'function'
        ? '函数'
        : typeof value === 'object'
          ? '对象'
          : `${typeof value} ${JSON.stringify(value)}`;

const KNOWN_KEYS = ['registry', 'distDir', 'build', 'tags', 'manifest', 'hooks'];
const KNOWN_TAGS_KEYS = ['default', 'byBranch', 'mainline'];
const KNOWN_MANIFEST_KEYS = ['rootEntry', 'peerDependencies', 'exports', 'extra', 'copy'];
const KNOWN_HOOKS_KEYS = ['afterBuild', 'selfCheck'];

// cspell:ignore defualt
/** 键名写错（defualtTag 之类）会让配置静默失效，必须点出来 */
const warnUnknown = (
  file: string,
  where: string,
  raw: Record<string, unknown>,
  known: string[],
  logWarn: (message: string) => void,
): void => {
  const unknown = Object.keys(raw).filter((key) => !known.includes(key));
  if (unknown.length) {
    logWarn(
      `${file} 中${where}有无法识别的字段，将被忽略: ${unknown.join(', ')}（可用字段: ${known.join(', ')}）`,
    );
  }
};

const requireStringArray = (file: string, where: string, value: unknown): string[] => {
  if (!Array.isArray(value) || value.some((item) => !isNonEmptyString(item))) {
    return (() => {
      throw new Error(`${file} 的 ${where} 必须是非空字符串数组，实际是 ${describe(value)}`);
    })();
  }
  return value.map((item) => (item as string).trim());
};

/**
 * 校验并填默认值。
 *
 * logWarn 由调用方注入只为一件事：让这段校验能在测试里不打日志地跑。
 */
export const resolveConfig = (
  raw: unknown,
  { configPath, logWarn }: { configPath: string; logWarn: (message: string) => void },
): ResolvedConfig => {
  const file = path.basename(configPath);
  const projectRoot = path.dirname(configPath);

  if (!isPlainObject(raw)) {
    throw new Error(
      `${file} 必须默认导出一个对象（推荐 export default defineConfig({...})），实际是 ${describe(raw)}`,
    );
  }
  warnUnknown(file, '', raw, KNOWN_KEYS, logWarn);

  // ---- registry ----
  if ('registry' in raw && !isNonEmptyString(raw.registry)) {
    throw new Error(`${file} 的 registry 必须是非空字符串，实际是 ${describe(raw.registry)}`);
  }
  const registry = (raw.registry as string | undefined)?.trim() || DEFAULT_REGISTRY;

  // ---- distDir ----
  if ('distDir' in raw && !isNonEmptyString(raw.distDir)) {
    throw new Error(`${file} 的 distDir 必须是非空字符串，实际是 ${describe(raw.distDir)}`);
  }
  const distDir = (raw.distDir as string | undefined)?.trim() || 'dist';

  // ---- build ----
  if (!isPlainObject(raw.build)) {
    throw new Error(
      `${file} 的 build 必须是对象且含 command（如 build: { command: ['vite', 'build'] }），实际是 ${describe(raw.build)}`,
    );
  }
  const command = requireStringArray(file, 'build.command', raw.build.command);
  if (!command.length) throw new Error(`${file} 的 build.command 不能是空数组`);

  // ---- tags ----
  if ('tags' in raw && !isPlainObject(raw.tags)) {
    throw new Error(`${file} 的 tags 必须是对象，实际是 ${describe(raw.tags)}`);
  }
  const tagsRaw = (raw.tags ?? {}) as Record<string, unknown>;
  warnUnknown(file, ' tags 里', tagsRaw, KNOWN_TAGS_KEYS, logWarn);

  // 字段类型不对时报错，而不是静默兜底成空值再落到内置默认 latest ——
  // 那样的症状和「没写配置」一模一样，写配置的人会以为声明生效了，包却发到了默认通道
  if ('default' in tagsRaw && !isNonEmptyString(tagsRaw.default)) {
    throw new Error(
      `${file} 的 tags.default 必须是非空字符串，实际是 ${describe(tagsRaw.default)}`,
    );
  }
  if ('byBranch' in tagsRaw && !isPlainObject(tagsRaw.byBranch)) {
    throw new Error(
      `${file} 的 tags.byBranch 必须是「分支名 → 标签」的对象，实际是 ${describe(tagsRaw.byBranch)}`,
    );
  }
  const byBranchRaw = (tagsRaw.byBranch ?? {}) as Record<string, unknown>;
  const invalid = Object.entries(byBranchRaw).filter(([, value]) => !isNonEmptyString(value));
  if (invalid.length) {
    throw new Error(
      `${file} 的 tags.byBranch 里这些分支的标签不是非空字符串: ${invalid
        .map(([branch, value]) => `${branch} = ${describe(value)}`)
        .join('、')}`,
    );
  }

  const mainline =
    'mainline' in tagsRaw
      ? requireStringArray(file, 'tags.mainline', tagsRaw.mainline)
      : [...DEFAULT_MAINLINE_TAGS];

  // ---- manifest ----
  if ('manifest' in raw && !isPlainObject(raw.manifest)) {
    throw new Error(`${file} 的 manifest 必须是对象，实际是 ${describe(raw.manifest)}`);
  }
  const manifestRaw = (raw.manifest ?? {}) as Record<string, unknown>;
  warnUnknown(file, ' manifest 里', manifestRaw, KNOWN_MANIFEST_KEYS, logWarn);

  if ('rootEntry' in manifestRaw && !isNonEmptyString(manifestRaw.rootEntry)) {
    throw new Error(
      `${file} 的 manifest.rootEntry 必须是非空字符串（dist 下的一级目录名），实际是 ${describe(manifestRaw.rootEntry)}`,
    );
  }
  const peerDependencies =
    'peerDependencies' in manifestRaw
      ? requireStringArray(file, 'manifest.peerDependencies', manifestRaw.peerDependencies)
      : [];

  if ('exports' in manifestRaw && typeof manifestRaw.exports !== 'function') {
    throw new Error(
      `${file} 的 manifest.exports 必须是函数 (ctx) => ({ ... })，实际是 ${describe(manifestRaw.exports)}`,
    );
  }
  if ('extra' in manifestRaw && !isPlainObject(manifestRaw.extra)) {
    throw new Error(`${file} 的 manifest.extra 必须是对象，实际是 ${describe(manifestRaw.extra)}`);
  }
  const copy =
    'copy' in manifestRaw
      ? requireStringArray(file, 'manifest.copy', manifestRaw.copy)
      : [...DEFAULT_COPY];

  // ---- hooks ----
  if ('hooks' in raw && !isPlainObject(raw.hooks)) {
    throw new Error(`${file} 的 hooks 必须是对象，实际是 ${describe(raw.hooks)}`);
  }
  const hooksRaw = (raw.hooks ?? {}) as Record<string, unknown>;
  warnUnknown(file, ' hooks 里', hooksRaw, KNOWN_HOOKS_KEYS, logWarn);
  for (const key of KNOWN_HOOKS_KEYS) {
    if (key in hooksRaw && typeof hooksRaw[key] !== 'function') {
      throw new Error(`${file} 的 hooks.${key} 必须是函数，实际是 ${describe(hooksRaw[key])}`);
    }
  }

  return {
    configPath,
    projectRoot,
    configFile: file,
    registry,
    distDir,
    build: { command },
    tags: {
      default: (tagsRaw.default as string | undefined)?.trim() || DEFAULT_TAG,
      defaultDeclared: 'default' in tagsRaw,
      byBranch: Object.fromEntries(
        Object.entries(byBranchRaw).map(([branch, tag]) => [branch, (tag as string).trim()]),
      ),
      mainline,
    },
    manifest: {
      rootEntry: (manifestRaw.rootEntry as string | undefined)?.trim(),
      peerDependencies,
      exports: manifestRaw.exports as
        ((ctx: ManifestExportsContext) => Record<string, unknown>) | undefined,
      extra: (manifestRaw.extra ?? {}) as Record<string, unknown>,
      copy,
    },
    hooks: hooksRaw as ResolvedConfig['hooks'],
  };
};

/**
 * 从 cwd 起向上找到配置文件并加载。找不到直接报错说明要建哪个文件 ——
 * 这个工具没有「零配置」模式：构建命令没有安全的缺省值。
 */
export const loadConfig = async ({
  cwd = process.cwd(),
  logWarn,
}: {
  cwd?: string;
  logWarn: (message: string) => void;
}): Promise<ResolvedConfig> => {
  const configPath = findConfigFile(cwd);
  if (!configPath) {
    throw new Error(
      `未找到发布配置文件：从 ${cwd} 起逐级向上都没有 ${CONFIG_FILE_NAMES.join(' / ')}。\n` +
        '请在仓库根新建 publish.config.ts：\n\n' +
        "  import { defineConfig } from '@kit/publish'\n\n" +
        '  export default defineConfig({\n' +
        "      build: { command: ['vite', 'build'] }\n" +
        '  })\n',
    );
  }

  let raw: unknown;
  try {
    raw = await importConfig(configPath);
  } catch (error) {
    throw new Error(
      `加载配置文件失败: ${configPath}\n${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  return resolveConfig(raw, { configPath, logWarn });
};

// ============ 按分支解析默认标签 ============

/** 解析出的目标标签及其来源 */
export interface ConfiguredTag {
  tag: string;
  source: string;
  /** 落到内置默认（没人声明过）时为 true */
  isDefault: boolean;
  /** 声明了 byBranch 却读不到分支名 */
  branchUnknown: boolean;
}

// 分支匹配模式 → 正则：只把 * 当通配符，其余字符按字面量转义
const patternToRegExp = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, (char) => (char === '*' ? '.*' : `\\${char}`))}$`,
  );

/**
 * 解析该分支应当使用的默认标签，总是返回 { tag, source, isDefault, branchUnknown }。
 *
 * 优先级：环境变量 > tags.byBranch 精确匹配 > tags.byBranch 通配匹配（最长模式优先）
 *        > tags.default > 内置默认 latest
 *
 * tags.byBranch 是推荐写法：它以分支名为键，因此这份配置被合并到别的分支上也不会生效。
 * tags.default 不看分支，只适合「这个 checkout 永远只发某个标签」的定制仓库 / fork。
 */
export const resolveConfiguredTag = ({
  config,
  branch,
  env = process.env,
}: {
  config: Pick<ResolvedConfig, 'tags' | 'configFile'>;
  branch: string;
  env?: NodeJS.ProcessEnv;
}): ConfiguredTag => {
  const file = config.configFile;

  const fromEnv = env.PUBLISH_TAG?.trim();
  if (fromEnv) {
    return { tag: fromEnv, source: '环境变量 PUBLISH_TAG', isDefault: false, branchUnknown: false };
  }

  const entries = Object.entries(config.tags.byBranch ?? {});
  /**
   * 声明了按分支的标签，却读不到分支名（detached HEAD —— CI 的 checkout <sha> / 浅克隆
   * 就是这个状态）。此时那些声明一条都没被求值过，这与「压根没写配置」不是一回事：
   * 后者落到默认标签是没人做过选择，前者是有人做了选择而我们没能读到它。
   * 无人值守时前者必须拦下来（见 core/target.ts 的 resolveTag），否则定制产物就发进默认通道了。
   *
   * 这一条与 tags.default 声明与否无关：byBranch 与 default 同时写着时，落到 default
   * 同样是「byBranch 那些声明一条都没被求值」，把它当成显式选择放过去，症状一模一样。
   */
  const branchUnknown = !branch && entries.length > 0;
  const declared = (tag: string, source: string): ConfiguredTag => ({
    tag,
    source,
    isDefault: false,
    branchUnknown,
  });

  if (branch) {
    const exact = entries.find(([pattern]) => pattern === branch);
    if (exact) return declared(exact[1], `${file} 的 tags.byBranch["${exact[0]}"]`);

    // 通配模式按长度降序：更长的模式更具体，feature-oem-* 应当胜过 feature-*
    const matched = entries
      .filter(([pattern]) => pattern.includes('*') && patternToRegExp(pattern).test(branch))
      .sort(([a], [b]) => b.length - a.length)[0];
    if (matched) return declared(matched[1], `${file} 的 tags.byBranch["${matched[0]}"]`);
  }

  if (config.tags.defaultDeclared) return declared(config.tags.default, `${file} 的 tags.default`);

  // 没有任何声明：落到内置默认。isDefault 让调用方能把「没人声明过」和
  // 「有人明确声明了 latest」区分开，前者在无人值守时值得告警
  return {
    tag: config.tags.default || DEFAULT_TAG,
    source: '内置默认',
    isDefault: true,
    branchUnknown,
  };
};
