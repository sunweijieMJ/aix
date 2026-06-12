/**
 * 本地发包脚本 - 使用 changeset 管理包版本
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import inquirer from 'inquirer';

// 导入共享模块
import {
  NPM_UNPUBLISH_TIME_LIMIT_HOURS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
  runWithRetry,
  confirm,
} from './shared.js';

// 导入功能模块
import {
  getNpmRegistry,
  checkNpmLogin,
  deprecatePackageVersion,
  unpublishPackageVersion,
} from './npm.js';
import { checkWorkspace, commitVersionChanges, postPublishGitActions } from './git.js';
import { getWorkspacePackages } from './workspace.js';
import {
  setupReleaseMode,
  createChangeset,
  updateVersion,
  getChangedPackages,
  getVersionBumpedPackages,
  detectPackages,
  getPreReleaseTag,
} from './changeset.js';
import { buildPackages } from './build.js';

// 获取当前脚本所在的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 查找项目根目录
const findProjectRoot = (startDir: string): string => {
  let currentDir = startDir;

  while (true) {
    const workspaceFilePath = path.join(currentDir, 'pnpm-workspace.yaml');
    if (fs.existsSync(workspaceFilePath)) {
      return currentDir;
    }

    const parentDir = path.resolve(currentDir, '..');
    if (parentDir === currentDir) {
      throw new Error('无法找到项目根目录 (未找到 pnpm-workspace.yaml)');
    }
    currentDir = parentDir;
  }
};

// 从脚本所在目录开始查找项目根目录
const projectRoot = findProjectRoot(__dirname);

const NPM_REGISTRY = getNpmRegistry(projectRoot);

// 解析命令行参数
const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = {
    mode: '', // 发布模式: release, beta, alpha
    action: '', // 操作类型: full, create, version, publish
    skipPrompts: false, // 是否跳过所有确认提示
    dryRun: false, // 干运行模式，只显示将要发布的包，不实际发布
    help: false, // 显示帮助信息
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--mode' || arg === '-m') {
      result.mode = args[i + 1] || '';
      i++;
    } else if (arg === '--action' || arg === '-a') {
      result.action = args[i + 1] || '';
      i++;
    } else if (arg === '--yes' || arg === '-y') {
      result.skipPrompts = true;
    } else if (arg === '--dry-run' || arg === '-d') {
      result.dryRun = true;
    }
  }

  return result;
};

// 显示帮助信息
const showHelp = () => {
  console.log(`
${chalk.cyan('本地包发布工具')}

${chalk.yellow('用法:')}
  pnpm pre [选项]

${chalk.yellow('选项:')}
  -h, --help           显示帮助信息
  -m, --mode <mode>    指定发布模式 (release, beta, alpha)
  -a, --action <action> 指定操作类型
  -y, --yes            跳过所有确认提示，自动选择默认选项
  -d, --dry-run        干运行模式，只显示将要发布的包，不实际发布

${chalk.yellow('操作类型:')}
  full                 完整发布流程（创建 changeset → 更新版本 → 构建 → 发布）
  create               仅创建 changeset
  version              仅更新版本号
  publish              仅构建并发布
  deprecate            废弃包版本（推荐，不删除包）
  unpublish            撤回包版本（仅 ${NPM_UNPUBLISH_TIME_LIMIT_HOURS} 小时内，高风险）

${chalk.yellow('示例:')}
  pnpm pre                   # 启动交互式菜单
  pnpm pre -a full -m beta   # 执行完整的 beta 发布流程
  pnpm pre -a create         # 只创建 changeset
  pnpm pre -a publish -y     # 构建并发布，使用默认选项
  pnpm pre -a publish -d     # 预览将要发布的包（不实际发布）
  pnpm pre -a deprecate      # 废弃指定包版本
  `);
};

// 发布包
// knownPackages: 调用方已检测到的待发布包名集合（用于 changeset 已被 version 消费的场景，
// 此时 .changeset/*.md 已被删除，单靠 getChangedPackages 无法还原汇总信息）
const publishPackages = async (
  skipPrompts = false,
  dryRun = false,
  knownPackages?: Set<string>,
) => {
  const preTag = getPreReleaseTag(projectRoot);
  const tagInfo = preTag ? ` (dist-tag: ${preTag})` : ' (dist-tag: latest)';

  // 解析待发布的包：优先使用调用方传入的列表，否则按 changeset → git diff fallback 检测
  const resolvePackages = async (): Promise<Set<string>> => {
    if (knownPackages && knownPackages.size > 0) return knownPackages;
    const fromChangeset = await getChangedPackages(projectRoot);
    if (fromChangeset.size > 0) return fromChangeset;
    return getVersionBumpedPackages(projectRoot);
  };

  // Dry-run 模式：只显示待发布的包
  if (dryRun) {
    console.log(chalk.cyan('\n🔍 Dry-run 模式 - Changeset 将发布以下包:'));
    console.log(chalk.gray(`目标 Registry: ${NPM_REGISTRY}`));
    console.log(chalk.gray(`Dist Tag: ${preTag || 'latest'}\n`));

    const targetPackages = await resolvePackages();

    if (targetPackages.size === 0) {
      console.log(chalk.yellow('未检测到需要发布的包 (无 changeset 且无版本变更)'));
      return;
    }

    for (const pkgName of targetPackages) {
      const pkg = getWorkspacePackages(projectRoot).find((p) => p.name === pkgName);
      if (pkg) {
        console.log(`  📦 ${chalk.green(pkg.name)}@${chalk.cyan(pkg.version)}`);
      }
    }

    console.log(chalk.gray(`\n共 ${targetPackages.size} 个包待发布`));
    console.log(chalk.yellow('\n(Dry-run 模式，未实际发布)'));
    return;
  }

  console.log(chalk.blue('发布包...'));
  console.log(chalk.yellow(`警告: 即将发布到 npm 仓库${tagInfo}`));

  if (!(await confirm('确认发布?', true, skipPrompts))) {
    throw new Error('用户取消发布');
  }

  // 记录发布前的包列表（用于发布汇总）
  const targetPackages = await resolvePackages();

  // 防护：未检测到版本变更（如版本变更已提交、上次发布失败后重跑）时，
  // changeset publish 仍会发布 registry 中缺失当前版本的包，但这些包未经本次构建/校验
  if (targetPackages.size === 0) {
    console.log(chalk.yellow('\n⚠️  未检测到待发布的版本变更（可能已提交，如上次发布失败后重跑）'));
    console.log(chalk.yellow('changeset publish 仍会发布 registry 中缺失当前版本的包'));
    console.log(chalk.yellow('这些包未经本次流程构建，请确认本地产物（es/、lib/）是最新构建结果'));
    if (!(await confirm('确认产物有效并继续发布?', false, skipPrompts))) {
      throw new Error('用户取消发布，请先构建后重试（pnpm build 或 pnpm pre -a publish）');
    }
  }
  const packagesBeforePublish: Array<{ name: string; version: string }> = [];
  for (const pkgName of targetPackages) {
    const pkg = getWorkspacePackages(projectRoot).find((p) => p.name === pkgName);
    if (pkg) {
      packagesBeforePublish.push({ name: pkg.name, version: pkg.version });
    }
  }

  // 先提交版本变更再发布（changesets 官方推荐顺序：version → commit → publish）
  // changeset publish 会在当前 HEAD 上打 tag，先提交才能让 tag 指向包含版本变更的 commit
  // 若 publish 失败，重跑 publish 即可（changeset 按 registry 缺失版本发布，已提交的版本变更不受影响）
  const committed = await commitVersionChanges(projectRoot, skipPrompts);

  // 说明：changeset publish 在两种模式下的行为
  // - pre 模式（beta/alpha）：自动使用 pre.json 中配置的标签，不支持 --tag 标志
  // - release 模式：默认使用 latest 标签
  // 因此两种模式下都不需要显式指定 --tag

  // 使用带重试的命令执行，应对网络波动
  await runWithRetry(`npx changeset publish`, {
    cwd: projectRoot,
    maxRetries: DEFAULT_MAX_RETRIES,
    retryDelayMs: DEFAULT_RETRY_DELAY_MS,
  });

  // 显示发布汇总
  if (packagesBeforePublish.length > 0) {
    console.log(chalk.green('\n📦 发布汇总:'));
    for (const pkg of packagesBeforePublish) {
      console.log(`  ✅ ${pkg.name}@${pkg.version}`);
    }
  }

  console.log(chalk.green('\n✅ 发布完成!'));

  await postPublishGitActions(projectRoot, skipPrompts, committed);
};

// 执行指定操作
const executeAction = async (
  action: string,
  mode: string,
  skipPrompts: boolean,
  dryRun: boolean,
) => {
  switch (action.toLowerCase()) {
    case 'full':
      await runFullProcess(skipPrompts, mode, dryRun);
      break;
    case 'create':
      await createChangeset(projectRoot, skipPrompts);
      break;
    case 'version':
      checkWorkspace(projectRoot);
      await setupReleaseMode(projectRoot, mode, skipPrompts);
      await updateVersion(projectRoot, skipPrompts);
      break;
    case 'publish': {
      // 不调用 checkWorkspace：publish 通常在 changeset version 之后执行，
      // 此时 package.json / CHANGELOG.md / pnpm-lock.yaml 必然处于未提交状态
      let packages: Set<string> | undefined;
      if (!dryRun) {
        checkNpmLogin(NPM_REGISTRY);
        // allowEmpty：上次发布失败后重跑时 changeset 已消费、版本变更已提交，
        // 检测结果为空属预期，跳过构建并交由 publishPackages 的防护分支确认后继续
        packages = await detectPackages(projectRoot, { allowEmpty: true });
        if (packages.size > 0) {
          await buildPackages(projectRoot, packages);
        } else {
          console.log(chalk.yellow('未检测到版本变更，跳过构建（可能为上次发布失败后的重跑）'));
        }
      }
      await publishPackages(skipPrompts, dryRun, packages);
      break;
    }
    case 'deprecate':
      checkNpmLogin(NPM_REGISTRY);
      await deprecatePackageVersion(projectRoot, NPM_REGISTRY, skipPrompts);
      break;
    case 'unpublish':
      checkNpmLogin(NPM_REGISTRY);
      await unpublishPackageVersion(projectRoot, NPM_REGISTRY, skipPrompts);
      break;
    default:
      throw new Error(
        `未知的操作类型 "${action}"，可选值: full, create, version, publish, deprecate, unpublish`,
      );
  }
};

// 显示交互式菜单
const showInteractiveMenu = async (args: ReturnType<typeof parseArgs>) => {
  if (args.help) {
    showHelp();
    return;
  }

  if (args.action) {
    await executeAction(args.action, args.mode, args.skipPrompts, args.dryRun);
    return;
  }

  console.log(chalk.cyan('========================================'));
  console.log(chalk.cyan('           本地包发布工具              '));
  console.log(chalk.cyan('========================================'));

  const { action } = await inquirer.prompt([
    {
      type: 'select',
      name: 'action',
      message: '请选择要执行的操作:',
      choices: [
        { name: '完整发布流程', value: 'full' },
        { name: '仅创建 changeset', value: 'create' },
        { name: '仅更新版本号', value: 'version' },
        { name: '仅构建并发布', value: 'publish' },
        { name: '预览待发布的包 (dry-run)', value: 'dry-run' },
        { name: '废弃包版本 (deprecate)', value: 'deprecate' },
        { name: '撤回包版本 (unpublish)', value: 'unpublish' },
        { name: '退出', value: 'exit' },
      ],
      default: 'full',
    },
  ]);

  if (action === 'exit') {
    console.log(chalk.green('已退出'));
    return;
  }

  if (action === 'dry-run') {
    await publishPackages(true, true);
    return;
  }

  // 统一走 executeAction，模式选择由 setupReleaseMode 内部处理
  await executeAction(action, '', args.skipPrompts, args.dryRun);
};

// 完整发布流程
const runFullProcess = async (skipPrompts = false, mode = '', dryRun = false) => {
  // Dry-run 模式跳过所有检查，直接显示待发布的包
  if (dryRun) {
    await publishPackages(skipPrompts, true);
    return;
  }

  checkNpmLogin(NPM_REGISTRY);
  checkWorkspace(projectRoot);

  // 模式设置必须在 checkWorkspace 之后，因为 changeset pre enter 会修改 pre.json
  await setupReleaseMode(projectRoot, mode, skipPrompts);

  // 检查是否已有 changeset 文件，没有则引导创建
  const initialChangedPackages = await getChangedPackages(projectRoot);
  if (!initialChangedPackages.size) {
    console.log(chalk.yellow('未检测到现有的 changeset 文件，需要先创建'));
    const created = await createChangeset(projectRoot, skipPrompts);
    if (!created) {
      throw new Error('未创建任何 changeset，发布流程终止');
    }
    const afterCreate = await getChangedPackages(projectRoot);
    if (!afterCreate.size) {
      throw new Error('未创建任何 changeset，发布流程终止');
    }
  } else if (!skipPrompts) {
    // 已有 changeset：仅在交互模式下询问是否追加新的 changeset
    // skipPrompts 下直接复用已有 changeset，避免卡在 inquirer 的必填输入
    await createChangeset(projectRoot, skipPrompts);
  }

  await updateVersion(projectRoot, skipPrompts);
  // updateVersion 后 .changeset/*.md 已消费，改用 detectPackages 的 git diff fallback
  // 捕获 changeset version 连带 bump 的所有包（而不只是 frontmatter 显式列出的包）
  const allBumpedPackages = await detectPackages(projectRoot);
  await buildPackages(projectRoot, allBumpedPackages);
  await publishPackages(skipPrompts, false, allBumpedPackages);
  console.log(chalk.green('✅ 发布流程完成'));
};

// 主函数
const main = async () => {
  try {
    const args = parseArgs();
    await showInteractiveMenu(args);
  } catch (error) {
    console.error(chalk.red('❌ 执行过程中出现错误:'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    process.exit(1);
  }
};

// 执行主函数
main();
