/**
 * 本地发包脚本 - 使用 changeset 管理包版本
 */

import { execSync } from 'child_process';
import fs from 'fs';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import inquirer from 'inquirer';

// 常量配置
const NPM_REGISTRY =
  process.env.NPM_REGISTRY || 'http://npm-registry.zhihuishu.com:4873/';

// 获取当前脚本所在的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 解析命令行参数
const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = {
    mode: '', // 发布模式: release, beta, alpha
    action: '', // 操作类型: full, create, version, publish
    skipPrompts: false, // 是否跳过所有确认提示
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
  -a, --action <action> 指定操作类型 (full, create, version, publish)
  -y, --yes            跳过所有确认提示，自动选择默认选项

${chalk.yellow('示例:')}
  pnpm pre                   # 启动交互式菜单
  pnpm pre -a full -m beta   # 执行完整的 beta 发布流程
  pnpm pre -a create         # 只创建 changeset
  pnpm pre -a publish -y     # 构建并发布，使用默认选项
  `);
};

// 封装确认函数
const confirm = async (
  message: string,
  defaultValue = true,
  skipPrompt = false,
) => {
  if (skipPrompt) {
    console.log(
      `${message} ${chalk.dim(`[自动选择: ${defaultValue ? 'Yes' : 'No'}]`)}`,
    );
    return defaultValue;
  }

  const { answer } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'answer',
      message,
      default: defaultValue,
    },
  ]);

  return answer as boolean;
};

// 执行命令并返回输出
const runCommand = (command: string, silent = false, cwd?: string): string => {
  try {
    return (
      execSync(command, {
        encoding: 'utf-8',
        stdio: silent ? 'pipe' : 'inherit',
        ...(cwd ? { cwd } : {}),
      }) ?? ''
    );
  } catch (error) {
    const exitCode = (error as { status?: number }).status;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `命令执行失败: ${command}${exitCode != null ? ` (exit code: ${exitCode})` : ''}\n${detail}`,
    );
  }
};

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

// 检查 npm 登录状态
const checkNpmLogin = async () => {
  console.log(chalk.blue(`检查 npm 登录状态 (${NPM_REGISTRY})...`));

  try {
    const username = execSync(`npm whoami --registry=${NPM_REGISTRY}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
    console.log(chalk.green(`npm 已登录 (${username})`));
  } catch {
    throw new Error(
      `未登录 npm 私有仓库: ${NPM_REGISTRY}\n请先执行以下命令登录:\n\n  npm login --registry=${NPM_REGISTRY}\n\n登录完成后重新运行发布脚本`,
    );
  }
};

// 检查工作区状态
const checkWorkspace = async () => {
  console.log(chalk.blue('检查代码工作区状态...'));
  const status = runCommand('git status --porcelain', true, projectRoot);

  if (status.trim() !== '') {
    throw new Error(
      `发布失败：存在未提交的代码更改\n请先提交或存储您的更改，然后再尝试发布\n未提交的更改：\n${status}`,
    );
  }

  console.log(chalk.green('✅ 工作区干净'));
};

