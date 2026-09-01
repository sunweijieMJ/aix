#!/usr/bin/env tsx
/**
 * verify-combos —— 特性组合矩阵验证（组合矩阵 CI 的雏形）
 *
 * 关键点：**不重实现协议**。每个组合都以子进程调用真实 CLI 生成项目，
 * 因此这里的绿灯等价于「用户实际跑 create-app 会得到的结果」。
 *
 * 默认模板源是注册表 `admin` 条目的 git 源（远端 master）——不写死任何人的本机路径，
 * 验的正是用户实际拿到的东西。模板本地开发时传 `--template <本地路径>`（改即验，不必先 push）。
 *
 * 用法：
 *   pnpm verify-combos                       # 三组合，L1 生成 + L2 静态体检
 *   pnpm verify-combos --combo i18n          # 只跑一种组合
 *   pnpm verify-combos --install             # 追加 L3 install → L4 type-check → L5 build
 *   pnpm verify-combos --template <id|path|src> # 换模板（注册表 id / 本地路径 / git 源，与 CLI 同语义）
 *   pnpm verify-combos --out-root /tmp/x     # 指定产物根目录（默认临时目录）
 *   pnpm verify-combos --registry <url>      # install 时覆盖 registry（默认走模板自带 .npmrc）
 *   pnpm verify-combos --param k=v [--param …] # 透传模板参数（无 default 的参数必须给）
 *   pnpm verify-combos --features a,b [--features ''] # 现给组合（可重复）
 *   pnpm verify-combos --smart-combos        # 从模板清单枚举 N+2 个组合（推荐）
 *   pnpm verify-combos --all-combos          # 全枚举 2^N（配 --install 会很慢）
 *   pnpm verify-combos --real-name <pkg>     # 模板真名（默认读模板 package.json 的 name）
 *
 * 组合来源优先级：`--features` > `--combo` > `--all-combos` / `--smart-combos` > 内置预设。
 *
 * 非本地路径源在开跑前会先强制刷一次缓存：git 源默认复用本地克隆，
 * 否则可能对着旧克隆验出假绿灯（已实测踩到）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { findTemplateById, loadTemplateRegistry } from '../src/config/defaults';
import { isLocalSource, TemplateResolver } from '../src/core/resolver';
import type { TemplateConfig } from '../src/types';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(PKG_ROOT, 'src/cli.ts');
// 直接用本包的 tsx bin：子进程 cwd 在临时目录（workspace 之外），`pnpm exec` 会找不到包
const TSX = path.join(PKG_ROOT, 'node_modules/.bin/tsx');
/**
 * 默认验注册表的 admin 模板（git 源，远端 master）
 *
 * 不写死本地路径：模板真源仓库在云端，每个人的本地 clone 位置都不同，
 * 写死等于「换台机器脚本就失效」。本地开发用 `--template <本地路径>` 显式指定。
 */
const DEFAULT_TEMPLATE_ID = 'admin';
/**
 * 模板真源的包名：产物里出现它即说明 substitutions 漏配
 *
 * 一律推导，不写死任何模板的名字（写死等于「验别的模板时这项检测静默失效」）：
 * 1. `--real-name` 显式指定
 * 2. 本地目录源：读它的 package.json
 * 3. 其余形态（git / giget）：取源地址最后一段并剥掉 `.git`——两个模板的包名都等于仓库名，
 *    这条推导对它们成立；不成立时会退化成「检测不到残留」，所以第 4 步要说破
 * 4. 都拿不到：返回 undefined，调用方跳过该项检测并打印提醒
 */
function detectRealName(template: string, override?: string): string | undefined {
  if (override) return override;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(template, 'package.json'), 'utf-8')) as {
      name?: string;
    };
    if (pkg.name) return pkg.name;
  } catch {
    // 非本地目录源，往下走地址推导
  }
  return repoNameFromSource(template);
}

