/**
 * Git 操作模块
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { exec, run, confirm, normalizePath } from './shared.js';
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

// 判断包的 version 字段相对 HEAD 是否发生变更
// 直接解析 HEAD 中的 package.json 与磁盘当前值比较，
// 避免基于 diff 文本匹配 "version" 字样的误判（如其他字段的改动行恰好含该字样）
const hasVersionChange = (projectRoot: string, pkgJsonRel: string, currentVersion: string) => {
  try {
    const headJson = exec(`git show HEAD:"${pkgJsonRel}"`, projectRoot);
    return JSON.parse(headJson).version !== currentVersion;
  } catch {
    // HEAD 中不存在该文件（新增的包），视为版本变更
    return true;
  }
};

// 获取有版本变更的包（相对 HEAD），用于收集提交文件和生成 commit message
const getVersionChangedPackages = (projectRoot: string) =>
  getPublishablePackages(projectRoot).filter((pkg) =>
    hasVersionChange(
      projectRoot,
      normalizePath(path.relative(projectRoot, pkg.pkgJsonPath)),
      pkg.version,
    ),
  );

// 获取已发布包的版本信息，用于生成 commit message
export const getPublishedVersions = (projectRoot: string): string[] =>
  getVersionChangedPackages(projectRoot).map((pkg) => `${pkg.name}@${pkg.version}`);

// 精确收集发布相关的文件路径（版本变更包的 package.json / CHANGELOG.md）
// 避免按目录整体 git add 把工作区中无关的 WIP 改动卷进 release commit
const getReleaseFilePaths = (projectRoot: string): string[] => {
  const paths: string[] = [];

  for (const pkg of getVersionChangedPackages(projectRoot)) {
    paths.push(normalizePath(path.relative(projectRoot, pkg.pkgJsonPath)));
    const changelogPath = path.join(pkg.dir, 'CHANGELOG.md');
    if (fs.existsSync(changelogPath)) {
      paths.push(normalizePath(path.relative(projectRoot, changelogPath)));
    }
  }

  return paths;
};

// 提交版本变更（必须在 changeset publish 之前调用）
// changeset publish 会在当前 HEAD 上打 tag，若版本变更未提交，tag 会指向旧版本的 commit
// 返回是否完成提交（false 表示用户跳过或无可提交内容）
export const commitVersionChanges = async (
  projectRoot: string,
  skipPrompts = false,
): Promise<boolean> => {
  const releasePaths = getReleaseFilePaths(projectRoot);
  if (releasePaths.length === 0) {
    return false;
  }

  console.log(chalk.blue('\n提交版本变更:'));
  console.log(chalk.gray('发布时 tag 会打在当前 commit 上，需先提交版本变更和 CHANGELOG'));

  if (!(await confirm('是否提交版本变更和 CHANGELOG?', true, skipPrompts))) {
    console.log(
      chalk.yellow('已跳过 Git 提交，注意：发布产生的 tag 将指向不含本次版本变更的 commit'),
    );
    return false;
  }

  run(`git add ${releasePaths.map((p) => `"${p}"`).join(' ')}`, projectRoot);
  // changeset version 会消费（删除）.changeset/*.md，pre 模式下还会修改 pre.json
  // 使用 -u 只暂存已跟踪文件的变更，避免把尚未消费的新 changeset（未跟踪文件）卷进 release commit
  run('git add -u -- .changeset/', projectRoot);

  // 确认有实际暂存内容再提交
  const staged = exec('git diff --cached --name-only', projectRoot);
  if (!staged.trim()) {
    console.log(chalk.yellow('未检测到需要提交的版本变更'));
    return false;
  }

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
  return true;
};

// 发布后的 git 操作（推送代码和 tags）
export const postPublishGitActions = async (
  projectRoot: string,
  skipPrompts = false,
  committed = true,
) => {
  if (!committed) {
    console.log(chalk.yellow('\n版本变更未提交，请手动提交后再推送代码和 tags'));
    return;
  }

  console.log(chalk.blue('\n发布后 Git 操作:'));

  // 1. 是否推送代码
  if (await confirm('是否推送代码到远程仓库?', true, skipPrompts)) {
    run('git push', projectRoot);
    console.log(chalk.green('✅ 代码已推送'));
  }

  // 2. 是否推送 tags
  if (await confirm('是否推送 Git Tags?', false, skipPrompts)) {
    run('git push --tags', projectRoot);
    console.log(chalk.green('✅ Tags 已推送'));
  }
};
