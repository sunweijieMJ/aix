/**
 * 发布前后的门禁：问人、打日志、调 registry。
 *
 * 每条判据都拆成两层，本文件是「壳」那一半 —— 算结论的纯函数
 *（collectVersionTagWarnings、planDistTagUpdate 在 versioning.ts，planGitTag 在 git-tag.ts）。
 *
 * 拆开是为了让它们能被离线测试直接跑：判据与 CLI 解析、菜单、确认流程
 * 绑在一起的话，一行断言都写不了。纯的那半不留在这里，
 * 是因为本文件为了 ensureBuiltDist 要 import manifest.ts，
 * 会把 es-module-lexer 的 WASM 初始化一路拖进测试的依赖图。
 */

import fs from 'fs';
import { confirm } from '../utils/prompts';
import { logInfo, logOk, logWarn } from '../utils/logger';
import * as npm from './npm';
import { collectVersionTagWarnings, planDistTagUpdate } from './versioning';
import {
  createTag,
  getBranch,
  getCommit,
  getDirtyFiles,
  getTagCommit,
  hasCommit,
  pushTag,
} from './git';
import { planGitTag } from './git-tag';
import { BUILD_META_FILE, formatBuildMeta, readBuildMeta, type Manifest } from './manifest';
import type { PublishContext } from '../config/types';

// ============ 工作区状态 ============

/** 工作区有未提交改动时只提醒不阻断：产物来自本地构建，脏工作区意味着产物与任何 commit 都不对应 */
export const checkGitState = async (projectRoot: string, skip: boolean): Promise<boolean> => {
  const branch = getBranch(projectRoot);
  if (branch) logInfo(`当前分支: ${branch}`);

  const dirty = getDirtyFiles(projectRoot);
  // 读不到 git 状态不阻断发布（git.ts 的一贯约定），但不能当成「干净」放过去 ——
  // 那会让人以为产物对应着某个 commit
  if (dirty === null) {
    logWarn('无法读取 git 状态（不是 git 仓库或 git 不可用），无从判断工作区是否干净');
    return true;
  }
  if (!dirty.length) return true;

  logWarn(`存在 ${dirty.length} 个未提交的改动，发布产物将与任何 commit 都不对应:`);
  dirty.slice(0, 10).forEach((line) => logInfo(line));
  if (dirty.length > 10) logInfo(`... 其余 ${dirty.length - 10} 项`);

  // 显式传了 -y 视为知情，只告警不阻断；非交互且未传 -y 时按默认值取消，避免误发
  if (skip) {
    logWarn('已指定 -y，忽略未提交改动继续发布');
    return true;
  }
  return confirm('仍然继续发布?', { defaultValue: false });
};

// ============ 版本号与 dist-tag 的搭配 ============

/** 把 collectVersionTagWarnings 的结论摆给人看并要一次确认。版本号已被占用是硬错误，不进确认流程 */
export const confirmVersionTagMatch = async ({
  version,
  tag,
  distTags,
  versions,
  skip,
}: {
  version: string;
  tag: string;
  distTags: Record<string, string>;
  versions: string[];
  skip: boolean;
}): Promise<boolean> => {
  if (versions.includes(version)) {
    throw new Error(`${version} 已存在于 registry，请更换版本号（或先 unpublish）`);
  }

  const warnings = collectVersionTagWarnings({ version, tag, distTags, versions });
  if (!warnings.length) return true;

  // 搭配异常时提示确认；-y 视为知情（会走到这里的版本号必是显式传入的 —— 自动推导出的
  // 首选不可能触发上面任何一条，__test__/versioning.test.ts 拿真实数据把这点验过），只告警不阻断
  warnings.forEach(logWarn);
  return skip ? true : confirm('确认继续?', { defaultValue: false });
};

// ============ 公开入口 ============

/**
 * 派生出的 exports 少了公开入口时要说话。
 *
 * exports 由 dist 下实际产出的入口目录派生，这是对的 —— 手工维护的清单会漂移。
 * 但反方向的风险是对称的：某个入口构建失败或改了名，exports 会静默少一项，
 * 而少掉一个公开子路径是破坏性变更，消费方要到 import 的时候才炸。
 * writeManifest 只守得住 "." 入口（它是 dist/<rootEntry>/index.js 存不存在的问题），
 * 其余入口没有任何基线可比 —— 除了该标签上一版实际发出去的那份清单。
 *
 * 拿不到基线（新标签、老版本没有 exports 字段、查询失败）时跳过：
 * 这道检查只在「比得出来」的时候有意义，比不出来不该拦住发布。
 */
