import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { isProjectRoot } from '../../utils/detector';
import { findMissingPrerequisites, generateFiles } from '../../override/generator';
import { checkProjectConflict, resolveConflicts } from '../../utils/conflict';
import { printFileTree, writeFiles } from '../../utils/fs';
import { runPrompts } from '../../override/prompts';
import { REQUIRED_MODULES, ALL_MODULES, type ModuleId } from '../../override/types';
import { CreateAppError } from '../../utils/errors';
import { handleError } from '../../utils/logger';
import { validateOverrideCode } from '../../utils/validate';

export interface OverrideAddOptions {
  modules?: string;
  output: string;
  yes: boolean;
  dryRun: boolean;
  force: boolean;
}

/**
 * 列出「本次运行还要靠问答补齐」的选项（与 create 的 missingNonInteractiveFlags 同思路）
 *
 * 历史缺陷：非 TTY 下 runPrompts 的取消分支曾以 exit 0 收场，CI 里表现为
 * 「命令成功但没有产物」。现在取消分支非 TTY 已改非零退出兜底，但在问答前
 * 快速失败仍是第一道防线——能一次列全缺失 flag。导出仅为便于测试；
 * 判定与 runPrompts 的问答条件逐条对应（冲突问答的兜底在 conflict.ts 现场）。
 */
export function missingOverrideNonInteractiveFlags(
  project: string | undefined,
  opts: OverrideAddOptions,
): string[] {
  const missing: string[] = [];

  // runPrompts：问答逐条对应。空串一律按缺失算——下游全是 truthy 判断
  // （add.ts 的 `if (opts.modules)`），`-m ''`（典型来源是未赋值的 shell 变量插值）
  // 会绕过体检落进问答
  if (!project) missing.push('[code]（定制目录名）');
  if (!opts.modules) missing.push('-m, --modules <list>');

  // 冲突问答（checkProjectConflict / resolveConflicts）不在此预判：
  // 「输出目录存在」不等于「会撞冲突」，在这里拦会误杀全参数的无冲突运行。
  // 兜底在 conflict.ts 的问答现场——非 TTY 下真要弹问答时直接抛 E_NON_INTERACTIVE
  return missing;
}

/** 非 TTY 且仍需交互时快速失败（TTY 下不做任何限制） */
function assertNonInteractiveReady(project: string | undefined, opts: OverrideAddOptions): void {
  if (process.stdin.isTTY) return;

  const missing = missingOverrideNonInteractiveFlags(project, opts);
  if (missing.length === 0) return;

  throw new CreateAppError(
    'E_NON_INTERACTIVE',
    `当前不是交互式终端（stdin 非 TTY），但以下选项缺失、无法通过问答补齐：\n${missing
      .map((m) => `  - ${m}`)
      .join('\n')}`,
    '非交互场景请补齐全部参数，例如：\n  create-app override add sysu -m router,store -y',
  );
}

export async function overrideAdd(project: string | undefined, opts: OverrideAddOptions) {
  // 与 create 命令对齐：未捕获异常一律走 handleError，打印 [错误码] + 建议后非零退出，
  // 否则 Node 直接吐一整段栈，且 CreateAppError 的 suggestion 完全看不到
  try {
    await runOverrideAdd(project, opts);
  } catch (err) {
    handleError(err);
  }
}

