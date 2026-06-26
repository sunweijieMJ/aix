import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import { BucketResolver } from './bucket-resolver';
import { FileUtils } from './file-utils';
import { LoggerUtils } from './logger';
import { LocaleValueLinter } from './locale-value-linter';
import type { RunReport } from './run-report';
import type { ExtractedString, ILangMap, LocaleMap } from './types';
import { CommonASTUtils } from './common-ast-utils';

type KeyBucketMap = Record<string, string>;

/**
 * 语言文件管理器
 *
 * 整合语言文件的所有操作：读取、写入、合并、分桶迁移、桶式落盘。
 *
 * 路径与字段访问全部基于 ResolvedConfig：
 *  - 工作目录：config.io.localesDir / config.io.customDir
 *  - 序列化格式：config.io.format（'flat' | 'nested'）
 *  - 段分隔符：config.keys.separator
 *  - 分桶：config.buckets
 *  - 多目标语种：config.locales.targets[]，getMessages 返回所有 locale 字典
 */
export class LanguageFileManager {
  /**
   * 获取所有语言（source + targets）的扁平 map。
   *
   * 若 config.buckets 已配置，则从桶子目录读取并合并；
   * 同时负责把遗留单文件自动迁移到桶式格式（一次性，幂等）。
   *
   * 返回结构：`{ [locale]: ILangMap }`，包含 source 与每个 target。
   */
  static getMessages(config: ResolvedConfig, isCustom: boolean): ILangMap {
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);
    const sourceLocale = config.locales.source;
    const targets = config.locales.targets;
    const allLocales = [sourceLocale, ...targets];
    const result: ILangMap = {};

    if (config.buckets) {
      // source 先迁，保留其扁平 map 以驱动 targets 的分桶——若 matchKey/match 规则
      // 依赖 message 文本内容，targets 用自己的译文反推会出现 source/target 分桶不一致。
      const sourceFlat = this.migrateToBuckets(config, workingDir, sourceLocale);
      for (const target of targets) {
        this.migrateToBuckets(config, workingDir, target, sourceFlat);
      }
      const layout = config.buckets.layout;
      for (const locale of allLocales) {
        result[locale] = this.readBucketedLocaleFlat(config, workingDir, locale, layout);
      }
      return result;
    }

