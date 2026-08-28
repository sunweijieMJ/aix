import path from 'path';
import type { ResolvedConfig } from '../config';
import { FileUtils } from '../utils/file-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import type { LocaleMap } from '../utils/types';
import { FileProcessor } from './FileProcessor';
import { classifyJsonFile, ensureDirectoryExists, writeJsonFile } from '../utils/json-io';

/**
 * 导出处理器
 *
 * 把基础 + 自定义语言包合并为最终发布产物。
 *
 * 多目标语种处理约定：
 *  - 对 source + 全部 targets 都做 base/custom 合并 + 冲突检测 + 输出
 *  - manifest.locales 包含全部
 */
export class ExportProcessor extends FileProcessor {
  constructor(config: ResolvedConfig) {
    super(config, false);
  }

  protected getOperationName(): string {
    return '导出语言包';
  }

  protected getDirectoryDescription(): string {
    return '全局';
  }

  async execute(outputDir?: string): Promise<void> {
    return this.executeWithLifecycle(() => this._execute(outputDir));
  }

  private async _execute(outputDir?: string): Promise<void> {
    const finalOutputDir = outputDir || this.config.io.exportDir;
    if (!finalOutputDir) {
      throw new Error(
        '[i18n-tools] export 需要输出目录：请配置 io.exportDir，' +
          '或通过 CLI --output 显式指定。',
      );
    }

    LoggerUtils.info(`📂 基础目录: ${this.config.io.localesDir}`);
    if (this.config.io.customDir) {
      LoggerUtils.info(`📂 定制目录: ${this.config.io.customDir}`);
    }
    LoggerUtils.info(`📂 输出目录: ${finalOutputDir}`);

    await this.performExport(finalOutputDir);
  }

  /**
   * 导出前损坏守卫：export 是发布最后一步，损坏 locale 若被 safeLoadJsonFile 静默当成 {}，
   * 会导出空语言包覆盖上次产物；且末尾「验证」拿空 merged 与自己回读对账必然相等 → 伪报
   * 「✅ 导出文件验证通过」。与 Pick/Merge/Prune 一致：源端（基础 + 定制目录）任一 locale
   * 损坏即中止，绝不静默降级。
   */
  private assertNoCorruptSources(): void {
    const allLocales = [this.config.locales.source, ...this.config.locales.targets];
    const customDir = this.config.io.customDir;

    const throwCorrupt = (filePath: string): never => {
      throw new Error(
        '语言文件损坏，已中止 export（避免导出空语言包覆盖已发布产物，请用 git 修复后重试）: ' +
          FileUtils.getRelativePath(filePath),
      );
    };

    // 基础目录（isCustom=false）+ 定制目录（isCustom=true，若配置）逐 locale 探测；export 必须
    // 同时看这两个目录，故显式构造两个 LanguageFileManager，而非复用绑定 this.isCustom 的 langFiles。
    // 探测口径（桶式 / 遗留单文件 / 单文件）统一收口于 findCorruptLocale。桶式必须带
    // checkLegacy：migrateToBuckets 会 silent 读遗留单文件、损坏则清空并 rename .bak →
    // 导出空包覆盖已发布产物。
    const baseFiles = new LanguageFileManager(this.config, false);
    const customFiles = new LanguageFileManager(this.config, true);
    for (const locale of allLocales) {
      const corruptBase = baseFiles.findCorruptLocale(locale, { checkLegacy: true });
      if (corruptBase) throwCorrupt(corruptBase);
      if (customDir) {
        const corruptCustom = customFiles.findCorruptLocale(locale, { checkLegacy: true });
        if (corruptCustom) throwCorrupt(corruptCustom);
      }
    }
  }

  private async performExport(outputDir: string): Promise<void> {
    try {
      this.assertNoCorruptSources();
      if (this.config.buckets) {
        await this.performBucketedExport(outputDir);
      } else {
        await this.performFlatExport(outputDir);
      }
    } catch (error) {
      LoggerUtils.error('语言包导出失败', error);
      throw error;
    }
  }

