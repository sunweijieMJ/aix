import path from 'path';
import { createHash } from 'crypto';
import type {
  PrefixContext,
  ResolvedConfig,
  ResolvedNestedPrefixStrategy,
  ResolvedPrefixStrategy,
  ResolvedRulesPrefixStrategy,
} from '../config/types';
import { FileUtils } from './file-utils';
import { compileMatcher, normalizePosix } from './path-matcher';

// =============================================================================
// ID 生成
//
// 流程：
//  1. 前缀派生（strategy 三选一）：PathStrategy / FixedStrategy / CustomStrategy
//     → 输出「段数组」`string[]`（不含 separator）
//  2. 段清理：preserveHyphens=false 时抹掉连字符等非 alnum 字符
//  3. 语义部分：从 cleanText 提取 + fallback.mappings 兜底 + hash
//  4. 拼接 + ensureUniqueId 去重
// =============================================================================

// ---- 大小写工具 ----

/**
 * 应用 fileNameCase 转换。把任意输入归一化为目标 case。
 *
 * 规则：先按非字母数字字符分词，再按目标 case 拼接。
 *  - 'as-is'：原样返回
 *  - 'camel'：第一段小写，后续段首字母大写后小写余下
 *  - 'kebab'：所有段小写，用 '-' 连接
 *  - 'snake'：所有段小写，用 '_' 连接
 */
function applyCase(
  name: string,
  caseStyle: 'as-is' | 'camel' | 'kebab' | 'snake' | ((name: string) => string),
): string {
  if (typeof caseStyle === 'function') return caseStyle(name);
  if (caseStyle === 'as-is') return name;

  // 切分：先拆 CamelCase 边界，再拆非字母数字分隔
  const tokens = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) return name;

  if (caseStyle === 'kebab') return tokens.map((t) => t.toLowerCase()).join('-');
  if (caseStyle === 'snake') return tokens.map((t) => t.toLowerCase()).join('_');

  // camel
  const [first, ...rest] = tokens;
  return (
    first!.toLowerCase() +
    rest.map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()).join('')
  );
}

// ---- 前缀策略 ----

/**
 * 前缀策略统一接口。
 *
 * derive 输入：文件路径、上下文。
 * 输出：前缀段数组（如 `['pages', 'flippedCourse']`）；空数组表示无前缀。
 */
export interface PrefixStrategy {
  derive(filePath: string, ctx: PrefixContext): string[];
}

/**
 * 路径派生策略。从 anchor 之后的目录段构造前缀，支持 skip/take/includeFile/transform。
 */
export class PathPrefixStrategyImpl implements PrefixStrategy {
  constructor(private readonly options: Extract<ResolvedPrefixStrategy, { strategy: 'path' }>) {}

  derive(filePath: string, ctx: PrefixContext): string[] {
    if (!filePath) return [];

    // 同时按 / 和 \ 切分以兼容跨平台
    const parts = filePath.split(/[\\/]/).filter(Boolean);

    const anchor = this.options.anchor;
    const anchorIndex = parts.findIndex((p) => p === anchor);
    if (anchorIndex === -1 || anchorIndex >= parts.length - 1) {
      // 找不到 anchor 或文件不在 anchor 下
      return [];
    }

    const fileIndex = parts.length - 1;
    let dirParts = parts.slice(anchorIndex + 1, fileIndex);

    // 文件直接在 anchor 下：用文件名（去扩展名）作为单段前缀
    if (dirParts.length === 0) {
      const baseName = path.parse(parts[fileIndex]!).name;
      return this.finalize([baseName], ctx);
    }

    // skip / take 在 transform 之前应用
    if (this.options.skip > 0) {
      dirParts = dirParts.slice(this.options.skip);
    }
    if (this.options.take > 0 && dirParts.length > this.options.take) {
      dirParts = dirParts.slice(0, this.options.take);
    }

    // includeFile：把文件名（去扩展名）作为额外一段
    if (this.options.includeFile) {
      const fileBase = path.parse(parts[fileIndex]!).name;
      // indexFile='collapse-to-parent' 时遇到 index 文件不追加，让父目录段作为末段
      // （Vue/React 生态主流：components/TagInput/index.vue → ['components', 'TagInput']）
      const isIndex = fileBase === 'index';
      const collapse = this.options.indexFile === 'collapse-to-parent';
      if (!(isIndex && collapse)) {
        const cased = applyCase(fileBase, this.options.fileNameCase);
        dirParts = [...dirParts, cased];
      }
    }

    return this.finalize(dirParts, ctx);
  }

