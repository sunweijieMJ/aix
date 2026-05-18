import type { BucketRule } from '../config/types';
import { compileMatcher, normalizePosix } from './path-matcher';

interface ResolvedBucketsConfig {
  rules: BucketRule[];
  defaultBucket: string;
  emitManifest: boolean;
  layout: 'by-locale' | 'by-bucket';
}

type CompiledMatcher = (filePath: string, key: string, message: string) => boolean;

interface CompiledRule {
  name: string;
  matcher: CompiledMatcher;
}

/**
 * 桶归属判定器：把 (filePath, key, message) 三元组映射到桶名。
 *
 * 编译期把 glob / RegExp / 函数统一为 `CompiledMatcher`，运行时只走一次函数调用，
 * 避免在导出大文件时反复编译 picomatch 实例。
 *
 * 路径相关的 match 编译统一走 utils/path-matcher 的 compileMatcher。
 */
export class BucketResolver {
  private readonly compiledRules: CompiledRule[];
  private readonly defaultBucket: string;
  /** rule.name → 累计命中次数。规则配错（matchKey 前缀 0 命中等）时用于上层告警 */
  private readonly hitCounts: Map<string, number>;

  constructor(config: ResolvedBucketsConfig) {
    this.defaultBucket = config.defaultBucket;
    this.compiledRules = config.rules.map((rule) => ({
      name: rule.name,
      matcher: BucketResolver.compileRule(rule),
    }));
    this.hitCounts = new Map(this.compiledRules.map(({ name }) => [name, 0]));
  }

  /**
   * 判定一个 (filePath, key, message) 归属的桶名。
   * filePath 会先规范化为 POSIX 风格，以兼容 Windows 输入。
   */
  resolve(filePath: string, key: string, message: string): string {
    const normalized = normalizePosix(filePath);
    for (const { name, matcher } of this.compiledRules) {
      if (matcher(normalized, key, message)) {
        this.hitCounts.set(name, (this.hitCounts.get(name) ?? 0) + 1);
        return name;
      }
    }
    return this.defaultBucket;
  }

  /**
   * 返回每条规则在此 resolver 生命周期内的命中次数。
   * caller 据此识别"配错或失效的规则"（连续多次 resolve 后仍为 0）。
   */
  getHitStats(): Record<string, number> {
    return Object.fromEntries(this.hitCounts);
  }

  /** 命中次数为 0 的规则名列表，便于直接生成 warning。 */
  getZeroHitRules(): string[] {
    return [...this.hitCounts.entries()].filter(([, n]) => n === 0).map(([name]) => name);
  }

  private static compileRule(rule: BucketRule): CompiledMatcher {
    if (rule.matchKey) {
      const fn = rule.matchKey;
      return (_fp, key, message) => fn(key, message);
    }

    const match = rule.match;
    if (typeof match === 'function') {
      // BucketRule.match 函数签名带 (key, message)，需要单独适配；不能直接走 path-matcher。
      const fn = match;
      return (fp, key, message) => fn(fp, key, message);
    }

    if (match instanceof RegExp || typeof match === 'string' || Array.isArray(match)) {
      const isMatch = compileMatcher(match);
      return (fp) => isMatch(fp);
    }

    // loader 已校验，不应走到这里
    throw new Error(`Invalid bucket rule: ${rule.name}`);
  }
}
