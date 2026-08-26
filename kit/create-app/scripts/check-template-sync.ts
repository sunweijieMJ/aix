#!/usr/bin/env tsx
/**
 * check-template-sync —— 多个模版真源之间的漂移检查
 *
 * 两个真源（vue-admin-template / vue-h5-template）会长期并存，而协议是 create-app 定的。
 * 已经真实发生过两次漂移：h5 的 `.claude/agents/project-structure.md` 里写着 admin 的包名、
 * h5 整个缺了自检脚本与维护指南。人工同步 140 多个同名文件不现实，所以只盯两件真正要紧的：
 *
 * 1. **协议必备**：每个真源都必须有 `.template/config.ts`、自检脚本、维护指南，
 *    package.json 里有 `check:template`，husky 接了自检。缺哪样就是「这个真源没有本地护栏」。
 * 2. **协议共享文件逐字节一致**：`scripts/template/checkTemplate.ts` 是协议实现，
 *    不该按仓库分叉——模板专属差异一律写进 `.template/config.ts`。
 *
 * 刻意**不做**「所有同名文件都要一致」：142 个同名文件里只有 45 个逐字节相同，
 * 其余 97 个（`.claude/**` 文档、`src/**`、配置）本该不同——两个模板的技术栈本身就分叉。
 * 那种检查只会产出 97 行噪音，然后被人忽略。
 *
 * 用法：
 *   pnpm check-template-sync                          # 检查内置的两个真源
 *   pnpm check-template-sync --template <路径> ...     # 显式指定（可重复，至少一个）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pc from 'picocolors';

/** 默认检查的真源（本地路径；不存在的会被跳过并提示） */
const DEFAULT_TEMPLATES = [
  path.join(os.homedir(), 'workspace/mine/vue-admin-template'),
  path.join(os.homedir(), 'workspace/mine/vue-h5-template'),
];

/** 每个模版真源都必须有的文件（协议要求，缺了就没有本地护栏） */
const REQUIRED_FILES = [
  '.template/config.ts',
  'scripts/template/checkTemplate.ts',
  'docs/template-authoring.md',
];

/** 必须逐字节一致的协议实现文件 */
const SHARED_FILES = ['scripts/template/checkTemplate.ts'];

/** package.json 里必须有的脚本项 */
const REQUIRED_SCRIPTS = ['check:template'];

interface Template {
  dir: string;
  name: string;
}

const problems: string[] = [];
const notes: string[] = [];

function read(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

/** 收集要检查的真源；路径不存在只提示不报错（不是每台机器都 clone 了全部模板） */
function collectTemplates(argv: string[]): Template[] {
  const explicit = argv.flatMap((a, i) =>
    a === '--template' && argv[i + 1] ? [argv[i + 1]!] : [],
  );
  const candidates = explicit.length > 0 ? explicit : DEFAULT_TEMPLATES;

  const found: Template[] = [];
  for (const dir of candidates) {
    const abs = path.resolve(dir.replace(/^~(?=\/)/, os.homedir()));
    if (!fs.existsSync(abs)) {
      notes.push(`跳过（路径不存在）：${abs}`);
      continue;
    }
    if (!fs.existsSync(path.join(abs, '.template/config.ts'))) {
      // 没有清单就不是模版真源——显式传入的话是用户搞错了，要报
      if (explicit.length > 0) problems.push(`${abs} 不是模版真源（缺 .template/config.ts）`);
      else notes.push(`跳过（不是模版真源）：${abs}`);
      continue;
    }
    found.push({ dir: abs, name: path.basename(abs) });
  }
  return found;
}

/** CHECK 1：协议必备文件与脚本项 */
function checkRequired(tpl: Template): void {
  for (const rel of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(tpl.dir, rel))) {
      problems.push(`${tpl.name}: 缺少协议必备文件 ${rel}`);
    }
  }

  const pkgRaw = read(path.join(tpl.dir, 'package.json'));
  if (pkgRaw === null) {
    problems.push(`${tpl.name}: 读不到 package.json`);
    return;
  }
  let scripts: Record<string, string>;
  try {
    scripts = (JSON.parse(pkgRaw) as { scripts?: Record<string, string> }).scripts ?? {};
  } catch {
    problems.push(`${tpl.name}: package.json 不是合法 JSON`);
    return;
  }
  for (const name of REQUIRED_SCRIPTS) {
    if (!scripts[name]) problems.push(`${tpl.name}: package.json 缺少 scripts.${name}`);
  }

  // 自检要真的在提交时跑，否则等于没有。判据放宽到「husky 目录下任一文件提到 check:template」，
  // 两个真源的 pre-commit 实现方式可能不同（直接写 sh 或转发给 ts 脚本）
  const hooked = ['.husky', 'scripts/husky'].some((dir) => {
    const full = path.join(tpl.dir, dir);
    if (!fs.existsSync(full)) return false;
    return fs
      .readdirSync(full, { withFileTypes: true })
      .filter((e) => e.isFile())
      .some((e) => (read(path.join(full, e.name)) ?? '').includes('check:template'));
  });
  if (!hooked) {
    problems.push(`${tpl.name}: 自检没有接进 husky（提交时不会跑，等于没有护栏）`);
  }
}

