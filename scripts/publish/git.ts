/**
 * Git 操作模块
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import {
  PRE_JSON_REL,
  exec,
  run,
  confirm,
  normalizePath,
  getPreJsonPath,
  parsePreJson,
} from './shared.js';
import { getPublishablePackages } from './workspace.js';

// 批量暂存指定路径：走 spawnSync 传参，避免路径经 shell 拼接产生转义/注入问题
// 用 `--` 终止选项解析，防止以 - 开头的文件名被当作 git 选项
const gitAdd = (projectRoot: string, paths: string[]) => {
  if (paths.length === 0) return;

  const result = spawnSync('git', ['add', '--', ...paths], {
    cwd: projectRoot,
    stdio: 'inherit',
    encoding: 'utf-8',
  });

  // spawn 本身失败（git 不存在、cwd 无效等）时 status 为 null，需单独报错而非误报退出码
  if (result.error) {
    throw new Error(`命令执行失败: git add\n${result.error.message}`, { cause: result.error });
  }
  if (result.status !== 0) {
    throw new Error(
      result.status === null
        ? `命令执行失败: git add (被信号 ${result.signal ?? '未知'} 终止)`
        : `命令执行失败: git add (exit code: ${result.status})`,
    );
  }
};

// 检查工作区状态
export const checkWorkspace = (projectRoot: string) => {
  console.log(chalk.blue('检查代码工作区状态...'));
  const status = exec('git status --porcelain', projectRoot);

  if (status.trim() !== '') {
    let message = `发布失败：存在未提交的代码更改\n请先提交或存储您的更改，然后再尝试发布\n未提交的更改：\n${status}`;

    // pre.json 是 changesets 的预发布状态文件，可能是上次流程在 version 之前中断遗留的，
    // 普通"提交或 stash"的建议对它并不合适，需给出按意图区分的处置方式
    if (status.includes(PRE_JSON_REL)) {
      message +=
        `\n注意：${PRE_JSON_REL} 是 changesets 的预发布状态文件\n` +
        `  - 若为中断遗留且要放弃该 pre 周期：未跟踪时直接删除该文件；已跟踪被修改时执行 git checkout -- ${PRE_JSON_REL} 恢复\n` +
        `  - 若要保留该 pre 周期：将该文件一并提交`;
    }

    throw new Error(message);
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

  gitAdd(projectRoot, releasePaths);
  // changeset version 会消费（删除）.changeset/*.md
  // 使用 -u 只暂存已跟踪文件的变更，避免把尚未消费的新 changeset（未跟踪文件）卷进 release commit
  // （-u 是全目录语义而非路径列表，不能并入 gitAdd）
  run('git add -u -- .changeset/', projectRoot);
  // pre 模式下 changeset version 不删除已消费的 .md（保留到 exit 后生成完整 CHANGELOG），
  // 本流程新建的 .md 是未跟踪文件，add -u 不会包含，需按 pre.json 记录的已消费清单显式暂存，
  // 否则遗留在工作区导致下次发布卡在 checkWorkspace；未消费的新 changeset 不在清单中，不会误卷入
  const preJson = parsePreJson(getPreJsonPath(projectRoot));
  if (preJson?.mode === 'pre') {
    const preStatePaths = preJson.changesets
      .map((changesetId) => `.changeset/${changesetId}.md`)
      .filter((mdRelPath) => fs.existsSync(path.join(projectRoot, mdRelPath)));

    // pre.json 是整个 pre 周期的共享状态（记录已消费清单与起始版本），必须与已消费的 .md
    // 一起提交：否则其他 clone 拿到 .md 却没有消费记录，下次 version 会重复消费同一批 changeset；
    // 首次 pre enter 创建的 pre.json 是未跟踪文件，不显式暂存还会遗留脏工作区
    // （能进入本分支说明 parsePreJson 已成功读到该文件，无需再判存在）
    preStatePaths.push(PRE_JSON_REL);

    gitAdd(projectRoot, preStatePaths);
  }

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
