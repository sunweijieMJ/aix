/**
 * 生成发布用的 dist/package.json。
 *
 * exports 由 dist 下实际产出的入口目录派生（一级目录中含 index.js 的即为入口），
 * 不必在打包配置的 input、根 package.json 的 exports、构建脚本的 entryNames
 * 三处各维护一份入口清单 —— 新增导出只需改打包配置。
 * 产物形态不适合按目录派生的仓库（单文件 lib）用 manifest.exports 整体覆盖。
 *
 * dependencies 同理由产物反推（见 buildDependencies），不照搬根 package.json。
 */

import fs from 'fs';
import path from 'path';
import { logInfo, logOk, logWarn } from '../utils/logger';
import { getBranch, getCommit, getDirtyFiles } from './git';
import { collectExternalImports } from './dist-scan';
import type { PublishContext } from '../config/types';

// 构建产物不进包的文件清单（写成 dist/.npmignore，npm 自己不会把 .npmignore 打进包）
const NPM_IGNORE_FILE = '.npmignore';

// 发布清单本身
const MANIFEST_FILE = 'package.json';

// writeManifest 会落盘的全部文件。dry-run 跑完要把它们原样还原（见 actions.ts 的 withRestoredDist），
// 清单放在写它们的这个模块里，日后多写一个文件不至于漏掉还原
export const MANIFEST_FILES = [MANIFEST_FILE, NPM_IGNORE_FILE];

// 构建时刻的溯源信息，供「复用 dist 直接发布」时读取。
// 它同时是「这次构建走完了全部产物修复」的标记：只在 hooks.afterBuild 通过之后才写，
// 因此 checks.ts 拿它当复用 dist 的准入门禁（见 ensureBuiltDist）
export const BUILD_META_FILE = '.build-meta.json';

/** dist/.build-meta.json 的内容 */
export interface BuildMeta {
  commit: string;
  branch: string;
  /** true 脏、false 干净、null 读不到 git 状态 */
  dirty: boolean | null;
  builtAt: string;
}

const readJson = (filePath: string): Record<string, any> =>
  JSON.parse(fs.readFileSync(filePath, 'utf-8'));

export const readRootPackage = (projectRoot: string): Record<string, any> =>
  readJson(path.join(projectRoot, 'package.json'));

/** 包名取自根 package.json */
export const readPackageName = (projectRoot: string): string => {
  const name = readRootPackage(projectRoot).name;
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`${path.join(projectRoot, 'package.json')} 没有 name 字段，无从确定要发哪个包`);
  }
  return name;
};

// peerDependencies 的范围优先取根 package.json 的 peerDependencies，其次 dependencies
const buildPeerDependencies = (
  rootPackage: Record<string, any>,
  names: readonly string[],
): Record<string, string> =>
  Object.fromEntries(
    names.map((name) => {
      const range = rootPackage.peerDependencies?.[name] ?? rootPackage.dependencies?.[name];
      if (!range) {
        throw new Error(
          `根 package.json 未声明 ${name} 的版本，无法写出 peerDependencies（它是直接约束消费方的，不能猜）`,
        );
      }
      return [name, range];
    }),
  );

/**
 * 构建结束时记录来源 commit。
 * 必须在构建时写：`-a build` 之后切分支再 `-a publish`，
 * 发布时刻的 HEAD 已经不是打出这份产物的 commit 了。
 *
 * 同时记录工作区是否干净：脏工作区里打出的产物不对应任何 commit，
 * 光记 commit 会让溯源信息说谎（见 writeManifest 里 gitHead 的处理）。
 *
 * dirty 有三种取值：true 脏、false 干净、null 读不到 git 状态。null 不能并进 false ——
 * 那等于拿一次失败的查询断言「产物对应这个 commit」，正是这个字段要防的事。
 */