  /**
   * 单文件场景的扁平导出。对每个 locale（source + targets）独立做 base/custom 合并。
   */
  private async performFlatExport(outputDir: string): Promise<void> {
    const sourceLocale = this.config.locales.source;
    const targets = this.config.locales.targets;
    const allLocales = [sourceLocale, ...targets];
    const customLocaleDir = this.config.io.customDir;

    const loadFlat = (filePath: string, lang: string, type: '基础' | '自定义'): LocaleMap => {
      const raw = FileUtils.loadLanguageFile<Record<string, any>>(filePath, lang, type);
      // 必须用 config.keys.separator 展平：与 readLocaleFile / language-file-manager 的读路径同源。
      // 漏传则默认 '.'，flat 格式 + 非 '.' 分隔符 + 磁盘嵌套 JSON 时导出 key（a.b）与运行时使用的
      // key（a/b）不一致，导致导出包整片 missing-key 兜底（回归同 flatten-separator-consistency #12）。
      return FileUtils.flattenObject(raw, '', this.config.keys.separator) as LocaleMap;
    };

    // 一次性加载所有 locale 的 base/custom
    const baseByLocale = new Map<string, LocaleMap>();
    const customByLocale = new Map<string, LocaleMap>();
    for (const locale of allLocales) {
      baseByLocale.set(
        locale,
        loadFlat(path.join(this.config.io.localesDir, `${locale}.json`), locale, '基础'),
      );
      customByLocale.set(
        locale,
        customLocaleDir
          ? loadFlat(path.join(customLocaleDir, `${locale}.json`), locale, '自定义')
          : {},
      );
    }

    const baseOf = (locale: string): LocaleMap => baseByLocale.get(locale)!;
    const customOf = (locale: string): LocaleMap => customByLocale.get(locale)!;
    if (customLocaleDir) ExportProcessor.checkLocaleConflicts(allLocales, baseOf, customOf);

    ensureDirectoryExists(outputDir);
    const mergedByLocale = ExportProcessor.mergeByLocale(allLocales, baseOf, customOf);

    LoggerUtils.info('\n📊 语言包统计信息:');
    LoggerUtils.info(`📁 基础语言包 (${this.config.io.localesDir}):`);
    for (const locale of allLocales) {
      LoggerUtils.info(`   ${locale}: ${Object.keys(baseByLocale.get(locale)!).length} 个条目`);
    }
    if (customLocaleDir) {
      LoggerUtils.info(`📁 自定义语言包 (${customLocaleDir}):`);
      for (const locale of allLocales) {
        LoggerUtils.info(`   ${locale}: ${Object.keys(customByLocale.get(locale)!).length} 个条目`);
      }
    }
    LoggerUtils.info(`📦 合并后语言包:`);
    for (const locale of allLocales) {
      LoggerUtils.info(`   ${locale}: ${Object.keys(mergedByLocale.get(locale)!).length} 个条目`);
    }

    // 复用 LanguageFileManager 的 serialize 逻辑：把 outputDir 当作"目标 localesDir"传入
    const exportConfig: ResolvedConfig = {
      ...this.config,
      io: { ...this.config.io, localesDir: outputDir },
    };
    // 导出目标是 outputDir（非 locales 目录），故用变造后的 exportConfig + isCustom=false 单独绑定。
    const exportFiles = new LanguageFileManager(exportConfig, false);
    for (const locale of allLocales) {
      exportFiles.writeLocaleFile(mergedByLocale.get(locale)!, locale);
    }

    const outputPaths = allLocales.map((l) => path.join(outputDir, `${l}.json`));
    LoggerUtils.success('\n✅ 语言包导出成功!');
    LoggerUtils.info(`📄 输出文件:\n   ${outputPaths.join('\n   ')}`);

    // 嵌套模式下顶层 key 数量少于 flat key 数量，flatten 后再比较。
    // 这里是「写完再读回来核对」的自检，故用判别式而非 silent 降级：silent 会把
    // 读不回来的文件当成 {}，只报出「条目数量不匹配」——用户照着这条去数条目，
    // 而真正的原因是刚写出的文件不是合法 JSON。两种故障必须分别报。
    const separator = this.config.keys.separator;
    const mismatched: string[] = [];
    const unreadable: string[] = [];
    for (const locale of allLocales) {
      const filePath = path.join(outputDir, `${locale}.json`);
      const cls = classifyJsonFile<Record<string, any>>(filePath);
      if (cls.status !== 'ok') {
        unreadable.push(`${locale}(${cls.status})`);
        continue;
      }
      const flat = FileUtils.flattenObject(cls.data, '', separator);
      if (Object.keys(flat).length !== Object.keys(mergedByLocale.get(locale)!).length) {
        mismatched.push(locale);
      }
    }
    if (unreadable.length === 0 && mismatched.length === 0) {
      LoggerUtils.success('✅ 导出文件验证通过');
    } else {
      if (unreadable.length > 0) {
        LoggerUtils.warn(`导出文件回读失败（写出的内容不是合法 JSON）: ${unreadable.join(', ')}`);
      }
      if (mismatched.length > 0) {
        LoggerUtils.warn(`导出文件条目数量不匹配: ${mismatched.join(', ')}`);
      }
    }
  }