  /**
   * 段级清理 + transform。
   *
   * 清理：preserveHyphens=false 时把每段中非 alnum 字符抹除（与旧 cleanDirectoryPrefix 行为一致）；
   * =true 时保留连字符（仅抹掉其它非 alnum 字符），让 matchKey 与目录名直接对齐。
   *
   * transform：null 返回值会删除该段；undefined 表示未配置时跳过。
   */
  private finalize(segments: string[], ctx: PrefixContext): string[] {
    const cleaned: string[] = [];
    const transform = this.options.transform;

    for (let i = 0; i < segments.length; i++) {
      let seg = segments[i]!;
      seg = this.options.preserveHyphens
        ? seg.replace(/[^a-zA-Z0-9-]/g, '')
        : seg.replace(/[^a-zA-Z0-9]/g, '');
      if (!seg) continue;

      if (transform) {
        const next = transform(seg, i, ctx);
        if (next === null) continue;
        if (typeof next === 'string' && next) seg = next;
      }
      cleaned.push(seg);
    }
    return cleaned;
  }
}

/**
 * 固定前缀策略。所有 key 共享同一前缀。
 */
export class FixedPrefixStrategyImpl implements PrefixStrategy {
  private readonly segments: string[];

  constructor(options: Extract<ResolvedPrefixStrategy, { strategy: 'fixed' }>, separator: string) {
    this.segments = options.value
      .split(separator)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  derive(): string[] {
    return [...this.segments];
  }
}

/**
 * 完全自定义策略。
 */
export class CustomPrefixStrategyImpl implements PrefixStrategy {
  constructor(private readonly options: Extract<ResolvedPrefixStrategy, { strategy: 'custom' }>) {}

  derive(filePath: string, ctx: PrefixContext): string[] {
    const result = this.options.resolve(filePath, ctx);
    if (!Array.isArray(result)) {
      throw new Error(`keys.prefix.resolve 必须返回字符串数组，实际收到: ${typeof result}`);
    }
    return result.filter((s): s is string => typeof s === 'string' && s.length > 0);
  }
}

/**
 * 规则列表策略。按 filePath（相对 root，POSIX 风格）顺序匹配 rules，
 * 命中后委派给该 rule 的子策略；未命中走 fallback；fallback 缺省返回空段数组。
 *
 * 子策略各自维护参数（anchor / take / includeFile / indexFile / preserveHyphens 等），
 * 互不影响——这是 rules 策略相对全局参数的核心价值。
 */
export class RulesPrefixStrategyImpl implements PrefixStrategy {
  private readonly compiled: Array<{
    matcher: (filePath: string) => boolean;
    strat: PrefixStrategy;
  }>;
  private readonly fallback: PrefixStrategy | null;

  constructor(options: ResolvedRulesPrefixStrategy, separator: string) {
    this.compiled = options.rules.map((rule) => ({
      matcher: compileMatcher(rule.match),
      strat: createNestedPrefixStrategy(rule.use, separator),
    }));
    this.fallback = options.fallback
      ? createNestedPrefixStrategy(options.fallback, separator)
      : null;
  }

