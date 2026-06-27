import fs from 'fs';
import path from 'path';
import picomatch from 'picomatch';
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
      // 剥离 UTF-8 BOM（U+FEFF）：Windows 外部编辑器（PowerShell 5.1、VS、记事本）写出的
      // locale/glossary/translations 文件常带 BOM，带 BOM 的内容直接 JSON.parse 会抛错，
      // 导致整条读链路误判文件损坏。此处单点收口，覆盖经 safeParseJson 的全部读路径。
      const normalized = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
      return JSON.parse(normalized);
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
    FileUtils.atomicWriteText(filePath, contentWithNewline);
  }

  /**
   * 原子写入：先写到同目录的临时文件，fsync 落盘后 rename 替换目标。
   *
   * Why: 直接 writeFileSync 在写入过程中若进程崩溃 / 同名并发写，
   *      目标文件会处于"半截"状态。rename 在大多数 POSIX 与 Windows
   *      文件系统上都是原子的，能保证读端永远看到完整的旧或新内容。
   *      fsync 显式刷新内核缓冲区到物理介质，避免 rename 后断电仍丢内容。
   *      显式 utf8 编码可避免 Windows 下默认 ANSI 解码的 mojibake。
   */
  static atomicWriteText(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
    try {
      const fd = fs.openSync(tmpPath, 'w');
      try {
        fs.writeFileSync(fd, content, 'utf8');
        // FlushFileBuffers / fdatasync：rename 仅保证目录项原子切换，
        // 文件内容真正落盘要靠 fsync。
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
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
    FileUtils.atomicWriteText(filePath, content);
  }

  /**
   * 写 translations.json / untranslated.json 这类「条目字典」文件：
   * 落盘前按顶层 key 字母序排序，使顺序与「哪个步骤最后写」解耦。
   *
   * Why: pick 按源 locale 装配顺序写、merge 按「已有 + 末尾追加」写，两者顺序
   * 不一致——merge 之后再跑 pick 会把追加的 key 重排回中部，产生大 no-op diff。
   * 统一排序后，pick / merge / translate / csv-import 写出的顺序恒定一致。
   * 内层值对象（{ zh, en, ... }）顺序保持不变。
   */
  static writeTranslationsFile(filePath: string, data: Record<string, unknown>): void {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(data).sort()) {
      sorted[key] = data[key];
    }
    FileUtils.writeJsonFile(filePath, sorted);
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
    for (const e of exclude) {
      if (e.includes('*') || e.includes('?')) {
        // 仅匹配单段文件名（不跨越 / 分隔符），保持与原 simpleGlobToRegex 行为一致
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

    const includeMatcher = include.length > 0 ? FileUtils.createIncludeMatcher(include) : null;
    // 解析为绝对路径，避免 dirPath / rootDir 形态不一致导致 path.relative 产出 `../..` 形态
    const absoluteDirPath = path.resolve(dirPath);
    const includeBase = path.resolve(rootDir ?? dirPath);

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
          if (!includeMatcher || includeMatcher(fullPath, includeBase)) {
            files.push(fullPath);
          }
        }
      }
    };

    walkDir(absoluteDirPath);
    return files;
  }

  /**
   * 创建 include 模式匹配器：编译期统一生成 picomatch，运行时仅做相对路径计算。
   * 使用 dot:true 让以 `.` 开头的目录/文件也能被模式命中；统一以 POSIX 风格相对路径喂入。
   */
  private static createIncludeMatcher(
    patterns: string[],
  ): (filePath: string, baseDir: string) => boolean {
    const isMatch = picomatch(patterns, { dot: true });
    return (filePath, baseDir) => {
      // 调用方传入的 filePath / baseDir 已经在 getFrameworkFiles 内统一 resolve 成绝对路径
      const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');
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
      if (!config.io.customDir) {
        throw new Error('未配置 io.customDir，无法启用定制目录模式');
      }
      return config.io.customDir;
    }
    return config.io.localesDir;
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
