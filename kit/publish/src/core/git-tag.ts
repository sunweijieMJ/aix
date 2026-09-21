/**
 * git tag 的判定规则（与 git 命令、日志、交互无关，可单独测试，见 __test__/git-tag.test.ts）。
 *
 * 这里说的 tag 一律是 git tag。工具里裸的「标签」指的是 dist-tag，两者在同一次发布里都会出现，
 * 所以本文件的命名与文案都把 git 二字带上。
 *
 * BuildMeta 只以 `import type` 引入：manifest.ts 会把 es-module-lexer 的 WASM 初始化拖进
 * 依赖图，而判据要能被离线测试直接跑，不该为一个接口形状付这个代价。
 */

import type { BuildMeta } from './manifest';

// 去掉 scope：@kit/publish → publish
const bareName = (name: string): string => name.replace(/^@[^/]+\//, '');

/** 按模板渲染 git tag 名：{version} 为本次版本号，{name} 为去掉 scope 的包名 */
export const renderTagName = ({
  template,
  name,
  version,
}: {
  template: string;
  name: string;
  version: string;
}): string => template.replaceAll('{name}', bareName(name)).replaceAll('{version}', version);

/** 这次发布该拿这个 git tag 怎么办 */
export interface GitTagPlan {
  /** create 新建；reuse 已指向同一 commit，不重打但仍可推送；skip 什么都不做 */
  action: 'create' | 'reuse' | 'skip';
  tagName: string;
  /** tag 应当指向 / 已经指向的 commit，skip 时为空串 */
  commit: string;
  /** skip 的理由 / reuse 的说明，create 时为空串 */
  reason: string;
}

/**
 * 判定这次发布要不要打 git tag、打在哪个 commit 上。
 *
 * 钉的是 `.build-meta.json` 里的 commit 而不是当前 HEAD：`-a publish` 复用产物时二者可以
 * 不是同一个，tag 要指向真正打出这份产物的那次提交。
 */
export const planGitTag = ({
  meta,
  tagName,
  existingTagCommit,
}: {
  meta: BuildMeta | null;
  tagName: string;
  /** 本地同名 git tag 指向的 commit，没有该 tag 则为 null */
  existingTagCommit: string | null;
}): GitTagPlan => {
  const skip = (reason: string): GitTagPlan => ({ action: 'skip', tagName, commit: '', reason });

  if (!meta || !meta.commit) return skip('产物来源未知');
  // 脏工作区打出的产物不对应任何 commit（gitHead 已记为 <sha>-dirty），tag 指过去只会撒谎。
  // 严格比 null：更早版本写的 meta 没有 dirty 字段（undefined），与 formatBuildMeta 一样按干净处理
  if (meta.dirty === true) return skip('脏工作区打出的产物不对应任何 commit');
  if (meta.dirty === null) return skip('git 状态未知，无从确认产物对应哪个 commit');

  // 已经指向同一个 commit：不重打，但仍要走推送 —— 远端未必有它（上次中断在推送之前）
  if (existingTagCommit === meta.commit) {
    return { action: 'reuse', tagName, commit: meta.commit, reason: '已指向同一 commit' };
  }
  // 同名 tag 指着别的 commit。正常走不到这里：版本号重复先被 registry 那道门禁挡了，
  // 只可能是上次中断的流程留下的残留。绝不 -f —— 移动一个别人可能已经拉走的 tag，
  // 代价远大于这次少一个 tag
  if (existingTagCommit) {
    return skip(`已存在且指向 ${existingTagCommit.slice(0, 8)}，不覆盖`);
  }

  return { action: 'create', tagName, commit: meta.commit, reason: '' };
};
