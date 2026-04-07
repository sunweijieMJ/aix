/**
 * NPM 操作模块
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { DEFAULT_REGISTRY, NPM_UNPUBLISH_TIME_LIMIT_HOURS, exec, run, confirm } from './shared.js';
import { getPublishablePackages } from './workspace.js';

// 从 .npmrc 文件中读取 registry 配置
const readRegistryFromNpmrc = (npmrcPath: string, scope?: string): string | null => {
  if (!fs.existsSync(npmrcPath)) return null;
  const npmrc = fs.readFileSync(npmrcPath, 'utf-8');

  // 优先匹配 scoped registry（如 @aix:registry=...）
  if (scope) {
    const scopeMatch = npmrc.match(new RegExp(`${scope}:registry\\s*=\\s*(.+)`));
    if (scopeMatch?.[1]) return scopeMatch[1].trim();
  }

  // 回退到全局 registry
  const match = npmrc.match(/^registry\s*=\s*(.+)/m);
  return match?.[1]?.trim() ?? null;
};

// 获取 npm registry 地址（优先级：环境变量 > 项目 .npmrc > 全局 .npmrc > 默认值）
export const getNpmRegistry = (projectRoot: string): string => {
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
  const globalNpmrc = path.join(process.env.HOME || process.env.USERPROFILE || '', '.npmrc');
  const fromGlobal = readRegistryFromNpmrc(globalNpmrc, scope);
  if (fromGlobal) return fromGlobal;

  // 4. 默认私有仓库
  return DEFAULT_REGISTRY;
};

// 检查 npm 登录状态
export const checkNpmLogin = (npmRegistry: string) => {
  console.log(chalk.blue(`检查 npm 登录状态 (${npmRegistry})...`));

  try {
    const username = exec(`npm whoami --registry=${npmRegistry}`).trim();
    console.log(chalk.green(`npm 已登录 (${username})`));
  } catch {
    throw new Error(
      `未登录 npm 私有仓库: ${npmRegistry}\n请先执行以下命令登录:\n\n  npm login --registry=${npmRegistry}\n\n登录完成后重新运行发布脚本`,
    );
  }
};

// 废弃包版本
export const deprecatePackageVersion = async (
  projectRoot: string,
  npmRegistry: string,
  skipPrompts = false,
) => {
  console.log(chalk.cyan('\n📦 废弃包版本'));
  console.log(chalk.gray('这将标记指定版本为废弃，用户安装时会看到警告'));
  console.log(chalk.gray('不会删除包，也不会破坏依赖链\n'));

  // 获取可发布的包列表
  const publishablePackages = getPublishablePackages(projectRoot);
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

  console.log(chalk.yellow(`\n即将废弃: ${packageName}@${version}\n原因: ${message}`));
  if (!(await confirm('确认废弃?', false, skipPrompts))) {
    console.log(chalk.gray('已取消'));
    return;
  }

  try {
    run(
      `npm deprecate ${packageName}@${version} "${message}" --registry=${npmRegistry}`,
      projectRoot,
    );
    console.log(chalk.green(`✅ 已废弃 ${packageName}@${version}`));
  } catch (error) {
    console.error(chalk.red('废弃失败:'), error);
  }
};

// 撤回包版本（仅 ${NPM_UNPUBLISH_TIME_LIMIT_HOURS} 小时内）
export const unpublishPackageVersion = async (
  projectRoot: string,
  npmRegistry: string,
  skipPrompts = false,
) => {
  console.log(chalk.red('\n⚠️  撤回包版本 (危险操作)'));
  console.log(chalk.yellow('注意事项:'));
  console.log(chalk.gray(`  - 仅 ${NPM_UNPUBLISH_TIME_LIMIT_HOURS} 小时内可撤回`));
  console.log(chalk.gray('  - 会破坏依赖链，影响下游项目'));
  console.log(chalk.gray('  - 撤回后 24 小时内不能重新发布同名包'));
  console.log(chalk.gray('  - 推荐使用 deprecate 代替\n'));

  if (!(await confirm('确认要继续？这是高风险操作！', false, skipPrompts))) {
    console.log(chalk.gray('已取消'));
    return;
  }

  // 获取可发布的包列表
  const publishablePackages = getPublishablePackages(projectRoot);
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

  console.log(chalk.red(`\n即将撤回: ${packageName}@${version}\n这将永久删除该版本！`));
  if (!(await confirm('最后确认，真的要撤回吗？', false, skipPrompts))) {
    console.log(chalk.gray('已取消'));
    return;
  }

  try {
    run(`npm unpublish ${packageName}@${version} --registry=${npmRegistry} --force`, projectRoot);
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
