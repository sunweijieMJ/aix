import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { isProjectRoot } from '../../utils/detector';
import { generateFiles, generateOverrideUtils } from '../../override/generator';
import {
  checkProjectConflict,
  resolveConflicts,
  writeFiles,
  printFileTree,
} from '../../utils/conflict';
import { runPrompts } from '../../override/prompts';
import { REQUIRED_MODULES, ALL_MODULES, type ModuleId } from '../../override/types';
import { CreateAppError } from '../../utils/errors';
import { handleError } from '../../utils/logger';

export interface OverrideAddOptions {
  project?: string;
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
  if (!(project ?? opts.project)) missing.push('[code]（定制目录名）');
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

  console.log(pc.bold('\n🚀 Override 初始化工具\n'));

  // 解析命令行参数中的 modules
  let modules: ModuleId[] | undefined;
  if (opts.modules) {
    modules = opts.modules.split(',').map((m: string) => m.trim()) as ModuleId[];
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
    project: project ?? opts.project,
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
  printFileTree(resolvedFiles, options.output);

  // ── 检测并生成 plugins/override（首次运行时） ──
  const utilsDir = path.resolve(cwd, 'src/plugins/override');
  const utilsIndexFile = path.join(utilsDir, 'index.ts');
  let utilsGenerated = false;

  if (!options.dryRun) {
    const utilFiles = generateOverrideUtils();
    const missingUtils = utilFiles.filter((f) => !fs.existsSync(path.join(utilsDir, f.path)));

    if (missingUtils.length > 0) {
      console.log(pc.cyan('\n🔧 检测到 src/plugins/override/ 缺少以下文件，自动生成：\n'));
      writeFiles(missingUtils, utilsDir);
      printFileTree(missingUtils, 'src/plugins/override');
      utilsGenerated = true;
    }
  }

  // ── 下一步提示 ──
  const overridesAlias = `@/${options.output.replace(/^src\//, '')}`;

  console.log(pc.bold('\n📝 下一步：'));
  console.log(`  1. 在 ${pc.cyan(`${options.output}/registry.ts`)} 中添加学校 NID 映射`);
  console.log(`  2. 在各模块的 ${pc.cyan('index.ts')} 中实现定制逻辑\n`);

  if (!fs.existsSync(utilsIndexFile) && !utilsGenerated) {
    console.log(
      pc.yellow('  ⚠️  未检测到 src/plugins/override/，请手动创建或重新运行（会自动生成）\n'),
    );
  }

  console.log(pc.bold('  手动接入定制系统：\n'));

  console.log(`  ${pc.dim('// main.ts — 初始化运行时覆盖')}`);
  console.log(`  import { initOverrides } from ${pc.cyan("'@/plugins/override'")};`);
  console.log(`  import overrideConfig from ${pc.cyan(`'${overridesAlias}'`)};`);
  console.log(`  ${pc.dim("// import { instances } from '@/api/core/request'; // 如有 API 覆盖")}`);
  console.log(
    `  ${pc.cyan('initOverrides')}({ pinia, i18n, config: overrideConfig, app, router });`,
  );
  console.log(
    `  ${pc.dim('// initOverrides({ pinia, i18n, config: overrideConfig, app, router, apiInstances: instances }); // 如有 API 覆盖')}`,
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
