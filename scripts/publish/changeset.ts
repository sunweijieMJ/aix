/**
 * Changeset 操作模块
 */

import * as fs from 'fs';
import * as path from 'path';
import { readdir, readFile } from 'fs/promises';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  WORKSPACE_DIRS,
  type PreJsonFile,
  type WorkspacePackage,
  exec,
  run,
  confirm,
  normalizePath,
} from './shared.js';
import { getPublishablePackages, clearWorkspaceCache } from './workspace.js';

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
const handlePreMode = async (projectRoot: string, mode: string) => {
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
export const setupReleaseMode = async (
  projectRoot: string,
  initialMode = '',
  skipPrompts = false,
) => {
  if (initialMode) {
    await handlePreMode(projectRoot, initialMode);
    return;
  }

  if (skipPrompts) {
    console.log(chalk.dim('[自动选择: 正式版本]'));
    await handlePreMode(projectRoot, 'release');
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

  await handlePreMode(projectRoot, mode);
};

// 创建 changeset，返回是否实际创建（中文交互版）
export const createChangeset = async (
  projectRoot: string,
  skipPrompts = false,
): Promise<boolean> => {
  if (!(await confirm('是否需要创建新的 changeset?', true, skipPrompts))) {
    console.log(chalk.yellow('已跳过创建 changeset'));
    return false;
  }

  const publishablePackages = getPublishablePackages(projectRoot);

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
export const updateVersion = async (
  projectRoot: string,
  skipPrompts = false,
) => {
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
export const getChangedPackages = async (
  projectRoot: string,
): Promise<Set<string>> => {
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

// 从 git diff 检测版本变更的包（changeset 文件被 version 消费后的 fallback）
export const getVersionBumpedPackages = (projectRoot: string): Set<string> => {
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
export const detectPackages = async (
  projectRoot: string,
): Promise<Set<string>> => {
  // 1. 从 changeset md 文件解析（优先级最高，确保只构建用户明确指定的包）
  const fromChangeset = await getChangedPackages(projectRoot);
  if (fromChangeset.size) {
    console.log(chalk.gray('(从 changeset 文件检测到变更的包)'));
    return fromChangeset;
  }

  // 2. 从 git diff 检测（changeset version 后的 unstaged changes）
  const fromDiff = getVersionBumpedPackages(projectRoot);
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

// 获取当前预发布 tag（beta/alpha），正式发布返回 undefined
export const getPreReleaseTag = (projectRoot: string): string | undefined => {
  const preJsonPath = path.join(projectRoot, '.changeset', 'pre.json');
  if (!fs.existsSync(preJsonPath)) {
    return undefined;
  }
  const preJson = parsePreJson(preJsonPath);
  return preJson?.tag;
};