/** 从源地址推导仓库名：取最后一段并剥 `.git`（两个模板的包名都等于仓库名） */
function repoNameFromSource(source: string): string | undefined {
  const repo = source
    .replace(/#.*$/, '')
    .replace(/\/+$/, '')
    .split(/[/:]/)
    .pop()
    ?.replace(/\.git$/, '');
  return repo && repo.length > 0 ? repo : undefined;
}

/**
 * 残留检测的真名全集：本模板自己的名字 + 注册表登记的**全部**模板仓库名
 *
 * 只扫本模板名有一个已实际漏过的盲区：模板之间会互相拷贝内容（`.claude` 的 skills /
 * agents 文档），把**别家**的真名带进来——admin 的 9 个 SKILL.md 曾带着
 * `author: vue-h5-template` 发进产物、h5 的部署文档带着 admin 名，两边的
 * substitutions 漏配检查与本模板名扫描全都看不见它们。
 */
function knownRealNames(template: string, override?: string): string[] {
  const registry = loadTemplateRegistry().map((e) => repoNameFromSource(e.source));
  return [...new Set([detectRealName(template, override), ...registry])].filter(
    (n): n is string => !!n,
  );
}

/**
 * 预设组合：名称 → 选中的特性集合
 *
 * 这些名字是 **admin 模板**的特性 id。验其他模板时用 `--features a,b`（可重复）
 * 现给组合，不要指望预设能通用——特性 id 的取值域由各模板的 config.ts 决定。
 */
const COMBOS: Record<string, string[]> = {
  full: ['i18n', 'qiankun', 'overrides', 'aiDocs'],
  none: [],
  i18n: ['i18n', 'aiDocs'],
  // overrides 单独成组：它的渗透点（main.ts / router / constants / vite.config）与 i18n 交叉，
  // 只靠 full 覆盖的话，一旦 full 挂了就分不清是哪个特性的问题
  overrides: ['i18n', 'overrides', 'aiDocs'],
};

// ---------------------------------------------------------------- 组合枚举

/**
 * 读模板清单，拿到特性 id 列表
 *
 * 直接复用 TemplateResolver 而不是自己 jiti + 解析：走的是 CLI 生成时的同一条通路
 * （含 Zod strict 校验），清单写错会在这里就以同样的错误报出来，不会「枚举出一堆
 * 特性、生成时才发现清单不合法」。非本地源顺便强制刷缓存，避免对着旧克隆枚举。
 */
async function readTemplateFeatures(source: string): Promise<string[]> {
  const resolver = new TemplateResolver();
  const dir = await resolver.fetch(source, isLocalSource(source) ? undefined : { refresh: true });
  const manifest: TemplateConfig = await resolver.readConfig(dir);
  return Object.keys(manifest.features);
}

/**
 * 「聪明」组合：全开 + 全关 + 每个特性单独关一次（N + 2 个）
 *
 * 为什么是「单独关」而不是「单独开」：条件块的错误几乎都在特性**关闭**时才显形
 * （残留标记、悬空 import、被裁的依赖仍被引用）。全开那一份由 `full` 覆盖，
 * 全关那一份把「所有裁剪同时发生」的交叉情况兜住。
 *
 * 6 个特性 → 8 个组合，配 `--install` 约几分钟；要穷尽 2^N 用 `--all-combos`。
 */
function smartCombos(features: string[]): (readonly [string, string[]])[] {
  const combos: (readonly [string, string[]])[] = [
    ['full', features] as const,
    ['none', []] as const,
  ];
  for (const off of features) {
    combos.push([`no-${off}`, features.filter((f) => f !== off)] as const);
  }
  return combos;
}

/** 全枚举 2^N：位掩码逐位映射到特性开关 */
function allCombos(features: string[]): (readonly [string, string[]])[] {
  const combos: (readonly [string, string[]])[] = [];
  for (let mask = 0; mask < 2 ** features.length; mask++) {
    const selected = features.filter((_, i) => Boolean(mask & (1 << i)));
    combos.push([selected.length > 0 ? selected.join('+') : 'none', selected] as const);
  }
  return combos;
}

// ---------------------------------------------------------------- 工具

/** 递归收集相对路径（POSIX 分隔），跳过 node_modules / .git */
function walk(root: string): string[] {
  const out: string[] = [];
  const rec = (dir: string, base: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) rec(path.join(dir, entry.name), rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  rec(root, '');
  return out.sort();
}

/** 文本判定与 composer 同规则：检测 null 字节 */
const isText = (buf: Buffer): boolean => !buf.includes(0);

// ---------------------------------------------------------------- L2 静态体检

/**
 * 条件标记的残留检测
 *
 * 比 conditional.ts 的 parseMarker 更宽：parseMarker 只认 `// #if `（严格一个空格），
 * 而 `//#if x`、`//  #endif` 这类形似标记它不认 → 原样留在产物里。检测侧必须覆盖
 * conditional.ts 的快路径判定 HAS_MARKER_PATTERN（`/#(if|else|endif)\b/`）能触发、
 * parseMarker 又认不出的整个区间，否则少一个空格就静默漏检。
 *
 * 三种前缀风格都要覆盖：`//`、`<!--`、以及 `#` 注释系的 `# #if`。注意第三种写成 `#\s*#`
 * 而不是 `#+`，markdown 的 `## #if …` 这类标题才不会被误判成残留。
 */
const MARKER_LINE = /^(\/\/|<!--|#)\s*#(if|else|endif)\b/;
/** CLI 变量一律小写 kebab；大写占位符（如 skill 文档里的 {{DATE}}）不属于本协议 */
const VAR_LEFTOVER = /\{\{[a-z][a-z0-9-]*\}\}/;

const RESOLVE_EXT = ['', '.ts', '.tsx', '.vue', '.json', '.js', '.mjs', '.scss', '.css'];

function resolveSpecifier(spec: string, fromFile: string, root: string): boolean {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(root, 'src', spec.slice(2));
  else if (spec.startsWith('./') || spec.startsWith('../'))
    base = path.resolve(path.dirname(fromFile), spec);
  else return true; // 裸包名交给 install / build 校验
  if (RESOLVE_EXT.some((ext) => fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()))
    return true;
  return ['/index.ts', '/index.vue', '/index.js'].some((idx) => fs.existsSync(base + idx));
}

function staticCheck(outDir: string, realNames: string[]): string[] {
  const problems: string[] = [];

  for (const rel of walk(outDir)) {
    const abs = path.join(outDir, rel);
    const buf = fs.readFileSync(abs);
    if (!isText(buf)) continue;
    const content = buf.toString('utf-8');

    content.split('\n').forEach((line, i) => {
      if (MARKER_LINE.test(line.trim())) problems.push(`标记残留 ${rel}:${i + 1} → ${line.trim()}`);
      if (VAR_LEFTOVER.test(line)) problems.push(`变量残留 ${rel}:${i + 1} → ${line.trim()}`);
      for (const name of realNames) {
        if (line.includes(name)) {
          problems.push(`真名残留（${name}）${rel}:${i + 1} → ${line.trim()}`);
        }
      }
    });

    if (!/\.(ts|tsx|vue|js|mjs)$/.test(rel)) continue;
    // 注释行不参与 import 扫描（模板里有大量写在注释中的「示例 import」）
    const code = content
      .split('\n')
      .map((l) => {
        const t = l.trimStart();
        return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') ? '' : l;
      })
      .join('\n');
    const specs = [
      ...code.matchAll(/(?:^|\s)(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/g),
      ...code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
      ...code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
    ].map((m) => m[1]!);
    for (const spec of new Set(specs)) {
      if (spec.startsWith('virtual:')) continue;
      // src/api/generated 由 `pnpm orval` 生成，模板内不落盘
      if (spec.includes('generated/')) continue;
      if (!resolveSpecifier(spec, abs, outDir)) problems.push(`死 import ${rel} → ${spec}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------- 执行

interface RunResult {
  ok: boolean;
  output: string;
  secs: string;
}

/**
 * 剥掉 `pnpm run` 注入的 PATH 前缀，还原用户环境里的包管理器
 *
 * 本脚本多半由 `pnpm verify-combos` 启动，而 aix workspace 用 corepack 钉了 pnpm@10；
 * 被钉的版本会把自己的 bin 目录塞进子进程 PATH，导致在生成的项目里跑 install 时
 * 命中 10.x，撞上模板 `engines.pnpm >= 11` 直接失败。生成的项目是独立仓库，
 * 必须用用户全局的包管理器来装。
 */
function cleanPath(): string {
  return (process.env['PATH'] ?? '')
    .split(path.delimiter)
    .filter(
      (entry) =>
        entry.length > 0 &&
        path.isAbsolute(entry) &&
        !entry.endsWith(`node_modules${path.sep}.bin`) &&
        !/[/\\]store[/\\]v\d+[/\\]links[/\\]/.test(entry),
    )
    .join(path.delimiter);
}

function run(cmd: string, args: string[], cwd: string, clean = false): RunResult {
  const started = Date.now();
  const env = clean
    ? { ...process.env, PATH: cleanPath(), npm_config_user_agent: undefined }
    : process.env;
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, env });
  return {
    ok: r.status === 0,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    secs: ((Date.now() - started) / 1000).toFixed(1),
  };
}

const tail = (s: string, n = 25): string =>
  s.trimEnd().split('\n').slice(-n).join('\n').replace(/^/gm, '     ');

interface Options {
  install: boolean;
  registry?: string;
  outRoot: string;
  template: string;
  /** 透传给 CLI 的 `--param k=v`：模板一旦声明无 default 的参数，不给就会 E_NON_INTERACTIVE */
  params: string[];
  /** 残留检测的真名全集（本模板 + 注册表全量）；空数组时跳过该项检测 */
  realNames: string[];
}

interface ComboResult {
  name: string;
  level: string;
  /** 本组合是否跑到了预期的最高层级（L2 / --install 下 L5）；决定进程退出码 */
  ok: boolean;
  fileCount?: number;
  note?: string;
}

const LEVELS: Record<string, string> = {
  'L1-FAIL': 'CLI 生成失败',
  'L2-FAIL': '生成成功但静态体检不通过',
  L2: '文件级一致性（无标记/变量/真名残留、无死 import）',
  L3: 'install 通过',
  L4: 'type-check 通过',
  L5: 'build 通过（全链路）',
};

function verify(name: string, selected: string[], opts: Options): ComboResult {
  const projectName = `verify-${name}`;
  const outDir = path.join(opts.outRoot, projectName);
  console.log(
    `\n${'='.repeat(70)}\n组合 ${name}：[${selected.join(', ') || '（全关）'}]\n${'='.repeat(70)}`,
  );

  fs.rmSync(outDir, { recursive: true, force: true });

  // L1：调真实 CLI，不做任何协议模拟
  const gen = run(
    TSX,
    [
      CLI,
      projectName,
      '--template',
      opts.template,
      `--features=${selected.join(',')}`,
      '-d',
      `verify-combos ${name}`,
      ...opts.params.flatMap((p) => ['--param', p]),
      // 不带 --refresh：缓存已在 main() 里统一刷过一次，
      // 每个组合都重克隆纯属浪费（模板动辄几百个文件）
      '-y',
      '--no-git',
      '--no-install',
    ],
    opts.outRoot,
  );
  if (!gen.ok || !fs.existsSync(outDir)) {
    console.log(`  L1 CLI 生成：${pc.red('✗')} (${gen.secs}s)`);
    console.log(tail(gen.output));
    return { name, level: 'L1-FAIL', ok: false };
  }
  const fileCount = walk(outDir).length;
  console.log(`  L1 CLI 生成：${pc.green('✓')} ${fileCount} 个文件 (${gen.secs}s) → ${outDir}`);

  const problems = staticCheck(outDir, opts.realNames);
  if (problems.length > 0) {
    console.log(`  L2 静态体检：${pc.red('✗')} ${problems.length} 处问题`);
    problems.slice(0, 40).forEach((p) => console.log(`     - ${p}`));
    return { name, level: 'L2-FAIL', ok: false, fileCount };
  }
  console.log(`  L2 静态体检：${pc.green('✓')} 无标记/变量/真名残留，无死 import`);

  if (!opts.install) return { name, level: 'L2', ok: true, fileCount };

  // 模板自带 .npmrc 已声明各 scope 的私服地址，默认不覆盖 registry
  const installArgs = ['install', '--no-frozen-lockfile'];
  if (opts.registry) installArgs.push('--registry', opts.registry);
  const install = run('pnpm', installArgs, outDir, true);
  console.log(`  L3 pnpm install：${install.ok ? pc.green('✓') : pc.red('✗')} (${install.secs}s)`);
  if (!install.ok) {
    console.log(tail(install.output));
    return {
      name,
      level: 'L2',
      ok: false,
      fileCount,
      note: 'install 失败（私服不可达 / 内网包缺失）',
    };
  }

  const tc = run('pnpm', ['type-check'], outDir, true);
  console.log(`  L4 type-check：${tc.ok ? pc.green('✓') : pc.red('✗')} (${tc.secs}s)`);
  if (!tc.ok) {
    console.log(tail(tc.output));
    return { name, level: 'L3', ok: false, fileCount, note: 'type-check 失败' };
  }

  const build = run('pnpm', ['build'], outDir, true);
  console.log(`  L5 build：${build.ok ? pc.green('✓') : pc.red('✗')} (${build.secs}s)`);
  if (!build.ok) {
    console.log(tail(build.output));
    return { name, level: 'L4', ok: false, fileCount, note: 'build 失败' };
  }

  return { name, level: 'L5', ok: true, fileCount };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  /**
   * 可重复的 flag：收集全部出现处的值
   *
   * allowEmpty 供 `--features ''`（一个特性都不选）使用——那是个合法组合，
   * 默认的 truthy 过滤会把它连同缺值的 flag 一起丢掉
   */
  const argAll = (flag: string, opts: { allowEmpty?: boolean } = {}): string[] =>
    argv.flatMap((a, i) => {
      if (a !== flag) return [];
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) return [];
      return opts.allowEmpty || next.length > 0 ? [next] : [];
    });

  const only = arg('--combo');
  if (only && !(only in COMBOS)) {
    throw new Error(`未知组合：${only}（可选 ${Object.keys(COMBOS).join(' / ')}）`);
  }
  // `--features a,b`（可重复）：为非 admin 模板现给组合。空串 = 一个都不选，也是合法组合
  const adhoc = argAll('--features', { allowEmpty: true });
  const outRoot = arg('--out-root') ?? fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-verify-'));
  fs.mkdirSync(outRoot, { recursive: true });

  // 与 CLI 的 --template 同语义：先按注册表 id 解析（含用户级注册表），
  // 未命中再当本地路径 / git 源用。默认 admin（注册表 git 源，远端 master）
  const templateArg = arg('--template') ?? DEFAULT_TEMPLATE_ID;
  const template = findTemplateById(templateArg)?.source ?? templateArg;
  const opts: Options = {
    install: argv.includes('--install'),
    registry: arg('--registry'),
    outRoot,
    template,
    params: argAll('--param'),
    realNames: knownRealNames(template, arg('--real-name')),
  };
  console.log(
    `模板源：${opts.template}\n真名残留检测：${opts.realNames.length > 0 ? opts.realNames.join(' / ') : '（推导不出，跳过——可用 --real-name 指定）'}`,
  );

  const wantAll = argv.includes('--all-combos');
  const wantSmart = argv.includes('--smart-combos');

  let entries: (readonly [string, string[]])[];
  if (adhoc.length > 0) {
    entries = adhoc.map((list, i) => [`custom${i + 1}`, list.split(',').filter(Boolean)] as const);
  } else if (only) {
    entries = [[only, COMBOS[only]!] as const];
  } else if (wantAll || wantSmart) {
    // 从模板清单枚举：特性 id 的取值域由各模板自己定，写死在本脚本里等于「换个模板就失效」
    const features = await readTemplateFeatures(opts.template);
    if (features.length === 0) throw new Error(`模板未声明任何特性：${opts.template}`);
    entries = wantAll ? allCombos(features) : smartCombos(features);
    console.log(
      `模板特性（${features.length}）：${features.join(', ')}\n` +
        `组合数：${entries.length}（${wantAll ? '全枚举 2^N' : 'full + none + 每个特性单独关一次'}）`,
    );
    if (wantAll && opts.install) {
      console.log(
        pc.yellow(
          `⚠️  --all-combos 配 --install：${entries.length} 个组合各要跑 install → type-check → build，` +
            '按单个约 40s 估算需要 ' +
            `${Math.ceil((entries.length * 40) / 60)} 分钟以上`,
        ),
      );
    }
  } else {
    // 兜底仍是内置预设（admin 的特性 id），保持既有调用方式不变
    entries = Object.entries(COMBOS);
  }

  // 非本地源统一在开跑前刷一次缓存，之后所有组合复用（详见文件头注释）。
  // 上面走枚举分支时 readTemplateFeatures 已经刷过，这里不重复
  if (!isLocalSource(opts.template) && !wantAll && !wantSmart) {
    console.log('刷新模板缓存…');
    await new TemplateResolver().fetch(opts.template, { refresh: true });
  }

  const results = entries.map(([name, selected]) => verify(name, selected, opts));

  console.log(`\n${'='.repeat(70)}\n汇总（产物根目录 ${outRoot}）`);
  for (const r of results) {
    console.log(
      `  ${r.name.padEnd(18)} ${r.level.padEnd(8)} ${String(r.fileCount ?? '-').padStart(4)} 文件  ${LEVELS[r.level]}${r.note ? ` — ${r.note}` : ''}`,
    );
  }
  // 任何一个组合没跑到预期层级都必须非零退出——包括 --install 模式下的 L3/L4/L5 失败，
  // 它们的 level 不以 FAIL 结尾，旧写法会让 CI 一路绿灯放行
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(
      pc.red(
        `\n${failed.length}/${results.length} 个组合未达预期：${failed.map((r) => r.name).join(', ')}`,
      ),
    );
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(pc.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
