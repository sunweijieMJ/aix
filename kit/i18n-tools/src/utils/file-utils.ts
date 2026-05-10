import fs from 'fs';
import path from 'path';
import { CONFIG, FILES } from './constants';
import { LoggerUtils } from './logger';
import type { ResolvedConfig } from '../config';

/**
 * 文件和文本操作工具类
 * 提供文件读写、目录管理、JSON处理和文本分析等功能
 *
 * 路径相关方法已参数化，接收 ResolvedConfig 而非硬编码路径
 */
export class FileUtils {
  // =================================================================
  // JSON Processing Methods
  // =================================================================

  static safeParseJson(content: string): any {
    try {
      return JSON.parse(content);
    } catch (error) {
      LoggerUtils.error('JSON解析失败:', error);
      return null;
    }
  }

  static findConflictingKeys(
    obj1: Record<string, any>,
    obj2: Record<string, any>,
    prefix = '',
  ): string[] {
    const conflicts: string[] = [];

    for (const key in obj1) {
      if (Object.prototype.hasOwnProperty.call(obj1, key)) {
        const currentPath = prefix ? `${prefix}.${key}` : key;

        if (Object.prototype.hasOwnProperty.call(obj2, key)) {
          const val1 = obj1[key];
          const val2 = obj2[key];

          if (
            typeof val1 === 'object' &&
            typeof val2 === 'object' &&
            val1 !== null &&
            val2 !== null
          ) {
            conflicts.push(...this.findConflictingKeys(val1, val2, currentPath));
          } else if (val1 !== val2) {
            conflicts.push(currentPath);
          }
        }
      }
    }

    return conflicts;
  }

  // =================================================================
  // Collection/Array Utilities
  // =================================================================

  static groupBy<T>(items: T[], getKey: (item: T) => string): Record<string, T[]> {
    return items.reduce(
      (groups, item) => {
        const key = getKey(item);
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(item);
        return groups;
      },
      {} as Record<string, T[]>,
    );
  }

  // =================================================================
  // Text Processing Methods
  // =================================================================

  static containsChinese(text: string, options: { ignoreSpaces?: boolean } = {}): boolean {
    if (!text) return false;

    const processedText = options.ignoreSpaces ? text.replace(/\s/g, '') : text;

    return CONFIG.CHINESE_REGEX.test(processedText);
  }

  /**
   * 检查翻译值是否有效（不为空、不是纯标点符号）
   * 支持任意目标语言（拉丁文、CJK、西里尔文等）
   */
  static isValidTranslation(enValue: any): boolean {
    if (typeof enValue !== 'string') return false;

    if (!enValue?.trim()) return false;

    const cleanValue = enValue.replace(/[{}[\]().,;:!?'""`~@#$%^&*+=<>|\\/-]/g, '').trim();
    if (cleanValue.length === 0) return false;

    // 包含任何文字或数字字符即视为有效翻译
    // \p{L} 匹配任意语言的字母，\p{N} 匹配任意数字
    return /[\p{L}\p{N}]/u.test(enValue);
  }

  static flattenObject(
    obj: Record<string, any>,
    prefix: string = '',
    separator: string = '.',
  ): Record<string, any> {
    const result: Record<string, any> = {};

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
        let current = result;

        for (let i = 0; i < keys.length; i++) {
          const k = keys[i]!;
          if (i === keys.length - 1) {
            current[k] = obj[key];
          } else {
            current[k] = current[k] || {};
            current = current[k];
          }
        }
      }
    }

    return result;
  }

