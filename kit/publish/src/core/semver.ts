/**
 * 版本号工具：薄封装 node-semver，只保留发包需要的语义。
 *
 * 版本约定（与私有 registry 上现有版本保持一致）：
 *   正式版      2.0.19
 *   预发布版    2.0.20-beta.1 / 1.8.3-oem.2  —— 预发布序号从 1 开始
 *
 * 「序号从 1 开始」由 node-semver 的 identifierBase 实现（inc 的第 4 个实参传 '1'），
 * 不必再自己拼预发布段。
 */

import semver from 'semver';

/** 解析结果；pre 统一成字符串数组 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

/**
 * 规范化并校验：合法返回 trim 后的版本号，否则返回 null。
 *
 * node-semver 接受 v 前缀（valid('v2.0.0') === '2.0.0'），但发布用的版本号不能允许它 ——
 * 否则同一个版本在 npm publish、dist-tag、registry 上会出现两种写法。故额外要求以数字开头。
 */
const normalize = (version: unknown): string | null => {
  const text = `${version}`.trim();
  return /^\d/.test(text) && semver.valid(text) ? text : null;
};

export const isValid = (version: unknown): boolean => normalize(version) !== null;

/**
 * 解析为 { major, minor, patch, pre }。
 *
 * pre 统一成字符串数组：node-semver 的 prerelease 是 (string | number)[]，
 * 而调用方按整段预发布标识做前缀匹配（见 versioning.ts 的 inSeries），
 * 混入数字类型会让比较行为随版本号写法漂移。
 */
export const parse = (version: unknown): ParsedVersion | null => {
  const text = normalize(version);
  if (!text) return null;

  const parsed = semver.parse(text);
  if (!parsed) return null;

  const { major, minor, patch, prerelease } = parsed;
  return { major, minor, patch, pre: prerelease.map(String) };
};

/** 供 Array.prototype.sort 使用的升序比较器。非法版本号返回 0，保持调用方的容错约定 */
export const compare = (a: unknown, b: unknown): number => {
  const [x, y] = [normalize(a), normalize(b)];
  return x && y ? semver.compare(x, y) : 0;
};

/**
 * 是否能被解析成 semver 范围。
 *
 * npm 用同一个判据拒绝 dist-tag（lib/commands/publish.js 与 dist-tag.js 里的
 * `if (semver.validRange(tag)) throw new Error('Tag name must not be a valid SemVer range')`），
 * 因此校验标签时必须照抄它，而不是自己列黑名单。
 */
export const isRange = (text: unknown): boolean => semver.validRange(`${text}`.trim()) !== null;

/** 取版本列表中的最大值（忽略非法版本号），列表为空返回 null */
export const maxVersion = (versions: readonly string[]): string | null =>
  [...versions].filter(isValid).sort(compare).at(-1) ?? null;

/**
 * 正式版递增，语义与 `npm version <type>` 一致：
 *   2.0.19        + patch → 2.0.20
 *   2.0.20-beta.2 + patch → 2.0.20   （预发布转正，不再进位）
 *
 * major / minor 不走 semver.inc：inc('2.0.0-beta.1', 'major') 会原地给出 2.0.0
 *（「已经是 2.0.0 的预发布了就不必进位」），而候选推导要的是无条件进位 —— 用户点「major」
 * 时期望的是下一个大版本，不是把当前预发布转正。
 */
export const bumpRelease = (
  version: string,
  type: 'major' | 'minor' | 'patch' = 'patch',
): string | null => {
  const v = parse(version);
  if (!v) return null;

  if (type === 'major') return `${v.major + 1}.0.0`;
  if (type === 'minor') return `${v.major}.${v.minor + 1}.0`;
  return semver.inc(version, 'patch');
};

