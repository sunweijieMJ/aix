/**
 * 发布前体检：对所有待发布包运行 publint + attw。
 *
 * - publint：校验 package.json 字段自洽性（exports/main/module/types 指向的文件是否存在、
 *   格式与扩展名和 type 字段是否匹配、files 有无遗漏）。
 * - attw：把包放进 node10 / node16-from-CJS / node16-from-ESM / bundler 四种模块解析模式，
 *   分别验证类型能否被正确解析。这是对手写 dual-package 处理（.d.cts 派生、stripStyleImports、
 *   emitStyleDts）的回归防护——那部分逻辑微妙且没有任何单测覆盖。
 *
 * 门禁策略：publint 的 error 与 attw 的 problems 会让本命令失败；
 * warning / suggestion 只报告不阻断。传 --strict 可把 warning 一并升级为失败。
 *
 * 用法：
 *   pnpm lint:publish            # 报告全部，仅 error 阻断
 *   pnpm lint:publish --strict   # warning 也阻断
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  /** 跳过原因，非空时其余字段无意义 */
  skipped?: string;
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

/**
 * 打包并用 attw 检查类型解析，返回 problems 的可读描述。
 *
 * 用 `pnpm pack` 而非 attw 自带的 `--pack`：后者内部调用 `npm pack`，
 * 而 npm 不认识 workspace:^ 协议，会打出错误的依赖版本。
 *
 * @param dir - 包目录
 * @param pkgJson - 解析后的 package.json
 * @returns problems 描述数组，空数组表示通过
 */
function runAttw(dir: string, pkgJson: Record<string, unknown>): string[] {
  if (isNotAJsPackage(pkgJson)) return [];

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aix-attw-'));
  try {
    execFileSync('pnpm', ['pack', '--pack-destination', quoteArg(tmpDir)], {
      cwd: dir,
      stdio: 'ignore',
      shell: true,
    });

    const tarball = fs.readdirSync(tmpDir).find((f) => f.endsWith('.tgz'));
    if (!tarball) return ['pnpm pack 未产出 tarball'];

    const excluded = collectCssEntrypoints(pkgJson);
    const args = [quoteArg(path.join(tmpDir, tarball)), '--format', 'json'];
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

    const problems = (JSON.parse(stdout).problems ?? {}) as Record<
      string,
      Record<string, unknown>[]
    >;
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
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
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

  report.attwProblems = runAttw(dir, pkgJson);
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
    if (report.skipped) continue;

    const blocking = [...report.errors, ...report.attwProblems, ...(STRICT ? report.warnings : [])];
    const hasAnything =
      blocking.length > 0 ||
      report.warnings.length > 0 ||
      report.suggestions.length > 0 ||
      report.attwProblems.length > 0;

    if (!hasAnything) {
      console.log(`${chalk.green('✓')} ${report.name}`);
      continue;
    }

    console.log(`${blocking.length > 0 ? chalk.red('✗') : chalk.yellow('!')} ${report.name}`);
    for (const item of collapse(report.errors)) console.log(`    ${chalk.red('error')}  ${item}`);
    for (const item of collapse(report.attwProblems)) {
      console.log(`    ${chalk.red('attw')}   ${item}`);
    }
    for (const item of collapse(report.warnings)) {
      console.log(`    ${chalk.yellow('warn')}   ${item}`);
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
      warnings: acc.warnings + r.warnings.length,
      suggestions: acc.suggestions + r.suggestions.length,
    }),
    { errors: 0, attw: 0, warnings: 0, suggestions: 0 },
  );

  console.log(
    `\n检查 ${checked.length} 个包：` +
      `${chalk.red(`${totals.errors} error`)} / ` +
      `${chalk.red(`${totals.attw} attw`)} / ` +
      `${chalk.yellow(`${totals.warnings} warning`)} / ` +
      `${chalk.dim(`${totals.suggestions} suggestion`)}`,
  );

  if (failed) {
    console.log(chalk.red('\n✗ 发布前体检未通过'));
    process.exit(1);
  }
  if (!STRICT && totals.warnings > 0) {
    console.log(chalk.dim('\n（warning 当前不阻断；清理干净后可在 CI 改用 --strict 收紧）'));
  }
  console.log(chalk.green('\n✓ 发布前体检通过'));
}

main().catch((error: unknown) => {
  console.error(chalk.red('发布前体检执行异常：'), error);
  process.exit(1);
});
