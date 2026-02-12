/**
 * Git 操作模块
 */

import { spawnSync } from 'child_process';
import * as path from 'path';
import chalk from 'chalk';
import { WORKSPACE_DIRS, exec, run, confirm, normalizePath } from './shared.js';
import { getPublishablePackages } from './workspace.js';

// 检查工作区状态
export const checkWorkspace = (projectRoot: string) => {
  console.log(chalk.blue('检查代码工作区状态...'));
  const status = exec('git status --porcelain', projectRoot);

  if (status.trim() !== '') {
    throw new Error(
      `发布失败：存在未提交的代码更改\n请先提交或存储您的更改，然后再尝试发布\n未提交的更改：\n${status}`,
    );
  }

  console.log(chalk.green('✅ 工作区干净'));
};

// 获取已发布包的版本信息，用于生成 commit message
// 注意：此函数在 git add 之后调用，需要检测 staged changes
export const getPublishedVersions = (projectRoot: string): string[] => {
  const versions: string[] = [];

  for (const pkg of getPublishablePackages(projectRoot)) {
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
export const postPublishGitActions = async (
  projectRoot: string,
  skipPrompts = false,
) => {
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

  // 动态生成 git add 路径（包含所有 workspace 目录 + apps）
  const addPaths = [
    ...WORKSPACE_DIRS.map((dir) => `${dir}/`),
    'apps/', // apps 目录的依赖版本更新也需要提交
    '.changeset/',
    'pnpm-lock.yaml',
  ].join(' ');

  run(`git add ${addPaths}`, projectRoot);

  // 生成包含版本信息的 commit message
  const versions = getPublishedVersions(projectRoot);
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