// 处理发布模式
const handlePreMode = async (mode: string) => {
  const normalizedMode = mode.toLowerCase();
  const preJsonPath = path.join(projectRoot, '.changeset', 'pre.json');

  if (fs.existsSync(preJsonPath)) {
    try {
      const preJson = JSON.parse(fs.readFileSync(preJsonPath, 'utf-8'));
      const currentTag = preJson.tag as string | undefined;
      const currentMode = preJson.mode as string | undefined;

      if (currentMode === 'exit') {
        // pre.json 处于退出状态，清理后重新设置
        console.log(chalk.gray('清理已退出的预发布状态...'));
        fs.unlinkSync(preJsonPath);
      } else if (currentTag === normalizedMode) {
        console.log(
          chalk.cyan(`已处于 ${normalizedMode} 预发布模式，无需切换`),
        );
        return;
      } else {
        // 当前处于预发布模式但要切换到其他模式，先退出
        console.log(chalk.yellow(`退出当前预发布模式 (${currentTag})...`));
        runCommand('npx changeset pre exit', false, projectRoot);
        // 清理 pre.json，确保后续 pre enter 能正常执行
        if (fs.existsSync(preJsonPath)) {
          fs.unlinkSync(preJsonPath);
        }
      }
    } catch {
      console.warn(chalk.yellow('pre.json 文件已损坏，将重新初始化'));
      fs.unlinkSync(preJsonPath);
    }
  }

  switch (normalizedMode) {
    case 'release':
      console.log(chalk.cyan('正式发布模式'));
      break;
    case 'beta':
      console.log(chalk.cyan('Beta 发布模式'));
      runCommand('npx changeset pre enter beta', false, projectRoot);
      break;
    case 'alpha':
      console.log(chalk.cyan('Alpha 发布模式'));
      runCommand('npx changeset pre enter alpha', false, projectRoot);
      break;
    default:
      console.log(chalk.yellow(`未知模式 "${mode}"，使用默认的正式发布模式`));
  }
};

// 设置发布模式
const setupReleaseMode = async (initialMode = '', skipPrompts = false) => {
  if (initialMode) {
    await handlePreMode(initialMode);
    return;
  }

  if (skipPrompts) {
    console.log(chalk.dim('[自动选择: 正式版本]'));
    await handlePreMode('release');
    return;
  }

  const { mode } = await inquirer.prompt([
    {
      type: 'select',
      name: 'mode',
      message: '请选择发布模式:',
      choices: [
        { name: '正式版本', value: 'release' },
        { name: 'Beta 版本', value: 'beta' },
        { name: 'Alpha 版本', value: 'alpha' },
      ],
      default: 'release',
    },
  ]);

  await handlePreMode(mode);
};

// 创建 changeset
const createChangeset = async (skipPrompts = false) => {
  if (await confirm('是否需要创建新的 changeset?', true, skipPrompts)) {
    runCommand('npx changeset', false, projectRoot);
  } else {
    console.log(chalk.yellow('已跳过创建 changeset'));
  }
};

// 更新版本
const updateVersion = async (skipPrompts = false) => {
  console.log(chalk.blue('更新包版本...'));
  runCommand('npx changeset version', false, projectRoot);

  console.log(chalk.yellow('版本已更新，请检查版本变更'));
  if (!(await confirm('是否继续?', true, skipPrompts))) {
    throw new Error(
      '用户取消发布流程\n注意: changeset version 已执行，包版本已更新但未发布。\n如需回退版本变更，请执行: git stash',
    );
  }
};

// 从 changeset 文件中解析变更的包名
const getChangedPackages = async (): Promise<Set<string>> => {
  const changesetDir = path.join(projectRoot, '.changeset');
  if (!fs.existsSync(changesetDir)) {
    return new Set();
  }

  const files = await readdir(changesetDir);
  const mdFiles = files.filter(
    (file) => file.endsWith('.md') && file !== 'README.md',
  );

  const packages = new Set<string>();

  for (const file of mdFiles) {
    const content = await readFile(path.join(changesetDir, file), 'utf-8');
    const parts = content.split('---');
    const frontMatter = parts[1];

    if (frontMatter) {
      // 解析 YAML frontmatter 中的包名，支持带引号和不带引号的格式
      // 例如: '@aix/button': minor 或 "@aix/button": patch
      const lines = frontMatter.trim().split('\n');
      for (const line of lines) {
        const match = line.match(/^['"]?([^'":\s]+)['"]?\s*:/);
        if (match?.[1]) {
          packages.add(match[1]);
        }
      }
    }
  }

  return packages;
};

