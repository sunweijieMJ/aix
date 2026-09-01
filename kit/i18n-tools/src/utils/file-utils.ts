import fs from 'fs';
import path from 'path';
import picomatch from 'picomatch';
import { CHINESE_CHAR_RE, FILES } from './constants';
import { LoggerUtils } from './logger';
import { normalizePosix } from './path-matcher';
import { safeLoadJsonFile } from './json-io';
import type { ResolvedConfig } from '../config';

/**
 * 文件和文本操作工具类
 * 提供文件读写、目录管理、JSON处理和文本分析等功能
 *
 * 路径相关方法已参数化，接收 ResolvedConfig 而非硬编码路径
 */
export class FileUtils {
  /**
   * 找出两个**扁平** locale map 中「同 key、不同值」的条目（基础包 vs 定制包冲突检测）。
   *
   * 入参契约：必须是已 flatten 的 `key → 标量值` 字典（两个生产调用点——ExportProcessor
   * 的 flat / bucketed 导出——都在 flatten 之后进来）。不递归下钻嵌套值，也因此无需
   * 感知 keys.separator。
   */
  static findConflictingKeys(
    obj1: Record<string, unknown>,
    obj2: Record<string, unknown>,
  ): string[] {
    const conflicts: string[] = [];
    for (const key of Object.keys(obj1)) {
      if (!Object.prototype.hasOwnProperty.call(obj2, key)) continue;
      if (obj1[key] !== obj2[key]) conflicts.push(key);
    }
    return conflicts;
  }

  // =================================================================
  // Text Processing Methods
  // =================================================================

  static containsChinese(text: string): boolean {
    if (!text) return false;
    return CHINESE_CHAR_RE.test(text);
  }

  /**
   * 检查翻译值是否有效（不为空、不是纯标点符号）
   * 支持任意目标语言（拉丁文、CJK、西里尔文等）
   */
  static isValidTranslation(enValue: any): boolean {
    if (typeof enValue !== 'string') return false;

    if (!enValue?.trim()) return false;

    // 包含任何文字或数字字符即视为有效翻译
    // \p{L} 匹配任意语言的字母，\p{N} 匹配任意数字
    return /[\p{L}\p{N}]/u.test(enValue);
  }