export const writeBuildMeta = ({
  projectRoot,
  distPath,
}: {
  projectRoot: string;
  distPath: string;
}): BuildMeta => {
  const dirty = getDirtyFiles(projectRoot);
  const meta: BuildMeta = {
    commit: getCommit(projectRoot),
    branch: getBranch(projectRoot),
    dirty: dirty === null ? null : dirty.length > 0,
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(distPath, BUILD_META_FILE), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
};

export const readBuildMeta = (distPath: string): BuildMeta | null => {
  try {
    return readJson(path.join(distPath, BUILD_META_FILE)) as BuildMeta;
  } catch {
    return null;
  }
};

// 溯源信息的单行摘要。新构建（build.ts）与复用现有 dist（actions.ts）两处都要打这一行，
// 格式只留一处，免得两边漂移
export const formatBuildMeta = (meta: BuildMeta): string => {
  // 严格比 null：更早版本写的 meta 没有 dirty 字段（undefined），按干净处理，不能显示成「未知」
  const state = meta.dirty === true ? ' (脏工作区)' : meta.dirty === null ? ' (git 状态未知)' : '';
  return `产物来源: ${meta.branch || '未知分支'} @ ${(meta.commit || '').slice(0, 8)}${state} (${meta.builtAt})`;
};

// 扫描 dist 一级目录，含 index.js 的即为构建入口（js/ 与 assets/ 天然被排除）
const collectEntries = (distPath: string): string[] =>
  fs
    .readdirSync(distPath, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && fs.existsSync(path.join(distPath, entry.name, 'index.js')),
    )
    .map((entry) => entry.name)
    .sort();

/**
 * 推导发布用的 dependencies。
 *
 * 只声明「产物里仍以裸导入形式引用的包」，而不是照搬根 package.json 的 dependencies：
 * 打包配置的 external 往往只有 vue，其余依赖全部被打进了产物，照搬会让消费方
 * 白装几十个已在 bundle 里的包（其中还混着 less / unplugin-* 这类纯构建期依赖），
 * 且可能与宿主装出第二份实例。external 配置变了，这里自动跟着变。
 */
const buildDependencies = (
  distPath: string,
  rootPackage: Record<string, any>,
  peerDependencies: Record<string, string>,
): Record<string, string> => {
  const external = collectExternalImports(distPath);
  const declared: Record<string, string> = rootPackage.dependencies ?? {};

  const dependencies: Record<string, string> = {};
  const undeclared: string[] = [];

  for (const name of [...external].sort()) {
    if (name in peerDependencies) continue;
    if (name in declared) dependencies[name] = declared[name] as string;
    else undeclared.push(name);
  }

  // 产物外部引用了但根 package.json 没声明版本：消费方装不上，必须让人看见
  if (undeclared.length) {
    logWarn(
      `以下包被产物以裸导入方式引用，但根 package.json 未声明版本，无法写入 dependencies: ${undeclared.join(', ')}`,
    );
  }
  // peerDependencies 声明的包若在产物里一次裸导入都没有，工具只知道「没被外部化引用」，
  // 分不清是被打进了产物还是压根没用到 —— 扫描看到的只有引用形态，看不到 bundle 里有什么。
  // 所以如实给两可表述，让人自己去分辨；说死成「已打进产物」会把「peer 名单写多了」误报成打包配置错
  for (const name of Object.keys(peerDependencies)) {
    if (!external.has(name)) {
      logWarn(
        `peerDependencies 中的 ${name} 未被产物以裸导入引用：要么已被打进产物（宿主与产物会各持一份实例，检查打包配置的 external），要么压根没被 import（可从 peer 名单移除）`,
      );
    }
  }

  // 不能说这些包「已打进产物」：根 package.json 的 dependencies 里混着 less / unplugin-*
  // 这类纯构建期依赖，它们从来没被产物引用过，也就谈不上被打包进来。
  // 这里能确定的只有「不写入发布清单」，原因是两种（已打进产物 / 压根没被引用），不细分
  const peerCount = Object.keys(peerDependencies).filter((name) => name in declared).length;
  const omitted = Object.keys(declared).length - Object.keys(dependencies).length - peerCount;
  logInfo(
    `运行时依赖 ${Object.keys(dependencies).length} 个${
      omitted > 0
        ? `（根 package.json 声明的另 ${omitted} 个不写入发布清单：已打进产物，或属纯构建期依赖）`
        : ''
    }`,
  );

  return dependencies;
};

/**
 * 按目录派生 exports。
 *
 * rootEntry 指定时 `dist/<rootEntry>/index.js` 是 `"."`，且该目录必须存在（由调用方断言）。
 * 未指定时不硬造一个 `"."`：dist 根有 index.js 就指向它（单文件 lib 的常见形态），
 * 没有就只给各目录入口 —— 硬造一个不存在的入口只会让消费方 import 的时候才炸。
 */
const buildExports = (
  distPath: string,
  entries: string[],
  rootEntry: string | undefined,
): Record<string, unknown> => {
  const exportsField: Record<string, unknown> = {};

  if (rootEntry) exportsField['.'] = `./${rootEntry}/index.js`;
  else if (fs.existsSync(path.join(distPath, 'index.js'))) exportsField['.'] = './index.js';

  for (const name of entries) {
    if (name !== rootEntry) exportsField[`./${name}`] = `./${name}/index.js`;
  }
  if (fs.existsSync(path.join(distPath, 'style.css'))) exportsField['./style.css'] = './style.css';
  // 兜底：chunk 文件与静态资源的通配（Node 按模式特异性匹配，通配不会盖掉上面的精确入口）
  exportsField['./*'] = './*';

  return exportsField;
};

/**
 * 摊平一个 exports 值里的全部字符串目标。
 *
 * 值可能是裸字符串、条件对象（`{ types, import, require, default }`，还能再套一层），
 * 也可能是 npm 允许的回退数组，所以递归收。
 */
const collectExportTargets = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectExportTargets);
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectExportTargets);
  return [];
};