  /**
   * 冲突检测：定制包 key 不应与基础包重复。flat / bucketed 两条导出路径共用，
   * 仅 base/custom map 的来源不同（flat 从文件加载、bucketed 走 getMessages）。
   */
  private static checkLocaleConflicts(
    allLocales: string[],
    baseOf: (locale: string) => LocaleMap,
    customOf: (locale: string) => LocaleMap,
  ): void {
    LoggerUtils.info('🔍 检查语言包冲突...');
    const conflictsByLocale: Record<string, string[]> = {};
    let totalConflicts = 0;
    for (const locale of allLocales) {
      const conflicts = FileUtils.findConflictingKeys(baseOf(locale), customOf(locale));
      if (conflicts.length > 0) {
        conflictsByLocale[locale] = conflicts;
        totalConflicts += conflicts.length;
      }
    }
    if (totalConflicts > 0) {
      for (const [locale, conflicts] of Object.entries(conflictsByLocale)) {
        LoggerUtils.error(
          `${locale} 语言包存在 ${conflicts.length} 个冲突键: ${conflicts.join(', ')}`,
        );
      }
      throw new Error('语言包存在冲突，请先解决冲突后再导出。定制包中的 key 不应与基础包重复。');
    }
    LoggerUtils.success('✅ 未发现语言包冲突');
  }

  /** 按 locale 合并 base + custom（custom 覆盖）。flat / bucketed 共用。 */
  private static mergeByLocale(
    allLocales: string[],
    baseOf: (locale: string) => LocaleMap,
    customOf: (locale: string) => LocaleMap,
  ): Map<string, LocaleMap> {
    const merged = new Map<string, LocaleMap>();
    for (const locale of allLocales) {
      merged.set(locale, { ...baseOf(locale), ...customOf(locale) });
    }
    return merged;
  }