  static flattenObject(
    obj: Record<string, any>,
    prefix: string = '',
    separator: string = '.',
  ): Record<string, any> {
    // null 原型：普通 `{}` 上 `result['__proto__'] = '文案'` 走 Object.prototype 的 __proto__
    // setter，字符串值不会成为自有属性（叶子 key 静默消失），对象值还会换掉 result 的原型。
    // `__proto__` 是合法的 locale 末段 key，写侧 writeTranslationsFile 已同样处理。
    const result: Record<string, any> = Object.create(null);

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}${separator}${key}` : key;

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          Object.assign(result, this.flattenObject(value, newKey, separator));
        } else {
          result[newKey] = value;
        }
      }
    }

    return result;
  }

  static unflattenObject(obj: Record<string, any>, separator: string = '.'): Record<string, any> {
    const result: Record<string, any> = {};

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const keys = key.split(separator);
        // 拒绝保留段名，杜绝原型链污染：键名可能来自手写 locale / CSV 回流等外部来源，
        // 含 `__proto__` 中间段时 `current[k]` 会读到 Object.prototype 并被写穿。
        if (keys.some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) {
          continue;
        }
        let current = result;

        for (let i = 0; i < keys.length; i++) {
          const k = keys[i]!;
          if (i === keys.length - 1) {
            current[k] = obj[key];
          } else {
            // 用 hasOwnProperty 判断容器是否已存在，而非 `|| {}`：后者对 toString 等
            // 原型链属性名会误读到继承值，导致下钻到非自有对象。
            if (
              !Object.prototype.hasOwnProperty.call(current, k) ||
              typeof current[k] !== 'object' ||
              current[k] === null
            ) {
              current[k] = {};
            }
            current = current[k];
          }
        }
      }
    }

    return result;
  }

  /** 类型声明文件不应被作为业务源码处理 */
  static isDeclarationFile(fileName: string): boolean {
    return fileName.endsWith('.d.ts') || fileName.endsWith('.d.mts') || fileName.endsWith('.d.cts');
  }

  /**
   * 文件名是否匹配给定扩展名集合（同时排除类型声明文件）。
   * 框架细节由调用方通过 Adapter.getSupportedExtensions() 提供，本工具不再硬编码。
   */
  static matchesExtensions(fileName: string, extensions: string[]): boolean {
    if (FileUtils.isDeclarationFile(fileName)) return false;
    return extensions.includes(path.extname(fileName));
  }

  /**
   * 扫描目录，返回所有匹配指定扩展名集合的源文件。
   * 框架信息由调用方通过 adapter.getSupportedExtensions() 注入。
   *
   * exclude 同时支持精确名（如 'node_modules'）与简单 glob（含 `*` 的模式，如
   * `*.config.ts`），避免业务方需要把每种构建工具配置文件名都写一遍。
   *
   * include 模式始终以 `rootDir` 为基准做相对路径匹配；未提供时回退到 `dirPath`。
   * 这样业务侧配置 `src/{glob}.vue` 这类相对项目根的模式，在用户传入子目录
   * （如 `src/pages/foo`）时也能正确匹配，而不会因相对路径丢失 `src/` 前缀而漏文件。
   */
  static getFrameworkFiles(
    dirPath: string,
    extensions: string[],
    exclude: string[] = ['node_modules', 'dist', 'build', '.git', 'public'],
    include: string[] = [],
    rootDir?: string,
  ): string[] {
    const files: string[] = [];
    const literalExcludes = new Set<string>();
    const globExcludes: picomatch.Matcher[] = [];
    // 含路径分隔符的 exclude 模式（如 `src/legacy/**`）按相对路径匹配，与 include 对称；
    // 单段模式（literal / `*.test.tsx` 等 basename glob）仍按文件名匹配并可剪枝目录。
    const pathExcludes: string[] = [];
    for (const e of exclude) {
      if (e.includes('/')) {
        pathExcludes.push(e);
      } else if (e.includes('*') || e.includes('?')) {
        // 仅匹配单段文件名（不跨越 / 分隔符）
        globExcludes.push(picomatch(e, { dot: true }));
      } else {
        literalExcludes.add(e);
      }
    }

    const isExcluded = (name: string): boolean => {
      if (literalExcludes.has(name)) return true;
      for (const m of globExcludes) {
        if (m(name)) return true;
      }
      return false;
    };

    // 路径式 exclude 按相对 POSIX 路径匹配（不剪枝目录，仅在收集文件时排除——确保
    // `src/legacy/**` 这类 include 侧本就支持的写法在 exclude 侧同样生效）。
    const excludePathMatcher =
      pathExcludes.length > 0 ? FileUtils.createPathGlobMatcher(pathExcludes) : null;

    const includeMatcher = include.length > 0 ? FileUtils.createPathGlobMatcher(include) : null;
    // 解析为绝对路径，避免 dirPath / rootDir 形态不一致导致 path.relative 产出 `../..` 形态
    const absoluteDirPath = path.resolve(dirPath);
    const includeBase = path.resolve(rootDir ?? dirPath);

    const collectFile = (fullPath: string): void => {
      const includedByGlob = !includeMatcher || includeMatcher(fullPath, includeBase);
      const excludedByPath = excludePathMatcher ? excludePathMatcher(fullPath, includeBase) : false;
      if (includedByGlob && !excludedByPath) {
        files.push(fullPath);
      }
    };

    // 已访问目录的 realpath 集合：软链可以指回祖先目录，跟随时不去重会无限递归。
    const visitedRealDirs = new Set<string>();

    const walkDir = (currentPath: string): void => {
      let realDir: string;
      try {
        realDir = fs.realpathSync(currentPath);
      } catch {
        return;
      }
      if (visitedRealDirs.has(realDir)) return;
      visitedRealDirs.add(realDir);

      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (isExcluded(entry.name)) {
          continue;
        }

        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isSymbolicLink()) {
          // Dirent 的 isDirectory/isFile 描述的是软链本身（两者都为 false），不跟随会让
          // 软链进来的源码目录 / 文件整片扫不到 —— 提取端看不到，中文静默留在源码里。
          // monorepo 用软链把共享目录挂进包内是常见布局，故必须 stat 跟随后再分流。
          let target: fs.Stats;
          try {
            target = fs.statSync(fullPath);
          } catch {
            // 断链（指向已删除路径）：跳过，不因扫描阶段的失效链接中断整条命令。
            continue;
          }
          if (target.isDirectory()) {
            walkDir(fullPath);
          } else if (target.isFile() && FileUtils.matchesExtensions(entry.name, extensions)) {
            collectFile(fullPath);
          }
        } else if (entry.isFile() && FileUtils.matchesExtensions(entry.name, extensions)) {
          collectFile(fullPath);
        }
      }
    };

    walkDir(absoluteDirPath);
    return files;
  }

  /**
   * 创建「相对路径 glob 匹配器」：编译期统一生成 picomatch，运行时仅做相对路径计算。
   * 使用 dot:true 让以 `.` 开头的目录/文件也能被模式命中；统一以 POSIX 风格相对路径喂入。
   * include 与「含路径分隔符的 exclude」共用此匹配器，确保二者路径匹配语义对称。
   */
  private static createPathGlobMatcher(
    patterns: string[],
  ): (filePath: string, baseDir: string) => boolean {
    const isMatch = picomatch(patterns, { dot: true });
    return (filePath, baseDir) => {
      // 调用方传入的 filePath / baseDir 已经在 getFrameworkFiles 内统一 resolve 成绝对路径
      const relativePath = normalizePosix(path.relative(baseDir, filePath));
      return isMatch(relativePath);
    };
  }

