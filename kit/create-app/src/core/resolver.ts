import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

/**
 * 既不是本地路径、也不是 git 源时的统一报错
 *
 * 模板源只有这两类通路（注册表条目最终也解析成其中之一）。写错的源必须当场说清
 * 支持哪几种形态：静默按某个通路去试，只会换来一句与真实病因无关的网络/路径错误。
 */
function unsupportedSourceError(source: string): CreateAppError {
  return new CreateAppError(
    'E_INVALID_OPTION',
    `不支持的模板源格式: ${source}`,
    '支持的形态有四种：注册表 id（如 admin）；本地路径（/abs/tpl、./tpl、~/tpl、file:./tpl）；' +
      'git+ssh://git@host/owner/repo.git；git@host:owner/repo.git（scp 简写）。' +
      '后两种可用 `#ref` 指定分支或 tag（如 …repo.git#master）',
  );
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
 * 其余形态交给 isGitSource 判定，两边都不认的一律报错（见 fetch）。
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
  const root = gitCacheRoot();
  if (dir !== root && !dir.startsWith(root + path.sep)) return undefined;

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

/**
 * 认定 `.tmp-*` 已成孤儿的年龄：比这更新的一律不碰
 *
 * 同一模板可能正被另一个进程克隆，它的 tmp 就在旁边长着——按名字前缀无脑删会把人家
 * 删到一半。真正的孤儿只可能来自已经死掉的进程，等一小时再收拾没有任何代价。
 */
const TMP_ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/**
 * 清理本仓库上次被中断留下的 `.tmp-*` 孤儿目录
 *
 * 只扫 `dir` 自身的前缀，不遍历整个缓存根：缓存根下还躺着别的模板，
 * 顺手「打扫全屋」既慢又容易误伤。清理失败一律吞掉——这只是省磁盘，不该挡住生成。
 */
function pruneStaleTmpDirs(dir: string): void {
  const parent = path.dirname(dir);
  const prefix = `${path.basename(dir)}.tmp-`;
  let entries: string[];
  try {
    entries = fs.readdirSync(parent);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.startsWith(prefix)) continue;
    const full = path.join(parent, name);
    try {
      if (Date.now() - fs.statSync(full).mtimeMs < TMP_ORPHAN_MIN_AGE_MS) continue;
      fs.rmSync(full, { recursive: true, force: true });
    } catch {
      // 并发删除 / 权限问题都无所谓，下次再清
    }
  }
}

export class TemplateResolver {
  /**
   * 克隆 git 源到本地缓存目录（~/.cache/create-app/），本地路径源则直接定位
   *
   * 只有这两条通路：模板真源都是内网 GitLab 的 git+ssh 仓库，本地开发用本地路径。
   * 其余形态一律报错（见 unsupportedSourceError），不做任何猜测性回退。
   *
   * source 格式示例：
   *   'git+ssh://git@git.zhihuishu.com/weijie/vue-admin-template.git#master'
   *   'git@git.zhihuishu.com:weijie/vue-admin-template.git#master'（scp 简写）
   *   '/abs/path/to/template'、'./local-template'、'~/tpl'、'file:./local-template'
   */
  // 两条通路本身都是同步的，但签名保持 async：调用方一律 await，且所有报错
  // （含 resolveCachePolicy 的互斥校验）都要以 reject 形态出现，不能同步抛
  async fetch(source: string, options?: FetchOptions): Promise<string> {
    // 策略判定（含 --refresh/--offline 互斥校验）对所有源统一生效：本地路径源虽然
    // 不涉及缓存，但同一对自相矛盾的 flag 不能换个源类型就从「硬报」变「静默忽略」
    const policy = resolveCachePolicy(options);

    // 本地路径不走缓存，每次直读，便于模板开发时即改即用
    if (isLocalSource(source)) return this.locate(source);

    if (isGitSource(source)) return this.cloneGit(source, policy);

    throw unsupportedSourceError(source);
  }

