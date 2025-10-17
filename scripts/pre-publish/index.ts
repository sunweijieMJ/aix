/**
 * 本地发包脚本 - 使用 changeset 管理包版本
 */

import { execSync } from 'child_process';
import fs from 'fs';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import inquirer from 'inquirer';

// 常量配置
const NPM_REGISTRY = 'https://it-artifactory.yitu-inc.com/api/npm/npm/';

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

// 创建readline接口用于用户交互
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 封装问答函数
const question = async (
  query: string,
  defaultValue = '',
  skipPrompt = false,
) => {
  if (skipPrompt && defaultValue) {
    console.log(`${query} ${chalk.dim(`[自动选择: ${defaultValue}]`)}`);
    return defaultValue;
  }

  const { answer } = await inquirer.prompt([
    {
      type: 'input',
      name: 'answer',
      message: defaultValue ? `${query} [${defaultValue}]:` : query,
      default: defaultValue,
    },
  ]);

  return answer || defaultValue || '';
};

// 执行命令并返回输出
const runCommand = (command: string, silent = false, cwd?: string): string => {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit',
      ...(cwd ? { cwd } : {}),
    });
  } catch (error) {
    console.error(chalk.red(`命令执行失败: ${command}`));
    console.error(error);
    process.exit(1);
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
  console.log(chalk.blue('检查 npm 登录状态...'));

  try {
    execSync(`npm whoami --registry=${NPM_REGISTRY}`, { stdio: 'pipe' });
    console.log(chalk.green('npm 已登录'));
  } catch {
    console.error(chalk.red('未登录 npm 私有仓库，请先登录:'));
    console.error(chalk.yellow(`npm login --registry=${NPM_REGISTRY}`));
    process.exit(1);
  }
};

// 检查工作区状态
const checkWorkspace = async () => {
  console.log(chalk.blue('检查代码工作区状态...'));
  const status = runCommand('git status --porcelain', true, projectRoot);

  if (status.trim() !== '') {
    console.error(chalk.red('❌ 发布失败：存在未提交的代码更改'));
    console.error(chalk.yellow('请先提交或存储您的更改，然后再尝试发布'));
    console.error(chalk.gray('未提交的更改：\n' + status));
    process.exit(1);
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
      if (preJson.mode === normalizedMode) {
        return normalizedMode === 'release' ? '' : `--tag ${normalizedMode}`;
      }
      runCommand('npx changeset pre exit', false, projectRoot);
    } catch (error) {
      console.error(chalk.red('读取 pre.json 文件失败:'));
      console.error(error);
    }
  }

  switch (normalizedMode) {
    case 'release':
      console.log(chalk.cyan('正式发布模式'));
      return '';
    case 'beta':
      console.log(chalk.cyan('Beta 发布模式'));
      runCommand('npx changeset pre enter beta', false, projectRoot);
      return '--tag beta';
    case 'alpha':
      console.log(chalk.cyan('Alpha 发布模式'));
      runCommand('npx changeset pre enter alpha', false, projectRoot);
      return '--tag alpha';
    default:
      console.log(chalk.yellow(`未知模式 "${mode}"，使用默认的正式发布模式`));
      return '';
  }
};

// 设置发布模式
const setupReleaseMode = async (initialMode = '', skipPrompts = false) => {
  if (initialMode) {
    return handlePreMode(initialMode);
  }

  console.log(chalk.blue('请选择发布模式:'));
  console.log('1) 正式版本 (默认)\n2) Beta 版本\n3) Alpha 版本');

  const choice = await question('请选择发布模式', '1', skipPrompts);

  switch (choice) {
    case '1':
      return handlePreMode('release');
    case '2':
      return handlePreMode('beta');
    case '3':
      return handlePreMode('alpha');
    default:
      console.log(chalk.yellow('无效选择，使用默认的正式发布模式'));
      return handlePreMode('release');
  }
};

