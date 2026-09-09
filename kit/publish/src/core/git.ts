/**
 * Git 操作。
 *
 * 读操作（分支、commit、工作区状态、tag 指向）仅用于发布前提示与产物溯源，失败一律返回
 * 「查不到」而不抛，不阻断发布流程。
 *
 * 写操作（打 tag、推 tag）反过来必须抛：静默失败会让人以为 tag 已经在了。它们跑在发布成功
 * 之后，由调用方 try/catch 兜住并降级成告警 —— 已经成功的发布不该因为 tag 没打上而报失败。
 */

import { exec, type ExecError } from '../utils/exec';

// 命令失败返回 null（而不是空串）：「查不到」与「查到的是空」在下面是两回事
const safeExec = (args: string[], cwd: string): string | null => {
  try {
    return exec('git', args, cwd);
  } catch {
    return null;
  }
};

/**
 * 当前分支名，detached HEAD 时为空串。
 *
 * 不用 rev-parse --abbrev-ref HEAD：它在 detached HEAD 下返回字面量 "HEAD"，于是
 * resolveConfiguredTag 拿 "HEAD" 去匹配 tags.byBranch，一条也匹配不上，定制分支的标签声明
 * 静默失效 —— 而 detached HEAD 正是 CI 的常态（checkout <sha>、浅克隆）。symbolic-ref 在
 * detached 时直接失败，「没有分支」与「分支叫 HEAD」就分得开了（后续判定见 branchUnknown）。
 */
export const getBranch = (cwd: string): string =>
  safeExec(['symbolic-ref', '-q', '--short', 'HEAD'], cwd) ?? '';

export const getCommit = (cwd: string): string => safeExec(['rev-parse', 'HEAD'], cwd) ?? '';

/**
 * 未提交的改动（含未跟踪文件；dist / node_modules 通常已被 .gitignore 忽略，不会误报）。
 *
 * git 不可用（不是仓库、没装 git、仓库损坏）时返回 null —— 它与「工作区干净」是两回事：
 * 两者都归成空数组的话，发布前检查会报告干净、.build-meta.json 记下 dirty: false，
 * 而实际上根本不知道产物对应哪个 commit。溯源信息不该替我们下这个结论。
 */
export const getDirtyFiles = (cwd: string): string[] | null => {
  const output = safeExec(['status', '--porcelain'], cwd);
  if (output === null) return null;

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
};

/**
 * 本地同名 tag 指向的 commit，不存在返回 null。
 *
 * `^{commit}` 是必须的：annotated tag 的 refs/tags/<name> 指向的是 tag 对象而非提交，
 * 不解引用的话拿到的 sha 与 .build-meta.json 里的 commit 永远对不上。
 */
export const getTagCommit = (name: string, cwd: string): string | null =>
  safeExec(['rev-parse', '-q', '--verify', `refs/tags/${name}^{commit}`], cwd) || null;

/** 该 commit 是否在本地仓库里（浅克隆、换了 checkout 都可能没有它） */
export const hasCommit = (sha: string, cwd: string): boolean =>
  safeExec(['cat-file', '-e', `${sha}^{commit}`], cwd) !== null;

/**
 * 校验 tag 名，合法返回 undefined，非法返回原因。
 *
 * 判据交给 git 自己（check-ref-format），不自己写正则：引用名的规则有十来条
 *（不能含空格、`..`、`~^:?*[`、不能以 `.` 结尾、不能有连续斜杠……），抄错一条的后果是
 * 让 `git tag` 在发布成功之后才失败。
 */
export const checkRefFormat = (name: string, cwd: string): string | undefined => {
  try {
    exec('git', ['check-ref-format', `refs/tags/${name}`], cwd);
    return undefined;
  } catch (error) {
    // check-ref-format 判定非法时通常只给退出码、不给理由，兜一句自己的
    return (error as ExecError).stderr?.split('\n')[0]?.trim() || 'git 不接受这个引用名';
  }
};

/** 打 annotated tag（不是轻量 tag：message 里要记下发布通道与 registry） */
export const createTag = (
  { name, commit, message }: { name: string; commit: string; message: string },
  cwd: string,
): void => {
  exec('git', ['tag', '-a', name, commit, '-m', message], cwd);
};

/**
 * 推送单个 tag。
 *
 * 显式写 refspec 而不是 `git push --tags` 或 `git push <remote> <name>`：前者会把本地
 * 所有 tag 一起推上去，后者在同名分支存在时会推分支。这里只推这一个 tag。
 */
export const pushTag = ({ remote, name }: { remote: string; name: string }, cwd: string): void => {
  exec('git', ['push', remote, `refs/tags/${name}`], cwd);
};
