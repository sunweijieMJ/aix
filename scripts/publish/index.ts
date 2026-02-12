/**
 * 本地发包脚本 - 使用 changeset 管理包版本
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import inquirer from 'inquirer';

// 常量配置
const WORKSPACE_DIRS = ['packages', 'internal']; // 可发布的 workspace 目录
const BUILD_OUTPUTS = ['es', 'lib', 'dist']; // 构建产物目录
const DEFAULT_REGISTRY = 'http://npm-registry.zhihuishu.com:4873/'; // 默认私有 npm 仓库地址

// 重试配置
const DEFAULT_MAX_RETRIES = 3; // 网络操作默认最大重试次数
const DEFAULT_RETRY_DELAY_MS = 3000; // 网络操作默认重试延迟（毫秒）

// npm 包管理限制
const NPM_UNPUBLISH_TIME_LIMIT_HOURS = 72; // npm unpublish 时间限制（小时）

// 从 .npmrc 文件中读取 registry 配置
const readRegistryFromNpmrc = (
  npmrcPath: string,
  scope?: string,
): string | null => {
  if (!fs.existsSync(npmrcPath)) return null;
  const npmrc = fs.readFileSync(npmrcPath, 'utf-8');

  // 优先匹配 scoped registry（如 @aix:registry=...）
  if (scope) {
    const scopeMatch = npmrc.match(
      new RegExp(`${scope}:registry\\s*=\\s*(.+)`),
    );
    if (scopeMatch?.[1]) return scopeMatch[1].trim();
  }

  // 回退到全局 registry
  const match = npmrc.match(/^registry\s*=\s*(.+)/m);
  return match?.[1]?.trim() ?? null;
};

// 获取 npm registry 地址（优先级：环境变量 > 项目 .npmrc > 全局 .npmrc > 默认值）
const getNpmRegistry = (): string => {
  // 1. 环境变量
  if (process.env.NPM_REGISTRY) {
    return process.env.NPM_REGISTRY;
  }

  const scope = '@aix';

  // 2. 项目级 .npmrc（优先读取 scoped registry）
  const projectNpmrc = path.join(projectRoot, '.npmrc');
  const fromProject = readRegistryFromNpmrc(projectNpmrc, scope);
  if (fromProject) return fromProject;

  // 3. 全局 ~/.npmrc
  const globalNpmrc = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.npmrc',
  );
  const fromGlobal = readRegistryFromNpmrc(globalNpmrc, scope);
  if (fromGlobal) return fromGlobal;

  // 4. 默认私有仓库
  return DEFAULT_REGISTRY;
};

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

const NPM_REGISTRY = getNpmRegistry();

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

// 延迟函数
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// 执行命令的通用函数
const execCommand = (
  command: string,
  options: { cwd?: string; silent?: boolean } = {},
): string => {
  const { cwd, silent = false } = options;
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit',
      ...(cwd ? { cwd } : {}),
    });
  } catch (error) {
    const exitCode = (error as { status?: number }).status;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `命令执行失败: ${command}${exitCode != null ? ` (exit code: ${exitCode})` : ''}\n${detail}`,
      { cause: error },
    );
  }
};

// 执行命令并捕获输出（静默模式）
const exec = (command: string, cwd?: string): string =>
  execCommand(command, { cwd, silent: true });

// 执行命令并显示输出（交互模式）
const run = (command: string, cwd?: string): void => {
  execCommand(command, { cwd, silent: false });
};

// 带重试的命令执行（用于网络相关操作，交互模式）
const runWithRetry = async (
  command: string,
  options: {
    cwd?: string;
    maxRetries?: number;
    retryDelayMs?: number;
  } = {},
): Promise<void> => {
  const {
    cwd,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      run(command, cwd);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const waitTime = retryDelayMs * attempt;
        console.log(
          chalk.yellow(
            `⚠️ 命令执行失败，${waitTime / 1000} 秒后进行第 ${attempt + 1}/${maxRetries} 次重试...`,
          ),
        );
        await sleep(waitTime);
      }
    }
  }

  throw lastError;
};

// 检查 npm 登录状态
const checkNpmLogin = () => {
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
const checkWorkspace = () => {
  console.log(chalk.blue('检查代码工作区状态...'));
  const status = exec('git status --porcelain', projectRoot);

  if (status.trim() !== '') {
    throw new Error(
      `发布失败：存在未提交的代码更改\n请先提交或存储您的更改，然后再尝试发布\n未提交的更改：\n${status}`,
    );
  }

  console.log(chalk.green('✅ 工作区干净'));
};

// pre.json 文件结构类型
interface PreJsonFile {
  mode: string;
  tag: string;
  initialVersions: Record<string, string>;
  changesets: string[];
}

// 安全解析 pre.json 文件
const parsePreJson = (filePath: string): PreJsonFile | null => {
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    // 类型守卫：确保必要字段存在且类型正确
    if (
      typeof content === 'object' &&
      content !== null &&
      typeof content.mode === 'string' &&
      typeof content.tag === 'string'
    ) {
      return content as PreJsonFile;
    }
    return null;
  } catch {
    return null;
  }
};

// 处理发布模式
const handlePreMode = async (mode: string) => {
  const normalizedMode = mode.toLowerCase();
  const preJsonPath = path.join(projectRoot, '.changeset', 'pre.json');

  if (fs.existsSync(preJsonPath)) {
    const preJson = parsePreJson(preJsonPath);

    if (!preJson) {
      // 文件损坏或格式无效
      console.warn(chalk.yellow('pre.json 文件已损坏，将重新初始化'));
      fs.unlinkSync(preJsonPath);
    } else if (preJson.mode !== 'pre' || !preJson.tag) {
      // changeset 的 pre.json 在预发布模式下 mode 为 "pre"
      // 如果 mode 不是 "pre" 或者没有有效的 tag，说明文件状态异常
      console.log(chalk.gray('清理无效的预发布状态文件...'));
      fs.unlinkSync(preJsonPath);
    } else if (preJson.tag === normalizedMode) {
      // 已处于目标预发布模式
      console.log(chalk.cyan(`已处于 ${normalizedMode} 预发布模式，无需切换`));
      return;
    } else {
      // 需要切换模式：从预发布退出（无论是切换到 release 还是其他预发布模式）
      console.log(chalk.yellow(`退出当前预发布模式 (${preJson.tag})...`));
      run('npx changeset pre exit', projectRoot);
    }
  }

  switch (normalizedMode) {
    case 'release':
      console.log(chalk.cyan('正式发布模式'));
      break;
    case 'beta':
      console.log(chalk.cyan('Beta 发布模式'));
      run('npx changeset pre enter beta', projectRoot);
      break;
    case 'alpha':
      console.log(chalk.cyan('Alpha 发布模式'));
      run('npx changeset pre enter alpha', projectRoot);
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

// 创建 changeset，返回是否实际创建（中文交互版）
const createChangeset = async (skipPrompts = false): Promise<boolean> => {
  if (!(await confirm('是否需要创建新的 changeset?', true, skipPrompts))) {
    console.log(chalk.yellow('已跳过创建 changeset'));
    return false;
  }

  const publishablePackages = getPublishablePackages();

  if (publishablePackages.length === 0) {
    console.log(chalk.yellow('没有可发布的包'));
    return false;
  }

  // 1. 选择要包含的包
  const { selectedPackages } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedPackages',
      message: '请选择要发布的包:',
      choices: publishablePackages.map((pkg: WorkspacePackage) => ({
        name: `${pkg.name} ${chalk.gray(`(当前版本: ${pkg.version})`)}`,
        value: pkg.name,
      })),
      validate: (answer: string[]) => {
        if (answer.length === 0) {
          return '请至少选择一个包';
        }
        return true;
      },
    },
  ]);

  // 2. 选择版本类型
  const { bumpType } = await inquirer.prompt([
    {
      type: 'select',
      name: 'bumpType',
      message: '请选择版本升级类型:',
      choices: [
        {
          name: `${chalk.cyan('Patch')} (修复) - 0.0.x ${chalk.gray('(Bug 修复、小改动)')}`,
          value: 'patch',
        },
        {
          name: `${chalk.cyan('Minor')} (功能) - 0.x.0 ${chalk.gray('(新增功能、向后兼容)')}`,
          value: 'minor',
        },
        {
          name: `${chalk.cyan('Major')} (破坏性) - x.0.0 ${chalk.gray('(不兼容的 API 变更)')}`,
          value: 'major',
        },
      ],
      default: 'patch',
    },
  ]);

  // 3. 输入变更说明
  const { summary } = await inquirer.prompt([
    {
      type: 'input',
      name: 'summary',
      message: '请输入变更说明 (将显示在 CHANGELOG 中):',
      validate: (input: string) => {
        if (!input.trim()) {
          return '变更说明不能为空';
        }
        return true;
      },
    },
  ]);

  // 4. 显示摘要并确认
  console.log(chalk.cyan('\n📋 变更集摘要:'));
  console.log(chalk.gray(`版本类型: ${bumpType.toUpperCase()}`));
  console.log(
    chalk.gray(`受影响的包: ${chalk.white(selectedPackages.join(', '))}`),
  );
  console.log(chalk.gray(`变更说明: ${chalk.white(summary)}\n`));

  if (!(await confirm('确认创建此 changeset?', true, skipPrompts))) {
    console.log(chalk.yellow('已取消创建 changeset'));
    return false;
  }

  // 5. 生成 changeset 文件
  const changesetId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const changesetPath = path.join(
    projectRoot,
    '.changeset',
    `${changesetId}.md`,
  );

  const changesetContent = `---
${selectedPackages.map((pkg: string) => `"${pkg}": ${bumpType}`).join('\n')}
---

${summary}
`;

  fs.writeFileSync(changesetPath, changesetContent, 'utf-8');
  console.log(chalk.green(`✅ 已创建 changeset: ${changesetId}.md`));

  return true;
};

// 更新版本
const updateVersion = async (skipPrompts = false) => {
  console.log(chalk.blue('更新包版本...'));

  run('npx changeset version', projectRoot);

  // 清除缓存，因为版本号已更新
  clearWorkspaceCache();

  console.log(chalk.yellow('版本已更新，请检查版本变更'));
  if (!(await confirm('是否继续?', true, skipPrompts))) {
    // 用户取消，提供回滚选项
    console.log(chalk.yellow('用户取消发布流程'));
    console.log(
      chalk.gray(
        '提示：回滚操作会使用 git stash 保存所有未提交的更改（不只是版本变更）',
      ),
    );
    if (
      await confirm(
        '是否回滚版本变更? (将 stash 所有未提交的更改)',
        true,
        skipPrompts,
      )
    ) {
      run('git stash push -m "changeset version rollback"', projectRoot);
      console.log(
        chalk.green(
          '✅ 已使用 git stash 保存所有未提交的更改，可通过 git stash pop 恢复',
        ),
      );
    }
    throw new Error('用户取消发布流程');
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
      // 例如: '@aix/button': minor 或 "@aix/button": patch 或 @aix/button: major
      // 包名可能包含 . 字符，如 @aix/pdf.viewer
      const lines = frontMatter.trim().split('\n');
      for (const line of lines) {
        // 匹配 @scope/name 或普通包名，支持带引号和不带引号，包名可包含 . 字符
        const match = line.match(/^['"]?(@?[\w.-]+\/[\w.-]+|[\w.-]+)['"]?\s*:/);
        if (match?.[1]) {
          packages.add(match[1]);
        }
      }
    }
  }

  return packages;
};

// 规范化路径分隔符（Windows 兼容）
const normalizePath = (filePath: string): string =>
  filePath.replace(/\\/g, '/');

// Workspace 包信息接口
interface WorkspacePackage {
  name: string;
  version: string;
  dir: string;
  pkgJsonPath: string;
  private: boolean;
}

// Workspace 包缓存
let workspacePackagesCache: WorkspacePackage[] | null = null;

// 清除 workspace 包缓存（版本更新后需要调用）
const clearWorkspaceCache = (): void => {
  workspacePackagesCache = null;
};

// 遍历所有 workspace 包（带缓存，避免重复遍历）
const getWorkspacePackages = (): WorkspacePackage[] => {
  if (workspacePackagesCache) {
    return workspacePackagesCache;
  }

  const packages: WorkspacePackage[] = [];

  for (const workspaceDir of WORKSPACE_DIRS) {
    const dirPath = path.join(projectRoot, workspaceDir);
    if (!fs.existsSync(dirPath)) continue;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pkgJsonPath = path.join(dirPath, entry.name, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) continue;

      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      packages.push({
        name: pkgJson.name as string,
        version: pkgJson.version as string,
        dir: path.join(dirPath, entry.name),
        pkgJsonPath,
        private: Boolean(pkgJson.private),
      });
    }
  }

  workspacePackagesCache = packages;
  return packages;
};

// 获取可发布的包（排除 private）
const getPublishablePackages = (): WorkspacePackage[] =>
  getWorkspacePackages().filter((pkg) => !pkg.private);

// 从 git diff 检测版本变更的包（changeset 文件被 version 消费后的 fallback）
const getVersionBumpedPackages = (): Set<string> => {
  const diff = exec('git diff --name-only HEAD', projectRoot);
  const packages = new Set<string>();

  // 动态生成匹配正则：(packages|internal)/[^/]+/package.json
  const workspaceDirsPattern = WORKSPACE_DIRS.join('|');
  const packageJsonRegex = new RegExp(
    `^(${workspaceDirsPattern})/[^/]+/package\\.json$`,
  );

  for (const file of diff.trim().split('\n').filter(Boolean)) {
    // 规范化路径分隔符，确保 Windows 兼容
    const normalizedFile = normalizePath(file);
    if (packageJsonRegex.test(normalizedFile)) {
      const pkgJsonPath = path.join(projectRoot, normalizedFile);
      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        // 跳过 private 包
        if (!pkgJson.private) {
          packages.add(pkgJson.name as string);
        }
      }
    }
  }

  return packages;
};

// 检测需要构建的包（多级 fallback）
const detectPackages = async (): Promise<Set<string>> => {
  // 1. 从 changeset md 文件解析（优先级最高，确保只构建用户明确指定的包）
  const fromChangeset = await getChangedPackages();
  if (fromChangeset.size) {
    console.log(chalk.gray('(从 changeset 文件检测到变更的包)'));
    return fromChangeset;
  }

  // 2. 从 git diff 检测（changeset version 后的 unstaged changes）
  const fromDiff = getVersionBumpedPackages();
  if (fromDiff.size) {
    console.log(chalk.gray('(从 git diff 检测到版本变更的包)'));
    return fromDiff;
  }

  // 正确的流程是：changeset -> changeset version -> changeset publish
  // 只构建 changeset 中明确指定的包，确保发布的准确性

  throw new Error(
    '未找到需要构建的包。请确认是否已创建 changeset 或更新版本号。',
  );
};

// 根据包名获取包目录路径
const getPackageDir = (pkgName: string): string | null => {
  const pkg = getWorkspacePackages().find((p) => p.name === pkgName);
  return pkg?.dir ?? null;
};

// 根据 package.json 的 exports/main/module 字段推断需要的构建产物
const getRequiredOutputs = (pkgJsonPath: string): string[] => {
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  const outputs = new Set<string>();

  // 检查 main 字段 (通常指向 lib/cjs)
  if (pkgJson.main) {
    if (pkgJson.main.includes('/lib/')) outputs.add('lib');
    if (pkgJson.main.includes('/dist/')) outputs.add('dist');
  }

  // 检查 module 字段 (通常指向 es/esm)
  if (pkgJson.module) {
    if (pkgJson.module.includes('/es/')) outputs.add('es');
    if (pkgJson.module.includes('/dist/')) outputs.add('dist');
  }

  // 检查 exports 字段
  if (pkgJson.exports) {
    const exportsStr = JSON.stringify(pkgJson.exports);
    if (exportsStr.includes('/es/')) outputs.add('es');
    if (exportsStr.includes('/lib/')) outputs.add('lib');
    if (exportsStr.includes('/dist/')) outputs.add('dist');
  }

  // 如果没有检测到任何配置，回退到检查任意一个产物目录存在即可
  return outputs.size > 0 ? Array.from(outputs) : [];
};

// 检查包是否需要构建（有 build 脚本）
const needsBuild = (pkgJsonPath: string): boolean => {
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  // 只有在 package.json 中明确定义了 build 脚本时，才需要校验构建产物
  return !!pkgJson.scripts?.build;
};

// 校验构建产物是否存在
const validateBuildOutputs = (packages: Set<string>) => {
  console.log(chalk.blue('校验构建产物...'));
  const errors: string[] = [];

  // 过滤掉 private 包，只校验可发布的包
  const publishablePackagesMap = new Map(
    getPublishablePackages().map((pkg) => [pkg.name, pkg]),
  );

  for (const pkgName of packages) {
    // 跳过 private 包
    if (!publishablePackagesMap.has(pkgName)) {
      continue;
    }

    const pkgDir = getPackageDir(pkgName);
    if (!pkgDir) {
      errors.push(`找不到包目录: ${pkgName}`);
      continue;
    }

    const pkgJsonPath = path.join(pkgDir, 'package.json');

    // 跳过没有 build 脚本的包（不需要构建产物）
    if (!needsBuild(pkgJsonPath)) {
      continue;
    }

    const requiredOutputs = getRequiredOutputs(pkgJsonPath);

    if (requiredOutputs.length > 0) {
      // 根据 package.json 配置精确校验
      const missingOutputs = requiredOutputs.filter(
        (output) => !fs.existsSync(path.join(pkgDir, output)),
      );

      if (missingOutputs.length > 0) {
        errors.push(`${pkgName}: 缺少构建产物 (${missingOutputs.join(', ')})`);
      }
    } else {
      // 回退逻辑：至少存在一个构建产物目录
      const hasAnyOutput = BUILD_OUTPUTS.some((output) =>
        fs.existsSync(path.join(pkgDir, output)),
      );

      if (!hasAnyOutput) {
        errors.push(`${pkgName}: 缺少构建产物 (${BUILD_OUTPUTS.join('/')})`);
      }
    }
  }

  if (errors.length) {
    throw new Error(
      `构建产物校验失败:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }

  console.log(chalk.green('✅ 构建产物校验通过'));
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

  run(
    `npx turbo run build ${filterArgs} --output-logs=errors-only`,
    projectRoot,
  );

  // 校验构建产物
  validateBuildOutputs(packagesToBuild);
};

// 获取已发布包的版本信息，用于生成 commit message
// 注意：此函数在 git add 之后调用，需要检测 staged changes
const getPublishedVersions = (): string[] => {
  const versions: string[] = [];

  for (const pkg of getPublishablePackages()) {
    // 检查该包是否有版本变更
    // 优先检测 staged changes (--cached)，fallback 到 unstaged changes
    try {
      // 规范化路径用于 git 命令
      const relativePath = normalizePath(
        path.relative(projectRoot, pkg.pkgJsonPath),
      );
      let diff = exec(
        `git diff --cached HEAD -- "${relativePath}"`,
        projectRoot,
      );
      // 如果没有 staged changes，尝试检测 unstaged changes
      if (!diff.trim()) {
        diff = exec(`git diff HEAD -- "${relativePath}"`, projectRoot);
      }
      if (diff.includes('"version"')) {
        versions.push(`${pkg.name}@${pkg.version}`);
      }
    } catch {
      // 忽略 diff 错误
    }
  }

  return versions;
};

// 发布后的 git 操作
const postPublishGitActions = async (skipPrompts = false) => {
  const status = exec('git status --porcelain', projectRoot);
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

  // 动态生成 git add 路径（包含所有 workspace 目录）
  const addPaths = [
    ...WORKSPACE_DIRS.map((dir) => `${dir}/`),
    '.changeset/',
    'pnpm-lock.yaml',
  ].join(' ');

  run(`git add ${addPaths}`, projectRoot);

  // 生成包含版本信息的 commit message
  const versions = getPublishedVersions();
  let commitMessage = 'chore(release): update versions\n\n🤖 Generated with AI';

  if (versions.length > 0) {
    const singleLineMessage = `chore(release): ${versions.join(', ')}`;

    // 符合 commitlint 的 header-max-length 规则（72 字符）
    if (singleLineMessage.length <= 72) {
      // 单包或少量包且不超长：使用完整信息
      commitMessage = `${singleLineMessage}\n\n🤖 Generated with AI`;
    } else {
      // 多包或超长：使用简洁的标题 + 详细的 body
      const packageCount = versions.length;
      const shortMessage = `chore(release): 发布 ${packageCount} 个包`;
      const bodyMessage = versions.map((v) => `- ${v}`).join('\n');
      commitMessage = `${shortMessage}\n\n${bodyMessage}\n\n🤖 Generated with AI`;
    }
  }

  // 使用 spawnSync 避免 shell 转义问题（跨平台兼容）
  const result = spawnSync('git', ['commit', '-m', commitMessage], {
    cwd: projectRoot,
    stdio: 'inherit',
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    throw new Error(`命令执行失败: git commit (exit code: ${result.status})`);
  }
  console.log(chalk.green('✅ 版本变更已提交'));

  // 2. 是否推送代码
  if (await confirm('是否推送代码到远程仓库?', true, skipPrompts)) {
    run('git push', projectRoot);
    console.log(chalk.green('✅ 代码已推送'));
  }

  // 3. 是否推送 tags
  if (await confirm('是否推送 Git Tags?', true, skipPrompts)) {
    run('git push --tags', projectRoot);
    console.log(chalk.green('✅ Tags 已推送'));
  }
};

// 获取当前预发布 tag（beta/alpha），正式发布返回 undefined
const getPreReleaseTag = (): string | undefined => {
  const preJsonPath = path.join(projectRoot, '.changeset', 'pre.json');
  if (!fs.existsSync(preJsonPath)) {
    return undefined;
  }
  const preJson = parsePreJson(preJsonPath);
  return preJson?.tag;
};

// 发布包
const publishPackages = async (skipPrompts = false, dryRun = false) => {
  const preTag = getPreReleaseTag();
  const tagInfo = preTag ? ` (dist-tag: ${preTag})` : ' (dist-tag: latest)';

  // Dry-run 模式：只显示 changeset 中指定的包
  if (dryRun) {
    console.log(chalk.cyan('\n🔍 Dry-run 模式 - Changeset 将发布以下包:'));
    console.log(chalk.gray(`目标 Registry: ${NPM_REGISTRY}`));
    console.log(chalk.gray(`Dist Tag: ${preTag || 'latest'}\n`));

    const changedPackages = await getChangedPackages();

    if (changedPackages.size === 0) {
      console.log(chalk.yellow('未在 changeset 中找到需要发布的包'));
      return;
    }

    for (const pkgName of changedPackages) {
      const pkg = getWorkspacePackages().find((p) => p.name === pkgName);
      if (pkg) {
        console.log(`  📦 ${chalk.green(pkg.name)}@${chalk.cyan(pkg.version)}`);
      }
    }

    console.log(chalk.gray(`\n共 ${changedPackages.size} 个包待发布`));
    console.log(chalk.yellow('\n(Dry-run 模式，未实际发布)'));
    return;
  }

  console.log(chalk.blue('发布包...'));
  console.log(chalk.yellow(`警告: 即将发布到 npm 仓库${tagInfo}`));

  if (!(await confirm('确认发布?', true, skipPrompts))) {
    throw new Error('用户取消发布');
  }

  // 记录发布前的包列表（从 changeset 中获取）
  const changedPackages = await getChangedPackages();
  const packagesBeforePublish: Array<{ name: string; version: string }> = [];
  for (const pkgName of changedPackages) {
    const pkg = getWorkspacePackages().find((p) => p.name === pkgName);
    if (pkg) {
      packagesBeforePublish.push({ name: pkg.name, version: pkg.version });
    }
  }

  // 说明：changeset publish 在两种模式下的行为
  // - pre 模式（beta/alpha）：自动使用 pre.json 中配置的标签，不支持 --tag 标志
  // - release 模式：默认使用 latest 标签
  // 因此两种模式下都不需要显式指定 --tag

  // 使用带重试的命令执行，应对网络波动
  await runWithRetry(`npx changeset publish --no-git-checks`, {
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

  await postPublishGitActions(skipPrompts);
};

// 废弃包版本
const deprecatePackageVersion = async (skipPrompts = false) => {
  console.log(chalk.cyan('\n📦 废弃包版本'));
  console.log(chalk.gray('这将标记指定版本为废弃，用户安装时会看到警告'));
  console.log(chalk.gray('不会删除包，也不会破坏依赖链\n'));

  // 获取可发布的包列表
  const publishablePackages = getPublishablePackages();
  if (publishablePackages.length === 0) {
    console.log(chalk.yellow('没有可操作的包'));
    return;
  }

  const { packageName } = await inquirer.prompt([
    {
      type: 'select',
      name: 'packageName',
      message: '选择要废弃的包:',
      choices: publishablePackages.map((pkg) => ({
        name: `${pkg.name} (当前版本: ${pkg.version})`,
        value: pkg.name,
      })),
    },
  ]);

  const { version } = await inquirer.prompt([
    {
      type: 'input',
      name: 'version',
      message: '输入要废弃的版本号（留空表示当前版本）:',
      default: publishablePackages.find((p) => p.name === packageName)?.version,
    },
  ]);

  const { message } = await inquirer.prompt([
    {
      type: 'input',
      name: 'message',
      message: '废弃原因:',
      default: '此版本已废弃，请升级到最新版本',
    },
  ]);

  console.log(
    chalk.yellow(`\n即将废弃: ${packageName}@${version}\n原因: ${message}`),
  );
  if (!(await confirm('确认废弃?', false, skipPrompts))) {
    console.log(chalk.gray('已取消'));
    return;
  }

  try {
    run(
      `npm deprecate ${packageName}@${version} "${message}" --registry=${NPM_REGISTRY}`,
      projectRoot,
    );
    console.log(chalk.green(`✅ 已废弃 ${packageName}@${version}`));
  } catch (error) {
    console.error(chalk.red('废弃失败:'), error);
  }
};

// 撤回包版本（仅 ${NPM_UNPUBLISH_TIME_LIMIT_HOURS} 小时内）
const unpublishPackageVersion = async (skipPrompts = false) => {
  console.log(chalk.red('\n⚠️  撤回包版本 (危险操作)'));
  console.log(chalk.yellow('注意事项:'));
  console.log(
    chalk.gray(`  - 仅 ${NPM_UNPUBLISH_TIME_LIMIT_HOURS} 小时内可撤回`),
  );
  console.log(chalk.gray('  - 会破坏依赖链，影响下游项目'));
  console.log(chalk.gray('  - 撤回后 24 小时内不能重新发布同名包'));
  console.log(chalk.gray('  - 推荐使用 deprecate 代替\n'));

  if (!(await confirm('确认要继续？这是高风险操作！', false, skipPrompts))) {
    console.log(chalk.gray('已取消'));
    return;
  }

  // 获取可发布的包列表
  const publishablePackages = getPublishablePackages();
  if (publishablePackages.length === 0) {
    console.log(chalk.yellow('没有可操作的包'));
    return;
  }

  const { packageName } = await inquirer.prompt([
    {
      type: 'select',
      name: 'packageName',
      message: '选择要撤回的包:',
      choices: publishablePackages.map((pkg) => ({
        name: `${pkg.name} (当前版本: ${pkg.version})`,
        value: pkg.name,
      })),
    },
  ]);

  const { version } = await inquirer.prompt([
    {
      type: 'input',
      name: 'version',
      message: '输入要撤回的版本号（留空表示当前版本）:',
      default: publishablePackages.find((p) => p.name === packageName)?.version,
    },
  ]);

  console.log(
    chalk.red(`\n即将撤回: ${packageName}@${version}\n这将永久删除该版本！`),
  );
  if (!(await confirm('最后确认，真的要撤回吗？', false, skipPrompts))) {
    console.log(chalk.gray('已取消'));
    return;
  }

  try {
    run(
      `npm unpublish ${packageName}@${version} --registry=${NPM_REGISTRY} --force`,
      projectRoot,
    );
    console.log(chalk.green(`✅ 已撤回 ${packageName}@${version}`));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('404') || errorMessage.includes('72 hours')) {
      console.error(
        chalk.red(
          `撤回失败: 可能是发布超过 ${NPM_UNPUBLISH_TIME_LIMIT_HOURS} 小时，或包不存在，或有其他包依赖`,
        ),
      );
    } else {
      console.error(chalk.red('撤回失败:'), errorMessage);
    }
  }
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
      await createChangeset(skipPrompts);
      break;
    case 'version':
      await checkWorkspace();
      await setupReleaseMode(mode, skipPrompts);
      await updateVersion(skipPrompts);
      break;
    case 'publish':
      if (!dryRun) {
        await checkNpmLogin();
        await checkWorkspace();
        await buildPackages();
      }
      await publishPackages(skipPrompts, dryRun);
      break;
    case 'deprecate':
      await checkNpmLogin();
      await deprecatePackageVersion(skipPrompts);
      break;
    case 'unpublish':
      await checkNpmLogin();
      await unpublishPackageVersion(skipPrompts);
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
const runFullProcess = async (
  skipPrompts = false,
  mode = '',
  dryRun = false,
) => {
  // Dry-run 模式跳过所有检查，直接显示待发布的包
  if (dryRun) {
    await publishPackages(skipPrompts, true);
    return;
  }

  await checkNpmLogin();
  await checkWorkspace();

  // 模式设置必须在 checkWorkspace 之后，因为 changeset pre enter 会修改 pre.json
  await setupReleaseMode(mode, skipPrompts);

  // 检查是否已有 changeset 文件，没有则引导创建
  let changedPackages = await getChangedPackages();
  if (!changedPackages.size) {
    console.log(chalk.yellow('未检测到现有的 changeset 文件，需要先创建'));
    run('npx changeset', projectRoot);
    changedPackages = await getChangedPackages();
    if (!changedPackages.size) {
      throw new Error('未创建任何 changeset，发布流程终止');
    }
  } else {
    // 只在实际创建了新 changeset 时才重新解析
    const created = await createChangeset(skipPrompts);
    if (created) {
      changedPackages = await getChangedPackages();
    }
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
