/**
 * 各操作的编排，以及它们的注册表。
 *
 * ACTIONS 是菜单、命令行分发、帮助文本的唯一来源：新增操作只需在这里加一项。
 * 判据在 checks.ts，选择在 target.ts，这里只负责把它们按顺序串起来。
 */

import fs from 'fs';
import path from 'path';
import { ask, confirm, isInteractive } from '../utils/prompts';
import { c, logInfo, logOk, logStep, logWarn } from '../utils/logger';
import * as npm from './npm';
import * as semver from './semver';
import { validateTag } from './versioning';
import { checkRefFormat, getBranch, getCommit, getDirtyFiles, getTagCommit } from './git';
import { planGitTag, renderTagName, type GitTagPlan } from './git-tag';
import {
  MANIFEST_FILES,
  readBuildMeta,
  readPackageName,
  writeManifest,
  type BuildMeta,
} from './manifest';
import { buildDist, LOCAL_VERSION } from './build';
import { runSelfCheck } from './selfcheck';
import { loadConfig, resolveConfiguredTag } from '../config/loader';
import {
  checkGitState,
  confirmExportsCoverage,
  confirmVersionTagMatch,
  describeReusedDist,
  ensureBuiltDist,
  recordGitTag,
  verifyDistTag,
} from './checks';
import { resolveTag, resolveVersion } from './target';
import type { PublishContext } from '../config/types';

/** 命令行解析出来的参数 */
export interface CliArgs {
  action: string;
  tag?: string;
  version?: string;
  skip: boolean;
  dryRun: boolean;
  registry?: string;
  allowUnverifiedDist: boolean;
  /** --no-git-tag：本次不打 git tag。未指定为 undefined，交回配置的 git.tag 决定 */
  gitTag?: false;
  /** --push-tag / --no-push-tag：未指定为 undefined，交回配置的 git.push 决定 */
  pushTag?: boolean;
}

// ============ 公共上下文 ============

/**
 * 每个操作都要先加载配置、拿到包名与 registry，集中在这里，避免各处重复解析。
 *
 * registry 的覆盖优先级：--registry > 环境变量 NPM_REGISTRY > 配置 registry > 内置默认。
 */
const buildContext = async (args: CliArgs): Promise<PublishContext> => {
  const config = await loadConfig({ logWarn });
  const resolved = npm.getRegistry(config.registry);

  // --registry 是真的会改写发布目标（npm.ts 会连 scope 限定一起传给 npm），
  // 因此把「谁覆盖了谁」点明：把包发到另一个 registry 是个该被看见的决定
  if (args.registry && args.registry !== resolved) {
    logWarn(`命令行 --registry ${args.registry} 覆盖了默认的 ${resolved}`);
  }

  return {
    projectRoot: config.projectRoot,
    distPath: path.resolve(config.projectRoot, config.distDir),
    name: readPackageName(config.projectRoot),
    registry: args.registry ?? resolved,
    config,
  };
};

/**
 * 上下文只建一次。
 *
 * 交互菜单要用包名做标题，之后各操作还要再拿一次同一份上下文 —— 不缓存的话配置文件会被
 * jiti 转译并求值两遍，「--registry 覆盖了默认值」这类告警也会打两遍。
 */
let contextPromise: Promise<PublishContext> | null = null;

export const createContext = (args: CliArgs): Promise<PublishContext> =>
  (contextPromise ??= buildContext(args));

// dry-run 不写 registry（npm publish --dry-run 连接都不发），未登录不该拦住排练；
// 但仍要跑一次校验并告警，因为排练的目的往往就是确认真实发布能不能走通
const ensureLogin = (registry: string, { fatal = true }: { fatal?: boolean } = {}): void => {
  try {
    npm.checkLogin(registry);
  } catch (error) {
    if (fatal) throw error;
    logWarn(
      `${(error instanceof Error ? error.message : String(error)).split('\n')[0]}（dry-run 不阻断）`,
    );
  }
};

// 废弃 / 撤回不接受无人值守授权：两处确认的默认值都是「否」，走 skip 只会拿到 false 后抛
// 「已取消」—— 读起来像是用户自己取消的。这里提前把「是谁挡下的、为什么」说清楚
const requireHumanConfirm = (args: CliArgs, what: string, why: string): void => {
  if (!args.skip && isInteractive()) return;
  throw new Error(`${what}必须在终端里逐项确认：-y 与非交互环境（CI / 管道）都不能授权。${why}`);
};