    for (const locale of allLocales) {
      const filePath = path.join(workingDir, `${locale}.json`);
      const data = FileUtils.safeLoadJsonFile<Record<string, any>>(filePath, {
        silent: true,
      });
      result[locale] = FileUtils.flattenObject(data);
    }
    return result;
  }

  /**
   * 把遗留单文件（`<lang>.json`）迁移到桶式格式。
   * 迁移幂等：只要 `.bak` 文件已存在就跳过。
   *
   * @param bucketingMessages - 用于驱动分桶的扁平 map。未传时用当前 locale 自身内容。
   *   传入 source locale 数据可保证 target locale 分桶与 source 完全一致。
   * @returns 当前 locale 迁移后的扁平 map（供 caller 复用，避免重新读取 .bak）。
   */
  private static migrateToBuckets(
    config: ResolvedConfig,
    baseDir: string,
    locale: string,
    bucketingMessages?: LocaleMap,
  ): LocaleMap | undefined {
    const singleFilePath = path.join(baseDir, `${locale}.json`);
    const bakPath = `${singleFilePath}.bak`;

    if (!fs.existsSync(singleFilePath) || fs.existsSync(bakPath)) return undefined;

    const existingData = FileUtils.safeLoadJsonFile<Record<string, any>>(singleFilePath, {
      silent: true,
    });
    const flatData = FileUtils.flattenObject(existingData) as LocaleMap;

    if (Object.keys(flatData).length > 0) {
      const keyBucketMap = LanguageFileManager.buildKeyBucketMap(
        config,
        bucketingMessages ?? flatData,
      );
      LanguageFileManager.writeBucketedLocaleFile(config, baseDir, flatData, locale, keyBucketMap);
    } else {
      // 空文件：只需创建目录占位，不写入任何 bucket 文件
      fs.mkdirSync(path.join(baseDir, locale), { recursive: true });
    }

    fs.renameSync(singleFilePath, bakPath);
    LoggerUtils.info(`✅ 已将 ${locale} 迁移到分桶格式，备份: ${bakPath}`);
    return flatData;
  }

  /**
   * 用 BucketResolver 为 localeMap 中每个 key 分配桶。
   *
   * 反推策略：从 key 前缀重建虚拟 filePath，但**单一形态**无法兼容所有真实文件结构。
   * 假设 anchor='src'、separator='.'、key='views.order.list.title'：
   *   - 真实文件可能是 `src/views/order/list.vue` 或 `src/views/order/list/index.vue`
   *   - 配置 `match: 'src/views/order/**'` 两种形态都命中
   *   - 配置 `match: 'src/views/order/*.vue'` 只有带 .vue 后缀候选命中
   *
   * 因此本函数对每个 key 依次尝试多种虚拟路径候选，**首个非 defaultBucket 命中即采用**。
   * matchKey 规则与 filePath 候选无关，循环外也能正确命中。
   *
   * 仍然存在的限制：若用户用 `keys.prefix.strategy='fixed'` 覆盖了目录前缀（key 不再保留目录结构），
   * 反推无法工作；loader 已在该场景输出警告，建议改用 matchKey。
   */
  static buildKeyBucketMap(config: ResolvedConfig, localeMap: LocaleMap): KeyBucketMap {
    return this.buildKeyBucketMapWithStats(config, localeMap).keyBucketMap;
  }

  /**
   * 同 buildKeyBucketMap，但额外返回 BucketResolver 的命中统计。
   *
   * caller（GenerateProcessor / MergeProcessor 等）拿到 zeroHitRules 后
   * 应当作为 warning 输出，提示用户规则配错（最常见：matchKey 前缀拼写错误）。
   */
  static buildKeyBucketMapWithStats(
    config: ResolvedConfig,
    localeMap: LocaleMap,
  ): { keyBucketMap: KeyBucketMap; ruleHits: Record<string, number>; zeroHitRules: string[] } {
    const buckets = config.buckets!;
    const resolver = new BucketResolver(buckets);
    const sep = config.keys.separator;
    const anchor = config.keys.prefix.strategy === 'path' ? config.keys.prefix.anchor : 'src';
    const keyBucketMap: KeyBucketMap = {};
    for (const [key, message] of Object.entries(localeMap)) {
      const parts = key.split(sep);
      let resolved = buckets.defaultBucket;

      if (parts.length > 1) {
        const dirPath = `${anchor}/${parts.slice(0, -1).join('/')}`;
        const candidates = [
          `${dirPath}.vue`,
          `${dirPath}.tsx`,
          `${dirPath}.ts`,
          dirPath,
          `${dirPath}/index`,
        ];
        for (const candidate of candidates) {
          const m = resolver.resolve(candidate, key, message);
          if (m !== buckets.defaultBucket) {
            resolved = m;
            break;
          }
        }
      } else {
        // 单段 key（极少见，通常是用户自定义）：只能靠 matchKey
        resolved = resolver.resolve('', key, message);
      }

      keyBucketMap[key] = resolved;
    }
    return {
      keyBucketMap,
      ruleHits: resolver.getHitStats(),
      zeroHitRules: resolver.getZeroHitRules(),
    };
  }

  /**
   * 桶式目录扫描的统一入口：对每个桶文件调用回调。
   *
   * by-locale 布局：baseDir/<locale>/<bucket>.json
   * by-bucket 布局：baseDir/<bucket>/<locale>.json
   */
  private static iterateBucketedFiles(
    baseDir: string,
    locale: string,
    layout: 'by-locale' | 'by-bucket',
    onFile: (bucketName: string, data: Record<string, any>) => void,
    onCorrupt?: (filePath: string) => void,
  ): void {
    // 读取单个 bucket 文件。返回 undefined 表示「损坏且已交给 onCorrupt 处理，应跳过」。
    // 未传 onCorrupt 时维持历史行为：损坏文件经 safeLoadJsonFile 静默退化为 {}。
    const loadOne = (filePath: string): Record<string, any> | undefined => {
      if (!onCorrupt) {
        return FileUtils.safeLoadJsonFile<Record<string, any>>(filePath, { silent: true });
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.trim() === '') return {};
      const parsed = FileUtils.safeParseJson(content) as Record<string, any> | null;
      if (parsed === null) {
        onCorrupt(filePath);
        return undefined;
      }
      return parsed;
    };

    if (layout === 'by-locale') {
      const dirPath = path.join(baseDir, locale);
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return;
      for (const file of fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'))) {
        const bucketName = path.basename(file, '.json');
        const data = loadOne(path.join(dirPath, file));
        if (data !== undefined) onFile(bucketName, data);
      }
      return;
    }
    // by-bucket
    if (!fs.existsSync(baseDir)) return;
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const langFile = path.join(baseDir, entry.name, `${locale}.json`);
      if (!fs.existsSync(langFile)) continue;
      const data = loadOne(langFile);
      if (data !== undefined) onFile(entry.name, data);
    }
  }

  /**
   * 扫描某 locale 的所有桶文件，返回首个「有内容却解析失败」的文件路径；无损坏返回 null。
   *
   * 供 MergeProcessor 在写回桶式语言包前做「损坏即中止」保护——与单文件路径的
   * `readLocaleFile` 返回 null 的语义对齐。桶式读取默认走 silent 降级（损坏当 {}），
   * 缺这层保护会导致损坏 bucket 在重写时被静默丢弃。
   */
  static findCorruptBucketFile(
    config: ResolvedConfig,
    isCustom: boolean,
    locale?: string,
  ): string | null {
    locale = locale || config.locales.source;
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);
    const layout = config.buckets?.layout ?? 'by-locale';
    let corrupt: string | null = null;
    this.iterateBucketedFiles(
      workingDir,
      locale,
      layout,
      () => {},
      (filePath) => {
        if (!corrupt) corrupt = filePath;
      },
    );
    return corrupt;
  }

  /**
   * 读取桶式目录下所有 JSON 文件并合并为扁平 map。
   */
  private static readBucketedLocaleFlat(
    config: ResolvedConfig,
    baseDir: string,
    locale: string,
    layout: 'by-locale' | 'by-bucket',
  ): Record<string, string> {
    const merged: Record<string, string> = {};
    const separator = config.keys.separator;
    this.iterateBucketedFiles(baseDir, locale, layout, (_bucketName, data) => {
      Object.assign(merged, FileUtils.flattenObject(data, '', separator));
    });
    return merged;
  }

  /**
   * 读取单文件语言文件并返回 { flat, isNested }。
   * 单文件场景下保留原结构信息（嵌套/扁平），供调用方决定写回格式。
   */
  static readFlatLocale(
    filePath: string,
    errorMessage?: string,
  ): { flat: Record<string, string>; isNested: boolean } {
    if (!fs.existsSync(filePath)) return { flat: {}, isNested: false };
    const data = FileUtils.safeLoadJsonFile<Record<string, any>>(filePath, {
      errorMessage,
      silent: false,
    });
    if (Object.keys(data).length === 0) return { flat: {}, isNested: false };
    const isNested = FileUtils.isNestedStructure(data);
    const flattened = FileUtils.flattenObject(data);
    const flat: Record<string, string> = Object.fromEntries(
      Object.entries(flattened)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => [key, String(value)]),
    );
    return { flat, isNested };
  }

  /**
   * 读取语言文件内容（单文件或桶式目录均支持）。
   *
   * 返回值始终是「扁平 map」（flat key → value）。上层（updateLanguageFiles /
   * IdReuseResolver / RestoreProcessor / MergeProcessor）一律按 flatKey 做查找与合并；
   * 落盘时再由 serialize 按 io.format 决定 flat / nested。
   */
  static readLocaleFile(
    config: ResolvedConfig,
    isCustom: boolean,
    locale?: string,
  ): LocaleMap | null {
    locale = locale || config.locales.source;
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);

    if (config.buckets) {
      return this.readBucketedLocaleFlat(config, workingDir, locale, config.buckets.layout);
    }

    const localeFilePath = path.join(workingDir, `${locale}.json`);
    try {
      if (!fs.existsSync(localeFilePath)) {
        LoggerUtils.warn(`语言文件不存在，将创建新文件: ${localeFilePath}`);
        return {};
      }
      const content = fs.readFileSync(localeFilePath, 'utf-8');
      const parsed = FileUtils.safeParseJson(content);
      // 文件存在但解析失败（非空内容却得到 null）：返回 null 表示「内容未知」，
      // 与「文件不存在 → {}」区分开。否则 safeParseJson→null→flattenObject(null)→{}
      // 会把损坏文件静默当成空 locale，导致 prune「假成功」地报告无孤儿、merge 丢数据。
      // 调用方需对 null 显式处理（中止/不写回），不得直接 `?? {}` 吞掉。
      if (parsed === null && content.trim() !== '') {
        LoggerUtils.error(`❌ 语言文件解析失败（JSON 格式错误）: ${localeFilePath}`);
        LoggerUtils.error('👉 为防止数据丢失/误判，本次不会把它当作空文件处理。请检查 JSON 格式。');
        return null;
      }
      // 用 keys.separator 展平，与 serialize 写回时的 unflattenObject 使用的
      // 分隔符保持一致——保证 nested 与 flat 之间往返无损。
      return FileUtils.flattenObject(parsed, '', config.keys.separator) as LocaleMap;
    } catch (error) {
      LoggerUtils.error(`❌ 读取语言文件失败: ${localeFilePath}`, error);
      LoggerUtils.error('👉 为防止数据丢失，本次将不会更新语言文件。请检查JSON文件格式是否正确。');
      return null;
    }
  }

  /**
   * 读取桶式目录，同时返回 key → bucket 的归属关系（供 writeLocaleFile 回写时复用）。
   */
  static readBucketedLocaleWithBucketMap(
    config: ResolvedConfig,
    isCustom: boolean,
    locale?: string,
  ): { flat: LocaleMap; keyBucketMap: KeyBucketMap } {
    locale = locale || config.locales.source;
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);
    const flat: LocaleMap = {};
    const keyBucketMap: KeyBucketMap = {};
    const layout = config.buckets?.layout ?? 'by-locale';

    this.iterateBucketedFiles(workingDir, locale, layout, (bucketName, data) => {
      const flatData = FileUtils.flattenObject(data);
      for (const key of Object.keys(flatData)) {
        flat[key] = flatData[key];
        keyBucketMap[key] = bucketName;
      }
    });

    return { flat, keyBucketMap };
  }

  /**
   * 写入语言文件内容。落盘格式由 config.io.format 统一决定。
   * @param keyBucketMap - 可选：key → bucket 名，启用后按桶分组写入；
   *   未提供时写入单文件。
   */
  static writeLocaleFile(
    config: ResolvedConfig,
    isCustom: boolean,
    localeMap: LocaleMap,
    locale?: string,
    keyBucketMap?: KeyBucketMap,
  ): void {
    locale = locale || config.locales.source;
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);

    if (config.buckets && keyBucketMap) {
      this.writeBucketedLocaleFile(config, workingDir, localeMap, locale, keyBucketMap);
      return;
    }

    const localeFilePath = path.join(workingDir, `${locale}.json`);
    try {
      FileUtils.writeJsonFile(localeFilePath, this.serialize(config, localeMap), {
        indent: config.io.indent,
      });
    } catch (error) {
      LoggerUtils.error(`❌ 写入语言文件失败: ${localeFilePath}`, error);
      throw error;
    }
  }

  /**
   * 按 keyBucketMap 分桶写入到桶式目录。
   * by-locale: `<baseDir>/<locale>/<bucket>.json`
   * by-bucket: `<baseDir>/<bucket>/<locale>.json`
   *
   * 写盘后自动**清理孤儿 bucket 文件**：当 bucket 规则变更使得某个 bucket 不再
   * 有 key 时，旧文件会被重命名为 `.json.bak`（与单文件→桶式迁移的备份策略一致）。
   * 已存在的 `.bak` 不会被覆盖——使清理幂等且不丢历史备份。
   */
  private static writeBucketedLocaleFile(
    config: ResolvedConfig,
    baseDir: string,
    localeMap: LocaleMap,
    locale: string,
    keyBucketMap: KeyBucketMap,
  ): void {
    const { layout, defaultBucket } = config.buckets!;
    const groups = new Map<string, LocaleMap>();

    for (const [key, value] of Object.entries(localeMap)) {
      const bucketName = keyBucketMap[key] ?? defaultBucket;
      if (!groups.has(bucketName)) groups.set(bucketName, {});
      groups.get(bucketName)![key] = value;
    }

    const writtenPaths = new Set<string>();
    for (const [bucketName, bucketMap] of groups) {
      const filePath =
        layout === 'by-bucket'
          ? path.join(baseDir, bucketName, `${locale}.json`)
          : path.join(baseDir, locale, `${bucketName}.json`);
      FileUtils.writeJsonFile(filePath, this.serialize(config, bucketMap), {
        indent: config.io.indent,
      });
      writtenPaths.add(path.resolve(filePath));
    }

    this.pruneOrphanBucketFiles(baseDir, locale, layout, writtenPaths);
  }

  /**
   * 扫描当前 locale 涉及的所有 bucket 文件位置，把不在 writtenPaths 中的孤儿
   * `.json` 重命名为 `.json.bak`。已存在的 `.bak` 文件会跳过，避免覆盖历史备份。
   *
   * by-locale: 扫 `<baseDir>/<locale>/*.json`
   * by-bucket: 扫所有 `<baseDir>/<bucket>/<locale>.json`
   */
  private static pruneOrphanBucketFiles(
    baseDir: string,
    locale: string,
    layout: 'by-locale' | 'by-bucket',
    writtenPaths: Set<string>,
  ): void {
    const candidates: string[] = [];
    if (layout === 'by-locale') {
      const dirPath = path.join(baseDir, locale);
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return;
      for (const file of fs.readdirSync(dirPath)) {
        if (file.endsWith('.json')) candidates.push(path.join(dirPath, file));
      }
    } else {
      if (!fs.existsSync(baseDir)) return;
      for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const langFile = path.join(baseDir, entry.name, `${locale}.json`);
        if (fs.existsSync(langFile)) candidates.push(langFile);
      }
    }

    for (const candidate of candidates) {
      if (writtenPaths.has(path.resolve(candidate))) continue;
      const bakPath = `${candidate}.bak`;
      if (fs.existsSync(bakPath)) {
        // 已经备份过，不再 rename 也不删原文件——人工决定何时清掉
        LoggerUtils.info(
          `🪦 孤儿 bucket 文件未清理（备份已存在）: ${path.relative(baseDir, candidate)}`,
        );
        continue;
      }
      try {
        fs.renameSync(candidate, bakPath);
        LoggerUtils.info(
          `🧹 已将孤儿 bucket 文件备份为 .bak: ${path.relative(baseDir, candidate)}`,
        );
      } catch (error) {
        LoggerUtils.warn(`⚠️  备份孤儿 bucket 文件失败（已忽略）: ${candidate}: ${error}`);
      }
    }
  }

  /**
   * 落盘前统一序列化：按 config.io.format 决定扁平 / 嵌套。
   *
   * 'nested' 模式下额外做前缀冲突校验——unflattenObject 对 `a.b` 与 `a.b.c`
   * 同时存在的扁平 map 会静默覆盖（叶子 vs 子树）导致数据丢失，必须前置拦截。
   */
  private static serialize(config: ResolvedConfig, flat: LocaleMap): Record<string, any> {
    if (config.io.format === 'flat') return flat;
    this.assertNoPrefixConflict(flat, config.keys.separator);
    return FileUtils.unflattenObject(flat, config.keys.separator);
  }

  /**
   * 校验扁平 key 集合是否存在前缀冲突。
   */
  private static assertNoPrefixConflict(flat: LocaleMap, separator: string): void {
    // 对每个 key 检查其所有真祖先路径是否也是叶子 key。
    // 不能只比「排序相邻对」：若存在含 < 分隔符字符的 key（如分隔符为 '.' 时的
    // 'a.b-c'）夹在 'a.b' 与 'a.b.c' 之间，相邻比较会漏掉这对祖先/子树冲突。
    const keySet = new Set(Object.keys(flat));
    for (const key of keySet) {
      const parts = key.split(separator);
      for (let i = 1; i < parts.length; i++) {
        const ancestor = parts.slice(0, i).join(separator);
        if (keySet.has(ancestor)) {
          throw new Error(
            `[i18n-tools] 嵌套输出存在前缀冲突：'${ancestor}' 同时作为叶子和 '${key}' 的祖先。\n` +
              `  unflatten 时叶子值会被子树覆盖，必然丢数据。\n` +
              `  解决方案：重命名其中一个 key，或将 io.format 切换为 'flat'。`,
          );
        }
      }
    }
  }

  /**
   * 更新语言文件。
   * @param keyBucketMap - 可选：key → bucket，启用桶式写入
   * @param report       - 可选：传入则把 LocaleValueLinter 的 warning 也写入 RunReport
   * @param library      - 可选：i18n 库（提供花括号策略 + 字面量转义），用于 locale 值定稿；
   *                       缺省时不做任何花括号转换/转义（按单花括号规范原样写）
   */
  static updateLanguageFiles(
    config: ResolvedConfig,
    isCustom: boolean,
    extractedStrings: ExtractedString[],
    keyBucketMap?: KeyBucketMap,
    report?: RunReport,
    library?: { usesDoubleBracePlaceholders: boolean; escapeLiteralText: (text: string) => string },
  ): void {
    if (extractedStrings.length === 0) return;

    let localeMap: LocaleMap;

    if (config.buckets) {
      // 读 flat 数据即可——磁盘当前布局**不再**作为 keyBucketMap 的兜底来源。
      // 历史问题：旧逻辑用 existingKeyBucketMap 兜底导致 matchKey/match 规则
      // 对存量 key 永远失效（旧规则下落到 A 桶的 key，即使新规则该去 B 桶，
      // 也会因 existing 占位而留在 A）。
      localeMap = this.readBucketedLocaleWithBucketMap(config, isCustom).flat;
    } else {
      const read = this.readLocaleFile(config, isCustom);
      if (read === null) return;
      localeMap = read;
    }

    const newEntries: LocaleMap = {};
    let updatedCount = 0;
    let addedCount = 0;

    for (const extracted of extractedStrings) {
      if (!extracted.semanticId) continue;

      const rawMessage = extracted.processedMessage || extracted.original;

      const built =
        extracted.isTemplateString && extracted.templateVariables
          ? CommonASTUtils.createMessageWithOptions(rawMessage, extracted.templateVariables)
          : {
              message: rawMessage.replace(/^['"`]|['"`]$/g, ''),
              placeholderMap: new Map<string, string>(),
            };
      const message = library
        ? CommonASTUtils.finalizeLocaleMessage(
            built.message,
            built.placeholderMap.values(),
            library,
          )
        : built.message;

      if (!(extracted.semanticId in localeMap)) {
        newEntries[extracted.semanticId] = message;
        addedCount++;
      } else if (localeMap[extracted.semanticId] !== message) {
        localeMap[extracted.semanticId] = message;
        updatedCount++;
      }
    }

    if (addedCount === 0 && updatedCount === 0) {
      LoggerUtils.info('✅ 语言文件已是最新状态，无需更新');
      return;
    }

    const finalMap = { ...localeMap, ...newEntries };

    // 重新计算 effectiveKeyBucketMap：caller 提供的（用真实 filePath 算）优先；
    // caller 没覆盖的 key（来自存量 localeMap 中未被本轮触达的文件）走
    // buildKeyBucketMap 用虚拟路径反推。这样规则一变，所有 key 都会按新规则落桶。
    let effectiveKeyBucketMap: KeyBucketMap | undefined;
    if (config.buckets) {
      const callerMap = keyBucketMap ?? {};
      const rebucketSource: LocaleMap = {};
      for (const key of Object.keys(finalMap)) {
        if (!(key in callerMap)) rebucketSource[key] = finalMap[key] ?? '';
      }
      const rebucket =
        Object.keys(rebucketSource).length > 0
          ? this.buildKeyBucketMapWithStats(config, rebucketSource)
          : { keyBucketMap: {}, zeroHitRules: [], ruleHits: {} };
      effectiveKeyBucketMap = { ...rebucket.keyBucketMap, ...callerMap };

      // caller 已自己上报真实路径下的命中情况，这里只关心"反推存量 key"也 0
      // 命中的规则——只有当 callerMap 也没让它命中时才告警，避免误伤。
      if (rebucket.zeroHitRules.length > 0 && report) {
        const callerHits = new Set(Object.values(callerMap));
        const trulyZero = rebucket.zeroHitRules.filter((name) => !callerHits.has(name));
        if (trulyZero.length > 0) {
          report.addWarning(
            `[buckets] 以下规则在本轮 ${Object.keys(finalMap).length} 个 key 上 0 命中，` +
              `可能配错（matchKey 前缀与实际 key 不符 / match glob 写错）：${trulyZero.join(', ')}`,
          );
        }
      }
    }

    this.writeLocaleFile(config, isCustom, finalMap, undefined, effectiveKeyBucketMap);

    LoggerUtils.success(`✅ 语言文件更新成功！`);
    if (addedCount > 0) LoggerUtils.info(`   - 新增条目: ${addedCount}`);
    if (updatedCount > 0) LoggerUtils.info(`   - 更新条目: ${updatedCount}`);

    // 落盘后做一次健康度 lint
    LocaleValueLinter.lint(finalMap, report, { separator: config.keys.separator });
  }
}