  /**
   * 桶式导出：每个 (locale, bucket) 写一个文件；按 buckets.layout 决定层级。
   */
  private async performBucketedExport(outputDir: string): Promise<void> {
    const { buckets } = this.config;
    if (!buckets) return;

    const sourceLocale = this.config.locales.source;
    const targets = this.config.locales.targets;
    const allLocales = [sourceLocale, ...targets];
    const customLocaleDir = this.config.io.customDir;

    // getMessages 兼容单文件/桶式两种源格式（buckets 配置下首次会触发迁移）
    const baseMessages = new LanguageFileManager(this.config, false).getMessages();
    // 定制目录：桶式同样需合并 customDir，否则定制覆盖会被静默丢弃（与 performFlatExport 对称）。
    const customMessages = customLocaleDir
      ? new LanguageFileManager(this.config, true).getMessages()
      : ({} as ReturnType<LanguageFileManager['getMessages']>);

    // 冲突检测 + 合并：与 performFlatExport 同口径，仅 base/custom 来源不同
    const baseOf = (locale: string): LocaleMap => (baseMessages[locale] ?? {}) as LocaleMap;
    const customOf = (locale: string): LocaleMap => (customMessages[locale] ?? {}) as LocaleMap;
    if (customLocaleDir) ExportProcessor.checkLocaleConflicts(allLocales, baseOf, customOf);

    // 合并 base + custom（custom 覆盖，冲突已在上方拦截，正常为并集）
    const mergedByLocale = ExportProcessor.mergeByLocale(allLocales, baseOf, customOf);

    // 用合并后的 source 文本驱动分桶（与 generate/merge 一致；含定制 source key）
    const sourceFlat = mergedByLocale.get(sourceLocale)!;
    const keyBucketMap = LanguageFileManager.buildKeyBucketMap(this.config, sourceFlat);
    // 清单必须来自每个 locale 实际写出的桶，而不是只看 source 的 keyBucketMap：目标语言
    // 独有 key 会按 writeBucketedLocaleFile 规则落 defaultBucket，也必须进入 index/manifest。
    const localeBuckets = new Map<string, string[]>();
    for (const locale of allLocales) {
      const actualBuckets = new Set<string>();
      for (const key of Object.keys(mergedByLocale.get(locale)!)) {
        actualBuckets.add(keyBucketMap[key] ?? buckets.defaultBucket);
      }
      localeBuckets.set(locale, [...actualBuckets].sort());
    }
    const bucketNames = [...new Set([...localeBuckets.values()].flat())].sort();
    const bucketCount = bucketNames.length;

    LoggerUtils.info('\n📊 桶式语言包统计:');
    for (const locale of allLocales) {
      LoggerUtils.info(`   ${locale}: ${Object.keys(mergedByLocale.get(locale)!).length} 个条目`);
    }
    if (customLocaleDir) {
      LoggerUtils.info(`📁 已合并定制目录 (${customLocaleDir})`);
    }
    LoggerUtils.info(`   桶数: ${bucketCount}`);

    const exportConfig: ResolvedConfig = {
      ...this.config,
      io: { ...this.config.io, localesDir: outputDir },
    };
    // 导出目标是 outputDir（非 locales 目录），故用变造后的 exportConfig + isCustom=false 单独绑定。
    const exportFiles = new LanguageFileManager(exportConfig, false);
    for (const locale of allLocales) {
      exportFiles.writeLocaleFile(mergedByLocale.get(locale)!, locale, keyBucketMap);
    }

    // 每个语言目录生成 index.json，便于消费方按需懒加载
    this.writeLocaleIndexFiles(outputDir, allLocales, localeBuckets, buckets.layout);

    if (buckets.emitManifest) {
      this.writeManifest(
        outputDir,
        bucketNames,
        allLocales,
        localeBuckets,
        buckets.layout,
        buckets.defaultBucket,
      );
    }

    LoggerUtils.success('\n✅ 桶式语言包导出成功!');
    LoggerUtils.info(`📁 输出目录: ${outputDir}`);
  }

  /** 在每个语言目录写 index.json，列出该目录下的桶清单 */
  private writeLocaleIndexFiles(
    outputDir: string,
    locales: string[],
    localeBuckets: Map<string, string[]>,
    layout: 'by-locale' | 'by-bucket',
  ): void {
    if (layout !== 'by-locale') return;
    for (const locale of locales) {
      writeJsonFile(path.join(outputDir, locale, 'index.json'), {
        buckets: localeBuckets.get(locale) ?? [],
      });
    }
  }

  private writeManifest(
    outputDir: string,
    bucketNames: string[],
    locales: string[],
    localeBuckets: Map<string, string[]>,
    layout: 'by-locale' | 'by-bucket',
    defaultBucket: string,
  ): void {
    const files: Record<string, Record<string, string>> = {};

    if (layout === 'by-bucket') {
      for (const bucket of bucketNames) {
        files[bucket] = {};
        for (const locale of locales) {
          if (localeBuckets.get(locale)?.includes(bucket)) {
            files[bucket][locale] = `${bucket}/${locale}.json`;
          }
        }
      }
    } else {
      for (const locale of locales) {
        files[locale] = {};
        for (const bucket of localeBuckets.get(locale) ?? []) {
          files[locale][bucket] = `${locale}/${bucket}.json`;
        }
      }
    }

    const manifest = {
      buckets: bucketNames,
      locales: [...locales].sort(),
      layout,
      defaultBucket,
      generatedAt: new Date().toISOString(),
      files,
    };
    writeJsonFile(path.join(outputDir, 'manifest.json'), manifest);
    LoggerUtils.info(`📄 已生成 manifest.json，包含 ${bucketNames.length} 个桶`);
  }
}
