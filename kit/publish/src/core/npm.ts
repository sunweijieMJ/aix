/**
 * npm registry 相关操作：地址解析、登录校验、版本查询、发布与下架。
 */

import fs from 'fs';
import path from 'path';
import {
  exec,
  formatDuration,
  heartbeat,
  runCapturingStderr,
  sleep,
  type ExecError,
} from '../utils/exec';
import { logInfo, logOk, logWarn } from '../utils/logger';

/**
 * 怎么调 npm：优先用当前 node 直接跑 npm 的 JS 入口，而不是 PATH 上的 npm.cmd。
 *
 * Node 修掉 CVE-2024-27980 之后（18.20.2 / 20.12.2 / 22 起），Windows 上 spawn 一个
 * .cmd / .bat 必须显式带 shell，否则一律 EINVAL —— execFileSync('npm.cmd', ...) 在
 * 「命令还没跑起来」的阶段就抛错，status 为 null、stderr 为空。于是本文件所有 npm 调用
 * 在 Windows + 新版 node 上全都失败，而第一个撞上它的是 whoami：落到 checkLogin 的
 * catch 里就成了「未登录私有仓库」，实际上 npm whoami 一次都没执行过。
 *
 * 改成带 shell 不行：deprecate 的原因这类含空格的中文参数交给 cmd 重新切词后，
 * 引号与 % 展开都得自己处理（utils/exec 一律数组传参正是为了躲开这层）。
 * 直接跑 npm-cli.js 既没有批处理包装这一层，也不依赖 PATH。
 */
const npmCliPath = (): string | null => {
  // 经 npm run 调起时这就是那个 npm；pnpm / yarn 下它指向它们自己的入口，不能用
  const fromEnv = process.env.npm_execpath;
  if (fromEnv && /npm-cli\.js$/i.test(fromEnv) && fs.existsSync(fromEnv)) return fromEnv;

  // node 自带的那份 npm：官方安装包与 nvm-windows 都是这个布局
  const bundled = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  return fs.existsSync(bundled) ? bundled : null;
};

const NPM_CLI = npmCliPath();
// 找不到 JS 入口时回落到 PATH 上的可执行文件（非 Windows 的 npm 是 shell 脚本，spawn 没有上述限制）
const NPM = NPM_CLI ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmArgs = (args: string[]): string[] => (NPM_CLI ? [NPM_CLI, ...args] : args);

// 包名 → scope：@scope/pkg → @scope；@scope/pkg@1.8.3 同样成立（版本号在 / 之后）
const scopeOf = (spec: string | undefined): string | null =>
  spec?.startsWith('@') ? (spec.split('/')[0] ?? null) : null;

/**
 * 把 registry 传给 npm 的完整参数。
 *
 * npm 解析 registry 时 @scope:registry 优先于 --registry。包名是 scoped 时，
 * 只传 --registry 会被 .npmrc 里的 @scope:registry 悄悄覆盖：
 * `npm publish --registry=<别的地址>` 照旧发到 .npmrc 指定的仓库，并在 notice 里打印
 * 它真正发往的地址 —— 脚本却在日志里显示覆盖后的地址。
 * 所以凡是带包名的命令，都要把同一个地址再以 scope 限定的形式传一遍。
 *
 * 不带包名的命令（whoami）没有 scope 上下文，npm 直接用 --registry，无需限定。
 */
const registryArgs = (registry: string, spec?: string): string[] => {
  const scope = scopeOf(spec);
  return scope
    ? [`--registry=${registry}`, `--${scope}:registry=${registry}`]
    : [`--registry=${registry}`];
};

/**
 * registry 地址：环境变量 NPM_REGISTRY > 配置里的 registry（本身默认为内置私仓地址）。
 *
 * 不去解析 .npmrc / 问 npm config：发布目标就该是仓库里写死的一个常量 —— 一个只往私有仓库
 * 发包的工具，目标地址随各人机器上的 .npmrc 变化没有好处，反而让「这次发到哪」变得要先查配置
 * 才知道。要临时改目标就显式传 --registry，日志里会点明是谁覆盖了默认值。
 */