  derive(filePath: string, ctx: PrefixContext): string[] {
    if (!filePath) return [];
    const rel = normalizePosix(path.relative(ctx.root, filePath));
    for (const { matcher, strat } of this.compiled) {
      if (matcher(rel)) return strat.derive(filePath, ctx);
    }
    return this.fallback ? this.fallback.derive(filePath, ctx) : [];
  }
}

/**
 * 非嵌套子策略工厂（path / fixed / custom）。供 rules 内部递归用。
 */
function createNestedPrefixStrategy(
  prefix: ResolvedNestedPrefixStrategy,
  separator: string,
): PrefixStrategy {
  if (prefix.strategy === 'path') return new PathPrefixStrategyImpl(prefix);
  if (prefix.strategy === 'fixed') return new FixedPrefixStrategyImpl(prefix, separator);
  return new CustomPrefixStrategyImpl(prefix);
}

/**
 * 工厂：按 strategy 字段分派到对应实现。
 */
export function createPrefixStrategy(
  prefix: ResolvedPrefixStrategy,
  separator: string,
): PrefixStrategy {
  if (prefix.strategy === 'rules') return new RulesPrefixStrategyImpl(prefix, separator);
  return createNestedPrefixStrategy(prefix, separator);
}

// ---- ID 生成器 ----

/**
 * 短哈希：对 SHA-256 的 base36 编码取前 8 位。
 *
 * 用 SHA-256 而非 DJB2 风格：短中文文本（如 "按钮"/"钮按"）DJB2 碰撞率显著，
 * SHA-256 在保持确定性的同时碰撞概率可忽略。
 */
function shortHash(str: string): string {
  const hex = createHash('sha256').update(str, 'utf8').digest('hex');
  return BigInt('0x' + hex.slice(0, 16))
    .toString(36)
    .slice(0, 8);
}

/**
 * 清理语义 ID：去前导序号噪音、保留 alnum + 下划线、压缩多余下划线。
 */
function sanitizeSemanticId(id: string, preserveCase: boolean = false): string {
  let r = id;
  // 「9. 消息提示」→「消息提示」
  r = r.replace(/^\s*\d+\s*[.、。)）:：、\s]+/, '');
  if (!preserveCase) r = r.toLowerCase();
  return r
    .replace(/[^a-zA-Z0-9\s_]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_{3,}/g, '__')
    .replace(/^_+|_+$/g, '');
}

/**
 * 在 sanitizeSemanticId 基础上保证返回非空语义段。
 *
 * Why: LLM 可能违背 prompt 返回纯中文/纯标点的 id（如「商品列表」「。。。」），
 * sanitizeSemanticId 会把它们抹成空串，导致 createFullId 产出 `prefix.`（尾随
 * 分隔符）的畸形 key，运行时 t('prefix.') 无法命中。空串时回退到稳定 hash。
 */
function sanitizeSemanticForId(semanticPart: string): string {
  return sanitizeSemanticId(semanticPart) || `t_${shortHash(semanticPart)}`;
}

/**
 * 提取语义部分（fallback / hash 兜底）。
 *
 * 流程：
 *  1. 中文 mappings 完全匹配 → 直接返回英文
 *  2. mappings 部分包含 → 用英文 + hash 后缀
 *  3. 纯英文 → sanitize
 *  4. 中文长串 → `t_<hash>`
 */
function extractSemanticPart(text: string, mappings: Record<string, string>): string {
  const cleanText = text.replace(/[^一-鿿\w\s]/g, '').trim();

  for (const [zh, en] of Object.entries(mappings)) {
    if (cleanText === zh) return en;
  }
  for (const [zh, en] of Object.entries(mappings)) {
    if (cleanText.includes(zh)) return `${en}_${shortHash(cleanText)}`;
  }
  if (!FileUtils.containsChinese(cleanText)) {
    return sanitizeSemanticId(cleanText);
  }
  return `t_${shortHash(cleanText)}`;
}

/**
 * 段清理：与 PathStrategy.finalize 中的逻辑等价，独立函数供 LLM 路径使用。
 */
