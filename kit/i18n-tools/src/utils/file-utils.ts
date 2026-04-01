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
            conflicts.push(
              ...this.findConflictingKeys(val1, val2, currentPath),
            );
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

  static groupBy<T>(
    items: T[],
    getKey: (item: T) => string,
  ): Record<string, T[]> {
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

  static containsChinese(
    text: string,
    options: { ignoreSpaces?: boolean } = {},
  ): boolean {
    if (!text) return false;

    const processedText = options.ignoreSpaces ? text.replace(/\s/g, '') : text;

    return CONFIG.CHINESE_REGEX.test(processedText);
  }

  /**
   * 检查翻译值是否有效（不为空、不是纯标点符号）
   * 支持任意目标语言（拉丁文、CJK、西里尔文等）
   */
  static isValidEnglishTranslation(enValue: any): boolean {
    if (typeof enValue !== 'string') return false;

    if (!enValue?.trim()) return false;

    const cleanValue = enValue
      .replace(/[{}[\]().,;:!?'""`~@#$%^&*+=<>|\\/-]/g, '')
      .trim();
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

        if (
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          Object.assign(result, this.flattenObject(value, newKey, separator));
        } else {
          result[newKey] = value;
        }
      }
    }

    return result;
  }

  static unflattenObject(
    obj: Record<string, any>,
    separator: string = '.',
  ): Record<string, any> {
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
        if (
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
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
    const {
      defaultValue = {} as T,
      errorMessage,
      logSuccess = false,
      silent = false,
    } = options;

    try {
      if (!fs.existsSync(filePath)) {
        if (!silent) {
          LoggerUtils.warn(`⚠️ 文件不存在: ${filePath}`);
        }
        return defaultValue;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const result = FileUtils.safeParseJson(fileContent) || defaultValue;

      if (logSuccess && !silent) {
        const itemCount = Object.keys(result).length;
        LoggerUtils.success(
          `📄 已加载 ${path.basename(filePath)}, 包含 ${itemCount} 个条目`,
        );
      }

      return result as T;
    } catch (error) {
      if (!silent) {
        LoggerUtils.error(
          errorMessage
            ? `❌ ${errorMessage}: ${filePath}`
            : `❌ 加载JSON文件失败: ${filePath}`,
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
    const contentWithNewline = content.endsWith('\n')
      ? content
      : content + '\n';
    fs.writeFileSync(filePath, contentWithNewline);
  }

  static isReactFile(fileName: string): boolean {
    return CONFIG.SUPPORTED_EXTENSIONS.includes(path.extname(fileName));
  }

  static isVueFile(fileName: string): boolean {
    const ext = path.extname(fileName);
    return ext === '.vue' || ext === '.ts' || ext === '.js';
  }

  static isFrameworkFile(
    fileName: string,
    framework: 'react' | 'vue',
  ): boolean {
    if (framework === 'vue') {
      return FileUtils.isVueFile(fileName);
    }
    return FileUtils.isReactFile(fileName);
  }

  static getFrameworkFiles(
    dirPath: string,
    framework: 'react' | 'vue',
    exclude: string[] = ['node_modules', 'dist', 'build', '.git', 'public'],
    include: string[] = [],
  ): string[] {
    const files: string[] = [];
    const excludeSet = new Set(exclude);

    const walkDir = (currentPath: string): void => {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (excludeSet.has(entry.name)) {
          continue;
        }

        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (
          entry.isFile() &&
          FileUtils.isFrameworkFile(entry.name, framework)
        ) {
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
   * 检查文件路径是否匹配 include 模式列表
   * 支持常见 glob 模式：** / *.ext、dir/ ** / *.ext、dir/ **
   */
  static matchesIncludePatterns(
    filePath: string,
    baseDir: string,
    patterns: string[],
  ): boolean {
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
    return isCustom ? config.paths.customLocale : config.paths.locale;
  }

  /**
   * 获取待翻译文件路径
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @returns 待翻译文件路径
   */
  static getUntranslatedPath(
    config: ResolvedConfig,
    isCustom: boolean,
  ): string {
    return path.join(
      this.getDirectoryPath(config, isCustom),
      FILES.UNTRANSLATED_JSON,
    );
  }

  /**
   * 获取翻译文件路径
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @returns 翻译文件路径
   */
  static getTranslatedPath(config: ResolvedConfig, isCustom: boolean): string {
    return path.join(
      this.getDirectoryPath(config, isCustom),
      FILES.TRANSLATIONS_JSON,
    );
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
  static getLocaleFilePath(
    config: ResolvedConfig,
    isCustom: boolean,
    locale: string,
  ): string {
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
   */
  static validateTargetPath(
    targetPath: string,
    framework: 'react' | 'vue' = 'react',
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
      if (!FileUtils.isFrameworkFile(path.basename(targetPath), framework)) {
        const supportedTypes =
          framework === 'vue' ? '.vue, .ts, .js' : '.tsx, .jsx, .ts, .js';
        return {
          isValid: false,
          type: 'file',
          error: `不支持的文件类型，请选择${framework === 'vue' ? 'Vue' : 'React'}文件(${supportedTypes})`,
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