async function runOverrideAdd(project: string | undefined, opts: OverrideAddOptions) {
  const cwd = process.cwd();

  // 检查是否在项目根目录
  if (!isProjectRoot(cwd)) {
    console.error(pc.red('❌ 未检测到 package.json，请在项目根目录执行'));
    process.exit(1);
  }

  // 任何问答之前先做非 TTY 体检：这里能列出缺失 flag 清单，比落进问答再由
  // 取消分支兜底退出的报错可读得多
  assertNonInteractiveReady(project, opts);

  // 命令行传入的定制目录名先校验再往下走（问答分支的校验在 runPrompts 里）：
  // 不校验的话 `../../x` 会把覆盖层写到 options.output 之外
  // 用 truthy 判断而不是 `!== undefined`：空串按「缺失」处理（与 `--template ''`、
  // `-m ''` 同一套约定，典型来源是未赋值的 shell 变量插值）——TTY 下落进问答，
  // 非 TTY 下由上面的 assertNonInteractiveReady 报 E_NON_INTERACTIVE
  if (project) {
    const codeError = validateOverrideCode(project);
    if (codeError) {
      throw new CreateAppError('E_INVALID_PROJECT_NAME', codeError, '请更换定制目录名后重试');
    }
  }

  console.log(pc.bold('\n🚀 Override 初始化工具\n'));

  // 解析命令行参数中的 modules
  let modules: ModuleId[] | undefined;
  if (opts.modules) {
    // 空片段一律剔除（`-m 'router,'`）：不过滤的话空串会被当成模块名，报出「未知模块: 」。
    // 去重（`-m router,router`）：重复项会让 generateFiles 产出重复的文件条目，
    // 预览列表与「共 N 个文件」计数跟着失真
    modules = [
      ...new Set(
        opts.modules
          .split(',')
          .map((m: string) => m.trim())
          .filter((m: string) => m.length > 0),
      ),
    ] as ModuleId[];
    if (modules.length === 0) {
      console.error(pc.red(`❌ -m 没有解析出任何模块: "${opts.modules}"`));
      console.error(pc.dim(`   可用模块: ${ALL_MODULES.join(', ')}`));
      process.exit(1);
    }
    // 校验模块名
    for (const m of modules) {
      if (!ALL_MODULES.includes(m)) {
        console.error(pc.red(`❌ 未知模块: ${m}`));
        console.error(pc.dim(`   可用模块: ${ALL_MODULES.join(', ')}`));
        process.exit(1);
      }
    }
    // 确保必选模块
    for (const req of REQUIRED_MODULES) {
      if (!modules.includes(req)) {
        modules.push(req);
      }
    }
  }

  // 交互式收集缺失参数
  const options = await runPrompts({
    project,
    modules,
    output: opts.output,
    yes: opts.yes,
    dryRun: opts.dryRun,
    force: opts.force,
  });

  if (!options) {
    // 非 TTY 下 runPrompts 返回 null 是「读不到输入」而非用户主动取消，必须非零退出
    process.exit(process.stdin.isTTY ? 0 : 1);
  }

  const outputDir = path.resolve(cwd, options.output);

  // 前置条件：内核与基础设施由模板的 `overrides` 特性提供，本包只生成按租户的骨架。
  // 缺了就生成，等于产出一堆 import 不到 `@/plugins/override` / `../types` 的死文件；
  // dry-run 也一并拦——预览一个注定装不上的产物只会误导
  const missingPrereq = findMissingPrerequisites(cwd, outputDir);
  if (missingPrereq.length > 0) {
    throw new CreateAppError(
      'E_MISSING_OVERRIDE_KERNEL',
      `缺少 Override 内核 / 基础设施，无法生成覆盖层骨架：\n${missingPrereq
        .map((f) => `  - ${f}`)
        .join('\n')}`,
      '这些文件由模板的 `overrides` 特性提供：\n' +
        '  · 新项目：生成时勾上「多租户定制体系」特性\n' +
        '  · 已有项目：从模板真源同步 src/plugins/override/ 与 src/overrides/*.ts\n' +
        '  · 用了 -o 指向非默认目录：基础设施需要先放到该目录下',
    );
  }

  // 项目代码重名检测
  if (!options.dryRun) {
    const canContinue = await checkProjectConflict(options.project, outputDir, {
      force: options.force,
      yes: options.yes,
    });
    if (!canContinue) {
      console.log(pc.yellow('已取消'));
      return;
    }
  }

  // 生成文件
  const files = generateFiles(options);

  // dry-run 模式：仅预览
  if (options.dryRun) {
    console.log(pc.cyan('\n📋 预览模式 (--dry-run)，不会写入文件：\n'));
    console.log(pc.dim(`  输出目录: ${outputDir}/`));
    for (const file of files) {
      console.log(pc.dim(`  ${file.path}`));
    }
    console.log(pc.dim(`\n  共 ${files.length} 个文件`));
    return;
  }

  // 冲突处理
  const resolvedFiles = await resolveConflicts(files, outputDir, {
    force: options.force,
    yes: options.yes,
  });

  if (!resolvedFiles) {
    console.log(pc.yellow('已取消'));
    return;
  }

  if (resolvedFiles.length === 0) {
    console.log(pc.yellow('所有文件已存在，无需生成'));
    return;
  }

  // 写入文件
  writeFiles(resolvedFiles, outputDir);
  console.log(pc.green('\n✅ 已生成以下文件：\n'));
  printFileTree(resolvedFiles, options.output);

  // ── 下一步提示 ──
  // `@` 别名指向 src/，所以只有 output 在 src/ 下才拼得出别名；
  // 指到 src/ 外时打印原始路径，别给出一个解析不了的 import
  const overridesAlias = options.output.startsWith('src/')
    ? `@/${options.output.slice('src/'.length)}`
    : options.output;

  console.log(pc.bold('\n📝 下一步：'));
  console.log(`  1. 在 ${pc.cyan(`${options.output}/registry.ts`)} 中添加学校 NID 映射`);
  console.log(`  2. 在各模块的 ${pc.cyan('index.ts')} 中实现定制逻辑\n`);

  // 模板的 overrides 特性自带 setup.ts，接线已经做完了。此时再打印一遍手动接入步骤，
  // 用户照着做就是重复接入
  // 必须复用上面 resolve 出的 outputDir：`-o` 传绝对路径时 join(cwd, 绝对路径) 会拼出
  // <cwd>/abs/... 这条不存在的路径，setup.ts 明明在也判为不在，整段手动接入被误打出来
  if (fs.existsSync(path.join(outputDir, 'setup.ts'))) {
    console.log(
      pc.dim(
        `  接线已由 ${options.output}/setup.ts 完成，无需手动改 main.ts / router / constants\n`,
      ),
    );
    return;
  }

  console.log(pc.bold('  手动接入定制系统：\n'));

  // API 覆盖不需要额外传参：内核自行 import `@/api/core/request` 的 instances 消费
  // config.api（initOverrides 已不收 apiInstances，见 templates-override/README）
  console.log(`  ${pc.dim('// main.ts — 初始化运行时覆盖')}`);
  console.log(`  import { initOverrides } from ${pc.cyan("'@/plugins/override'")};`);
  console.log(`  import overrideConfig from ${pc.cyan(`'${overridesAlias}'`)};`);
  console.log(
    `  ${pc.cyan('initOverrides')}({ pinia, i18n, config: overrideConfig, app, router });`,
  );

  console.log('');
  console.log(`  ${pc.dim('// router/index.ts — 注册路由覆盖（同步，在 createRouter 之前）')}`);
  console.log(`  import { routerManager } from ${pc.cyan("'@/plugins/override'")};`);
  console.log(`  import { customRoutes } from ${pc.cyan(`'${overridesAlias}'`)};`);
  console.log(`  ${pc.cyan('routerManager.register')}(customRoutes);`);
  console.log(`  routes: [...${pc.cyan('routerManager.applyOverrides')}(staticRoutes)]`);
  console.log(`  ${pc.cyan('routerManager.addCustomRoutes')}(router);`);

  console.log('');
  console.log(`  ${pc.dim('// constants/index.ts — 合并静态常量')}`);
  console.log(`  import { mergeConstants } from ${pc.cyan("'@/plugins/override'")};`);
  console.log(`  import { customConstants } from ${pc.cyan(`'${overridesAlias}'`)};`);
  console.log(
    `  export const ROLES = ${pc.cyan('mergeConstants')}(DEFAULT_ROLES, customConstants.roles ?? {});`,
  );

  console.log('');
}
