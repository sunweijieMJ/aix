/**
 * 发布前体检：对所有待发布包运行 publint + attw。
 *
 * - publint：校验 package.json 字段自洽性（exports/main/module/types 指向的文件是否存在、
 *   格式与扩展名和 type 字段是否匹配、files 有无遗漏）。
 * - attw：把包放进 node10 / node16-from-CJS / node16-from-ESM / bundler 四种模块解析模式，
 *   分别验证类型能否被正确解析。这是对手写 dual-package 处理（.d.cts 派生、stripStyleImports、
 *   emitStyleDts）的回归防护——那部分逻辑微妙且没有任何单测覆盖。
 *
 * - 自检（本文件实现）：补 publint / attw 的四处盲区，它们都只验「声明自洽」而不验「真的跑得动」。
 *   1. 通配 exports 展开后能否真的解析（attw 整体跳过通配 entrypoint）；
 *   2. `files` 声明的资源目录是否真实存在且非空（publint 只看代码入口）；
 *   3. CJS 入口能否真的被 require（两者都不会执行一次）；
 *   4. ESM 入口能否真的被 import（同上，且这是浏览器侧的主消费路径）。
 *   前三条各自对应一个曾经全绿放行、却在消费端直接崩掉的真实故障。
 *
 * 门禁策略：publint 的 error、attw 的 problems 与自检问题会让本命令失败；
 * warning / suggestion / note 只报告不阻断。传 --strict 可把 warning 一并升级为失败
 * （note 不受 --strict 影响，见 PackageReport.notes）。
 *
 * 用法：
 *   pnpm lint:publish            # 报告全部，仅 error 阻断
 *   pnpm lint:publish --strict   # warning 也阻断（CI 用的就是这个，见下）
 *
 * CI 的 check-quality.yml 与 release-packages.yml 均以 `--strict` 调用，
 * 故本地不带 --strict 跑通不代表 CI 会通过——warning 也得清干净。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import chalk from 'chalk';
import { glob } from 'glob';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';

/** 待检查的工作区目录（apps/ 不发布，排除在外）。 */
const WORKSPACE_GLOBS = [
  'packages/*/package.json',
  'kit/*/package.json',
  'internal/*/package.json',
];

const STRICT = process.argv.includes('--strict');

interface PackageReport {
  name: string;
  dir: string;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  attwProblems: string[];
  /** 本文件自带的四条自检（见 selfCheck）报出的问题，与 error 同等阻断 */
  selfCheckProblems: string[];
  /**
   * 自检发现、但属于**已知设计取舍**而非缺陷的情况，任何模式下都不阻断。
   *
   * 单独一个桶而不是塞进 suggestions：suggestions 是 publint 的产出，混进来会分不清来源；
   * 也不能用 warnings，因为 CI 跑 `--strict` 会把 warning 升级成失败——那等于替维护者做了
   * 「这个取舍必须改」的决定。note 的定位是「让盲区可见」，不是「逼人动手」。
   */
  notes: string[];
  /** 跳过原因，非空时其余字段无意义 */
  skipped?: string;
}

/** 自检产出：problems 阻断，notes 仅提示（见 PackageReport.notes）。 */
interface SelfCheckResult {
  problems: string[];
  notes: string[];
}

/** 被视为「源文件扩展名」的中缀——它们不该出现在对外暴露的 exports 子路径里。 */
const SOURCE_EXTENSION_RE = /\.(?:vue|ts|tsx|jsx)$/;

/**
 * 把冒烟测试 stderr 里的绝对路径压成可读短形式。
 *
 * 原样打出来有两个问题：含构建机用户名（`C:\Users\<名字>\...`），以及 pnpm 的内容寻址目录
 * （`.pnpm/@vue-flow+minimap@1.5.4_@vu_ba8361d0.../node_modules/...`）——既刷屏又在别人
 * 机器上对不上号。取最后一段 `node_modules/` 之后的部分即可还原成消费方认得的包内路径。
 *
 * @param p - 绝对路径
 * @returns 短路径
 */
function shortenPath(p: string): string {
  const posix = p.split('\\').join('/');
  const marker = posix.lastIndexOf('node_modules/');
  if (marker !== -1) return posix.slice(marker + 'node_modules/'.length);

  const rel = path.relative(process.cwd(), p);
  return rel && !rel.startsWith('..') ? rel.split(path.sep).join('/') : posix;
}

/**
 * 用于在 CJS 冒烟测试的 stderr 里识别「require 到样式文件」。
 *
 * 后面的边界必须显式列出分隔符而非用 `\b`：`\b` 会让 `.less` 命中 `foo.less.js`
 * 这种正常的 JS 文件名，把无关失败误判成样式打包问题。
 */