/** CHECK 2：协议共享文件在所有真源之间逐字节一致 */
function checkShared(templates: Template[]): void {
  if (templates.length < 2) return;
  const [base, ...rest] = templates as [Template, ...Template[]];

  for (const rel of SHARED_FILES) {
    const baseContent = read(path.join(base.dir, rel));
    if (baseContent === null) continue; // 缺失已由 CHECK 1 报过

    for (const other of rest) {
      const otherContent = read(path.join(other.dir, rel));
      if (otherContent === null) continue;
      if (otherContent === baseContent) continue;

      const diffLines = countDiffLines(baseContent, otherContent);
      problems.push(
        `${rel}: ${base.name} 与 ${other.name} 不一致（约 ${diffLines} 行差异）\n` +
          `    这是协议实现，不该按仓库分叉。模板专属差异写进 .template/config.ts；\n` +
          `    对比：diff ${path.join(base.dir, rel)} ${path.join(other.dir, rel)}`,
      );
    }
  }
}

/** 粗略统计差异行数（只为在报错里给个量级，不追求精确） */
function countDiffLines(a: string, b: string): number {
  const linesA = new Set(a.split('\n'));
  const linesB = new Set(b.split('\n'));
  let n = 0;
  for (const l of linesA) if (!linesB.has(l)) n++;
  for (const l of linesB) if (!linesA.has(l)) n++;
  return n;
}

/** 信息性汇总：同名文件里有多少逐字节相同 —— 只打印，不作为失败依据 */
function reportOverlap(templates: Template[]): void {
  if (templates.length !== 2) return;
  const [a, b] = templates as [Template, Template];

  const listFiles = (root: string): Set<string> => {
    const out = new Set<string>();
    const walk = (dir: string, base: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'dist', 'coverage'].includes(e.name)) continue;
        const rel = base ? `${base}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), rel);
        else if (e.isFile()) out.add(rel);
      }
    };
    walk(root, '');
    return out;
  };

  const filesA = listFiles(a.dir);
  const filesB = listFiles(b.dir);
  const shared = [...filesA].filter((f) => filesB.has(f));
  let identical = 0;
  for (const f of shared) {
    if (read(path.join(a.dir, f)) === read(path.join(b.dir, f))) identical++;
  }
  console.log(
    pc.dim(
      `\n重叠面（仅供参考，不作为失败依据）：同名 ${shared.length} 个，其中逐字节相同 ${identical} 个\n` +
        `  同名但不同的多数是 .claude 文档 / src / 配置——两个模板技术栈本身分叉，本该不同`,
    ),
  );
}

function main(): void {
  const templates = collectTemplates(process.argv.slice(2));
  for (const n of notes) console.log(pc.dim(`  ${n}`));

  if (templates.length === 0) {
    // ⚠️ 不能在这里直接 exit(0)：collectTemplates 对**显式传入**的非真源路径会记 problem，
    // 提前返回会把它静默吞掉（`--template /tmp` 一度就是绿灯）。先落到下面的报告分支
    if (problems.length === 0) {
      console.log(pc.yellow('没有找到任何模版真源，跳过检查'));
      process.exit(0);
    }
  } else {
    console.log(`检查模版真源：${templates.map((t) => t.name).join(', ')}`);
    templates.forEach(checkRequired);
    checkShared(templates);
    reportOverlap(templates);
  }

  if (problems.length > 0) {
    console.error(pc.red(`\n× 模版真源漂移检查失败（${problems.length} 项）\n`));
    for (const p of [...new Set(problems)]) console.error(pc.red(`  • ${p}`));
    console.error('');
    process.exit(1);
  }
  console.log(pc.green(`\n✓ 漂移检查通过：${templates.length} 个真源，协议必备文件与共享实现一致`));
}

main();
