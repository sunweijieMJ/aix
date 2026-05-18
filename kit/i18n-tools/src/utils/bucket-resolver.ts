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

  constructor(config: ResolvedBucketsConfig) {
    this.defaultBucket = config.defaultBucket;
    this.compiledRules = config.rules.map((rule) => ({
      name: rule.name,
      matcher: BucketResolver.compileRule(rule),
    }));
  }

  /**
   * 判定一个 (filePath, key, message) 归属的桶名。
   * filePath 会先规范化为 POSIX 风格，以兼容 Windows 输入。
   */
  resolve(filePath: string, key: string, message: string): string {
    const normalized = normalizePosix(filePath);
    for (const { name, matcher } of this.compiledRules) {
      if (matcher(normalized, key, message)) return name;
    }
    return this.defaultBucket;
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