/**
 * 在预发布线上按 patch / minor / major 递进，数字部分一律进位：
 *   1.8.3-oem.7 + (oem, patch) → 1.8.4-oem.1
 *   1.8.3-oem.7 + (oem, minor) → 1.9.0-oem.1
 *   1.8.3-oem   + (oem, patch) → 1.8.4-oem.1   （入参带不带序号都进位）
 *   2.0.19      + (oem, patch) → 2.0.20-oem.1  （也用于「以 latest 为基准开新序列」）
 *
 * 与 bumpPre 的区别是数字部分一律进位，不受入参自身带不带预发布影响。
 */
export const advanceSeries = (
  version: string,
  tag: string,
  type: 'major' | 'minor' | 'patch' = 'patch',
): string | null => (isValid(version) ? semver.inc(version, `pre${type}`, tag, '1') : null);

/**
 * 预发布段是否为标准形态 `<tag>.N`：整段预发布标识等于「标签 + 点 + 纯数字序号」。
 *
 * 按整段比对而不是按段数：标签本身可以带点号（registry 上确有 sysu-test.1、IEU-beta.8），
 * 它们的标准形态 `1.3.96-sysu-test.1.1` 拆开是三段，按「恰好两段」判就永远不成立，
 * 这些标签的「递增序号」候选会整个消失。与 inSeries 的口径一致。
 *
 * 判据只此一处：bumpPre 用它守自己的契约，selfcheck 用同一个判据核对全量真实版本，
 * 两边各写一份就会漂移 —— 而漂移的表现是「自检说契约成立、实际给出的却不是标准形态」。
 */
export const isStandardPre = (version: unknown, tag: string): boolean => {
  const parsed = parse(version);
  if (!parsed) return false;
  const pre = parsed.pre.join('.');
  return pre.startsWith(`${tag}.`) && /^\d+$/.test(pre.slice(tag.length + 1));
};

/**
 * 预发布版递增，一律给出**标准形态** `<tag>.N`：
 *   同标识（2.0.20-beta.2 + beta） → 2.0.20-beta.3
 *   异标识（2.0.20-beta.2 + oem）  → 2.0.20-oem.1
 *   正式版（2.0.19 + beta）        → 2.0.20-beta.1
 *   无序号（1.8.3-oem + oem）      → 1.8.3-oem.1   （把序列收回标准形态）
 *   多段（1.0.0-beta.1.2 + beta）  → 1.0.1-beta.1  （不延长成 1.0.0-beta.1.3）
 *   非标准形态（1.6.25-beta.qk）    → 1.6.26-beta.1 （见下）
 *
 * registry 上有一批不合标准的版本（1.6.25-beta.qk / .qk.1 / .qk.2 / .qk.3、1.6.26-beta.qk.1）。
 * 工具不跟随这种既有约定 —— 不会给出 1.6.25-beta.qk.4 这样继续把它延续下去的版本号。
 *
 * 但直接取 semver.inc 的结果也不行：它对这批版本给出 1.6.25-beta.1，而数字段的优先级低于
 * 字符串段（1.6.25-beta.1 < 1.6.25-beta.qk），等于把版本号往回退。同一个 patch 上不存在
 * 既是标准形态、又大于 1.6.25-beta.qk 的版本号，所以此时退到下一个 patch 开标准序列。
 *
 * 于是这个函数的契约是两条同时成立：结果是标准形态，且严格大于入参。
 */
export const bumpPre = (version: string, tag: string): string | null => {
  if (!isValid(version)) return null;

  // 契约是两条同时成立，所以两条都得守：只守「严格大于」的话，三段预发布（1.0.0-beta.1.2）
  // 会被 semver.inc 原样延长成 1.0.0-beta.1.3 —— 确实前进了，却把非标准形态延续了下去
  const next = semver.inc(version, 'prerelease', tag, '1');
  if (next && compare(next, version) > 0 && isStandardPre(next, tag)) return next;

  // 入参的预发布段不是 <tag>.N 形态时才会走到这里
  return advanceSeries(version, tag, 'patch');
};
