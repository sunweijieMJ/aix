#!/usr/bin/env tsx
/**
 * verify-combos —— 特性组合矩阵验证（组合矩阵 CI 的雏形）
 *
 * 关键点：**不重实现协议**。每个组合都以子进程调用真实 CLI 生成项目，
 * 因此这里的绿灯等价于「用户实际跑 create-app 会得到的结果」。
 *
 * 默认用本地路径源（`~/workspace/mine/vue-admin-template`）而非 git 源：
 * 模板改动即改即验，不必先 push；git 源的连通性由单独的 smoke 验证。
 *
 * 用法：
 *   pnpm verify-combos                       # 三组合，L1 生成 + L2 静态体检
 *   pnpm verify-combos --combo i18n          # 只跑一种组合
 *   pnpm verify-combos --install             # 追加 L3 install → L4 type-check → L5 build
 *   pnpm verify-combos --template <path|src> # 换模板源（本地路径或 git 源）
 *   pnpm verify-combos --out-root /tmp/x     # 指定产物根目录（默认临时目录）
 *   pnpm verify-combos --registry <url>      # install 时覆盖 registry（默认走模板自带 .npmrc）
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(PKG_ROOT, 'src/cli.ts');
// 直接用本包的 tsx bin：子进程 cwd 在临时目录（workspace 之外），`pnpm exec` 会找不到包
const TSX = path.join(PKG_ROOT, 'node_modules/.bin/tsx');
const DEFAULT_TEMPLATE = path.join(os.homedir(), 'workspace/mine/vue-admin-template');
/** 模板真源的包名，产物里出现即说明 substitutions 漏配 */
const TEMPLATE_REAL_NAME = 'vite-vue3-temp';

/** 预设组合：名称 → 选中的特性集合 */
const COMBOS: Record<string, string[]> = {
  full: ['i18n', 'qiankun', 'demoPages', 'overrides'],
  none: [],
  i18n: ['i18n'],
  // overrides 单独成组：它的渗透点（main.ts / router / constants / vite.config）与 i18n 交叉，
  // 只靠 full 覆盖的话，一旦 full 挂了就分不清是哪个特性的问题
  overrides: ['i18n', 'overrides'],
};

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

function staticCheck(outDir: string): string[] {
  const problems: string[] = [];

  for (const rel of walk(outDir)) {
    const abs = path.join(outDir, rel);
    const buf = fs.readFileSync(abs);
    if (!isText(buf)) continue;
    const content = buf.toString('utf-8');

    content.split('\n').forEach((line, i) => {
      if (MARKER_LINE.test(line.trim())) problems.push(`标记残留 ${rel}:${i + 1} → ${line.trim()}`);
      if (VAR_LEFTOVER.test(line)) problems.push(`变量残留 ${rel}:${i + 1} → ${line.trim()}`);
      if (line.includes(TEMPLATE_REAL_NAME)) {
        problems.push(`真名残留 ${rel}:${i + 1} → ${line.trim()}`);
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

  const problems = staticCheck(outDir);
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

function main(): void {
  const argv = process.argv.slice(2);
  const arg = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const only = arg('--combo');
  if (only && !(only in COMBOS)) {
    throw new Error(`未知组合：${only}（可选 ${Object.keys(COMBOS).join(' / ')}）`);
  }
  const outRoot = arg('--out-root') ?? fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-verify-'));
  fs.mkdirSync(outRoot, { recursive: true });

  const opts: Options = {
    install: argv.includes('--install'),
    registry: arg('--registry'),
    outRoot,
    template: arg('--template') ?? DEFAULT_TEMPLATE,
  };
  console.log(`模板源：${opts.template}`);

  const entries = only ? [[only, COMBOS[only]!] as const] : Object.entries(COMBOS);
  const results = entries.map(([name, selected]) => verify(name, selected, opts));

  console.log(`\n${'='.repeat(70)}\n汇总（产物根目录 ${outRoot}）`);
  for (const r of results) {
    console.log(
      `  ${r.name.padEnd(6)} ${r.level.padEnd(8)} ${String(r.fileCount ?? '-').padStart(4)} 文件  ${LEVELS[r.level]}${r.note ? ` — ${r.note}` : ''}`,
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

main();