export const getRegistry = (configured: string): string =>
  process.env.NPM_REGISTRY?.trim() || configured;

/** 登录校验放在构建之前：避免跑完几分钟构建才发现没登录 */
export const checkLogin = (registry: string): string => {
  try {
    const user = exec(NPM, npmArgs(['whoami', ...registryArgs(registry)]));
    logOk(`npm 已登录: ${user}`);
    return user;
  } catch (error) {
    // npm 根本没跑起来（spawn 失败：没有退出码、也没有 stderr）时报「未登录」是误导 ——
    // whoami 一次都没执行，让人去 npm login 只会白折腾一轮
    const e = error as ExecError & { cause?: { code?: string } };
    if (e?.status == null) {
      throw new Error(
        `无法执行 npm 命令（${e?.cause?.code ?? '未知错误'}），无从校验登录状态:\n${e?.message ?? String(error)}`,
        { cause: error },
      );
    }
    throw new Error(
      `未登录私有仓库 ${registry}\n请先执行:\n\n  npm login --registry=${registry}\n\n登录后重新运行发布脚本`,
      { cause: error },
    );
  }
};

// npm view 封装：包、版本或字段不存在时返回 null（首次发布场景），其余错误照常抛出
const view = (spec: string, field: string, registry: string): unknown => {
  try {
    // 字段存在但没有值时 npm 以 0 退出且不输出任何内容（如老版本没有 gitHead），
    // 直接 JSON.parse('') 会抛 SyntaxError 并被当成未知错误上抛
    const output = exec(
      NPM,
      npmArgs(['view', spec, field, '--json', ...registryArgs(registry, spec)]),
    );
    return output ? JSON.parse(output) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/E404|404 Not Found|No match found|is not in this registry/i.test(message)) return null;
    throw error;
  }
};

export const getDistTags = (name: string, registry: string): Record<string, string> =>
  (view(name, 'dist-tags', registry) as Record<string, string> | null) ?? {};

// 单版本包时 npm view 返回字符串而非数组，统一成数组
export const getVersions = (name: string, registry: string): string[] => {
  const versions = view(name, 'versions', registry) as string | string[] | null;
  return versions == null ? [] : ([] as string[]).concat(versions);
};

const versionExists = (name: string, version: string, registry: string): boolean =>
  view(`${name}@${version}`, 'version', registry) != null;

// 某个已发布版本的 exports：用来比对本次派生出的入口有没有少掉公开子路径。
// 拿不到（老版本没这个字段、或字段形状不对）时返回 null，由调用方跳过比对而不是当成「空」
export const getExports = (
  name: string,
  version: string,
  registry: string,
): Record<string, unknown> | null => {
  const field = view(`${name}@${version}`, 'exports', registry);
  return field && typeof field === 'object' && !Array.isArray(field)
    ? (field as Record<string, unknown>)
    : null;
};

// registry 上该版本的来源 commit：manifest 显式写了就是我们写的值，
// 没写时 npm publish 会自己按仓库 HEAD 补上，两种情况调用方都知道期望值
const gitHeadOf = (name: string, version: string, registry: string): string | null => {
  const head = view(`${name}@${version}`, 'gitHead', registry);
  return typeof head === 'string' ? head : null;
};

// 查询失败时按「不存在」处理：宁可多重试一次，也不要凭一次失败的查询下结论
const existsSafely = (name: string, version: string, registry: string): boolean => {
  try {
    return versionExists(name, version, registry);
  } catch {
    return false;
  }
};