  /**
   * 浅克隆 git 源到缓存目录并返回该目录
   *
   * 缓存三态由 fetch 入口统一判定后传入：
   * 默认复用缓存，`--refresh` 删缓存重克隆，`--offline` 只用缓存、缺失即报错。
   * 克隆后删掉 `.git/`——模板只要工作区内容，留着会被 composer 当普通文件拷进新项目。
   *
   * 全程「克隆到临时目录，完整了再 rename 到 dir」，理由见函数内注释。
   */
  private cloneGit(source: string, policy: CachePolicy): string {
    const src = parseGitSource(source);
    const dir = gitCacheDir(src);

    if (fs.existsSync(dir)) {
      if (policy !== 'refresh') return this.assertTemplateDir(dir, source);
      fs.rmSync(dir, { recursive: true, force: true });
    } else if (policy === 'offline') {
      throw offlineMissError(source, dir);
    }

    fs.mkdirSync(path.dirname(dir), { recursive: true });
    pruneStaleTmpDirs(dir);

    // 克隆到同父目录下的临时目录，完整了再 rename 到 dir——同一文件系统内 rename 是原子的，
    // 于是 dir 位置要么不存在、要么就是一份完整模板。
    // 直接克隆到 dir 的话，只有「git 返回非零」这一条路径会清理，Ctrl-C / 断电 / OOM
    // 杀在克隆中途都会留下半成品；而下次的缓存命中只校验 `.template/config.ts` 存在
    // （assertTemplateDir），半成品照样放行，产出一个内容残缺却一路报成功的项目
    const tmp = `${dir}.tmp-${process.pid}`;
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
      const r = spawnSync('git', buildCloneArgs(src, tmp), { encoding: 'utf-8' });

      if (r.status !== 0) {
        const detail = `${r.stderr ?? ''}${r.error ? String(r.error.message) : ''}`.trim();
        throw new CreateAppError(
          'E_TEMPLATE_FETCH_FAILED',
          `克隆模板仓库失败: ${source}\n${detail}`,
          '请检查 ssh 权限与网络（git clone 能否手动成功），或改用 --template <本地路径>',
        );
      }

      fs.rmSync(path.join(tmp, '.git'), { recursive: true, force: true });
      try {
        fs.renameSync(tmp, dir);
      } catch (err) {
        // 并发生成同一模板时，另一个进程可能已经先完成并占住了 dir（非空目录上 rename 会失败）。
        // 目标已存在即视为可用缓存（同一 url+ref，内容同源），丢掉自己这份 tmp 即可
        if (!fs.existsSync(dir)) throw err;
      }
    } finally {
      // 成功路径上 tmp 已被 rename 走，这里兜的是失败与并发路径：任何出口都不留孤儿
      fs.rmSync(tmp, { recursive: true, force: true });
    }

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

    // 协议规定清单只能 `export default`：jiti 执行 TS 的 default 导出后一律裹在 `default` 里。
    // 此处不回退到裸模块对象——那样一个只有具名导出的 config.ts 会带着整个模块命名空间进 Zod，
    // 报一串结构错（"Unrecognized key: config"），而真正的病因（少写 default）一个字都不会出现。
    //
    // 判定必须用 `'default' in raw` 而不是 `raw.default !== undefined`：jiti 返回的是带
    // interop 回退的 Proxy，模块没有 default 导出时读 `.default` 会拿到整个命名空间对象，
    // 于是「取值判空」永远为真，这道校验等于不存在。`in` 走的是真实的 ownKeys
    const hasDefault = typeof raw === 'object' && raw !== null && 'default' in raw;
    if (!hasDefault) {
      throw new CreateAppError(
        'E_INVALID_TEMPLATE_CONFIG',
        `.template/config.ts 没有 default 导出: ${configPath}`,
        '模板清单必须写成 `export default config`（协议 v0.2）',
      );
    }

    const result = TemplateConfigSchema.safeParse((raw as { default: unknown }).default);
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