// 从 git diff 检测版本变更的包（changeset 文件被 version 消费后的 fallback）
const getVersionBumpedPackages = async (): Promise<Set<string>> => {
  const diff = runCommand('git diff --name-only HEAD', true, projectRoot);
  const packages = new Set<string>();

  for (const file of diff.trim().split('\n').filter(Boolean)) {
    if (/^packages\/[^/]+\/package\.json$/.test(file)) {
      const pkgJson = JSON.parse(
        fs.readFileSync(path.join(projectRoot, file), 'utf-8'),
      );
      packages.add(pkgJson.name as string);
    }
  }

  return packages;
};

// 对比本地版本与 npm registry 已发布版本，检测待发布的包
const getUnpublishedPackages = async (): Promise<Set<string>> => {
  const packagesDir = path.join(projectRoot, 'packages');
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const packages = new Set<string>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pkgJsonPath = path.join(packagesDir, entry.name, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    if (pkgJson.private) continue;

    const pkgName = pkgJson.name as string;
    const localVersion = pkgJson.version as string;

    try {
      const publishedVersion = execSync(
        `npm view ${pkgName} version --registry=${NPM_REGISTRY}`,
        { encoding: 'utf-8', stdio: 'pipe' },
      ).trim();

      if (publishedVersion !== localVersion) {
        packages.add(pkgName);
      }
    } catch {
      // 包从未发布过，视为待发布
      packages.add(pkgName);
    }
  }

  return packages;
};

// 检测需要构建的包（多级 fallback）
const detectPackages = async (): Promise<Set<string>> => {
  // 1. 从 changeset md 文件解析
  const fromChangeset = await getChangedPackages();
  if (fromChangeset.size) {
    console.log(chalk.gray('(从 changeset 文件检测到变更的包)'));
    return fromChangeset;
  }

  // 2. 从 git diff 检测（changeset version 后的 unstaged changes）
  const fromDiff = await getVersionBumpedPackages();
  if (fromDiff.size) {
    console.log(chalk.gray('(从 git diff 检测到版本变更的包)'));
    return fromDiff;
  }

  // 3. 对比 npm registry 版本（workspace 已 clean 的情况）
  console.log(chalk.yellow('从 npm registry 对比本地版本，检测待发布的包...'));
  const fromRegistry = await getUnpublishedPackages();
  if (fromRegistry.size) {
    return fromRegistry;
  }

  throw new Error(
    '未找到需要构建的包。请确认是否已创建 changeset 或更新版本号。',
  );
};

// 构建指定的包
const buildPackages = async (packages?: Set<string>) => {
  const packagesToBuild = packages ?? (await detectPackages());

  console.log(chalk.green('需要构建的包:'));
  packagesToBuild.forEach((pkg) => console.log(`  ${pkg}`));

  console.log(chalk.blue('开始构建...'));
  const filterArgs = Array.from(packagesToBuild)
    .map((pkg) => `--filter=${pkg}`)
    .join(' ');

  runCommand(
    `npx turbo run build ${filterArgs} --output-logs=errors-only`,
    false,
    projectRoot,
  );
};

// 发布后的 git 操作
const postPublishGitActions = async (skipPrompts = false) => {
  const status = runCommand('git status --porcelain', true, projectRoot);
  if (!status.trim()) {
    return;
  }

  console.log(chalk.blue('\n发布后 Git 操作:'));
  console.log(chalk.gray('版本变更和 CHANGELOG 需要提交到 Git'));

  // 1. 是否提交版本变更
  if (!(await confirm('是否提交版本变更和 CHANGELOG?', true, skipPrompts))) {
    console.log(chalk.yellow('已跳过 Git 提交，请稍后手动处理'));
    return;
  }

  runCommand(
    'git add packages/ .changeset/ pnpm-lock.yaml',
    false,
    projectRoot,
  );
  runCommand('git commit -m "chore: release packages"', false, projectRoot);
  console.log(chalk.green('✅ 版本变更已提交'));

  // 2. 是否推送代码
  if (await confirm('是否推送代码到远程仓库?', true, skipPrompts)) {
    runCommand('git push', false, projectRoot);
    console.log(chalk.green('✅ 代码已推送'));
  }

  // 3. 是否推送 tags
  if (await confirm('是否推送 Git Tags?', true, skipPrompts)) {
    runCommand('git push --tags', false, projectRoot);
    console.log(chalk.green('✅ Tags 已推送'));
  }
};