// 创建 changeset
const createChangeset = async (skipPrompts = false) => {
  const needCreate = await question(
    '是否需要创建新的 changeset? (y/n)',
    'y',
    skipPrompts,
  );
  if (needCreate.toLowerCase() === 'y') {
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
  const continuePublish = await question('是否继续? (y/n)', 'y', skipPrompts);

  if (continuePublish.toLowerCase() !== 'y') {
    console.log(chalk.red('已取消发布流程'));
    process.exit(1);
  }
};

// 构建变更的包
const buildPackages = async () => {
  console.log(chalk.blue('分析并构建变更的包...'));

  const changesetDir = path.join(projectRoot, '.changeset');
  if (!fs.existsSync(changesetDir)) {
    console.error(chalk.red('未发现 .changeset 目录，请先创建 changeset'));
    process.exit(1);
  }

  const files = await readdir(changesetDir);
  const mdFiles = files.filter(
    (file) => file.endsWith('.md') && file !== 'README.md',
  );

  if (!mdFiles.length) {
    console.error(chalk.red('未找到任何 changeset 文件'));
    process.exit(1);
  }

  const packagesToBuilt = new Set<string>();

  for (const file of mdFiles) {
    const content = await readFile(path.join(changesetDir, file), 'utf-8');
    const frontMatter = content.split('---')[1];

    if (frontMatter) {
      const packageMatches = frontMatter.match(/'([^']+)':|"([^"]+)":/g);
      packageMatches?.forEach((match) => {
        const packageName = match.replace(/['":]/g, '');
        packagesToBuilt.add(packageName);
      });
    }
  }

  if (!packagesToBuilt.size) {
    console.error(chalk.red('无需要构建的包'));
    process.exit(1);
  }

  console.log(chalk.green('需要构建的包:'));
  packagesToBuilt.forEach((pkg) => console.log(pkg));

  console.log(chalk.blue('开始构建...'));
  const filterArgs = Array.from(packagesToBuilt)
    .map((pkg) => `--filter=${pkg}`)
    .join(' ');

  runCommand(
    `npx turbo run build ${filterArgs} --output-logs=errors-only`,
    false,
    projectRoot,
  );
};

// 发布包
const publishPackages = async (skipPrompts = false) => {
  console.log(chalk.blue('发布包...'));
  console.log(chalk.yellow('警告: 即将发布到 npm 仓库'));

  const confirmPublish = await question('确认发布? (y/n)', 'y', skipPrompts);
  if (confirmPublish.toLowerCase() === 'y') {
    runCommand('npx changeset publish --no-git-checks', false, projectRoot);
    console.log(chalk.green('✅ 发布完成!'));
  } else {
    console.log(chalk.red('已取消发布'));
    process.exit(1);
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
      type: 'list',
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

  if (['full', 'publish', 'version'].includes(action)) {
    const { mode } = await inquirer.prompt([
      {
        type: 'list',
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
  }

  switch (action) {
    case 'full':
      await runFullProcess(args.skipPrompts);
      break;
    case 'create':
      await createChangeset(args.skipPrompts);
      console.log(chalk.green('✅ changeset 创建完成'));
      break;
    case 'version':
      await updateVersion(args.skipPrompts);
      break;
    case 'publish':
      await buildPackages();
      await publishPackages(args.skipPrompts);
      break;
    default:
      console.log(chalk.yellow('无效选择，执行默认的完整发布流程'));
      await handlePreMode(args.mode || 'release');
      await runFullProcess(args.skipPrompts);
  }
};

// 执行指定操作
const executeAction = async (
  action: string,
  mode: string,
  skipPrompts: boolean,
) => {
  if (['full', 'publish'].includes(action)) {
    await setupReleaseMode(mode, skipPrompts);
  }

  switch (action.toLowerCase()) {
    case 'full':
      await runFullProcess(skipPrompts);
      break;
    case 'create':
      await createChangeset(skipPrompts);
      break;
    case 'version':
      await updateVersion(skipPrompts);
      break;
    case 'publish':
      await buildPackages();
      await publishPackages(skipPrompts);
      break;
    default:
      console.log(
        chalk.yellow(`未知的操作类型 "${action}"，执行默认的完整发布流程`),
      );
      await runFullProcess(skipPrompts);
  }
};

// 完整发布流程
const runFullProcess = async (skipPrompts = false) => {
  try {
    await checkNpmLogin();
    await checkWorkspace();
    await createChangeset(skipPrompts);
    await updateVersion(skipPrompts);
    await buildPackages();
    await publishPackages(skipPrompts);
    console.log(chalk.green('✅ 发布流程完成'));
  } catch (error) {
    console.error(chalk.red('❌ 发布过程中出现错误:'));
    console.error(error);
    process.exit(1);
  }
};

// 主函数
const main = async () => {
  try {
    const args = parseArgs();
    await showInteractiveMenu(args);
    console.log(chalk.green('✅ 操作完成'));
  } catch (error) {
    console.error(chalk.red('❌ 执行过程中出现错误:'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    process.exit(1);
  } finally {
    rl.close();
  }
};

// 执行主函数
main();