/**
 * publish 失败后判定 registry 上的同名版本是谁发的：
 *   absent      —— 不存在，这一版确实没发出去
 *   ours        —— gitHead 与本次产物一致，属于「上传成功但响应超时」
 *   foreign     —— gitHead 不一致，版本号在构建期间被别人占用了
 *   unknown     —— 存在但无从比对，只能交人工核对
 *   unreachable —— 查询自己也失败了，这一版到底发出去了没有，本轮无从知晓
 *
 * 只看「版本存在」是不够的，它区分不了 foreign 与 unknown：构建往往要几分钟，同事在这段
 * 时间里发了同一个版本号的话，脚本会以退出码 0 谎报成功，而 dist-tag 根本没指向我们的产物。
 *
 * unreachable 更不能并进 absent。会走到这个函数的场合本身就是「上传失败」，其中最常见的
 * 一类是网络不稳，而查询走的是同一条链路 —— 跟着一起失败的概率并不低。把它当成「不存在」
 * 等于在最该谨慎的时刻替人断言「没发出去」：真相若是「已上传、只是响应丢了」，
 * 重传拿到的是 EPUBLISHCONFLICT，一次成功的发布就被报成了失败。
 */
type Verdict = 'absent' | 'ours' | 'foreign' | 'unknown' | 'unreachable';

const judgeLanded = ({
  name,
  version,
  registry,
  gitHead,
}: {
  name: string;
  version: string;
  registry: string;
  gitHead?: string;
}): Verdict => {
  let landedHead: string | null;
  try {
    if (!versionExists(name, version, registry)) return 'absent';
    landedHead = gitHeadOf(name, version, registry);
  } catch {
    return 'unreachable';
  }

  if (!gitHead || !landedHead) return 'unknown';
  return landedHead === gitHead ? 'ours' : 'foreign';
};

// 网络抖动类错误值得重试；鉴权、版本冲突等确定性错误重试只是白等
const TRANSIENT =
  /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPROTO|socket hang up|network|Socket timeout|502 Bad Gateway|503 Service|504 Gateway/i;
const FATAL = /EPUBLISHCONFLICT|cannot publish over|E401|E403|ENEEDAUTH|EOTP|EBADPLATFORM|E404/i;

/**
 * 只把 npm 自己的报错行交给上面两个正则。
 *
 * npm publish 把整份 tarball 清单也写进 stderr（实测 33KB / 657 行，含 639 条
 * `npm notice <大小> js/xxx.js`）。让 chunk 文件名参与判定是危险的：TRANSIENT 里的
 * `network` 是个裸词，哪天出现 js/useNetworkStatus-xxx.js 就会把确定性错误误判成网络抖动
 * 白等三轮；反向撞上 FATAL 则会把真的网络抖动判成不可重试。
 *
 * spawn 失败（npm 不存在之类）没有 stderr，此时回落到 execError 的 reason 与 cause ——
 * reason 是「命令执行失败: ...」那一句本身，不含 stderr；cause 那一半不能省：
 * reason 不含 cause 的文本，只看它连 ENOENT 都匹配不到。
 *
 * 兜底文本两头都匹配不上时（既不像网络抖动也不像确定性错误），isTransient 得到 false ——
 * 分不清的失败不重试，这是安全的一侧：publish 非幂等，盲目重试的代价比白等一轮大。
 */
export const errorText = (error: unknown): string => {
  const e = error as (ExecError & { cause?: { message?: string } }) | undefined;
  const lines = String(e?.stderr ?? '')
    .split('\n')
    // ERR! 后面不能跟 \b：`!` 是非单词字符，其后是空格，边界不成立，
    // 老版本 npm（ERR! 前缀）的报错行会一条都匹配不上
    .filter((line) => /^npm (error\b|ERR!)/.test(line.trim()));
  if (lines.length) return lines.join('\n');

  return [e?.reason ?? e?.message, e?.cause?.message].filter(Boolean).join('\n');
};

export const isTransient = (error: unknown): boolean => {
  const text = errorText(error);
  return !FATAL.test(text) && TRANSIENT.test(text);
};