// 获取当前预发布 tag（beta/alpha），正式发布返回 undefined
const getPreReleaseTag = (): string | undefined => {
  const preJsonPath = path.join(projectRoot, '.changeset', 'pre.json');
  if (!fs.existsSync(preJsonPath)) {
    return undefined;
  }
  try {
    const preJson = JSON.parse(fs.readFileSync(preJsonPath, 'utf-8'));
    return preJson.tag as string | undefined;
  } catch {
    return undefined;
  }
};

// 发布包
const publishPackages = async (skipPrompts = false) => {
  const preTag = getPreReleaseTag();
  const tagInfo = preTag ? ` (dist-tag: ${preTag})` : ' (dist-tag: latest)';

  console.log(chalk.blue('发布包...'));
  console.log(chalk.yellow(`警告: 即将发布到 npm 仓库${tagInfo}`));

  if (!(await confirm('确认发布?', true, skipPrompts))) {
    throw new Error('用户取消发布');
  }

  const tagFlag = preTag ? ` --tag ${preTag}` : '';
  runCommand(
    `npx changeset publish --no-git-checks${tagFlag}`,
    false,
    projectRoot,
  );
  console.log(chalk.green('✅ 发布完成!'));

  await postPublishGitActions(skipPrompts);
};

// 执行指定操作
const executeAction = async (
  action: string,
  mode: string,
  skipPrompts: boolean,
) => {
  switch (action.toLowerCase()) {
    case 'full':
      await runFullProcess(skipPrompts, mode);
      break;
    case 'create':
      await createChangeset(skipPrompts);
      break;
    case 'version':
      await checkWorkspace();
      await setupReleaseMode(mode, skipPrompts);
      await updateVersion(skipPrompts);
      break;
    case 'publish':
      await checkNpmLogin();
      await checkWorkspace();
      await buildPackages();
      await publishPackages(skipPrompts);
      break;
    default:
      throw new Error(
        `未知的操作类型 "${action}"，可选值: full, create, version, publish`,
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
    await executeAction(args.action, args.mode, args.skipPrompts);
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
        { name: '退出', value: 'exit' },
      ],
      default: 'full',
    },
  ]);

  if (action === 'exit') {
    console.log(chalk.green('已退出'));
    return;
  }

  // 统一走 executeAction，模式选择由 setupReleaseMode 内部处理
  await executeAction(action, '', args.skipPrompts);
};

// 完整发布流程
const runFullProcess = async (skipPrompts = false, mode = '') => {
  await checkNpmLogin();
  await checkWorkspace();

  // 模式设置必须在 checkWorkspace 之后，因为 changeset pre enter 会修改 pre.json
  await setupReleaseMode(mode, skipPrompts);

  // 检查是否已有 changeset 文件，没有则引导创建
  let changedPackages = await getChangedPackages();
  if (!changedPackages.size) {
    console.log(chalk.yellow('未检测到现有的 changeset 文件，需要先创建'));
    runCommand('npx changeset', false, projectRoot);
    changedPackages = await getChangedPackages();
    if (!changedPackages.size) {
      throw new Error('未创建任何 changeset，发布流程终止');
    }
  } else {
    await createChangeset(skipPrompts);
    // 重新解析，包含可能新增的 changeset
    changedPackages = await getChangedPackages();
  }

  await updateVersion(skipPrompts);
  await buildPackages(changedPackages);
  await publishPackages(skipPrompts);
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