export const confirmExportsCoverage = async ({
  name,
  tag,
  distTags,
  registry,
  manifest,
  skip,
}: {
  name: string;
  tag: string;
  distTags: Record<string, string>;
  registry: string;
  manifest: Manifest;
  skip: boolean;
}): Promise<boolean> => {
  const baseline = distTags[tag];
  if (!baseline) return true;

  let published: Record<string, unknown> | null;
  try {
    published = npm.getExports(name, baseline, registry);
  } catch (error) {
    logWarn(
      `未能读取 ${baseline} 的 exports，跳过公开入口比对: ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`,
    );
    return true;
  }
  if (!published) return true;

  const removed = Object.keys(published).filter((key) => !(key in manifest.exports));
  if (!removed.length) {
    logOk(`公开入口与 ${tag} 上一版（${baseline}）相比没有减少`);
    return true;
  }

  logWarn(`本次派生出的 exports 比 ${tag} 当前的 ${baseline} 少了 ${removed.length} 个公开入口:`);
  removed.forEach((key) => logInfo(key));
  logWarn(
    '消费方 import 这些子路径会直接失败。入口确实已下线就继续；否则检查打包配置的 input 与这次构建是否完整',
  );

  return skip ? true : confirm('仍然继续发布?', { defaultValue: false });
};

// ============ 发布后校验 ============

/**
 * 回读 dist-tag，确认指针真的落到了本次版本上。
 *
 * npm publish 正常成功时会自己移动指针，但「上传成功、响应超时」被判定为成功的那条路径
 * 并没有走完设置指针的步骤，所以这里要补设。
 */
export const verifyDistTag = ({
  name,
  version,
  tag,
  registry,
}: {
  name: string;
  version: string;
  tag: string;
  registry: string;
}): void => {
  const current = npm.getDistTags(name, registry)[tag];
  const { action, message } = planDistTagUpdate({ current, version, tag });

  if (action === 'ok') {
    logOk(message);
    return;
  }
  if (action === 'keep') {
    logWarn(message);
    return;
  }

  logWarn(message);
  npm.setDistTag(name, version, tag, registry);
};

/**
 * 发布成功后给来源 commit 打一个 git tag，可选推送。
 *
 * 补的是溯源的反向那条边：版本号只写进 dist/package.json，根 package.json 不动，
 * 仓库里因此没有任何「哪个 commit 发了 x.y.z」的记录 —— 从 tarball 的 gitHead 能反查 commit，
 * 从仓库却看不出发过哪些版本。
 *
 * 「这次打不打」不在这里决定：tag 名已由调用方渲染并过了引用名校验，配置关闭 / --no-git-tag /
 * dry-run 时根本不会调到这里。这里只回答「打在哪个 commit 上」—— 依据是真实落盘的
 * .build-meta.json，而不是确认摘要里那次构建之前的预判。
 *
 * 任何一步失败都只降级成告警（推送这步在这里兜，其余由调用方兜）：tag 是事后记录，
 * 不该让一次已经成功的发布报失败。
 */