/**
 * 传输参数。这类包的 tarball 可以接近 20MB，而 npm publish 走的是 registry 的 PUT 接口 ——
 * tarball 被 base64 编码进 JSON body，实际上行量再涨三分之一（约 25MB），
 * 且这是个不可续传的单请求，慢上行链路上要连续占用同一个连接十几分钟。
 *
 * 而 npm 的 fetch-timeout 默认只有 5 分钟：包还没传完它自己就先把请求掐了，
 * 对外表现成 ECONNRESET / socket hang up，看着像网络抖动，实则是超时设得太短，
 * 于是每次重试都在同一个 5 分钟上撞死。故放宽到 30 分钟。
 *
 * fetch-retries 反过来置 0。npm 自己的重试会把整个 25MB 重传一遍，而 make-fetch-happen
 * 只对 POST 与流式 body 免除重试，publish 的 PUT 照样在内（见 remote.js 的 isRetriable），
 * 叠上外层三次就是最坏十八轮上传、几小时不收口，且这几轮对脚本不可见 —— 心跳照旧显示
 * 同一次尝试。重试统一交给下面的 publish：只有它在重传之前会拿 registry 上的实际状态
 * 判定这一版是否其实已经入库，而 publish 非幂等，盲目重传拿到的只会是 EPUBLISHCONFLICT。
 *
 * 这些值必须写在这里而不是靠各人的 .npmrc：发布能不能成功，不该取决于谁的机器上配了什么。
 */
const FETCH_TIMEOUT_MS = 1800000;
const NETWORK_ARGS = [`--fetch-timeout=${FETCH_TIMEOUT_MS}`, '--fetch-retries=0'];

/** npm pack 报出的体积，只留判断用得上的三个数 */
interface TarballSize {
  /** gzip 之后的 tarball 字节数，即 registry 收到的那个 attachment */
  packed: number;
  unpacked: number;
  entries: number;
}

const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// tarball 被 base64 编进 JSON body，上行量涨三分之一
const uploadBytes = (packed: number): number => Math.round((packed * 4) / 3);

/** Verdaccio 的 max_body_size 默认值。前置 nginx 的 client_max_body_size 默认更小（1m） */
const DEFAULT_BODY_LIMIT = 10 * 1024 * 1024;

/**
 * 上行体积越过服务端默认 body 上限时的告警。
 *
 * 这是「传到一半被断开」最常见的成因，且现象与网络抖动完全一样：服务端先回 413 再断流，
 * 客户端还在上行，于是只看到 read ECONNRESET。判据在客户端这边只能是「疑似」——
 * 服务端把上限调大了就没事 —— 但把这个数摆出来，至少不用靠「换台机器对比」才想到它。
 */
export const bodyLimitWarning = (packed: number): string | null =>
  uploadBytes(packed) > DEFAULT_BODY_LIMIT
    ? `上行体积超过 Verdaccio 的 max_body_size 默认值（10mb）：服务端若没调大它，上传会在传到一半时被 413 掐断，而客户端只看到 read ECONNRESET`
    : null;

/**
 * 量一次 tarball 体积，发布前打进日志。
 *
 * 走 npm pack 而不是自己遍历目录相加：要的是 gzip 之后、且按 .npmignore 过滤过的那个数，
 * 跟 publish 真正上传的是同一套打包逻辑。多打一遍包是几秒钟的事，换来的是「体积」
 * 这个维度在日志里有据可查 —— 同一个 commit 在不同机器上打出的产物并不总是一样大
 * （清理失败留下的旧 chunk、混进来的 sourcemap），而那恰恰能解释「只有部分机器发不上去」。
 *
 * 量不到就返回 null：这只是诊断信息，不该让发布本身失败 —— publish 自己还要再打一次包，
 * 真有打包问题会在那里报出来。
 */
const measureTarball = (dir: string): TarballSize | null => {
  try {
    const output = exec(NPM, npmArgs(['pack', '--dry-run', '--json']), dir);
    const [packed] = JSON.parse(output) as {
      size?: number;
      unpackedSize?: number;
      entryCount?: number;
    }[];
    if (typeof packed?.size !== 'number') return null;
    return {
      packed: packed.size,
      unpacked: packed.unpackedSize ?? 0,
      entries: packed.entryCount ?? 0,
    };
  } catch {
    return null;
  }
};

