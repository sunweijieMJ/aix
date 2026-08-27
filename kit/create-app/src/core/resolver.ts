import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { downloadTemplate } from 'giget';
import { createJiti } from 'jiti';
import semver from 'semver';
import type { TemplateConfig } from '../types';
import { CreateAppError } from '../utils/errors';
import {
  buildCloneArgs,
  gitCacheDir,
  gitCacheRoot,
  isGitSource,
  parseGitSource,
} from './git-source';
import { TemplateConfigSchema } from './schemas';

export interface FetchOptions {
  /** 重新拉取模板，忽略缓存（`--refresh`，未传即 undefined） */
  refresh?: boolean;
  /** 仅使用本地缓存，不联网（`--offline`，未传即 undefined） */
  offline?: boolean;
}

/**
 * 缓存策略三态
 *
 * - `reuse`：默认。缓存命中即复用，未命中才联网拉取
 * - `refresh`：`--force`，先删缓存再重新拉取
 * - `offline`：`--offline`，只用缓存；缓存缺失直接失败，绝不联网
 */
export type CachePolicy = 'reuse' | 'refresh' | 'offline';

/**
 * 把 CLI 的两个布尔 flag 归约为缓存策略
 *
 * `--refresh` 与 `--offline` 同时传是自相矛盾的（一个要求联网重取、一个禁止联网），
 * 直接报错而不是择一：静默按其中一个执行，必然违背另一半意图，而且事后完全看不出来。
 *
 * 注意这里**不再涉及 `--force`**。`--force` 曾同时表示「清空目标目录」和「刷新模板缓存」，
 * 于是 `--force --offline` 只能择一；拆成 `--force`（只管目录）+ `--refresh`（只管缓存）之后，
 * 「清空目录 + 只用缓存」变成一个完全合法的组合，矛盾自然消失。
 */
export function resolveCachePolicy(options?: FetchOptions): CachePolicy {
  if (options?.refresh && options?.offline) {
    throw new CreateAppError(
      'E_INVALID_OPTION',
      '--refresh 与 --offline 不能同时使用（一个要求联网重取，一个禁止联网）',
      '要拉取远端最新模板用 --refresh；要在无网环境下用本地缓存用 --offline',
    );
  }
  if (options?.refresh) return 'refresh';
  if (options?.offline) return 'offline';
  return 'reuse';
}

/** `--offline` 且缓存缺失时的统一报错 */
function offlineMissError(source: string, where: string, cause?: unknown): CreateAppError {
  return new CreateAppError(
    'E_TEMPLATE_FETCH_FAILED',
    `--offline 只允许使用本地缓存，但缓存中没有该模板: ${source}\n（期望缓存位置 ${where}）`,
    '请去掉 --offline 让其联网拉取一次，或先在有网环境下执行一次生成以填充缓存',
    cause,
  );
}

/**
 * 判断模板源是否为本地路径
 *
 * 命中条件：绝对路径 `/`、相对路径 `./` `../`、home 展开 `~/`、`file:` 前缀。
 * 其余（`github:` `git:` `gitlab:` 等）一律交给 giget。
 */
export function isLocalSource(source: string): boolean {
  return (
    source.startsWith('/') ||
    source.startsWith('./') ||
    source.startsWith('../') ||
    source.startsWith('~/') ||
    source.startsWith('file:')
  );
}

/** 把本地模板源归一化为绝对路径（不校验存在性） */
export function resolveLocalSource(source: string): string {
  if (source.startsWith('file:')) {
    // 兼容 `file:./x`、`file:/abs/x`、`file:///abs/x` 三种写法
    const stripped = source.replace(/^file:(\/\/)?/, '');
    return path.resolve(process.cwd(), stripped);
  }
  if (source.startsWith('~/')) {
    return path.join(os.homedir(), source.slice(2));
  }
  return path.resolve(process.cwd(), source);
}

/** 低于这个年龄不提示：几分钟内的缓存多半就是本次运行刚克隆出来的 */
const CACHE_HINT_MIN_MINUTES = 5;

