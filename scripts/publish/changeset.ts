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
  type WorkspacePackage,
  exec,
  run,
  confirm,
  normalizePath,
  normalizeTag,
  getPreJsonPath,
  parsePreJson,
} from './shared.js';
import { getPublishablePackages, clearWorkspaceCache } from './workspace.js';

// npm dist-tag 校验：合法返回 null，非法返回错误原因
// 字符集限定 [a-z0-9-]：changesets 会用 tag 拼 semver 预发布号 x.y.z-<tag>.<n>，
// semver 预发布标识符不允许下划线（changeset version 会直接崩溃），
// 带点的标签会破坏 changesets 的 pre 版本计数器（prerelease[1] 被当作数字序号解析）
export const validateDistTag = (tag: string): string | null => {
  if (tag === 'latest') {
    return `"latest" 是 npm 保留的 dist-tag，不能用作预发布标签`;
  }
  if (!/^[a-z][a-z0-9-]*$/.test(tag)) {
    return `标签 "${tag}" 格式无效：需以小写字母开头，只能包含小写字母、数字和连字符 -`;
  }
  if (/^v\d/.test(tag)) {
    return `标签 "${tag}" 易与 semver 版本混淆（不能是 v+数字 开头）`;
  }
  return null;
};

// 校验发布模式并在非法时抛出完整报错（setupReleaseMode 与 publish 的 -m 校验共用，避免文案重复漂移）
export const assertValidTagMode = (mode: string): void => {
  const tagError = validateDistTag(mode);
  if (tagError) {
    throw new Error(
      `无效的发布模式: ${tagError}\n可选值: release, beta, alpha, 或自定义 dist-tag (如 oem)`,
    );
  }
};

// 标准预发布标签（无需自定义标签的回显确认与额外风险提示）
const STANDARD_PRE_TAGS = new Set(['beta', 'alpha']);

// 标准发布模式（无需回显确认），其余合法标签视为自定义 dist-tag
const STANDARD_MODES = new Set(['release', ...STANDARD_PRE_TAGS]);

// 处理发布模式：release 走正式发布，其余（beta/alpha/自定义标签如 oem）统一进入 changeset pre 模式
// mode 已由 setupReleaseMode 规范化并通过 validateDistTag 校验
const handlePreMode = async (projectRoot: string, mode: string) => {
  const preJsonPath = getPreJsonPath(projectRoot);

  if (fs.existsSync(preJsonPath)) {
    const preJson = parsePreJson(preJsonPath);

    if (!preJson) {
      // 文件损坏或格式无效
      console.warn(chalk.yellow('pre.json 文件已损坏，将重新初始化'));
      fs.unlinkSync(preJsonPath);
    } else if (preJson.mode === 'pre' && !preJson.tag) {
      // pre 模式却没有有效 tag，文件状态异常
      console.log(chalk.gray('清理无效的预发布状态文件...'));
      fs.unlinkSync(preJsonPath);
    } else if (preJson.mode === 'pre' && preJson.tag === mode) {
      // 已处于目标预发布模式
      console.log(chalk.cyan(`已处于 ${mode} 预发布模式，无需切换`));
      return;
    } else if (preJson.mode === 'pre') {
      // 需要切换模式：从预发布退出（无论是切换到 release 还是其他预发布模式）
      console.log(chalk.yellow(`退出当前预发布模式 (${preJson.tag})...`));
      run('npx changeset pre exit', projectRoot);
    } else if (mode === 'release') {
      // exit 态（pre exit 后尚未 version）：不能删除该文件，它记录着本轮 pre 周期的已消费清单
      // 与起始版本，changeset version 需要靠它生成完整 CHANGELOG 并收口
      console.log(chalk.cyan(`检测到已退出的预发布状态 (tag: ${preJson.tag})`));
      console.log(chalk.gray('changeset version 会自动完成收口并删除 pre.json'));
    } else {
      // exit 态重入预发布：changesets 允许从 mode "exit" 直接 pre enter（无需先 exit），
      // 且会保留原 changesets 已消费清单，避免同一批 changeset 被重复消费
      console.log(chalk.cyan(`将从已退出的预发布状态 (tag: ${preJson.tag}) 重新进入 pre 模式`));
      console.log(chalk.gray('changesets 会保留已消费的 changeset 清单'));
    }
  }

  if (mode === 'release') {
    console.log(chalk.cyan('正式发布模式'));
    return;
  }

  if (STANDARD_PRE_TAGS.has(mode)) {
    console.log(chalk.cyan(`${mode === 'beta' ? 'Beta' : 'Alpha'} 发布模式`));
  } else {
    // 自定义标签（如 oem）通常是不会转正的平行发行版，
    // 而 pre 模式下的 changeset 会在退出 pre 后流入下一个正式版的版本 bump 和 CHANGELOG
    const branch = exec('git rev-parse --abbrev-ref HEAD', projectRoot).trim();
    console.log(chalk.cyan(`自定义标签发布模式 (${mode})，版本形如 x.x.x-${mode}.0`));
    console.log(
      chalk.yellow(`⚠️  本次产生的 changeset 与 pre.json 退出 pre 模式后会流入下一个正式版`),
    );
    console.log(
      chalk.yellow(
        `建议在独立分支上发布定制版（当前分支: ${branch}），避免定制内容进入正式版 CHANGELOG`,
      ),
    );
    console.log(
      chalk.yellow(`下游安装请锁定版本号或使用 npm i <pkg>@${mode}（^ 范围会解析到后续正式版）`),
    );
    // changesets 的 getReleaseTag 对 publishedState 为 only-pre 的包（registry 上只有当前 pre tag
    // 的预发布版、没有任何正式版）会返回 latest
    console.log(
      chalk.yellow(
        `在本 pre 周期内首次发布的新包，自第二次发布起会被 changesets 发到 latest；` +
          `此类包需先出一个正式版，之后才能稳定走 ${mode} 通道`,
      ),
    );
  }

  run(`npx changeset pre enter ${mode}`, projectRoot);
};