  static loadLanguageFile<T extends Record<string, any>>(
    filePath: string,
    lang: string,
    type: '基础' | '自定义',
  ): T {
    if (!fs.existsSync(filePath)) {
      LoggerUtils.warn(
        `[${type}] ${lang} 语言文件不存在，将返回空对象: ${this.getRelativePath(filePath)}`,
      );
      return {} as T;
    }
    return safeLoadJsonFile<T>(filePath, {
      errorMessage: `加载 ${type} ${lang} 语言文件失败`,
      logSuccess: true,
    });
  }

  // =================================================================
  // Path-related Methods (config-driven)
  // =================================================================

  static getDirectoryPath(config: ResolvedConfig, isCustom: boolean): string {
    if (isCustom) {
      if (!config.io.customDir) {
        throw new Error('未配置 io.customDir，无法启用定制目录模式');
      }
      return config.io.customDir;
    }
    return config.io.localesDir;
  }

  static getUntranslatedPath(config: ResolvedConfig, isCustom: boolean): string {
    return path.join(this.getDirectoryPath(config, isCustom), FILES.UNTRANSLATED_JSON);
  }

  static getTranslatedPath(config: ResolvedConfig, isCustom: boolean): string {
    return path.join(this.getDirectoryPath(config, isCustom), FILES.TRANSLATIONS_JSON);
  }

  /**
   * 验证目标路径的有效性
   *
   * @param extensions - 该框架支持的扩展名列表（含点号）
   * @param displayName - 框架展示名，用于错误提示（例如 "Vue" / "React"）
   */
  static validateTargetPath(
    targetPath: string,
    extensions: string[],
    displayName: string,
  ): {
    isValid: boolean;
    type: 'file' | 'directory' | 'invalid';
    error?: string;
  } {
    if (!targetPath || !targetPath.trim()) {
      return { isValid: false, type: 'invalid', error: '路径不能为空' };
    }

    if (!fs.existsSync(targetPath)) {
      return { isValid: false, type: 'invalid', error: '路径不存在' };
    }

    const stat = fs.statSync(targetPath);

    if (stat.isFile()) {
      if (!FileUtils.matchesExtensions(path.basename(targetPath), extensions)) {
        return {
          isValid: false,
          type: 'file',
          error: `不支持的文件类型，请选择${displayName}文件(${extensions.join(', ')})`,
        };
      }
      return { isValid: true, type: 'file' };
    }

    if (stat.isDirectory()) {
      return { isValid: true, type: 'directory' };
    }

    return { isValid: false, type: 'invalid', error: '不支持的路径类型' };
  }

  static getRelativePath(filePath: string): string {
    return path.relative(process.cwd(), filePath);
  }
}
