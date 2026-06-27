import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import { FileUtils } from '../utils/file-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import type { LocaleMap } from '../utils/types';
import { FileProcessor } from './FileProcessor';

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

    if (this.config.buckets) {
      for (const locale of allLocales) {
        const corruptBase = LanguageFileManager.findCorruptBucketFile(this.config, false, locale);
        if (corruptBase) throwCorrupt(corruptBase);
        // 还需校验「尚未迁移的遗留单文件」：getMessages 桶式分支会 migrateToBuckets，
        // 它 silent 读遗留 <locale>.json，损坏则静默清空并 rename .bak → 导出空包覆盖
        // 已发布产物。findCorruptBucketFile 只扫桶目录，扫不到遗留单文件。
        const corruptLegacyBase = LanguageFileManager.findCorruptLegacySingleFile(
          this.config,
          false,
          locale,
        );
        if (corruptLegacyBase) throwCorrupt(corruptLegacyBase);
        if (customDir) {
          const corruptCustom = LanguageFileManager.findCorruptBucketFile(
            this.config,
            true,
            locale,
          );
          if (corruptCustom) throwCorrupt(corruptCustom);
          const corruptLegacyCustom = LanguageFileManager.findCorruptLegacySingleFile(
            this.config,
            true,
            locale,
          );
          if (corruptLegacyCustom) throwCorrupt(corruptLegacyCustom);
        }
      }
      return;
    }

    const checkFlat = (filePath: string): void => {
      if (!fs.existsSync(filePath)) return;
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.trim() === '') return;
      if (FileUtils.safeParseJson(content) === null) throwCorrupt(filePath);
    };
    for (const locale of allLocales) {
      checkFlat(path.join(this.config.io.localesDir, `${locale}.json`));
      if (customDir) checkFlat(path.join(customDir, `${locale}.json`));
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
      return FileUtils.flattenObject(raw) as LocaleMap;
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

    if (customLocaleDir) {
      LoggerUtils.info('🔍 检查语言包冲突...');
      const conflictsByLocale: Record<string, string[]> = {};
      let totalConflicts = 0;
      for (const locale of allLocales) {
        const conflicts = FileUtils.findConflictingKeys(
          baseByLocale.get(locale)!,
          customByLocale.get(locale)!,
        );
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

    // 合并并落盘
    FileUtils.ensureDirectoryExists(outputDir);
    const mergedByLocale = new Map<string, LocaleMap>();
    for (const locale of allLocales) {
      mergedByLocale.set(locale, { ...baseByLocale.get(locale)!, ...customByLocale.get(locale)! });
    }

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
    for (const locale of allLocales) {
      LanguageFileManager.writeLocaleFile(exportConfig, false, mergedByLocale.get(locale)!, locale);
    }

    const outputPaths = allLocales.map((l) => path.join(outputDir, `${l}.json`));
    LoggerUtils.success('\n✅ 语言包导出成功!');
    LoggerUtils.info(`📄 输出文件:\n   ${outputPaths.join('\n   ')}`);

    // 嵌套模式下顶层 key 数量少于 flat key 数量，flatten 后再比较
    const separator = this.config.keys.separator;
    let allOk = true;
    for (const locale of allLocales) {
      const exported = FileUtils.safeLoadJsonFile<Record<string, any>>(
        path.join(outputDir, `${locale}.json`),
        { silent: true },
      );
      const flat = FileUtils.flattenObject(exported, '', separator);
      if (Object.keys(flat).length !== Object.keys(mergedByLocale.get(locale)!).length) {
        allOk = false;
      }
    }
    if (allOk) {
      LoggerUtils.success('✅ 导出文件验证通过');
    } else {
      LoggerUtils.warn('导出文件条目数量不匹配');
    }
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
    const baseMessages = LanguageFileManager.getMessages(this.config, false);
    // 定制目录：桶式同样需合并 customDir，否则定制覆盖会被静默丢弃（与 performFlatExport 对称）。
    const customMessages = customLocaleDir
      ? LanguageFileManager.getMessages(this.config, true)
      : ({} as ReturnType<typeof LanguageFileManager.getMessages>);

    // 冲突检测：定制包 key 不应与基础包重复（与 performFlatExport 同口径）
    if (customLocaleDir) {
      LoggerUtils.info('🔍 检查语言包冲突...');
      const conflictsByLocale: Record<string, string[]> = {};
      let totalConflicts = 0;
      for (const locale of allLocales) {
        const conflicts = FileUtils.findConflictingKeys(
          (baseMessages[locale] ?? {}) as LocaleMap,
          (customMessages[locale] ?? {}) as LocaleMap,
        );
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

    // 合并 base + custom（custom 覆盖，冲突已在上方拦截，正常为并集）
    const mergedByLocale = new Map<string, LocaleMap>();
    for (const locale of allLocales) {
      mergedByLocale.set(locale, {
        ...((baseMessages[locale] ?? {}) as LocaleMap),
        ...((customMessages[locale] ?? {}) as LocaleMap),
      });
    }

    // 用合并后的 source 文本驱动分桶（与 generate/merge 一致；含定制 source key）
    const sourceFlat = mergedByLocale.get(sourceLocale)!;
    const keyBucketMap = LanguageFileManager.buildKeyBucketMap(this.config, sourceFlat);
    const bucketCount = new Set(Object.values(keyBucketMap)).size;

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
    for (const locale of allLocales) {
      LanguageFileManager.writeLocaleFile(
        exportConfig,
        false,
        mergedByLocale.get(locale)!,
        locale,
        keyBucketMap,
      );
    }

    const bucketNames = [...new Set(Object.values(keyBucketMap))].sort();

    // 每个语言目录生成 index.json，便于消费方按需懒加载
    this.writeLocaleIndexFiles(outputDir, allLocales, bucketNames, buckets.layout);

    if (buckets.emitManifest) {
      this.writeManifest(
        outputDir,
        keyBucketMap,
        allLocales,
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
    bucketNames: string[],
    layout: 'by-locale' | 'by-bucket',
  ): void {
    if (layout !== 'by-locale') return;
    for (const locale of locales) {
      FileUtils.writeJsonFile(path.join(outputDir, locale, 'index.json'), {
        buckets: bucketNames,
      });
    }
  }

  private writeManifest(
    outputDir: string,
    keyBucketMap: Record<string, string>,
    locales: string[],
    layout: 'by-locale' | 'by-bucket',
    defaultBucket: string,
  ): void {
    const bucketNames = [...new Set(Object.values(keyBucketMap))].sort();
    const files: Record<string, Record<string, string>> = {};

    if (layout === 'by-bucket') {
      for (const bucket of bucketNames) {
        files[bucket] = {};
        for (const locale of locales) {
          files[bucket][locale] = `${bucket}/${locale}.json`;
        }
      }
    } else {
      for (const locale of locales) {
        files[locale] = {};
        for (const bucket of bucketNames) {
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
    FileUtils.writeJsonFile(path.join(outputDir, 'manifest.json'), manifest);
    LoggerUtils.info(`📄 已生成 manifest.json，包含 ${bucketNames.length} 个桶`);
  }
}