/**
 * dry-run 期间临时改写 dist，跑完原样还原。
 *
 * 「只看会发出什么」不该留下副作用：dist/package.json 的版本号与 dist/.npmignore
 * 本该由下一次真实构建 / 发布来写。但 npm publish --dry-run 确实要读 dist/package.json
 * 才能给出有意义的清单，所以只能先备份、跑完放回去 —— 包括「文件原本不存在」这种情形，
 * 那就删掉。
 */
const withRestoredDist = async <T>(
  distPath: string,
  files: readonly string[],
  task: () => Promise<T>,
): Promise<T> => {
  const backups = files.map((file) => {
    const filePath = path.join(distPath, file);
    return { filePath, content: fs.existsSync(filePath) ? fs.readFileSync(filePath) : null };
  });

  try {
    return await task();
  } finally {
    // 失败路径同样要还原：中途抛错留下的半截清单比改动本身更难查
    for (const { filePath, content } of backups) {
      if (content === null) fs.rmSync(filePath, { force: true });
      else fs.writeFileSync(filePath, content);
    }
  }
};

/**
 * 打 git tag 之前的预判所依据的 meta。
 *
 * `-a full` 时 dist 里还没有 .build-meta.json（构建走完才写），拿当前工作区现拼一份等价的 ——
 * 构建本身不产生 commit，与构建之后读到的应当一致。`-a publish` 直接读现成的那份。
 */
const previewBuildMeta = (ctx: PublishContext, build: boolean): BuildMeta | null => {
  if (!build) return readBuildMeta(ctx.distPath);

  const dirty = getDirtyFiles(ctx.projectRoot);
  return {
    commit: getCommit(ctx.projectRoot),
    branch: getBranch(ctx.projectRoot),
    dirty: dirty === null ? null : dirty.length > 0,
    builtAt: new Date().toISOString(),
  };
};

/**
 * 确认发布之前对 git tag 的预判：名字合不合法、打在哪、还是跳过。
 *
 * 引用名校验放在这里而不是发布之后：模板写坏了（git.tag: 'v{version}..x'）要在确认摘要里
 * 就看见「跳过」，而不是上传十几分钟之后才被告知没打上。
 */
const previewGitTag = (
  ctx: PublishContext,
  { tagName, build }: { tagName: string; build: boolean },
): GitTagPlan => {
  const formatError = checkRefFormat(tagName, ctx.projectRoot);
  if (formatError) {
    return {
      action: 'skip',
      tagName,
      commit: '',
      reason: `${tagName} 不是合法的引用名（${formatError}），检查配置的 git.tag`,
    };
  }
  return planGitTag({
    meta: previewBuildMeta(ctx, build),
    tagName,
    existingTagCommit: getTagCommit(tagName, ctx.projectRoot),
  });
};

// 确认摘要里 git tag 那一行。plan 为 null 表示这次根本不打（配置关了，或 --no-git-tag）
const summarizeGitTag = ({
  isDryRun,
  plan,
  remote,
  push,
}: {
  isDryRun: boolean;
  plan: GitTagPlan | null;
  remote: string;
  push: boolean;
}): string => {
  if (isDryRun) return 'dry-run 不打 git tag';
  if (!plan) return '不打';
  if (plan.action === 'skip') return `跳过（${plan.reason}）`;
  return `${plan.tagName} @ ${plan.commit.slice(0, 8)} → ${push ? `推送到 ${remote}` : '不推送'}`;
};

// ============ 各操作 ============

// 仅构建：版本号用占位值，之后可用「仅发布」在不重新构建的前提下确定真实版本号
const runBuild = async (args: CliArgs): Promise<void> => {
  const ctx = await createContext(args);
  logStep('构建');
  await buildDist({ ctx, version: args.version || LOCAL_VERSION });
  logInfo('如需发布该产物: kit-publish -a publish');
};

/**
 * 发布流程，full / publish / preview 共用：
 *   build = false 时复用现有 dist，只改写清单里的版本号
 *   dryRun = true 时 npm publish 带 --dry-run
 */