function cleanSegment(segment: string, preserveHyphens: boolean): string {
  return preserveHyphens
    ? segment.replace(/[^a-zA-Z0-9-]/g, '')
    : segment.replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * ID 生成器：消费 ResolvedConfig.keys 直接对外服务。
 *
 * 基于实例（每个 ResolvedConfig 一个），缓存 prefix strategy 实例；
 * 策略分派显式化（PathStrategy / FixedStrategy / CustomStrategy）；
 * 段清理统一在策略内完成。
 */
export class IdGenerator {
  private readonly strategy: PrefixStrategy;
  private readonly separator: string;
  private readonly mappings: Record<string, string>;
  private readonly root: string;
  /**
   * PrefixContext.anchor 的展示值。
   *
   * - path 策略：取真实 anchor
   * - 其它策略（fixed/custom/rules）：anchor 概念不适用，置空串供回调判别
   */
  private readonly anchor: string;

  constructor(config: ResolvedConfig) {
    this.separator = config.keys.separator;
    this.strategy = createPrefixStrategy(config.keys.prefix, this.separator);
    this.mappings = config.keys.fallback.mappings;
    this.root = config.root;
    this.anchor = config.keys.prefix.strategy === 'path' ? config.keys.prefix.anchor : '';
  }

  /**
   * 构造 PrefixContext，供 transform / resolve 回调使用。
   */
  private buildContext(filePath: string): PrefixContext {
    return { filePath, root: this.root, anchor: this.anchor };
  }

  /**
   * 获取仅前缀部分（不含语义段）的 ID。
   * 供 IdReuseResolver 用 `startsWith` 与历史 key 对比。
   */
  getDirectoryPrefix(filePath: string): string {
    const segments = this.strategy.derive(filePath, this.buildContext(filePath));
    return segments.join(this.separator);
  }

  /**
   * 用文件路径派生完整 ID（无 LLM 输入）：前缀 + 语义兜底 + 唯一化。
   */
  generateWithFilePath(filePath: string, text: string, existingIds: Set<string>): string {
    const semanticPart = extractSemanticPart(text, this.mappings);
    return this.createFullId(filePath, semanticPart, existingIds);
  }

  /**
   * 已有 LLM 给出的语义 ID 时，为其拼接目录前缀并去重。
   */
  addDirectoryPrefixToId(filePath: string, semanticId: string, existingIds: Set<string>): string {
    return this.createFullId(filePath, semanticId, existingIds);
  }

  /**
   * 使用固定前缀（如 'common'）生成 ID，绕过 strategy。
   *
   * 用于 promoteToCommon：当原文被多个模块复用时统一进入 common namespace。
   */
  generateWithFixedPrefix(
    fixedPrefix: string,
    semanticPart: string,
    existingIds: Set<string>,
  ): string {
    // 用 preserveHyphens=true 清洗：promoteToCommon 默认 namespace 是 'common'，
    // 不含连字符，保留与抹除等价；用户若自定义带 kebab 命名（如 'shared-common'）也能原样保留。
    const cleanedPrefix = fixedPrefix
      .split(this.separator)
      .map((seg) => cleanSegment(seg, true))
      .filter(Boolean)
      .join(this.separator);
    const cleanedSemantic = sanitizeSemanticForId(semanticPart);
    const fullId = cleanedPrefix
      ? `${cleanedPrefix}${this.separator}${cleanedSemantic}`
      : cleanedSemantic;
    return ensureUniqueId(fullId, existingIds);
  }

  private createFullId(filePath: string, semanticPart: string, existingIds: Set<string>): string {
    const segments = this.strategy.derive(filePath, this.buildContext(filePath));
    const cleanedSemantic = sanitizeSemanticForId(semanticPart);
    const prefix = segments.join(this.separator);
    const fullId = prefix ? `${prefix}${this.separator}${cleanedSemantic}` : cleanedSemantic;
    return ensureUniqueId(fullId, existingIds);
  }
}

/**
 * 确保 ID 唯一性：冲突时追加 `_1` / `_2` 后缀。
 */
function ensureUniqueId(cleanedId: string, existingIds: Set<string>): string {
  if (!existingIds.has(cleanedId)) {
    existingIds.add(cleanedId);
    return cleanedId;
  }
  let counter = 1;
  let uniqueId = `${cleanedId}_${counter}`;
  while (existingIds.has(uniqueId)) {
    counter++;
    uniqueId = `${cleanedId}_${counter}`;
  }
  existingIds.add(uniqueId);
  return uniqueId;
}

// 暴露内部工具供测试 / 高级用法
export const __internal = {
  applyCase,
  sanitizeSemanticId,
  extractSemanticPart,
  ensureUniqueId,
  shortHash,
};