/**
 * exports 里的目标文件必须真的存在。
 *
 * 少掉一个公开子路径是破坏性变更，而消费方要到 import 的时候才炸 —— 这里是唯一还能
 * 在发布前拦住它的地方。派生出来的目标本就来自实际扫描，这道检查对它零成本通过；
 * 真正需要它的是 manifest.exports 函数覆盖的那条路径：那份清单是手写的，会跟着产物漂移。
 *
 * 只查以 `./` 开头且不含 `*` 的目标：裸包名是「导出转发到另一个包」的合法写法，
 * 通配则要到解析时才知道匹配到什么。`./package.json` 是本函数随后才写出的，放行。
 *
 * 缺失项一次性全部列出，命中第一个就停会让人修一个再撞一个。
 */
const assertExportTargetsExist = (
  distPath: string,
  distDir: string,
  exportsField: Record<string, unknown>,
): void => {
  const missing: string[] = [];

  for (const [subpath, value] of Object.entries(exportsField)) {
    for (const target of collectExportTargets(value)) {
      if (!target.startsWith('./') || target.includes('*')) continue;
      if (target === `./${MANIFEST_FILE}`) continue;
      if (!fs.existsSync(path.join(distPath, target))) missing.push(`"${subpath}" → ${target}`);
    }
  }

  if (missing.length) {
    throw new Error(
      `exports 指向的这些文件在 ${distDir} 里不存在，发出去会让消费方 import 时才炸:\n` +
        missing.map((item) => `  ${item}`).join('\n'),
    );
  }
};

/** 写入 dist/package.json 之后返回的清单 */
export interface Manifest extends Record<string, unknown> {
  name: string;
  version: string;
  exports: Record<string, unknown>;
  gitHead?: string;
}