const logTarball = ({ packed, unpacked, entries }: TarballSize): void => {
  logInfo(
    `产物体积 ${formatBytes(packed)}（${entries} 个文件，解包后 ${formatBytes(unpacked)}），` +
      `上行约 ${formatBytes(uploadBytes(packed))}（tarball 以 base64 编进 JSON body）`,
  );
  const warning = bodyLimitWarning(packed);
  if (warning) logWarn(warning);
};

/**
 * 「几秒钟就断」的时长阈值。
 *
 * 真正的链路超时会撞在 fetch-timeout 上（30 分钟），不会在一分钟内收口。一分钟内断掉的
 * ECONNRESET 更像是被对端主动拒绝：服务端 body 上限、代理或安全软件的策略、又或者版本号
 * 已被上一轮上传占用而中间设备把 409 转成了 RST。这三者都不会因为「等网络缓过来」而好转。
 */
const FAST_FAILURE_SECONDS = 60;

/**
 * 快速失败时的排查提示。
 *
 * 只提示、不改重试决策：判据是时长而非确证，拿它去阻断一次可能真的是抖动的重试并不划算。
 * 但错误文本一律是 read ECONNRESET，不给方向的话，人只会照着「网络问题」查下去 ——
 * 而上面三种成因没有一个能靠重试解决。
 */
export const fastFailureHint = ({
  seconds,
  name,
  version,
  registry,
  packed,
}: {
  seconds: number;
  name: string;
  version: string;
  registry: string;
  packed?: number;
}): string | null => {
  if (seconds >= FAST_FAILURE_SECONDS) return null;
  const body = packed ? `上行约 ${formatBytes(uploadBytes(packed))} 的 body，却` : '';

  return [
    `${body}只用 ${formatDuration(seconds)} 就断连，离 fetch-timeout（${FETCH_TIMEOUT_MS / 60000} 分钟）很远，不像链路超时。`,
    `   这种「快速被断」按下面三处查，等它自己好通常没用:`,
    `   1) 服务端 body 上限: Verdaccio max_body_size（默认 10mb）/ 前置 nginx client_max_body_size（默认 1m），看服务端日志里有没有 413`,
    `   2) 代理与安全软件: npm config get proxy https-proxy noproxy${process.platform === 'win32' ? '、netsh winhttp show proxy' : ''}`,
    `   3) 版本号是否已被上一轮上传占用: npm view ${name}@${version} gitHead --registry=${registry}`,
  ].join('\n');
};

/**
 * 拿 registry 上的实际状态，给一次失败的 publish 定性。
 *
 * landed 表示「其实已经入库了」，调用方应当直接收工；absent 表示确实没发出去，可以重传；
 * unreachable 表示这一轮没查清，调用方不能据此重传（见 judgeLanded 的注释）。
 * 版本号被他人占用、或存在但无从比对来源的情况一律抛错交人工，不在这里替人做主。
 */
type Settlement = 'landed' | 'absent' | 'unreachable';

const settleByRegistry = ({
  name,
  version,
  registry,
  gitHead,
  cause,
}: {
  name: string;
  version: string;
  registry: string;
  gitHead?: string;
  cause: unknown;
}): Settlement => {
  const verdict = judgeLanded({ name, version, registry, gitHead });
  if (verdict === 'ours') {
    logWarn(
      `npm publish 报错，但 registry 上的 ${name}@${version} 来源 commit 与本次产物一致，判定为「上传成功、响应超时」`,
    );
    return 'landed';
  }
  if (verdict === 'foreign') {
    throw new Error(
      `npm publish 失败，且 registry 上的 ${name}@${version} 并非本次产物（来源 commit 不一致）：该版本号已被他人占用，请换一个版本号重发`,
      { cause },
    );
  }
  if (verdict === 'unknown') {
    throw new Error(
      `npm publish 失败，但 ${name}@${version} 已存在于 registry 且无法比对来源 commit，请人工核对该版本是否为本次产物后再决定是否重发`,
      { cause },
    );
  }
  if (verdict === 'unreachable') {
    logWarn(
      `连不上 registry，本轮无从判定 ${name}@${version} 是否已入库（查询与上传走的是同一条链路）`,
    );
    return 'unreachable';
  }
  return 'absent';
};

