/**
 * Git 信息读取：仅用于发布前提示与产物溯源，任何失败都不阻断发布流程。
 */

import { exec } from '../utils/exec';

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