/**
 * 写入 dist/package.json。构建后与「跳过构建直接改版本重发」两种场景共用。
 * 返回本次写入的 manifest。
 */
export const writeManifest = ({
  ctx,
  version,
}: {
  ctx: PublishContext;
  version: string;
}): Manifest => {
  const { projectRoot, distPath, config } = ctx;
  const rootPackage = readRootPackage(projectRoot);
  const entries = collectEntries(distPath);
  const { rootEntry } = config.manifest;

  if (rootEntry && !entries.includes(rootEntry)) {
    throw new Error(
      `${config.distDir}/${rootEntry}/index.js 不存在，无法生成 "." 入口，请确认构建是否成功`,
    );
  }

  const peerDependencies = buildPeerDependencies(rootPackage, config.manifest.peerDependencies);
  const dependencies = buildDependencies(distPath, rootPackage, peerDependencies);

  // 记录来源 commit：同一版本号被多个定制分支发布时便于回溯产物出处
  const meta = readBuildMeta(distPath);
  if (!meta) {
    logWarn(`未找到 ${config.distDir}/${BUILD_META_FILE}，gitHead 将留空（产物来源无从确认）`);
  }

  /**
   * 脏工作区打出的产物不对应任何 commit，因此 gitHead 加 -dirty 后缀
   *（git describe --dirty 的同一套写法）。
   *
   * 这里不另打告警：新构建时 checkGitState 已经在确认之前列过未提交改动，
   * 复用 dist 时 describeReusedDist 也在确认之前说过 —— 而这一步发生在确认之后，
   * 同一件事说两遍，且晚到了已经决定不了任何事的时候。
   *
   * 为什么不能干脆不写：npm 只在字段缺失时才补 gitHead（@npmcli/package-json 的 normalize:
   * `if (steps.includes('gitHead') && !data.gitHead)`），而 dist 就在仓库里，它会一路往上
   * 找到 .git 并填进当前 HEAD —— 省略只是把同一个误导换成由 npm 来写，还丢掉了控制权。
   */
  const gitHead = meta?.commit ? `${meta.commit}${meta.dirty ? '-dirty' : ''}` : '';

  const overridden = Boolean(config.manifest.exports);
  const exportsField = config.manifest.exports
    ? config.manifest.exports({ projectRoot, distPath, version, entries })
    : buildExports(distPath, entries, rootEntry);
  assertExportTargetsExist(distPath, config.distDir, exportsField);

  const manifest: Manifest = {
    name: rootPackage.name,
    version,
    type: 'module',
    exports: exportsField,
    // extra 在核心字段之后合并：main / module / types 这类由业务仓库决定的字段从这里进来
    ...config.manifest.extra,
    ...(Object.keys(peerDependencies).length ? { peerDependencies } : {}),
    ...(Object.keys(dependencies).length ? { dependencies } : {}),
    ...(gitHead ? { gitHead } : {}),
  };

  fs.writeFileSync(path.join(distPath, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  // 溯源信息只服务于本地「复用 dist 发布」，不该跟着包发给消费方（内部分支名会一起泄出去）
  fs.writeFileSync(path.join(distPath, NPM_IGNORE_FILE), `${BUILD_META_FILE}\n`);
  logOk(`已生成 ${config.distDir}/package.json (${manifest.name}@${version})`);
  // 按最终写出的 exports 打，而不是按目录派生的 entries：manifest.exports 覆盖时那两者对不上，
  // 日志报的却是一份根本没被写进清单的名单
  const subpaths = Object.keys(exportsField).filter((key) => !key.includes('*'));
  const wildcards = Object.keys(exportsField).length - subpaths.length;
  logInfo(
    `exports 入口 ${subpaths.length} 个${overridden ? '（由 manifest.exports 覆盖）' : ''}: ` +
      `${subpaths.join(', ') || '（无）'}${wildcards ? `，另有 ${wildcards} 条通配` : ''}`,
  );

  return manifest;
};