const STYLE_FILE_RE = /\.(?:css|scss|sass|less)(?=[:'")\s]|$)/;

/**
 * 「声明成 CJS 的入口其实是 ESM / 子路径导出缺失」这一类打包故障的 stderr 特征。
 *
 * 必须单列而不能落进「预期内的宿主 API 缺失」那一桶：它和样式 require 一样是纯粹的产物
 * 缺陷，且恰好是 attw 覆盖不到的部分——attw 只解析类型，不会发现 `lib/index.cjs` 里
 * 躺着 `import` 语句。Node 22 起 require(ESM) 已默认可用，故 ERR_REQUIRE_ESM 变少，
 * 但 `.cjs` 里残留 import 语法仍会以 SyntaxError 形式暴露，两种都要认。
 */
const BROKEN_CJS_RE =
  /ERR_REQUIRE_ESM|Cannot use import statement outside a module|ERR_PACKAGE_PATH_NOT_EXPORTED|ERR_UNSUPPORTED_DIR_IMPORT|ERR_REQUIRE_CYCLE_MODULE/;

/**
 * 列出 npm tarball 内的全部文件路径（已去掉统一的 `package/` 前缀）。
 *
 * 手写 tar 解析而不引第三方库：格式本身极简（512 字节定长头 + 512 对齐的数据块），
 * 而为一条校验新增依赖并不划算。只读文件名与长度，不解压内容。
 *
 * @param tarballPath - .tgz 路径
 * @returns 包内相对路径列表
 */
function listTarballEntries(tarballPath: string): string[] {
  const buffer = zlib.gunzipSync(fs.readFileSync(tarballPath));
  const entries: string[] = [];

  for (let offset = 0; offset + 512 <= buffer.length;) {
    const header = buffer.subarray(offset, offset + 512);
    // 连续两个全零块表示归档结束；单个空文件名同样视为结束
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (name === '') break;

    // ustar 的长路径拆成 prefix(345..500) + name，需要拼回去
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const full = prefix ? `${prefix}/${name}` : name;

    const size = parseInt(
      header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim(),
      8,
    );
    const typeFlag = String.fromCharCode(header[156] ?? 0);

    // '0' / '\0' 为普通文件，其余（目录 '5'、长名扩展 'L' 等）不计入
    if (typeFlag === '0' || typeFlag === '\0') {
      entries.push(full.replace(/^package\//, ''));
    }

    offset += 512 + Math.ceil((Number.isNaN(size) ? 0 : size) / 512) * 512;
  }

  return entries;
}

/**
 * 把 exports 的通配目标（如 `./es/*.vue.js`）在磁盘上展开，返回 `*` 实际匹配到的值。
 *
 * @param dir - 包目录
 * @param target - 含单个 `*` 的相对目标路径
 * @returns `*` 位置的实际取值列表
 */
async function expandWildcardTarget(dir: string, target: string): Promise<string[]> {
  const relative = target.replace(/^\.\//, '');
  const starIndex = relative.indexOf('*');
  if (starIndex === -1) return [];

  const prefix = relative.slice(0, starIndex);
  const suffix = relative.slice(starIndex + 1);

  const files = await glob(`${prefix}**`, { cwd: dir, nodir: true });
  return files
    .map((file) => file.split(path.sep).join('/'))
    .filter(
      (file) => file.startsWith(prefix) && file.endsWith(suffix) && file.length > prefix.length,
    )
    .map((file) => file.slice(prefix.length, file.length - suffix.length));
}

/**
 * 自检 1：通配 exports 的真实可解析性。
 *
 * attw 会**整体跳过**通配 entrypoint（不展开 glob），publint 也只看字段自洽，
 * 于是「`"./*": "./es/*.js"` 但产物其实叫 `Add.vue.js`」这种错误两边都查不出来——
 * 消费方 `import '@aix/icons/General/Add'` 直接 ERR_MODULE_NOT_FOUND。
 *
 * 两项断言：
 * 1. 通配至少能展开出一个真实文件（否则整条导出是死的）；
 * 2. `*` 的取值里不得残留 `.vue` / `.ts` 等源文件扩展名——那是把构建产物的命名细节
 *    泄漏成了公开 API，消费方必须写出 `.../Add.vue` 才能引到，不符合导出意图；
 * 3. 抽样一个取值做 `import.meta.resolve` 实解析，端到端确认它真的能被 Node 解析出来。
 *
 * @param dir - 包目录
 * @param pkgJson - 解析后的 package.json
 * @returns 问题描述数组
 */
async function checkWildcardExports(
  dir: string,
  pkgJson: Record<string, unknown>,
): Promise<string[]> {
  const exportsField = pkgJson.exports;
  if (!exportsField || typeof exportsField !== 'object') return [];

  const problems: string[] = [];
  const pkgName = String(pkgJson.name ?? '');

  for (const [key, value] of Object.entries(exportsField)) {
    if (!key.includes('*')) continue;

    // 收集该 key 下所有条件分支里含 `*` 的目标路径
    const targets: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'string') {
        if (node.includes('*')) targets.push(node);
        return;
      }
      if (node && typeof node === 'object') for (const nested of Object.values(node)) walk(nested);
    };
    walk(value);

    /** 各 target 的展开结果，供下面抽样复用——icons 的 es/ 有近 1800 个文件，不重复 glob */
    const expansions = new Map<string, string[]>();

    for (const target of targets) {
      const stars = await expandWildcardTarget(dir, target);
      expansions.set(target, stars);

      if (stars.length === 0) {
        problems.push(`通配导出 "${key}" → ${target} 在产物中无任何匹配文件`);
        continue;
      }

      const leaky = stars.filter((star) => SOURCE_EXTENSION_RE.test(star));
      if (leaky.length > 0) {
        problems.push(
          `通配导出 "${key}" → ${target} 的 * 取值残留源文件扩展名` +
            `（如 ${leaky[0]}），消费方须写出该后缀才能引入：${leaky.length} 处`,
        );
      }
    }

    // 抽样实解析：只对 `./*` 这类「裸通配」做，带前缀的通配拼子路径规则复杂，留给上面的静态断言。
    //
    // 必须另起一个 cwd 在包目录内的 Node 进程，靠**自引用**（package.json 有 exports 时，
    // 包可以用自己的名字 import 自己）来解析。不能在本脚本里直接 import.meta.resolve：
    // 本脚本跑在仓库根，而根 node_modules 下并没有 @aix/*（它们只被各消费包依赖），
    // 那样解析必然失败，报出的是「找不到包」而非「exports 映射错」——纯误报。
    if (key === './*' && pkgName) {
      // 必须从**运行时** target 取样，不能用 targets[0]——条件对象里 types 排在最前，
      // 而实解析走的是 import/default 分支。拿 .d.ts 的取值去解析 .js，一旦两者文件集
      // 不完全重合就会报出与实际成因无关的失败。
      const runtimeTarget = targets.find((t) => !/\.d\.[cm]?ts$/.test(t)) ?? targets[0];
      const sample = (expansions.get(runtimeTarget ?? '') ?? []).find(
        (star) => !SOURCE_EXTENSION_RE.test(star),
      );
      if (sample) {
        const specifier = `${pkgName}/${sample}`;
        // 光调 import.meta.resolve 是不够的：对**通配**导出它只做字符串代入、不 stat 文件，
        // 连 `@aix/icons/Totally/Bogus` 这种纯虚构路径都会照样返回 URL（实测）。
        // 必须自己确认解析结果真的落在一个存在的文件上，否则这一步只是虚假的安全感——
        // 最初那个「`./es/*.js` 但产物叫 `Add.vue.js`」的缺陷正是这样漏过去的。
        const probe = `
          import { existsSync } from 'node:fs';
          import { fileURLToPath } from 'node:url';
          const resolved = import.meta.resolve(${JSON.stringify(specifier)});
          if (!existsSync(fileURLToPath(resolved))) {
            throw new Error('resolved to a missing file: ' + resolved);
          }
        `;
        try {
          execFileSync(process.execPath, ['--input-type=module', '-e', probe], {
            cwd: dir,
            stdio: 'pipe',
            timeout: 30_000,
          });
        } catch {
          problems.push(`通配导出 "${key}" 实解析失败：import '${specifier}' 解析不到真实文件`);
        }
      }
    }
  }

  return problems;
}

/**
 * 自检 2：`files` 里声明的资源目录必须真实存在且非空。
 *
 * publint 只校验 exports/main/types 指向的**代码**文件，不会过问 `files` 里额外声明的
 * 资源目录。`@aix/mcp-server` 就栽在这里：`files:["dist","data"]`，但 data/ 被 gitignore、
 * 且当时不由 build 生成 —— CI 干净检出打出来的包缺全部数据文件，服务器启动即崩，
 * 而 publint + attw 全绿。
 *
 * 判定依据是 **tarball 的真实内容**而非工作区磁盘：`files` 与 `.npmignore`、嵌套 ignore
 * 规则的相互作用相当微妙，「磁盘上有」不等于「会被发出去」。直接问 `pnpm pack` 的产物，
 * 校验的就是真正要发布的那份负载。
 *
 * @param pkgJson - 解析后的 package.json
 * @param tarballEntries - tarball 内的路径列表（已去掉 `package/` 前缀）
 * @returns 问题描述数组
 */
function checkFilesEntries(
  pkgJson: Record<string, unknown>,
  tarballEntries: string[] | null,
): string[] {
  const files = pkgJson.files;
  if (!Array.isArray(files) || !tarballEntries) return [];

  const problems: string[] = [];
  for (const entry of files) {
    if (typeof entry !== 'string') continue;
    // 含 glob 的条目按模式匹配，缺失不代表错误
    if (/[*?[\]{}!]/.test(entry)) continue;

    const normalized = entry.replace(/^\.?\//, '').replace(/\/$/, '');
    const included = tarballEntries.some(
      (file) => file === normalized || file.startsWith(`${normalized}/`),
    );
    if (!included) {
      problems.push(
        `files 声明了 "${entry}"，但 pnpm pack 产出的 tarball 里没有它（发布后该内容会整体缺失）`,
      );
    }
  }
  return problems;
}

/**
 * 自检 3：声明了 CJS 入口的包，其入口必须真的 require 得动。
 *
 * 起因：三方样式的副作用导入被原样保留成 `require('x.css')`，Node 会把 .css 当 JS 解析并抛
 * `SyntaxError: Unexpected token '.'`，导致 video / flow-graph / rich-text-editor /
 * pdf-viewer 的 `lib/` 入口开箱即坏 —— 而 lib/ 存在的唯一理由就是 CJS/SSR 消费。
 * publint 只确认文件存在，attw 只做类型解析，都不会真的执行一次。
 *
 * **只把「打包问题」判为失败**：组件库多为浏览器专用，在 Node 里 require 时因缺
 * DOMMatrix / window 之类的宿主 API 而报 ReferenceError 是预期内的，不能算作缺陷。
 * 故仅当错误指向非 JS 文件（样式）、模块解析失败、或产物根本不是可用的 CJS
 * （见 BROKEN_CJS_RE）时才阻断。
 *
 * @param dir - 包目录
 * @param pkgJson - 解析后的 package.json
 * @returns 问题描述数组
 */
function checkCjsEntryLoads(dir: string, pkgJson: Record<string, unknown>): string[] {
  if (isEsmOnly(pkgJson)) return [];

  const exportsField = pkgJson.exports as Record<string, unknown> | undefined;
  const root = exportsField?.['.'] as Record<string, unknown> | undefined;
  const requireBranch = root?.require as Record<string, unknown> | string | undefined;
  const entry =
    typeof requireBranch === 'string'
      ? requireBranch
      : typeof requireBranch?.default === 'string'
        ? requireBranch.default
        : typeof pkgJson.main === 'string'
          ? pkgJson.main
          : undefined;

  if (!entry) return [];

  const full = path.resolve(dir, entry);
  if (!fs.existsSync(full)) return [];

  try {
    // 必须设超时：本函数是 CI 门禁的一环，而 require 会真的执行模块顶层代码。
    // 万一某个入口在加载期起了定时器/服务器（或依赖如此），没有超时会让整条流水线挂死。
    execFileSync(process.execPath, ['-e', `require(${JSON.stringify(full)})`], {
      stdio: 'pipe',
      cwd: dir,
      timeout: 30_000,
    });
    return [];
  } catch (error) {
    // 超时被 kill 时 signal 为 SIGTERM，stderr 多半是空的，不能按「通过」处理
    if ((error as { signal?: string }).signal) {
      return [`CJS 入口 ${entry} require 超时（30s 未完成加载）`];
    }
    const stderr = String((error as { stderr?: Buffer }).stderr ?? '');

    if (STYLE_FILE_RE.test(stderr)) {
      const hit = stderr.match(/[^\s'"]+\.(?:css|scss|sass|less)/)?.[0];
      return [
        `CJS 入口 ${entry} require 失败：加载到了非 JS 文件 ${hit ? shortenPath(hit) : '样式文件'}`,
      ];
    }
    if (/MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|Cannot find module/.test(stderr)) {
      const hit = stderr.match(/Cannot find module '([^']+)'/)?.[1];
      return [`CJS 入口 ${entry} require 失败：找不到模块 ${hit ? shortenPath(hit) : '?'}`];
    }
    if (BROKEN_CJS_RE.test(stderr)) {
      const reason = stderr.match(BROKEN_CJS_RE)?.[0] ?? '?';
      return [`CJS 入口 ${entry} require 失败：产物并非可用的 CJS（${reason}）`];
    }
    // 其余（浏览器宿主 API 缺失等）属预期，不阻断
    return [];
  }
}

/**
 * 自检 4：声明了 ESM 入口的包，其入口必须真的 import 得动。
 *
 * 为什么 CJS 冒烟不够：`es/` 才是浏览器/打包器侧的主消费路径，文件数是 `lib/` 的两倍，
 * 而且它独有一批只作用于 ESM 的构建步骤——preserveModules 的多 chunk 图、
 * dropOrphanChunks 的按引用图删除。**一旦 dropOrphanChunks 误删了一个真被引用的 chunk，
 * 现有检查没有任何一项会发现**：publint 只看入口文件在不在，attw 只解析类型，
 * CJS 冒烟走的是另一套产物。这条就是补这个洞。
 *
 * 与 CJS 那条一样，只把「打包问题」判为失败，宿主 API 缺失属预期。但多一类特殊处理：
 * **样式副作用导入导致的 ERR_UNKNOWN_FILE_EXTENSION 记为 note 而非 problem**。
 * `es/` 保留 `import 'x.css'` 是既定取舍（打包器消费方靠它收集 CSS，剥掉就没样式了，
 * 参见根 rollup.config.js 的 stripStyleRequires 注释），代价是不经打包器的 Node 原生
 * ESM/SSR 加载不了这些包。那是设计后果不是缺陷，不该由本门禁替维护者判死刑——
 * 但也不该像现在这样完全不可见，故降级成提示。
 *
 * @param dir - 包目录
 * @param pkgJson - 解析后的 package.json
 * @returns 阻断问题与提示
 */
function checkEsmEntryLoads(dir: string, pkgJson: Record<string, unknown>): SelfCheckResult {
  const empty: SelfCheckResult = { problems: [], notes: [] };
  if (isNotAJsPackage(pkgJson)) return empty;

  const exportsField = pkgJson.exports as Record<string, unknown> | undefined;
  const root = exportsField?.['.'] as Record<string, unknown> | string | undefined;
  const importBranch =
    typeof root === 'string'
      ? root
      : (root?.import as Record<string, unknown> | string | undefined);
  const entry =
    typeof importBranch === 'string'
      ? importBranch
      : typeof importBranch?.default === 'string'
        ? importBranch.default
        : typeof pkgJson.module === 'string'
          ? pkgJson.module
          : pkgJson.type === 'module' && typeof pkgJson.main === 'string'
            ? pkgJson.main
            : undefined;

  if (!entry) return empty;

  const full = path.resolve(dir, entry);
  if (!fs.existsSync(full)) return empty;

  try {
    // 必须走 file:// URL：Windows 下 `import("C:\...")` 会被当成裸说明符解析而失败。
    // 超时理由同 checkCjsEntryLoads；30s 是为负载留的余量——实测正常包 0.1~2s，
    // 但机器上并行跑构建时偶发过 10s 以上，阈值太紧会假报超时。
    execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(full).href)})`],
      { stdio: 'pipe', cwd: dir, timeout: 30_000 },
    );
    return empty;
  } catch (error) {
    if ((error as { signal?: string }).signal) {
      return { problems: [`ESM 入口 ${entry} import 超时（30s 未完成加载）`], notes: [] };
    }
    const stderr = String((error as { stderr?: Buffer }).stderr ?? '');

    if (/ERR_UNKNOWN_FILE_EXTENSION/.test(stderr) && STYLE_FILE_RE.test(stderr)) {
      const hit = stderr.match(/[^\s'"]+\.(?:css|scss|sass|less)/)?.[0];
      return {
        problems: [],
        notes: [
          `ESM 入口 ${entry} 无法被 Node 原生 import：加载到样式文件 ` +
            `${hit ? shortenPath(hit) : '样式文件'}\n` +
            `           （es/ 保留样式副作用导入是既定取舍，仅影响不经打包器的 Node ESM/SSR；` +
            `如需支持，可给 exports 增加 node 条件指向 lib/）`,
        ],
      };
    }
    if (/ERR_MODULE_NOT_FOUND|Cannot find module|ERR_UNSUPPORTED_DIR_IMPORT/.test(stderr)) {
      // ESM 的报文是 `Cannot find module 'C:\...\x.js' imported from ...`，取被找的那个
      const hit = stderr.match(/Cannot find module '([^']+)'/)?.[1];
      return {
        problems: [`ESM 入口 ${entry} import 失败：找不到模块 ${hit ? shortenPath(hit) : '?'}`],
        notes: [],
      };
    }
    if (/SyntaxError|ERR_PACKAGE_PATH_NOT_EXPORTED|ERR_INVALID_MODULE_SPECIFIER/.test(stderr)) {
      const reason = stderr.match(/SyntaxError: .{0,80}|ERR_[A-Z_]+/)?.[0] ?? '?';
      return {
        problems: [`ESM 入口 ${entry} import 失败：产物并非可用的 ESM（${reason}）`],
        notes: [],
      };
    }
    // 其余（浏览器宿主 API 缺失等）属预期，不阻断
    return empty;
  }
}

/**
 * 跑本文件自带的四条自检 —— 它们专补 publint / attw 的盲区。
 * @param dir - 包目录
 * @param pkgJson - 解析后的 package.json
 * @param tarballEntries - tarball 内的路径列表；打包失败时为 null，届时跳过依赖它的那条检查
 * @returns 阻断问题与提示
 */
async function selfCheck(
  dir: string,
  pkgJson: Record<string, unknown>,
  tarballEntries: string[] | null,
): Promise<SelfCheckResult> {
  const esm = checkEsmEntryLoads(dir, pkgJson);
  return {
    problems: [
      ...(await checkWildcardExports(dir, pkgJson)),
      ...checkFilesEntries(pkgJson, tarballEntries),
      ...checkCjsEntryLoads(dir, pkgJson),
      ...esm.problems,
    ],
    notes: esm.notes,
  };
}

/**
 * 从 exports 中挑出「纯 CSS 副作用入口」的子路径。
 *
 * attw 会把 `./style` 这类入口当作 JS 模块解析，从而报出 NoResolution / CJSResolvesToESM，
 * 但它们实际指向 .css 文件、只用于 `import '@aix/xxx/style'` 副作用导入，属于误报，需排除。
 *
 * @param pkgJson - 解析后的 package.json
 * @returns 需要传给 attw --exclude-entrypoints 的子路径列表
 */
function collectCssEntrypoints(pkgJson: Record<string, unknown>): string[] {
  const found = new Set<string>();

  const walk = (key: string, value: unknown): void => {
    if (typeof value === 'string') {
      if (value.endsWith('.css')) found.add(key);
      return;
    }
    if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) walk(key, nested);
    }
  };

  const exportsField = pkgJson.exports;
  if (!exportsField || typeof exportsField !== 'object') return [];

  for (const [key, value] of Object.entries(exportsField)) {
    // 主入口不可能是纯 CSS；通配与 package.json 由 attw 自行跳过
    if (key === '.' || key === './package.json' || key.includes('*')) continue;
    walk(key, value);
  }
  return [...found];
}

/**
 * 判断包是否为「有意的 ESM-only」：不提供任何 CJS 入口。
 *
 * 两种写法都要覆盖：
 * - 有 exports：其中不含 require 条件（kit/ 下大部分包）；
 * - 无 exports：type=module 且 main 指向 ESM（如 @aix/mcp-server）。
 *
 * @param pkgJson - 解析后的 package.json
 * @returns 是否 ESM-only
 */
function isEsmOnly(pkgJson: Record<string, unknown>): boolean {
  const exportsField = pkgJson.exports;
  if (exportsField && typeof exportsField === 'object') {
    return !JSON.stringify(exportsField).includes('"require"');
  }
  return pkgJson.type === 'module';
}

/**
 * attw 是否根本不适用于该包：既无 exports、也无 main/types，说明它不是 JS 包
 * （如 @kit/typescript-config 只发布 tsconfig 预设 JSON）。
 *
 * @param pkgJson - 解析后的 package.json
 * @returns 是否应跳过 attw
 */
function isNotAJsPackage(pkgJson: Record<string, unknown>): boolean {
  return !pkgJson.exports && !pkgJson.main && !pkgJson.types;
}

/**
 * 判断 problem 是否属于「设计选择的必然结果」而非缺陷。
 *
 * 按 kind + resolutionKind 精确过滤，而不是用 attw 的 --ignore-rules 全局屏蔽——
 * 后者会连 node16-esm / bundler 下的真实解析失败一并掩盖。
 *
 * @param problem - attw 报出的单条 problem
 * @param pkgJson - 解析后的 package.json
 * @returns 是否属于预期内、应被忽略
 */
function isExpectedProblem(
  problem: { kind: string; entrypoint?: string; resolutionKind?: string },
  pkgJson: Record<string, unknown>,
): boolean {
  // ESM-only 包：CJS 消费方 require() 落到 ESM 上，是「不支持 CJS」的必然结果
  if (problem.kind === 'CJSResolvesToESM' && isEsmOnly(pkgJson)) return true;

  // node10 早于 exports 字段存在，完全不解析它，故声明了 exports 的包在 node10 下
  // 解析不到子路径属预期。node16 / bundler 下的同类问题仍会照常报出。
  //
  // 主入口（'.'）不在豁免范围内：各包仍通过 main/types 为 node10 消费方提供主入口，
  // 若这两个字段被删掉或指错，node10 会彻底失效——那是真实回归，必须报出来。
  const isNode10SubpathFallout =
    problem.resolutionKind === 'node10' &&
    problem.entrypoint !== '.' &&
    (problem.kind === 'NoResolution' || problem.kind === 'UntypedResolution');
  return isNode10SubpathFallout && Boolean(pkgJson.exports);
}

/**
 * 把 attw 的 problem 渲染成可定位的一行。
 *
 * 不同 kind 携带的字段不同：NoResolution / UntypedResolution 等带 entrypoint +
 * resolutionKind，而 FalseESM / FalseCJS 只带 typesFileName + implementationFileName。
 * 若统一按前者取值，后者会退化成 `FalseESM @ ? (unknown)`——恰恰在门禁真正拦下
 * 回归时丢掉定位信息。
 *
 * @param kind - problem 类型
 * @param problem - attw 报出的单条 problem
 * @returns 单行描述
 */
function describeProblem(kind: string, problem: Record<string, unknown>): string {
  const parts: string[] = [kind];
  if (typeof problem.entrypoint === 'string') parts.push(`@ ${problem.entrypoint}`);
  if (typeof problem.resolutionKind === 'string') parts.push(`(${problem.resolutionKind})`);
  if (typeof problem.typesFileName === 'string') parts.push(`types: ${problem.typesFileName}`);
  if (typeof problem.implementationFileName === 'string') {
    parts.push(`impl: ${problem.implementationFileName}`);
  }
  return parts.join(' ');
}

/**
 * 为传给 shell 的路径加引号。
 *
 * Windows 上必须用 shell:true 才能走到 pnpm/attw 的 .CMD 垫片，而 shell:true 会把
 * argv 重新拼成一行交给 shell 解析——os.tmpdir() 形如 C:\Users\<用户名>\AppData\...，
 * 用户名含空格时路径会被词法拆分，产物写到别处，脚本只会报「未产出 tarball」。
 *
 * @param value - 原始路径
 * @returns 带引号的路径
 */
function quoteArg(value: string): string {
  return `"${value}"`;
}

/** 打包结果：成功时 tarball 为绝对路径、error 为 null，失败时反之。 */
interface PackResult {
  tarball: string | null;
  error: string | null;
}

/**
 * 把包打成 tarball 交给回调，用完清理临时目录。
 *
 * 用 `pnpm pack` 而非 attw 自带的 `--pack`：后者内部调用 `npm pack`，
 * 而 npm 不认识 workspace:^ 协议，会打出错误的依赖版本。
 *
 * 打包结果由 attw 与 files 自检共用 —— 每个包只 pack 一次。
 *
 * 打包失败**必须降级成该包的一条问题，不能让异常逃出去**：本命令要把 28 个包全部体检完
 * 再统一报告，一个包 pack 挂掉就冒到 main().catch 的话，输出只剩一个裸栈——既看不出是哪个包，
 * 后面的包也全不检查了。
 *
 * @param dir - 包目录
 * @param fn - 拿到打包结果后的处理逻辑
 * @returns 回调的返回值
 */
function withPackedTarball<T>(dir: string, fn: (packed: PackResult) => T): T {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aix-pack-'));
  try {
    try {
      execFileSync('pnpm', ['pack', '--pack-destination', quoteArg(tmpDir)], {
        cwd: dir,
        stdio: 'pipe',
        shell: true,
      });
    } catch (error) {
      const stderr = String((error as { stderr?: Buffer }).stderr ?? '').trim();
      return fn({
        tarball: null,
        error: `pnpm pack 执行失败：${stderr.split('\n').at(-1) ?? (error as Error).message}`,
      });
    }

    const tarball = fs.readdirSync(tmpDir).find((f) => f.endsWith('.tgz'));
    if (!tarball) return fn({ tarball: null, error: 'pnpm pack 未产出 tarball' });

    return fn({ tarball: path.join(tmpDir, tarball), error: null });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * 用 attw 检查类型解析，返回 problems 的可读描述。
 *
 * 打包失败（tarball 为 null）时直接返回空：失败原因已由 withPackedTarball 记成一条
 * 自检问题，这里再报一遍只会重复刷屏。
 *
 * @param tarball - 已打好的 tarball 路径，null 表示打包失败
 * @param pkgJson - 解析后的 package.json
 * @returns problems 描述数组，空数组表示通过
 */
function runAttw(tarball: string | null, pkgJson: Record<string, unknown>): string[] {
  if (isNotAJsPackage(pkgJson) || !tarball) return [];

  const excluded = collectCssEntrypoints(pkgJson);
  const args = [quoteArg(tarball), '--format', 'json'];
  if (excluded.length > 0) args.push('--exclude-entrypoints', ...excluded);

  // attw 发现问题时以非 0 退出，故失败不代表执行异常，需读取 stdout
  let stdout: string;
  try {
    stdout = execFileSync('pnpm', ['exec', 'attw', ...args], {
      encoding: 'utf8',
      shell: true,
    });
  } catch (error) {
    stdout = (error as { stdout?: string }).stdout ?? '';
    if (!stdout) return [`attw 执行失败：${(error as Error).message}`];
  }

  // attw 崩溃或改了输出格式时 stdout 不是 JSON。同 withPackedTarball 的理由：
  // 必须降级成该包的一条 problem，不能让 JSON.parse 的异常中断整轮体检。
  let problems: Record<string, Record<string, unknown>[]>;
  try {
    problems = (JSON.parse(stdout).problems ?? {}) as Record<string, Record<string, unknown>[]>;
  } catch {
    return [`attw 输出无法解析为 JSON（前 200 字符）：${stdout.slice(0, 200).trim()}`];
  }

  return Object.entries(problems).flatMap(([kind, items]) =>
    items
      .filter(
        (item) =>
          !isExpectedProblem(
            {
              kind,
              entrypoint: item.entrypoint as string | undefined,
              resolutionKind: item.resolutionKind as string | undefined,
            },
            pkgJson,
          ),
      )
      .map((item) => describeProblem(kind, item)),
  );
}

/**
 * 对单个包运行 publint + attw。
 * @param pkgJsonPath - package.json 路径
 * @returns 该包的检查报告
 */
async function checkPackage(pkgJsonPath: string): Promise<PackageReport> {
  const dir = path.dirname(pkgJsonPath);
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as Record<string, unknown>;
  const name = String(pkgJson.name ?? dir);
  const report: PackageReport = {
    name,
    dir,
    errors: [],
    warnings: [],
    suggestions: [],
    attwProblems: [],
    selfCheckProblems: [],
    notes: [],
  };

  if (pkgJson.private === true) {
    return { ...report, skipped: 'private' };
  }

  const { messages } = await publint({ pkgDir: dir, level: 'suggestion' });
  for (const message of messages) {
    const text = formatMessage(message, pkgJson) ?? message.code;
    const bucket =
      message.type === 'error'
        ? report.errors
        : message.type === 'warning'
          ? report.warnings
          : report.suggestions;
    bucket.push(text);
  }

  // pack 一次，attw 与 files 自检共用同一份 tarball
  const packed = withPackedTarball(dir, ({ tarball, error }) => {
    // tar 解析同样不能让异常逃逸（理由见 withPackedTarball）：entries 为 null 时
    // checkFilesEntries 会自动跳过，失败原因单独记成一条问题，避免静默失去这项覆盖。
    let entries: string[] | null = null;
    let entriesError: string | null = null;
    if (tarball) {
      try {
        entries = listTarballEntries(tarball);
      } catch (err) {
        entriesError = `tarball 解析失败，files 自检已跳过：${(err as Error).message}`;
      }
    }
    return {
      problems: [error, entriesError].filter((m): m is string => m !== null),
      attwProblems: runAttw(tarball, pkgJson),
      entries,
    };
  });

  const self = await selfCheck(dir, pkgJson, packed.entries);
  report.attwProblems = packed.attwProblems;
  report.selfCheckProblems = [...packed.problems, ...self.problems];
  report.notes = self.notes;
  return report;
}

/**
 * 折叠重复条目为「文案 ×次数」，避免 ai-chat 那种 72 条同类警告刷屏。
 * @param items - 原始条目
 * @returns 折叠后的条目
 */
function collapse(items: string[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts].map(([text, n]) => (n > 1 ? `${text}  ${chalk.dim(`×${n}`)}` : text));
}

async function main(): Promise<void> {
  console.log(chalk.cyan('🔍 发布前体检 (publint + attw)\n'));

  const pkgJsonPaths = (await Promise.all(WORKSPACE_GLOBS.map((g) => glob(g)))).flat().sort();
  const reports: PackageReport[] = [];

  for (const pkgJsonPath of pkgJsonPaths) {
    reports.push(await checkPackage(pkgJsonPath));
  }

  let failed = false;

  for (const report of reports) {
    // 跳过也要留痕：静默 continue 会让误标 private 的包从报告里凭空消失且无迹可循
    if (report.skipped) {
      console.log(`${chalk.dim('-')} ${chalk.dim(`${report.name}（已跳过：${report.skipped}）`)}`);
      continue;
    }

    const blocking = [
      ...report.errors,
      ...report.attwProblems,
      ...report.selfCheckProblems,
      ...(STRICT ? report.warnings : []),
    ];
    const hasAnything =
      blocking.length > 0 ||
      report.warnings.length > 0 ||
      report.suggestions.length > 0 ||
      report.notes.length > 0;

    if (!hasAnything) {
      console.log(`${chalk.green('✓')} ${report.name}`);
      continue;
    }

    console.log(`${blocking.length > 0 ? chalk.red('✗') : chalk.yellow('!')} ${report.name}`);
    for (const item of collapse(report.errors)) console.log(`    ${chalk.red('error')}  ${item}`);
    for (const item of collapse(report.attwProblems)) {
      console.log(`    ${chalk.red('attw')}   ${item}`);
    }
    for (const item of collapse(report.selfCheckProblems)) {
      console.log(`    ${chalk.red('self')}   ${item}`);
    }
    for (const item of collapse(report.warnings)) {
      console.log(`    ${chalk.yellow('warn')}   ${item}`);
    }
    for (const item of collapse(report.notes)) {
      console.log(`    ${chalk.cyan('note')}   ${item}`);
    }
    for (const item of collapse(report.suggestions)) {
      console.log(`    ${chalk.dim('hint')}   ${chalk.dim(item)}`);
    }

    if (blocking.length > 0) failed = true;
  }

  const checked = reports.filter((r) => !r.skipped);
  const totals = checked.reduce(
    (acc, r) => ({
      errors: acc.errors + r.errors.length,
      attw: acc.attw + r.attwProblems.length,
      self: acc.self + r.selfCheckProblems.length,
      warnings: acc.warnings + r.warnings.length,
      notes: acc.notes + r.notes.length,
      suggestions: acc.suggestions + r.suggestions.length,
    }),
    { errors: 0, attw: 0, self: 0, warnings: 0, notes: 0, suggestions: 0 },
  );

  const skippedCount = reports.length - checked.length;
  console.log(
    `\n检查 ${checked.length} 个包${skippedCount > 0 ? `（另跳过 ${skippedCount} 个）` : ''}：` +
      `${chalk.red(`${totals.errors} error`)} / ` +
      `${chalk.red(`${totals.attw} attw`)} / ` +
      `${chalk.red(`${totals.self} self`)} / ` +
      `${chalk.yellow(`${totals.warnings} warning`)} / ` +
      `${chalk.cyan(`${totals.notes} note`)} / ` +
      `${chalk.dim(`${totals.suggestions} suggestion`)}`,
  );

  if (failed) {
    console.log(chalk.red('\n✗ 发布前体检未通过'));
    process.exit(1);
  }
  if (!STRICT && totals.warnings > 0) {
    console.log(
      chalk.yellow(
        '\n⚠ 本次未开 --strict，上述 warning 未阻断；但 CI 跑的是 --strict' +
          '（check-quality.yml / release-packages.yml），它们会让流水线失败。',
      ),
    );
  }
  console.log(chalk.green('\n✓ 发布前体检通过'));
}

main().catch((error: unknown) => {
  console.error(chalk.red('发布前体检执行异常：'), error);
  process.exit(1);
});
