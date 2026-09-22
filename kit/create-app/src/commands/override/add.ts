import path from 'node:path';
import pc from 'picocolors';
import { assertProjectRoot } from '../../utils/detector';
import {
  availableModules,
  findMissingPrerequisites,
  findOrphanModuleDirs,
  generateFiles,
  overrideInfraFiles,
  OVERRIDE_KERNEL_FILE,
} from '../../override/generator';
import type { Platform } from '../../types';
import { checkProjectConflict, resolveConflicts } from '../../utils/conflict';
import { printFileTree, writeFiles } from '../../utils/fs';
import { runPrompts } from '../../override/prompts';
import {
  ALL_MODULES,
  PLATFORM_OPTIONS,
  REQUIRED_MODULES,
  type ModuleId,
} from '../../override/types';
import { CreateAppError } from '../../utils/errors';
import { handleError } from '../../utils/logger';
import { validateOverrideCode } from '../../utils/validate';

export interface OverrideAddOptions {
  modules?: string;
  /** 目标项目平台，取值见 PLATFORM_OPTIONS；缺省时 TTY 下问答补齐 */
  platform?: string;
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
  if (!opts.platform) missing.push('-p, --platform <web|mobile>');
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
    '非交互场景请补齐全部参数，例如：\n  create-app override add sysu -p web -m router,store -y',
  );
}

/** 报出盘上没人引用的模块目录，交给用户自己处置（目录里是用户代码，CLI 不替他删） */
function warnOrphanModuleDirs(outputDir: string, project: string, output: string): void {
  const orphans = findOrphanModuleDirs(outputDir, project);
  if (orphans.length === 0) return;

  console.log(pc.yellow(`\n⚠️  以下模块目录没有被 ${project}/index.ts 引用，不会被加载：`));
  for (const dir of orphans) {
    console.log(pc.dim(`   ${output}/${project}/${dir}/`));
  }
  console.log(pc.dim('   里面是你写的代码，需要的话自行保留或删除'));
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
  assertProjectRoot(cwd);

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

  // 平台由用户指定（`-p` 或问答），两个模板真源的 Override 形态不同，可选模块与骨架示例都按它走
  let platform: Platform | undefined;
  if (opts.platform) {
    const matched = PLATFORM_OPTIONS.find((item) => item.value === opts.platform);
    if (!matched) {
      throw new CreateAppError(
        'E_INVALID_OPTION',
        `未知平台: ${opts.platform}`,
        `-p 可选值: ${PLATFORM_OPTIONS.map((item) => item.value).join(', ')}`,
      );
    }
    platform = matched.value;
  }

  // 解析命令行参数中的 modules（模块名的平台适用性在 platform 就绪后校验）
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
      throw new CreateAppError(
        'E_INVALID_OPTION',
        `-m 没有解析出任何模块: "${opts.modules}"`,
        `可用模块: ${availableModules(platform ?? 'web').join(', ')}`,
      );
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
    platform,
    output: opts.output,
    yes: opts.yes,
    dryRun: opts.dryRun,
    force: opts.force,
  });

  if (!options) {
    // 非 TTY 下 runPrompts 返回 null 是「读不到输入」而非用户主动取消，必须非零退出
    process.exit(process.stdin.isTTY ? 0 : 1);
  }

  // 模块名按平台校验：走统一的 E_INVALID_OPTION，可用模块清单放 suggestion 里
  const allowed = availableModules(options.platform);
  for (const m of options.modules) {
    if (allowed.includes(m)) continue;
    throw new CreateAppError(
      'E_INVALID_OPTION',
      ALL_MODULES.includes(m) ? `模块 ${m} 不适用于 ${options.platform} 平台` : `未知模块: ${m}`,
      `${options.platform} 平台可用模块: ${allowed.join(', ')}`,
    );
  }
  console.log(
    pc.dim(
      `  目标平台：${PLATFORM_OPTIONS.find((item) => item.value === options.platform)!.label}\n`,
    ),
  );

  const outputDir = path.resolve(cwd, options.output);

  // 前置条件：内核与基础设施由模板的 `overrides` 特性提供，本包只生成按租户的骨架。
  // 缺了就生成，等于产出一堆 import 不到 `@/plugins/override`、也没人 glob 的死文件；
  // dry-run 也一并拦——预览一个注定装不上的产物只会误导
  const missingPrereq = findMissingPrerequisites(cwd, outputDir, options.platform);
  if (missingPrereq.length > 0) {
    throw new CreateAppError(
      'E_MISSING_OVERRIDE_KERNEL',
      `缺少 Override 内核 / 基础设施，无法生成覆盖层骨架：\n${missingPrereq
        .map((f) => `  - ${f}`)
        .join('\n')}`,
      'Override 内核与基础设施由模板的 `overrides` 特性提供（admin 与 h5 模板都有）：\n' +
        '  · 新项目：生成时勾上「多租户定制体系 / 学校定制体系」特性\n' +
        `  · 已有项目：从对应模板真源同步 ${path.posix.dirname(OVERRIDE_KERNEL_FILE)}/ ` +
        `与输出目录下的 ${overrideInfraFiles(options.platform).join(' / ')}\n` +
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

  // 一个文件都没写也要报残留：缩减模块集时生成的文件往往全都已存在（`-y` 下逐个跳过），
  // 而那正是残留最容易出现的一次运行
  if (resolvedFiles.length === 0) {
    console.log(pc.yellow('所有文件已存在，无需生成'));
    warnOrphanModuleDirs(outputDir, options.project, options.output);
    return;
  }

  // 写入文件
  writeFiles(resolvedFiles, outputDir);
  console.log(pc.green('\n✅ 已生成以下文件：\n'));
  printFileTree(resolvedFiles, options.output);

  warnOrphanModuleDirs(outputDir, options.project, options.output);

  printNextSteps(options.output, options.project, options.platform);
}

/** 接线由模板提供的基础设施完成（前置检查已保证它们在场），这里只提示租户侧还要做什么 */
function printNextSteps(output: string, project: string, platform: Platform): void {
  console.log(pc.bold('\n📝 下一步：'));
  if (platform === 'mobile') {
    console.log(
      `  1. 在 ${pc.cyan(`${output}/registry.ts`)} 的 SCHOOL_MAP 中添加学校 id → ${project} 的映射，` +
        `并在 ${pc.cyan(`${output}/identity.ts`)} 打开 Bridge / 接口身份来源；单校包用 VITE_BUILD_SCHOOL_CODE=${project}`,
    );
  } else {
    console.log(`  1. 在 ${pc.cyan(`${output}/registry.ts`)} 中添加学校 NID 映射`);
  }
  console.log(`  2. 在各模块的 ${pc.cyan('index.ts')} 中实现定制逻辑`);
  console.log(
    `  3. 常量覆盖写在 ${pc.cyan(`${output}/${project}/constants.ts`)}（不得 import @/constants）\n`,
  );
  console.log(
    pc.dim(`  接线已由 ${output}/index.ts 完成，无需手动改 main.ts / router / constants\n`),
  );
}