// 交互菜单"自定义标签"选项的哨兵值：双下划线包裹，不可能与合法 dist-tag（^[a-z][a-z0-9-]*$）冲突，
// 万一泄漏到 handlePreMode 也会被 validateDistTag 的格式校验拦下，失败模式安全
const CUSTOM_TAG_SENTINEL = '__custom__';

// 设置发布模式
export const setupReleaseMode = async (
  projectRoot: string,
  initialMode = '',
  skipPrompts = false,
) => {
  let mode = normalizeTag(initialMode);

  if (!mode) {
    if (skipPrompts) {
      console.log(chalk.dim('[自动选择: 正式版本]'));
      mode = 'release';
    } else {
      const { selected } = await inquirer.prompt([
        {
          type: 'select',
          name: 'selected',
          message: '请选择发布模式:',
          choices: [
            { name: '正式版本', value: 'release' },
            { name: 'Beta 版本', value: 'beta' },
            { name: 'Alpha 版本', value: 'alpha' },
            { name: '自定义标签 (如 oem)…', value: CUSTOM_TAG_SENTINEL },
          ],
          default: 'release',
        },
      ]);
      mode = selected as string;

      if (mode === CUSTOM_TAG_SENTINEL) {
        const { customTag } = await inquirer.prompt<{ customTag: string }>([
          {
            type: 'input',
            name: 'customTag',
            message: '请输入自定义 dist-tag (如 oem):',
            validate: (input: string) => {
              const tag = normalizeTag(input);
              if (!tag) return '标签不能为空';
              if (tag === 'release') return '正式版本请直接选择"正式版本"选项';
              return validateDistTag(tag) ?? true;
            },
          },
        ]);
        mode = normalizeTag(customTag);
      }
    }
  }

  // 无条件校验：validateDistTag('release') 本就返回 null，无需额外守卫
  assertValidTagMode(mode);

  // 自定义标签回显确认：CLI 显式 -m 与交互手输共用此单点，防拼写手误进入意外的预发布通道
  // skipPrompts (-y) 下自动通过——显式传参配合 -y 视为明确意图，保持 CI 可用
  if (!STANDARD_MODES.has(mode)) {
    if (
      !(await confirm(
        `确认使用自定义标签 "${mode}" 发布 (版本形如 x.x.x-${mode}.0, dist-tag: ${mode})?`,
        true,
        skipPrompts,
      ))
    ) {
      throw new Error('用户取消发布流程');
    }
  }

  await handlePreMode(projectRoot, mode);
};