/**
 * 若 dir 落在已知缓存根下**且缓存已有年龄**，返回「上次拉取距今多久」的人话描述，否则 undefined
 *
 * 「模板改了怎么没生效」是这套缓存最常见的困惑：默认策略是复用缓存，git 源在缓存命中时
 * 压根不会 fetch，远端分支前进后本地会一直读旧克隆。把缓存年龄摆到台面上，
 * 比让用户自己想起来要 --refresh 便宜得多。
 *
 * 但首次克隆同样落在缓存目录里、mtime 就是刚刚——调用方只知道「策略是复用」，
 * 分不出「真命中了缓存」还是「刚建的缓存」。用年龄下限过滤掉后者：
 * 提示的价值只在缓存**旧**的时候，说「复用缓存（刚刚拉取）」纯属误导。
 */
export function describeCacheAge(dir: string): string | undefined {
  // giget 的缓存根遵循 XDG_CACHE_HOME（缺省 ~/.cache），这里必须同一套推导：
  // 写死 ~/.cache 会让设了该变量的用户永远看不到「复用缓存」提示
  const xdg = process.env['XDG_CACHE_HOME'];
  const cacheBase = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.cache');
  const roots = [gitCacheRoot(), path.join(cacheBase, 'giget')];
  if (!roots.some((root) => dir === root || dir.startsWith(root + path.sep))) return undefined;

  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(dir).mtimeMs;
  } catch {
    return undefined;
  }

  const minutes = Math.floor((Date.now() - mtimeMs) / 60_000);
  if (minutes < CACHE_HINT_MIN_MINUTES) return undefined;
  if (minutes < 60) return `${minutes} 分钟前拉取`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} 小时前拉取`;
  return `${Math.floor(minutes / (60 * 24))} 天前拉取`;
}

export class TemplateResolver {
  /**
   * 拉取模板到本地缓存目录（~/.cache/giget/），本地路径源则直接定位
   *
   * source 格式示例：
   *   'git+ssh://git@git.zhihuishu.com/weijie/vue-admin-template.git#master'
   *   'git@git.zhihuishu.com:weijie/vue-admin-template.git#master'（scp 简写）
   *   'github:org/app-templates/packages/template-pc'
   *   '/abs/path/to/template'、'./local-template'、'~/tpl'、'file:./local-template'
   */
  async fetch(source: string, options?: FetchOptions): Promise<string> {
    // 本地路径不走缓存，每次直读，便于模板开发时即改即用
    if (isLocalSource(source)) return this.locate(source);

    // git 源自己 clone：内网 GitLab 多数只开 ssh，giget 的 tarball 通路拿不到
    if (isGitSource(source)) return this.cloneGit(source, options);

    // 本地路径分支在上面已 return，此处起才需要策略判定（含 refresh/offline 互斥校验）

    const policy = resolveCachePolicy(options);
    try {
      const { dir } = await downloadTemplate(source, {
        // refresh 才删缓存重取；其余两态都优先吃缓存，offline 再额外禁掉联网回退
        force: policy === 'refresh',
        preferOffline: policy !== 'refresh',
        offline: policy === 'offline',
      });
      return dir;
    } catch (err) {
      // offline 下 giget 的失败只可能是「缓存里没有」——它压根不会去联网
      if (policy === 'offline') throw offlineMissError(source, 'giget 缓存（~/.cache/giget）', err);
      throw new CreateAppError(
        'E_TEMPLATE_FETCH_FAILED',
        `拉取模板失败: ${source}\n${err instanceof Error ? err.message : String(err)}`,
        '请检查网络连接，或使用 --offline 参数使用本地缓存',
        err,
      );
    }
  }

  /**
   * 浅克隆 git 源到缓存目录并返回该目录
   *
   * 缓存策略与 giget 分支保持一致（resolveCachePolicy 三态）：
   * 默认复用缓存，`--refresh` 删缓存重克隆，`--offline` 只用缓存、缺失即报错。
   * 克隆后删掉 `.git/`——模板只要工作区内容，留着会被 composer 当普通文件拷进新项目。
   */
  private cloneGit(source: string, options?: FetchOptions): string {
    const src = parseGitSource(source);
    const dir = gitCacheDir(src);
    const policy = resolveCachePolicy(options);

    if (fs.existsSync(dir)) {
      if (policy !== 'refresh') return this.assertTemplateDir(dir, source);
      fs.rmSync(dir, { recursive: true, force: true });
    } else if (policy === 'offline') {
      throw offlineMissError(source, dir);
    }

    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const args = buildCloneArgs(src, dir);
    const r = spawnSync('git', args, { encoding: 'utf-8' });

    if (r.status !== 0) {
      // 克隆失败会留下半个目录，不清掉会被下次的「缓存命中」当成有效模板
      fs.rmSync(dir, { recursive: true, force: true });
      const detail = `${r.stderr ?? ''}${r.error ? String(r.error.message) : ''}`.trim();
      throw new CreateAppError(
        'E_TEMPLATE_FETCH_FAILED',
        `克隆模板仓库失败: ${source}\n${detail}`,
        '请检查 ssh 权限与网络（git clone 能否手动成功），或改用 --template <本地路径>',
      );
    }

    fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });
    return this.assertTemplateDir(dir, source);
  }

  /** 克隆/缓存命中后统一校验模板结构 */
  private assertTemplateDir(dir: string, source: string): string {
    if (!fs.existsSync(path.join(dir, '.template/config.ts'))) {
      throw new CreateAppError(
        'E_NO_TEMPLATE_CONFIG',
        `模板缺少 .template/config.ts: ${source}\n（克隆到 ${dir}）`,
        '请确认该仓库/分支已包含 .template/config.ts，或用 --refresh 重新拉取',
      );
    }
    return dir;
  }

  /** 校验本地模板目录并返回绝对路径 */
  private locate(source: string): string {
    const dir = resolveLocalSource(source);

    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new CreateAppError(
        'E_TEMPLATE_FETCH_FAILED',
        `本地模板目录不存在: ${dir}`,
        '请检查 --template 传入的路径是否正确',
      );
    }

    if (!fs.existsSync(path.join(dir, '.template/config.ts'))) {
      throw new CreateAppError(
        'E_NO_TEMPLATE_CONFIG',
        `模板缺少 .template/config.ts: ${dir}`,
        '请确认 --template 指向的是模板根目录',
      );
    }

    return dir;
  }

  /**
   * 用 jiti 执行 .template/config.ts，然后经 Zod 验证结构
   */
  async readConfig(templateDir: string): Promise<TemplateConfig> {
    const configPath = path.join(templateDir, '.template/config.ts');

    if (!fs.existsSync(configPath)) {
      throw new CreateAppError(
        'E_NO_TEMPLATE_CONFIG',
        `模板缺少 .template/config.ts: ${templateDir}`,
        '请确认模板目录结构是否正确',
      );
    }

    let raw: unknown;
    try {
      const jiti = createJiti(import.meta.url);
      raw = await jiti.import(configPath);
    } catch (err) {
      throw new CreateAppError(
        'E_INVALID_TEMPLATE_CONFIG',
        `执行 .template/config.ts 失败: ${err instanceof Error ? err.message : String(err)}`,
        '请检查 config.ts 语法是否正确',
        err,
      );
    }

    // 兼容 export default 和 module.exports
    const configData = (raw as any)?.default ?? raw;

    const result = TemplateConfigSchema.safeParse(configData);
    if (!result.success) {
      throw new CreateAppError(
        'E_INVALID_TEMPLATE_CONFIG',
        `模板 config.ts 结构不合法:\n${result.error.message}`,
        '请确认 config.ts 符合 TemplateConfig 接口定义',
      );
    }

    return result.data;
  }

  /** 校验 CLI 版本与模板的兼容性 */
  checkCompat(config: TemplateConfig, cliVersion: string): void {
    // 预发布版本按其对应正式版参与判定（0.2.0-alpha.x 视同 0.2.0）：
    // - 不处理的话 semver 默认把预发布整体排除在 range 外，changesets pre 模式
    //   发出的 CLI 会被所有模板误拦，且报错提示（“请更新到最新版本”）完全误导
    // - 也不能只开 includePrerelease：0.3.0-alpha.x < 0.3.0 会钻过 '<0.3.0' 上界，
    //   而模板钉上界正是为了挡住下一代协议
    const effective = semver.coerce(cliVersion)?.version ?? cliVersion;
    if (!semver.satisfies(effective, config.compatibleCliVersions)) {
      throw new CreateAppError(
        'E_VERSION_INCOMPATIBLE',
        `模板要求 CLI 版本 ${config.compatibleCliVersions}，当前版本 ${cliVersion}`,
        '请运行 npm install -g @kit/create-app 更新 CLI 到最新版本',
      );
    }
  }
}