export const recordGitTag = ({
  ctx,
  tagName,
  name,
  version,
  distTag,
  push,
}: {
  ctx: PublishContext;
  /** 已渲染、已通过 check-ref-format 的 git tag 名 */
  tagName: string;
  name: string;
  version: string;
  /** 本次发布用的 dist-tag，写进 annotated tag 的 message */
  distTag: string;
  push: boolean;
}): void => {
  const { remote } = ctx.config.git;

  // 构建本身不产生 commit，这里的结论应当与确认摘要里的预判一致；
  // 不一致只有一种可能 —— 构建把受 git 跟踪的文件写脏了，此时以真实 meta 为准
  const plan = planGitTag({
    meta: readBuildMeta(ctx.distPath),
    tagName,
    existingTagCommit: getTagCommit(tagName, ctx.projectRoot),
  });
  if (plan.action === 'skip') {
    logWarn(`未打 git tag ${tagName}: ${plan.reason}`);
    return;
  }

  if (plan.action === 'create') {
    // 产物可以来自另一个 checkout（-a publish 复用别处拷来的 dist），那个 commit 在这里未必有
    if (!hasCommit(plan.commit, ctx.projectRoot)) {
      logWarn(`未打 git tag ${tagName}: 产物来源 ${plan.commit.slice(0, 8)} 不在当前仓库里`);
      return;
    }
    createTag(
      {
        name: tagName,
        commit: plan.commit,
        message: [`${name}@${version}`, `dist-tag: ${distTag}`, `registry: ${ctx.registry}`].join(
          '\n',
        ),
      },
      ctx.projectRoot,
    );
    logOk(`已打 git tag ${tagName} → ${plan.commit.slice(0, 8)}`);
  } else {
    logInfo(`git tag ${tagName} ${plan.reason}（${plan.commit.slice(0, 8)}），不重复创建`);
  }

  const manually = `git push ${remote} refs/tags/${tagName}`;
  if (!push) {
    logInfo(`未推送 git tag，需要时手工执行: ${manually}`);
    return;
  }

  try {
    pushTag({ remote, name: tagName }, ctx.projectRoot);
    logOk(`已推送 git tag ${tagName} 到 ${remote}`);
  } catch (error) {
    logWarn(
      `推送 git tag 失败（发布本身已成功）: ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`,
    );
    logInfo(`tag 已在本地，可手工补: ${manually}`);
  }
};

// ============ 复用现有 dist ============

/**
 * 复用现有 dist 的准入门禁。
 *
 * .build-meta.json 是「构建成功」的标记：buildDist 只在 hooks.afterBuild
 * 全部通过之后才写它。缺了它有两种可能 —— 产物不是本工具构建的，或者上一次构建在 afterBuild
 * 中途抛错，留下了一份「一部分文件修好了、一部分还没修」的 dist。
 *
 * 后者只给一行告警是不够的：-y 会连确认一起跳过，半成品就这么发出去了。所以这里直接拒绝，
 * 确知产物可用时用 --allow-unverified-dist 显式放行。
 */
export const ensureBuiltDist = (
  ctx: PublishContext,
  { allowUnverified }: { allowUnverified: boolean },
): void => {
  if (!fs.existsSync(ctx.distPath)) {
    throw new Error(`${ctx.config.distDir} 不存在，无法复用产物，请先执行完整发布或仅构建`);
  }
  if (readBuildMeta(ctx.distPath)) return;

  if (allowUnverified) {
    logWarn(
      `${ctx.config.distDir} 中没有 ${BUILD_META_FILE}，无法确认它来自一次成功的构建（已指定 --allow-unverified-dist，继续）`,
    );
    return;
  }

  throw new Error(
    `${ctx.config.distDir} 中没有 ${BUILD_META_FILE}，无法确认这份产物来自一次成功的构建：\n` +
      '它可能不是本工具构建的，也可能是上一次构建在 afterBuild 中途失败后留下的半成品（其中一部分文件没有经过修复）。\n' +
      '请重新执行 kit-publish -a full 完整构建；确知这份产物可用时，可加 --allow-unverified-dist 放行',
  );
};

/** 复用现有 dist 时，说明这份产物的来源；脏工作区或与当前 HEAD 不一致都要点明 */
export const describeReusedDist = (ctx: PublishContext): void => {
  // 缺少溯源信息的情形已由 ensureBuiltDist 处理（拒绝，或在 --allow-unverified-dist 下告警过一次）
  const meta = readBuildMeta(ctx.distPath);
  if (!meta) return;

  logInfo(formatBuildMeta(meta));
  // 脏工作区打出的产物不对应任何 commit，这是确认发布前该看见的事
  if (meta.dirty) {
    logWarn('该产物构建于脏工作区，与任何 commit 都不对应（gitHead 会记为 <sha>-dirty）');
  }

  const head = getCommit(ctx.projectRoot);
  if (head && meta.commit && head !== meta.commit) {
    logWarn(`该产物构建于 ${meta.commit.slice(0, 8)}，与当前 HEAD ${head.slice(0, 8)} 不一致`);
  }
};