/**
 * 两次定性都没连上 registry 时抛出的错误。
 *
 * 必须停在这里交人工，而不是再传一轮：真相若是「已上传、只是响应丢了」，重传拿到的是
 * EPUBLISHCONFLICT —— 一次成功的发布被报成失败，人还得反过来怀疑 registry 上那一版是谁发的。
 * 停下来的代价只是手动核对一条命令，判错的代价是一个已经发出去、却没人认领的版本。
 */
const unconfirmable = ({
  name,
  version,
  registry,
  cause,
}: {
  name: string;
  version: string;
  registry: string;
  cause: unknown;
}): Error =>
  new Error(
    `npm publish 失败，且查询 registry 也失败，无从确认 ${name}@${version} 是否已经入库。\n` +
      `不再重传：这一版若其实已上传成功，重传只会拿到 EPUBLISHCONFLICT，把一次成功的发布报成失败。\n` +
      `请等网络恢复后手动核对，再决定是否重发:\n\n` +
      `  npm view ${name}@${version} gitHead --registry=${registry}\n`,
    { cause },
  );

/**
 * 发布。npm publish 不是幂等操作，因此重试前必须先确认这一版是否其实已经入库：
 * 「已成功上传但响应超时」若被盲目重试，只会拿到 EPUBLISHCONFLICT 并对外谎报发布失败。
 *
 * 定性做两次 —— 失败当下一次，退避之后再一次 —— 因为这两个时刻查到的结果真的会不一样：
 * 上传成功但响应丢失时，registry 未必已经把这一版建进索引，紧贴失败去查会查不到，
 * 退避那几十秒之后才看得见。只判一次的话，已经入库的版本会被当成没发出去，
 * 白传一轮十几分钟，最后拿到 EPUBLISHCONFLICT。
 *
 * 退避是 30s / 60s：每次尝试都要传十几分钟，按「瞬时抖动」设的几秒钟退避
 * 等于网络还没缓过来就再撞一次。
 *
 * 两次定性都没能连上 registry 时不再重传，改抛错交人工：这一版是否已入库始终没查清，
 * 而重传一个其实已入库的版本，换来的是 EPUBLISHCONFLICT 与一次被谎报成失败的发布。
 */
