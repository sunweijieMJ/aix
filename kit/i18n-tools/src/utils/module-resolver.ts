import picomatch from 'picomatch';
import type { ModuleRule } from '../config/types';

interface ResolvedModulesConfig {
  rules: ModuleRule[];
  defaultModule: string;
  manifest: boolean;
  layout: 'by-locale' | 'by-module';
}

type CompiledMatcher = (filePath: string, key: string, message: string) => boolean;

interface CompiledRule {
  name: string;
  matcher: CompiledMatcher;
}

/**
 * 模块归属判定器：把 (filePath, key, message) 三元组映射到模块名。
 *
 * 编译期把 glob / RegExp / 函数统一为 `CompiledMatcher`，运行时只走一次函数调用，
 * 避免在导出大文件时反复编译 picomatch 实例。
 *
 * Why 不直接持有 picomatch 实例数组：matchKey / 函数 match 不依赖 filePath，
 * 统一的 `CompiledMatcher` 签名让 resolve() 内部循环更整齐。
 */
export class ModuleResolver {
  private readonly compiledRules: CompiledRule[];
  private readonly defaultModule: string;

  constructor(config: ResolvedModulesConfig) {
    this.defaultModule = config.defaultModule;
    this.compiledRules = config.rules.map((rule) => ({
      name: rule.name,
      matcher: ModuleResolver.compileRule(rule),
    }));
  }

  /**
   * 判定一个 (filePath, key, message) 归属的模块名。
   * filePath 会先规范化为 POSIX 风格，以兼容 Windows 输入。
   */
  resolve(filePath: string, key: string, message: string): string {
    const normalized = ModuleResolver.normalizePath(filePath);
    for (const { name, matcher } of this.compiledRules) {
      if (matcher(normalized, key, message)) return name;
    }
    return this.defaultModule;
  }

  private static normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }

  private static compileRule(rule: ModuleRule): CompiledMatcher {
    if (rule.matchKey) {
      const fn = rule.matchKey;
      return (_fp, key, message) => fn(key, message);
    }

    const match = rule.match;
    if (typeof match === 'function') {
      const fn = match;
      return (fp, key, message) => fn(fp, key, message);
    }

    if (match instanceof RegExp) {
      return (fp) => match.test(fp);
    }

    if (typeof match === 'string' || Array.isArray(match)) {
      // dot:true 与 file-utils.ts 中的 picomatch 调用保持一致，否则以 `.` 开头的
      // 目录（如 `.storybook/...`）下的文件在文件扫描阶段被识别为框架文件，
      // 但模块归属判定却走 defaultModule，前后行为偏差难以排查。
      const isMatch = picomatch(match, { dot: true });
      return (fp) => isMatch(fp);
    }

    // loader 已校验，不应走到这里
    throw new Error(`Invalid module rule: ${rule.name}`);
  }
}