const runRelease = async (
  args: CliArgs,
  { build = true, dryRun = false }: { build?: boolean; dryRun?: boolean } = {},
): Promise<void> => {
  const ctx = await createContext(args);
  const { name, registry, config } = ctx;
  const isDryRun = dryRun || args.dryRun;

  console.log(c.bold(`\n📦 ${name} 发布`));
  logInfo(`registry: ${registry}`);

  logStep('发布前检查');
  // 复用产物的门禁跑在网络请求与交互之前：它是纯本地判断，产物用不了就不必再发 whoami、
  // 也不必再问标签和版本号
  if (!build) ensureBuiltDist(ctx, { allowUnverified: args.allowUnverifiedDist });
  ensureLogin(registry, { fatal: !isDryRun });
  // 工作区状态只在「这次要新构建」时说明得了问题：复用产物时那份 dist 的出处已记在
  // .build-meta.json 里、由 describeReusedDist 如实报告，此刻工作区干不干净与它无关。
  // 而这道检查在非交互且未传 -y 时按默认值取消 —— 留着会让一份已验证的产物因为
  // 本地有无关改动而重发失败
  if (build && !(await checkGitState(ctx.projectRoot, args.skip))) throw new Error('已取消发布');

  // 配置写错一律抛错，那它就是一道门禁，同样该跑在网络请求之前（加载时已经抛过）
  const configured = resolveConfiguredTag({ config, branch: getBranch(ctx.projectRoot) });
  if (args.tag) {
    // 命令行显式给了标签时，配置里那个根本不会被采用，也就不该挡路
    //（-t 自身已在入口处过了同一道 validateTag）
    if (!configured.isDefault && args.tag !== configured.tag) {
      logWarn(`命令行 --tag ${args.tag} 覆盖了${configured.source} 声明的 ${configured.tag}`);
    }
  } else {
    const configuredTagError = validateTag(configured.tag);
    if (configuredTagError) throw new Error(`${configured.source} 里的${configuredTagError}`);
  }

  const distTags = npm.getDistTags(name, registry);
  const versions = npm.getVersions(name, registry);
  // 说「latest 指向」而不是「最新正式版」：这个指针未必是正式版，也未必是最高的那个
  //（registry 上它就出现过既落后于最高正式版、又指着一个预发布的情形）
  logOk(`registry 上已有 ${versions.length} 个版本，latest 指向 ${distTags.latest ?? '无'}`);

  logStep('确定发布目标');
  const tag =
    args.tag ||
    (await resolveTag({
      distTags,
      configured,
      mainline: config.tags.mainline,
      configFile: config.configFile,
      skip: args.skip,
    }));
  const version =
    args.version ||
    (await resolveVersion({
      tag,
      distTags,
      versions,
      mainline: config.tags.mainline,
      skip: args.skip,
    }));

  if (!semver.isValid(version)) throw new Error(`版本号不合法: ${version || '(空)'}`);
  if (!(await confirmVersionTagMatch({ version, tag, distTags, versions, skip: args.skip }))) {
    throw new Error('已取消发布');
  }

  /**
   * git tag 的预判。问在前、做在后：大包上传十几分钟，人早走开了，
   * 发布成功之后再弹确认框只会把流程卡在那儿，所以确认发布之前就要定下打不打、推不推。
   *
   * 优先级 命令行 > 配置 > 默认，与 registry / dist-tag 一致。
   */
  const tagTemplate = args.gitTag === false ? false : config.git.tag;
  const gitTagName =
    tagTemplate === false ? '' : renderTagName({ template: tagTemplate, name, version });
  // dry-run 不留 tag，也就不必预判
  const gitTagPlan: GitTagPlan | null =
    gitTagName && !isDryRun ? previewGitTag(ctx, { tagName: gitTagName, build }) : null;
  const pushDefault = args.pushTag ?? config.git.push;

  console.log('');
  logInfo(`包名   : ${name}`);
  logInfo(`版本   : ${c.bold(version)}`);
  logInfo(`标签   : ${c.bold(tag)}${distTags[tag] ? c.dim(` (原 ${distTags[tag]})`) : ''}`);
  logInfo(`产物   : ${build ? '重新构建' : `复用现有 ${config.distDir}`}`);
  // 复用产物时，「这份 dist 是哪个 commit 打的」正是决策依据，必须在确认之前给出
  if (!build) describeReusedDist(ctx);
  logInfo(
    `git tag: ${summarizeGitTag({ isDryRun, plan: gitTagPlan, remote: config.git.remote, push: pushDefault })}`,
  );
  if (isDryRun) logWarn('dry-run 模式：不会真正发布');
  else logWarn(`真实发布：会写入 registry，并把 dist-tag ${tag} 指向 ${version}`);

  // 推送是要改远端的，单独问一次；它排在「确认发布?」之前，才不会在上传跑完之后才拦人
  const pushGitTag =
    gitTagPlan && gitTagPlan.action !== 'skip'
      ? await confirm(`推送 git tag ${gitTagPlan.tagName} 到 ${config.git.remote}?`, {
          defaultValue: pushDefault,
          skip: args.skip,
        })
      : false;

  if (!(await confirm('确认发布?', { defaultValue: true, skip: args.skip }))) {
    throw new Error('已取消发布');
  }

  const stageAndPublish = async () => {
    let manifest;
    if (build) {
      manifest = await buildDist({ ctx, version });
    } else {
      logStep(`复用现有 ${config.distDir}，改写发布清单`);
      manifest = writeManifest({ ctx, version });
    }

    // 派生出的 exports 少了公开入口是个破坏性变更，发布前必须过一道
    if (
      !(await confirmExportsCoverage({ name, tag, distTags, registry, manifest, skip: args.skip }))
    ) {
      throw new Error('已取消发布');
    }

    logStep(`发布到 ${registry}`);
    // 清单没写 gitHead 时，npm publish 会自己按仓库 HEAD 补一个，因此期望值取二者之一：
    // 发布失败后据此判断 registry 上的同名版本到底是不是本次产物
    const gitHead = manifest.gitHead || getCommit(ctx.projectRoot) || undefined;
    await npm.publish(ctx.distPath, { name, version, registry, tag, gitHead, dryRun: isDryRun });
  };

  // 复用产物的 dry-run 跑完把清单还原回去；完整构建的 dry-run 不还原也无从还原 ——
  // 那份 dist 本来就是这次新打的，还原不到任何「之前的状态」
  if (isDryRun && !build) await withRestoredDist(ctx.distPath, MANIFEST_FILES, stageAndPublish);
  else await stageAndPublish();

  if (isDryRun) {
    logOk(`dry-run 完成，未实际发布 ${name}@${version}`);
    return;
  }
  logOk(`发布完成 ${name}@${version} (tag: ${tag})`);

  // 校验失败不该把已经成功的发布报成失败
  try {
    verifyDistTag({ name, version, tag, registry });
  } catch (error) {
    logWarn(
      `dist-tag 校验未能完成（发布本身已成功）: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  // 版本号只写进 dist/package.json，仓库里没有「哪个 commit 发了 x.y.z」的记录，git tag 补这条边。
  // 同样地，它失败了也不该把一次已经成功的发布报成失败
  if (gitTagPlan && gitTagPlan.action !== 'skip') {
    try {
      recordGitTag({
        ctx,
        tagName: gitTagPlan.tagName,
        name,
        version,
        distTag: tag,
        push: pushGitTag,
      });
    } catch (error) {
      logWarn(
        `git tag 未能完成（发布本身已成功）: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  logInfo(`安装: npm i ${name}@${tag}  或  npm i ${name}@${version}`);
};

const runDeprecate = async (args: CliArgs): Promise<void> => {
  requireHumanConfirm(args, '废弃版本', '废弃会让所有安装该版本的人看到告警');
  const { name, registry } = await createContext(args);
  ensureLogin(registry);
  const distTags = npm.getDistTags(name, registry);
  const versions = npm.getVersions(name, registry);

  logInfo('deprecate 只给版本打废弃标记（安装时告警），不删除包、不破坏依赖链');
  const version =
    args.version || (await ask('要废弃的版本号', { defaultValue: distTags.latest ?? '' }));
  if (!semver.isValid(version)) throw new Error(`版本号不合法: ${version || '(空)'}`);
  if (!versions.includes(version)) throw new Error(`${name}@${version} 不存在于 ${registry}`);

  // 原因不能为空：npm 把空字符串当作「取消废弃」（lib/commands/deprecate.js:
  // `// msg == null because '' is a valid value, it indicates undeprecate`），
  // 而这里的确认文案写的是「确认废弃」——回车带出默认值没问题，敲个空格就把语义反过来了
  const message = await ask('废弃原因', {
    defaultValue: '此版本已废弃，请升级到最新版本',
    validate: (value) =>
      value ? undefined : '废弃原因不能为空（空字符串会被 npm 当作「取消废弃」）',
  });

  if (!(await confirm(`确认废弃 ${name}@${version}?`, { defaultValue: false }))) {
    throw new Error('已取消');
  }
  npm.deprecate(`${name}@${version}`, message, registry);
};

const runUnpublish = async (args: CliArgs): Promise<void> => {
  requireHumanConfirm(args, '撤回版本', '撤回不可逆，且会破坏下游依赖');
  const { name, registry } = await createContext(args);
  ensureLogin(registry);
  const versions = npm.getVersions(name, registry);

  logWarn('unpublish 会永久删除版本：仅发布后 72 小时内可用，会破坏下游依赖，优先考虑 deprecate');
  const version = args.version || (await ask('要撤回的版本号', { defaultValue: '' }));
  if (!semver.isValid(version)) throw new Error(`版本号不合法: ${version || '(空)'}`);
  if (!versions.includes(version)) throw new Error(`${name}@${version} 不存在于 ${registry}`);

  const pointing = Object.entries(npm.getDistTags(name, registry))
    .filter(([, value]) => value === version)
    .map(([key]) => key);
  if (pointing.length) logWarn(`以下 dist-tag 正指向该版本，撤回后会悬空: ${pointing.join(', ')}`);

  if (!(await confirm(`确认撤回 ${name}@${version}?`, { defaultValue: false }))) {
    throw new Error('已取消');
  }
  if (!(await confirm('最后确认，该操作不可恢复?', { defaultValue: false }))) {
    throw new Error('已取消');
  }
  npm.unpublish(`${name}@${version}`, registry);
};

/**
 * 自检：拿 registry 上的真实数据跑一遍版本候选推导，只读、不需要登录。
 * 业务仓库的 hooks.selfCheck 在通用断言之后一并跑。
 */
const runCheck = async (args: CliArgs): Promise<void> => {
  const { name, registry, config } = await createContext(args);
  logStep(`拉取 ${name} @ ${registry}`);

  const distTags = npm.getDistTags(name, registry);
  const versions = npm.getVersions(name, registry);
  const ok = await runSelfCheck({
    distTags,
    versions,
    mainline: config.tags.mainline,
    hooks: config.hooks,
  });
  if (!ok) throw new Error('自检未通过');
};

// ============ 操作注册表 ============

export interface ActionEntry {
  value: string;
  name: string;
  description: string;
  run: (args: CliArgs) => Promise<void>;
}

// 菜单、命令行分发、帮助文本的唯一来源：新增操作只需在这里加一项
export const ACTIONS: ActionEntry[] = [
  {
    value: 'full',
    name: '完整发布流程（构建 + 发布）',
    description: '完整发布流程，构建后发布（最常用）',
    run: (args) => runRelease(args, { build: true }),
  },
  { value: 'build', name: '仅构建（不发布）', description: '仅构建，不发布', run: runBuild },
  {
    value: 'publish',
    name: '仅发布（复用现有 dist）',
    description: '仅发布，复用现有 dist（构建失败重试 / 一份产物发多个标签）',
    run: (args) => runRelease(args, { build: false }),
  },
  {
    value: 'preview',
    name: '预览发布内容（dry-run，不实际发布）',
    description: '预览发布内容（复用现有 dist + npm publish --dry-run）',
    run: (args) => runRelease(args, { build: false, dryRun: true }),
  },
  {
    value: 'deprecate',
    name: '废弃版本 (deprecate)',
    description: '废弃某个版本（打废弃标记，不删包）',
    run: runDeprecate,
  },
  {
    value: 'unpublish',
    name: '撤回版本 (unpublish)',
    description: '撤回某个版本（仅 72 小时内，高风险）',
    run: runUnpublish,
  },
  {
    value: 'check',
    name: '自检（校验版本推导规则）',
    description: '自检：拿 registry 真实数据跑一遍版本候选推导（只读，不改动 registry）',
    run: runCheck,
  },
  { value: 'exit', name: '退出', description: '退出', run: async () => logInfo('已退出') },
];

// exit 只在交互菜单里有意义，不作为命令行可选项对外提示
export const selectableActions = (): string[] =>
  ACTIONS.filter((item) => item.value !== 'exit').map((item) => item.value);

export const executeAction = async (action: string, args: CliArgs): Promise<void> => {
  const matched = ACTIONS.find((item) => item.value === action);
  if (!matched) throw new Error(`未知操作 "${action}"，可选: ${selectableActions().join(' / ')}`);
  return matched.run(args);
};