export const publish = async (
  dir: string,
  {
    name,
    version,
    registry,
    tag,
    gitHead,
    dryRun = false,
    retries = 3,
    delayMs = 30000,
    budgetMs = 3600000,
  }: {
    name: string;
    version: string;
    registry: string;
    tag: string;
    gitHead?: string;
    dryRun?: boolean;
    retries?: number;
    delayMs?: number;
    budgetMs?: number;
  },
): Promise<void> => {
  const args = npmArgs([
    'publish',
    ...registryArgs(registry, name),
    '--tag',
    tag,
    ...NETWORK_ARGS,
    ...(dryRun ? ['--dry-run'] : []),
  ]);

  // 体积摆在上传之前：失败原因里「越过服务端 body 上限」与「网络抖动」的报错文本一模一样
  //（都是 read ECONNRESET），而前者只要看一眼这个数就能排除或者确认
  const size = measureTarball(dir);
  if (size) logTarball(size);

  // 墙钟预算。单次尝试最长就是 fetch-timeout（30 分钟），三次尝试能占住终端一个半小时以上；
  // 已经烧掉一小时还没成的，再开一轮 30 分钟也不会有新信息，不如把失败交回给人
  const startedAt = Date.now();
  const overBudget = () => Date.now() - startedAt >= budgetMs;

  // dry-run 不写 registry，无从也无须定性
  const settle = (cause: unknown): Settlement =>
    dryRun ? 'absent' : settleByRegistry({ name, version, registry, gitHead, cause });

  // 版本号可用性是在构建之前查的，而构建要几分钟：紧贴 publish 再确认一次，
  // 把「构建期间被别人占用」在发布前变成明确错误，而不是等发布失败后无从分辨
  if (!dryRun && existsSafely(name, version, registry)) {
    throw new Error(
      `${name}@${version} 已存在于 registry（很可能是构建期间被他人发布），请更换版本号后重试`,
    );
  }

  for (let attempt = 1; ; attempt++) {
    const stop = heartbeat(`上传中 (第 ${attempt}/${retries} 次)`);
    try {
      await runCapturingStderr(NPM, args, dir);
      logInfo(`上传用时 ${formatDuration(stop())}`);
      return;
    } catch (error) {
      const elapsed = stop();
      logWarn(`第 ${attempt} 次上传失败，用时 ${formatDuration(elapsed)}`);

      // 网络类报错才提示：E403 之类的确定性错误配上「查代理」只是噪音
      if (isTransient(error)) {
        const hint = fastFailureHint({
          seconds: elapsed,
          name,
          version,
          registry,
          packed: size?.packed,
        });
        if (hint) logWarn(hint);
      }

      const verdict = settle(error);
      if (verdict === 'landed') return;

      // 这一轮没查清是否已入库：还要重试的话退避之后还有一次机会查清，就此收尾的话
      // 不能拿原始错误糊过去 —— 那等于替人断言「没发出去」
      const lastRound = attempt >= retries || !isTransient(error) || overBudget();
      if (verdict === 'unreachable' && lastRound) {
        throw unconfirmable({ name, version, registry, cause: error });
      }

      if (attempt >= retries || !isTransient(error)) throw error;
      if (overBudget()) {
        logWarn(
          `累计已用时 ${formatDuration(Math.round((Date.now() - startedAt) / 1000))}，超出重试预算，不再重试`,
        );
        throw error;
      }

      const wait = delayMs * attempt;
      logWarn(`疑似网络抖动，${wait / 1000}s 后重试 (${attempt + 1}/${retries})`);
      await sleep(wait);

      // 退避这段时间足够 registry 把上一轮的写入落地，再判一次，别让已经成功的那一版被重传
      const settled = settle(error);
      if (settled === 'landed') return;
      // 失败当下与退避之后都没连上 registry：这一版是否已入库始终没查清，不敢重传。
      // 只要有一次查清了「不存在」，重传就是安全的
      if (verdict === 'unreachable' && settled === 'unreachable') {
        throw unconfirmable({ name, version, registry, cause: error });
      }
    }
  }
};

/** 显式设置 dist-tag 指针：publish 成功但指针没落到本次版本时用来补设 */
export const setDistTag = (name: string, version: string, tag: string, registry: string): void => {
  exec(
    NPM,
    npmArgs(['dist-tag', 'add', `${name}@${version}`, tag, ...registryArgs(registry, name)]),
  );
  logOk(`dist-tag ${tag} → ${version}`);
};

/** 废弃版本：仅打标记，不破坏依赖链（优先于 unpublish） */
export const deprecate = (spec: string, message: string, registry: string): void => {
  exec(NPM, npmArgs(['deprecate', spec, message, ...registryArgs(registry, spec)]));
  logOk(`已废弃 ${spec}`);
};

/** 撤回版本：仅 72 小时内可用，会破坏下游依赖，属高风险操作 */
export const unpublish = (spec: string, registry: string): void => {
  exec(NPM, npmArgs(['unpublish', spec, ...registryArgs(registry, spec), '--force']));
  logOk(`已撤回 ${spec}`);
};

/** 现有标签按多列排版：这些仓库可能有几十个定制标签，挤成一行没法看 */
export const tagListLines = (distTags: Record<string, string>, perLine = 4): string[] => {
  const entries = Object.entries(distTags).map(([tag, version]) => `${tag} → ${version}`);
  const width = Math.max(0, ...entries.map((entry) => entry.length));
  const lines: string[] = [];

  for (let index = 0; index < entries.length; index += perLine) {
    lines.push(
      entries
        .slice(index, index + perLine)
        .map((entry) => entry.padEnd(width))
        .join('  ')
        .trimEnd(),
    );
  }
  return lines;
};