  static isNestedStructure(obj: Record<string, any>): boolean {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          return true;
        }
      }
    }
    return false;
  }

  // =================================================================
  // File I/O Methods
  // =================================================================

  static safeLoadJsonFile<T extends object>(
    filePath: string,
    options: {
      defaultValue?: T;
      errorMessage?: string;
      logSuccess?: boolean;
      silent?: boolean;
    } = {},
  ): T {
    const { defaultValue = {} as T, errorMessage, logSuccess = false, silent = false } = options;

    try {
      if (!fs.existsSync(filePath)) {
        if (!silent) {
          LoggerUtils.warn(`⚠️ 文件不存在: ${filePath}`);
        }
        return defaultValue;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parsed = FileUtils.safeParseJson(fileContent);

      if (parsed === null) {
        if (!silent) {
          LoggerUtils.error(
            errorMessage
              ? `❌ ${errorMessage}（JSON格式损坏）: ${filePath}`
              : `❌ JSON格式损坏，无法加载: ${filePath}`,
          );
        }
        return defaultValue;
      }

      if (logSuccess && !silent) {
        const itemCount = Object.keys(parsed).length;
        LoggerUtils.success(`📄 已加载 ${path.basename(filePath)}, 包含 ${itemCount} 个条目`);
      }

      return parsed as T;
    } catch (error) {
      if (!silent) {
        LoggerUtils.error(
          errorMessage ? `❌ ${errorMessage}: ${filePath}` : `❌ 加载JSON文件失败: ${filePath}`,
          error,
        );
      }
      return defaultValue;
    }
  }

  static ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  static createOrEmptyFile(filePath: string, content: string = '{}'): void {
    FileUtils.ensureDirectoryExists(path.dirname(filePath));
    const contentWithNewline = content.endsWith('\n') ? content : content + '\n';
    FileUtils.atomicWrite(filePath, contentWithNewline);
  }

  /**
   * 原子写入：先写到同目录的临时文件，fsync 后 rename 替换目标。
   *
   * Why: 直接 writeFileSync 在写入过程中若进程崩溃 / 同名并发写，
   *      目标文件会处于"半截"状态。rename 在大多数 POSIX 与 Windows
   *      文件系统上都是原子的，能保证读端永远看到完整的旧或新内容。
   *      显式 utf8 编码可避免 Windows 下默认 ANSI 解码的 mojibake。
   */
  private static atomicWrite(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
    try {
      fs.writeFileSync(tmpPath, content, 'utf8');
      fs.renameSync(tmpPath, filePath);
    } catch (error) {
      // 失败时清理临时文件，不向上吞没原始错误
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // 临时文件清理失败不影响主流程错误传播
      }
      throw error;
    }
  }

  /**
   * 统一的 JSON 写入：保证父目录存在、缩进一致、末尾换行。
   *
   * Why: 早期实现散落在多个 Processor 内联拼装 `JSON.stringify(data, null, 2) + '\n'`，
   * 一旦换行/编码/缩进策略需要调整就要多处改动；统一入口避免漂移。
   */
  static writeJsonFile(
    filePath: string,
    data: unknown,
    options: { indent?: number; ensureDir?: boolean } = {},
  ): void {
    const { indent = 2, ensureDir = true } = options;
    if (ensureDir) {
      FileUtils.ensureDirectoryExists(path.dirname(filePath));
    }
    const content = JSON.stringify(data, null, indent) + '\n';
    FileUtils.atomicWrite(filePath, content);
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
   */
  static getFrameworkFiles(
    dirPath: string,
    extensions: string[],
    exclude: string[] = ['node_modules', 'dist', 'build', '.git', 'public'],
    include: string[] = [],
  ): string[] {
    const files: string[] = [];
    const literalExcludes = new Set<string>();
    const globExcludes: RegExp[] = [];
    for (const e of exclude) {
      if (e.includes('*') || e.includes('?')) {
        globExcludes.push(FileUtils.simpleGlobToRegex(e));
      } else {
        literalExcludes.add(e);
      }
    }

    const isExcluded = (name: string): boolean => {
      if (literalExcludes.has(name)) return true;
      for (const r of globExcludes) {
        if (r.test(name)) return true;
      }
      return false;
    };

    const walkDir = (currentPath: string): void => {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (isExcluded(entry.name)) {
          continue;
        }

        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile() && FileUtils.matchesExtensions(entry.name, extensions)) {
          if (
            include.length === 0 ||
            FileUtils.matchesIncludePatterns(fullPath, dirPath, include)
          ) {
            files.push(fullPath);
          }
        }
      }
    };

    walkDir(dirPath);
    return files;
  }

  /**
   * 将简单 glob（仅支持 `*` 与 `?`）编译为锚定到整段名称的正则。
   * 不处理路径分隔符与花括号扩展，仅服务于 exclude 中的单段文件名匹配。
   */
  private static simpleGlobToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regex}$`);
  }

  /**
   * 检查文件路径是否匹配 include 模式列表
   * 支持常见 glob 模式：** / *.ext、dir/ ** / *.ext、dir/ **
   */
  static matchesIncludePatterns(filePath: string, baseDir: string, patterns: string[]): boolean {
    if (patterns.length === 0) return true;

    const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');

    return patterns.some((pattern) => {
      const normalized = pattern.replace(/\\/g, '/');

      // **/*.ext → 匹配任意目录下指定扩展名的文件
      if (normalized.startsWith('**/')) {
        const suffix = normalized.slice(3);
        if (suffix.startsWith('*.')) {
          const ext = suffix.slice(1);
          return relativePath.endsWith(ext);
        }
      }

      // dir/** → 匹配目录下所有文件
      if (normalized.endsWith('/**')) {
        const prefix = normalized.slice(0, -3);
        return relativePath.startsWith(prefix + '/') || relativePath === prefix;
      }

      // dir/**/*.ext → 匹配目录下指定扩展名的文件
      const doubleStarIdx = normalized.indexOf('/**/');
      if (doubleStarIdx !== -1) {
        const prefix = normalized.slice(0, doubleStarIdx);
        const suffix = normalized.slice(doubleStarIdx + 4);
        const matchesPrefix = relativePath.startsWith(prefix + '/');
        if (suffix.startsWith('*.')) {
          const ext = suffix.slice(1);
          return matchesPrefix && relativePath.endsWith(ext);
        }
      }

      // *.ext → 匹配当前目录下指定扩展名
      if (normalized.startsWith('*.')) {
        const ext = normalized.slice(1);
        return relativePath.endsWith(ext) && !relativePath.includes('/');
      }

      // 精确匹配
      return relativePath === normalized;
    });
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
    return this.safeLoadJsonFile<T>(filePath, {
      errorMessage: `加载 ${type} ${lang} 语言文件失败`,
      logSuccess: true,
    });
  }

  // =================================================================
  // Path-related Methods (config-driven)
  // =================================================================

  /**
   * 获取工作目录路径
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @returns 目录路径
   */
  static getDirectoryPath(config: ResolvedConfig, isCustom: boolean): string {
    if (isCustom) {
      if (!config.paths.customLocale) {
        throw new Error('未配置 paths.customLocale，无法启用定制目录模式');
      }
      return config.paths.customLocale;
    }
    return config.paths.locale;
  }

  /**
   * 获取待翻译文件路径
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @returns 待翻译文件路径
   */
  static getUntranslatedPath(config: ResolvedConfig, isCustom: boolean): string {
    return path.join(this.getDirectoryPath(config, isCustom), FILES.UNTRANSLATED_JSON);
  }

  /**
   * 获取翻译文件路径
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @returns 翻译文件路径
   */
  static getTranslatedPath(config: ResolvedConfig, isCustom: boolean): string {
    return path.join(this.getDirectoryPath(config, isCustom), FILES.TRANSLATIONS_JSON);
  }

  /**
   * 获取输出目录路径
   * @param config - 已解析的配置
   * @returns 输出目录路径
   */
  static getOutputDir(config: ResolvedConfig): string {
    return config.paths.exportLocale;
  }

  /**
   * 获取语言文件路径
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @param locale - 语言代码
   * @returns 语言文件路径
   */
  static getLocaleFilePath(config: ResolvedConfig, isCustom: boolean, locale: string): string {
    const baseDir = this.getDirectoryPath(config, isCustom);
    return path.join(baseDir, `${locale}.json`);
  }

  /**
   * 获取导出文件路径
   * @param config - 已解析的配置
   * @param locale - 语言代码
   * @returns 导出文件路径
   */
  static getExportFilePath(config: ResolvedConfig, locale: string): string {
    return path.join(this.getOutputDir(config), `${locale}.json`);
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

  /**
   * 获取相对路径
   * @param filePath - 文件路径
   * @returns 相对于工作目录的路径
   */
  static getRelativePath(filePath: string): string {
    return path.relative(process.cwd(), filePath);
  }
}