// 版本升级类型选项
const BUMP_TYPE_CHOICES = [
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
];

// 生成 changeset 文件，返回文件名
const writeChangesetFile = (
  projectRoot: string,
  entries: Array<{ pkg: string; bumpType: string }>,
  summary: string,
): string => {
  const changesetId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const changesetPath = path.join(projectRoot, '.changeset', `${changesetId}.md`);

  const frontMatter = entries.map(({ pkg, bumpType }) => `"${pkg}": ${bumpType}`).join('\n');
  const content = `---\n${frontMatter}\n---\n\n${summary}\n`;

  fs.writeFileSync(changesetPath, content, 'utf-8');
  return `${changesetId}.md`;
};

// 非交互创建参数：供 AI/CI 等无 TTY 场景绕过 inquirer 直接写 changeset 文件
export interface NonInteractiveChangesetOptions {
  /** 要包含的包 */
  packages: string[];
  /** 版本升级类型: patch | minor | major */
  bumpType: string;
  /** 变更说明 */
  summary: string;
}

// 非交互创建 changeset（校验包名/版本类型/摘要后直接写文件，不弹任何 inquirer 提示）
export const createChangesetNonInteractive = (
  projectRoot: string,
  options: NonInteractiveChangesetOptions,
): boolean => {
  const { packages, bumpType, summary } = options;

  const validBumpTypes = new Set(['patch', 'minor', 'major']);
  if (!validBumpTypes.has(bumpType)) {
    throw new Error(`无效的版本类型 "${bumpType}"，可选值: patch, minor, major`);
  }

  if (!summary.trim()) {
    throw new Error('变更说明不能为空');
  }

  if (packages.length === 0) {
    throw new Error('请至少指定一个包（--packages）');
  }

  const publishablePackages = getPublishablePackages(projectRoot);
  const publishableNames = new Set(publishablePackages.map((pkg) => pkg.name));
  const unknownPackages = packages.filter((name) => !publishableNames.has(name));
  if (unknownPackages.length > 0) {
    throw new Error(`以下包不存在或不可发布: ${unknownPackages.join(', ')}`);
  }

  const filename = writeChangesetFile(
    projectRoot,
    packages.map((pkg) => ({ pkg, bumpType })),
    summary.trim(),
  );

  console.log(chalk.green(`✅ 已创建 changeset: ${filename}`));
  console.log(chalk.gray(`  版本类型: ${bumpType.toUpperCase()}`));
  console.log(chalk.gray(`  受影响的包: ${packages.join(', ')}`));
  console.log(chalk.gray(`  变更说明: ${summary.trim()}`));

  return true;
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
  const { selectedPackages } = await inquirer.prompt<{ selectedPackages: string[] }>([
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

  // 2. 多包时询问是否独立配置 CHANGELOG
  let perPackage = false;
  if (selectedPackages.length > 1) {
    const { mode } = await inquirer.prompt<{ mode: 'shared' | 'per-package' }>([
      {
        type: 'select',
        name: 'mode',
        message: '多个包的变更说明配置方式:',
        choices: [
          { name: '统一配置 (所有包使用相同的版本类型和变更说明)', value: 'shared' },
          { name: '逐个配置 (为每个包单独设置版本类型和变更说明)', value: 'per-package' },
        ],
        default: 'shared',
      },
    ]);
    perPackage = mode === 'per-package';
  }

  // 3. 收集每个包的版本类型与变更说明
  type Entry = { pkg: string; bumpType: string; summary: string };
  const entries: Entry[] = [];

  if (perPackage) {
    for (const pkgName of selectedPackages) {
      console.log(chalk.cyan(`\n配置包: ${pkgName}`));
      const { bumpType } = await inquirer.prompt<{ bumpType: string }>([
        {
          type: 'select',
          name: 'bumpType',
          message: `[${pkgName}] 请选择版本升级类型:`,
          choices: BUMP_TYPE_CHOICES,
          default: 'patch',
        },
      ]);
      const { summary } = await inquirer.prompt<{ summary: string }>([
        {
          type: 'input',
          name: 'summary',
          message: `[${pkgName}] 请输入变更说明:`,
          validate: (input: string) => (input.trim() ? true : '变更说明不能为空'),
        },
      ]);
      entries.push({ pkg: pkgName, bumpType, summary: summary.trim() });
    }
  } else {
    const { bumpType } = await inquirer.prompt<{ bumpType: string }>([
      {
        type: 'select',
        name: 'bumpType',
        message: '请选择版本升级类型:',
        choices: BUMP_TYPE_CHOICES,
        default: 'patch',
      },
    ]);
    const { summary } = await inquirer.prompt<{ summary: string }>([
      {
        type: 'input',
        name: 'summary',
        message: '请输入变更说明 (将显示在 CHANGELOG 中):',
        validate: (input: string) => (input.trim() ? true : '变更说明不能为空'),
      },
    ]);
    for (const pkg of selectedPackages) {
      entries.push({ pkg, bumpType, summary: summary.trim() });
    }
  }

  // 防御性检查：理论上 entries 一定非空（选择包时已 validate），此分支只为类型收窄
  const firstEntry = entries[0];
  if (!firstEntry) {
    console.log(chalk.yellow('未生成任何变更条目'));
    return false;
  }

  // 4. 显示摘要并确认
  console.log(chalk.cyan('\n📋 变更集摘要:'));
  if (perPackage) {
    for (const e of entries) {
      console.log(
        chalk.gray(`  - ${chalk.white(e.pkg)} [${e.bumpType.toUpperCase()}]: ${e.summary}`),
      );
    }
  } else {
    console.log(chalk.gray(`版本类型: ${firstEntry.bumpType.toUpperCase()}`));
    console.log(chalk.gray(`受影响的包: ${chalk.white(selectedPackages.join(', '))}`));
    console.log(chalk.gray(`变更说明: ${chalk.white(firstEntry.summary)}`));
  }
  console.log('');

  if (!(await confirm('确认创建此 changeset?', true, skipPrompts))) {
    console.log(chalk.yellow('已取消创建 changeset'));
    return false;
  }

  // 5. 写入 changeset 文件
  // 独立模式：每个包一个文件，CHANGELOG 中每个包都有自己的条目
  // 共享模式：所有包合并成一个文件，CHANGELOG 中各包共用同一段说明
  if (perPackage) {
    for (const e of entries) {
      const filename = writeChangesetFile(
        projectRoot,
        [{ pkg: e.pkg, bumpType: e.bumpType }],
        e.summary,
      );
      console.log(chalk.green(`✅ 已创建 changeset: ${filename} (${e.pkg})`));
    }
  } else {
    const filename = writeChangesetFile(
      projectRoot,
      entries.map((e) => ({ pkg: e.pkg, bumpType: e.bumpType })),
      firstEntry.summary,
    );
    console.log(chalk.green(`✅ 已创建 changeset: ${filename}`));
  }

  return true;
};

// 更新版本
export const updateVersion = async (projectRoot: string, skipPrompts = false) => {
  console.log(chalk.blue('更新包版本...'));

  run('npx changeset version', projectRoot);

  // 清除缓存，因为版本号已更新
  clearWorkspaceCache();

  console.log(chalk.yellow('版本已更新，请检查版本变更'));
  if (!(await confirm('是否继续?', true, skipPrompts))) {
    // 用户取消，提供回滚选项
    console.log(chalk.yellow('用户取消发布流程'));
    console.log(
      chalk.gray('提示：回滚操作会使用 git stash 保存所有未提交的更改（不只是版本变更）'),
    );
    if (await confirm('是否回滚版本变更? (将 stash 所有未提交的更改)', true, skipPrompts)) {
      // -u 确保 untracked 文件（如新生成的 CHANGELOG.md）也被保存
      run('git stash push -u -m "changeset version rollback"', projectRoot);
      console.log(
        chalk.green('✅ 已使用 git stash 保存所有未提交的更改，可通过 git stash pop 恢复'),
      );
    }
    throw new Error('用户取消发布流程');
  }
};

// 从 changeset 文件中解析变更的包名
export const getChangedPackages = async (projectRoot: string): Promise<Set<string>> => {
  const changesetDir = path.join(projectRoot, '.changeset');
  if (!fs.existsSync(changesetDir)) {
    return new Set();
  }

  const files = await readdir(changesetDir);
  const mdFiles = files.filter((file) => file.endsWith('.md') && file !== 'README.md');

  // 与 changesets assemble-release-plan 的过滤语义一致：pre 模式下 changeset version 不删除
  // 已消费的 .md（保留到 exit 后生成完整 CHANGELOG），这些文件不代表待发布内容。
  // 不排除的话，同一 pre 周期内重跑 full 会把它们当成新 changeset，绕过空发布防护并打印虚假成功汇总
  const preJson = parsePreJson(getPreJsonPath(projectRoot));
  const consumedIds = preJson?.mode === 'pre' ? new Set(preJson.changesets) : new Set<string>();

  const packages = new Set<string>();

  for (const file of mdFiles) {
    if (consumedIds.has(file.slice(0, -'.md'.length))) continue;

    const content = await readFile(path.join(changesetDir, file), 'utf-8');
    // 精确匹配开头的 YAML frontmatter，避免 summary 中的 --- 干扰
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const frontMatter = fmMatch?.[1];
    if (!frontMatter) continue;

    const lines = frontMatter.split('\n');
    for (const line of lines) {
      // 匹配 @scope/name 或普通包名，支持带引号和不带引号，包名可包含 . 字符
      const match = line.match(/^['"]?(@?[\w.-]+\/[\w.-]+|[\w.-]+)['"]?\s*:/);
      if (match?.[1]) {
        packages.add(match[1]);
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
  const packageJsonRegex = new RegExp(`^(${workspaceDirsPattern})/[^/]+/package\\.json$`);

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

// 检测需要构建的包：changeset 文件与 git diff 两个来源取并集
// 必须取并集而非短路 fallback：pre 模式下 changeset version 不删除已消费的 .md，
// 若命中 changeset 分支就返回，则 changeset version 按 updateInternalDependencies 连带 bump 的
// 依赖方包（不在任何 .md 的 frontmatter 里）不会进构建清单，却仍会被 changeset publish 发布，
// 导致带陈旧产物上线
// allowEmpty: 检测结果为空时返回空集合而不抛错
// （publish 重跑场景：changeset 已被 version 消费、版本变更已提交，两个来源必为空，
//  需放行到 publishPackages 的防护分支由用户确认后继续）
export const detectPackages = async (
  projectRoot: string,
  options: { allowEmpty?: boolean } = {},
): Promise<Set<string>> => {
  // 1. 从 changeset md 文件解析（用户明确指定的包）
  const fromChangeset = await getChangedPackages(projectRoot);
  // 2. 从 git diff 检测版本变更（changeset version 后的 unstaged changes，含连带 bump 的包）
  const fromDiff = getVersionBumpedPackages(projectRoot);

  const packages = new Set([...fromChangeset, ...fromDiff]);

  if (packages.size) {
    if (!fromChangeset.size) {
      // git diff 是唯一来源（changeset 已被 version 消费），无从"补充"可言
      console.log(chalk.gray(`(从 git diff 检测到 ${fromDiff.size} 个版本变更的包)`));
      return packages;
    }
    console.log(chalk.gray(`(从 changeset 文件检测到 ${fromChangeset.size} 个包)`));
    const extraFromDiff = [...fromDiff].filter((name) => !fromChangeset.has(name));
    if (extraFromDiff.length) {
      console.log(chalk.gray(`(从 git diff 补充检测到 ${extraFromDiff.length} 个版本变更的包)`));
    }
    return packages;
  }

  // 正确的流程是：changeset -> changeset version -> changeset publish
  if (options.allowEmpty) {
    return new Set();
  }
  throw new Error('未找到需要构建的包。请确认是否已创建 changeset 或更新版本号。');
};

// 获取当前预发布 tag（beta/alpha/自定义标签），无 pre.json 时返回 undefined
// 有意不检查 mode，与 changeset publish 的实际行为保持一致：只要 pre.json 存在
// （包括 pre exit 后 mode 为 "exit" 的残留状态），publish 就按其 tag 发布
// （@changesets/cli 的 getReleaseTag 不检查 mode）；exit 残留由 publish action 入口拦截
export const getPreReleaseTag = (projectRoot: string): string | undefined => {
  const preJson = parsePreJson(getPreJsonPath(projectRoot));
  return preJson?.tag;
};
