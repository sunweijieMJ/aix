import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

/**
 * git 模板源的识别、归一化与缓存路径推导
 *
 * create-app 直连模板真源仓库（不再维护任何包内快照），因此需要一条自己的
 * git clone 通路：giget 的 `github:` / `gitlab:` 走的是 tarball API，
 * 内网 GitLab 常常只开放 ssh，拿不到 tarball。
 */

/** 解析后的 git 源 */
export interface GitSource {
  /** 归一化后的 clone URL（scp 形式会被转成 git+ssh://） */
  url: string;
  /** 分支 / tag，未指定时为 undefined（用远端默认分支） */
  ref?: string;
}

/**
 * `git+<scheme>://…#ref`
 *
 * 实际用的是 `git+ssh://`；`file` / `http(s)` 一并放行，既让单测能不联网跑通
 * clone 链路，也留出内网 http 仓库的口子。
 */
const GIT_SSH_URL = /^git\+(ssh|file|https?|git):\/\/[^\s#]+$/;
/** scp 简写 `git@host:owner/repo.git#ref` */
const GIT_SCP = /^([A-Za-z0-9._-]+)@([A-Za-z0-9._-]+):(.+)$/;

/**
 * 判断是否为本模块处理的 git 源
 *
 * 只认 `git+ssh://` 与 scp 简写两种；`github:` / `gitlab:` / `git:` 仍归 giget，
 * 避免抢走既有行为。
 */
export function isGitSource(source: string): boolean {
  const [body] = splitRef(source);
  return GIT_SSH_URL.test(body) || GIT_SCP.test(body);
}

/** 以最后一个 `#` 切出 ref（ssh URL 本身不含 `#`，故不会误切） */
function splitRef(source: string): [string, string | undefined] {
  const i = source.lastIndexOf('#');
  if (i < 0) return [source, undefined];
  const ref = source.slice(i + 1).trim();
  return [source.slice(0, i), ref.length > 0 ? ref : undefined];
}

/**
 * 解析并归一化 git 源
 *
 * scp 简写 `git@host:owner/repo.git` → `git+ssh://git@host/owner/repo.git`，
 * 这样缓存 key 与展示形态都只有一种写法。
 */
export function parseGitSource(source: string): GitSource {
  const [body, ref] = splitRef(source);

  const scp = GIT_SCP.exec(body);
  if (scp && !body.startsWith('git+ssh://')) {
    const [, user, host, pathPart] = scp;
    return { url: `git+ssh://${user}@${host}/${pathPart!.replace(/^\/+/, '')}`, ref };
  }

  return { url: body, ref };
}

/** 交给 `git clone` 的实际 URL：剥掉 `git+` 前缀（git 不认这个 scheme） */
export function toCloneUrl(url: string): string {
  return url.startsWith('git+') ? url.slice('git+'.length) : url;
}

/** 缓存根目录：`~/.cache/create-app` */
export function gitCacheRoot(): string {
  return path.join(os.homedir(), '.cache', 'create-app');
}

/**
 * 缓存目录：`~/.cache/create-app/git-<repo 名>-<url+ref 的短 hash>`
 *
 * 带上可读的 repo 名只为方便人肉排查；唯一性由 hash 保证（同一仓库的不同 ref
 * 必须落在不同目录，否则切分支时会读到上一次的内容）。
 */
export function gitCacheDir(src: GitSource): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${src.url}#${src.ref ?? ''}`)
    .digest('hex')
    .slice(0, 12);
  const repo = (src.url.split('/').pop() ?? 'repo').replace(/\.git$/, '').replace(/[^\w.-]/g, '-');
  return path.join(gitCacheRoot(), `git-${repo}-${hash}`);
}

/** 组装 `git clone` 参数：浅克隆，指定 ref 时加 `-b` */
export function buildCloneArgs(src: GitSource, dest: string): string[] {
  const args = ['clone', '--depth', '1'];
  if (src.ref) args.push('-b', src.ref);
  args.push(toCloneUrl(src.url), dest);
  return args;
}
