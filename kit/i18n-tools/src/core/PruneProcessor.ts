import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import type { FrameworkAdapter } from '../adapters';
import { FileUtils } from '../utils/file-utils';
import { InteractiveUtils } from '../utils/interactive-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import { collectUsedKeys, matchesDynamicAllowlist } from '../utils/source-key-scanner';
import type { LocaleMap, Translations } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';

export interface PruneOptions {
  /** 只预览不删 */
  dryRun: boolean;
  /** 跳过 y/N 确认 */
  ci: boolean;
}

/**
 * 清理孤儿 key：源码已不再引用的 locale key，从所有 locale 文件删除。
 * 与 doctor 的 orphan 判据同一口径（共享 source-key-scanner）。删 source 中文一起删，
 * 恢复靠 git。不动 translations.json/untranslated.json（下次 pick 自动重生）。
 */
export class PruneProcessor extends BaseProcessor {
  private readonly options: PruneOptions;

  constructor(
    config: ResolvedConfig,
    isCustom: boolean = false,
    adapter?: FrameworkAdapter,
    options: PruneOptions = { dryRun: false, ci: false },
  ) {
    super(config, isCustom, adapter);
    this.options = options;
  }

  protected getOperationName(): string {
    return '清理孤儿 key';
  }

  async execute(): Promise<void> {
    return this.executeWithLifecycle(() => this.run());
  }

  private async run(): Promise<void> {
    const usedKeys = collectUsedKeys(this.config, this.adapter);
    const sourceLocale = this.config.locales.source;
    // 损坏守卫：桶式与单文件口径不同。
    //   - 单文件：readLocaleFile 对「解析失败」返回 null（与「文件不存在 → {}」区分），下方据此中止。
    //   - 桶式：readLocaleFile 会把损坏桶经 safeLoadJsonFile 静默降级为 {}、永不返回 null，
    //     故 null 守卫对桶式失效。必须用 findCorruptBucketFile 单独探测（与 Pick/Merge 一致），
    //     否则会基于残缺 source 误判孤儿，并把损坏桶静默改名 .bak、源 key 从活跃 locale 消失（Bug #2）。
    //
    //   守卫覆盖 source + 所有 target：pruneLocale 会对每个 locale 都删除并整体重写桶文件，
    //   target 桶损坏同样会被静默降级为 {}、命中孤儿后触发重写、损坏桶被改名 .bak 致 key 丢失。
    //   只守 source 会在 target 桶损坏时重蹈 Bug #2。
    // 探测口径（桶式 / 遗留单文件 / 单文件）统一收口于 findCorruptLocale。
    LanguageFileManager.assertLocalesNotCorrupt(
      this.config,
      this.isCustom,
      [sourceLocale, ...this.config.locales.targets],
      {
        checkLegacy: true,
        buildMessage: (locale, file) =>
          `locale「${locale}」解析失败：${file}，已中止 prune 以防误判孤儿 / 误删 key。请先修复 JSON 格式。`,
      },
    );
    // 守卫已确保 source 非损坏，readLocaleFile 不会返回 null（仅「不存在/空 → {}」或解析结果）。
    const sourceMap =
      LanguageFileManager.readLocaleFile(this.config, this.isCustom, sourceLocale) ?? {};

    const orphans = Object.keys(sourceMap).filter(
      (key) => !usedKeys.has(key) && !matchesDynamicAllowlist(this.config, key),
    );

    LoggerUtils.info(
      `🔍 源码引用 ${usedKeys.size} 个 key，source locale 共 ${Object.keys(sourceMap).length} 个`,
    );
    if (orphans.length === 0) {
      LoggerUtils.success('✅ 没有孤儿 key，无需清理');
      return;
    }
    LoggerUtils.info(`🗑️  将删除 ${orphans.length} 个孤儿 key：`);
    orphans.slice(0, 20).forEach((k) => LoggerUtils.info(`   - ${k}`));
    if (orphans.length > 20) LoggerUtils.info(`   … 其余 ${orphans.length - 20} 个`);

    if (this.options.dryRun) {
      LoggerUtils.info('🧪 --dry-run：仅预览，未删除');
      return;
    }
    if (!this.options.ci) {
      const ok = await InteractiveUtils.promptForGenericConfirmation(
        `确认从所有 locale 删除这 ${orphans.length} 个孤儿 key？`,
      );
      if (!ok) {
        LoggerUtils.warn('操作已取消');
        return;
      }
    }

    const orphanSet = new Set(orphans);
    const locales = [sourceLocale, ...this.config.locales.targets];
    for (const locale of locales) {
      this.pruneLocale(locale, orphanSet);
    }

    // 中间字典文件（translations.json / untranslated.json）里的孤儿也一并删除，
    // 与 locale 保持一致，避免遗留半清理状态（不依赖事后再跑 pick 自愈）。
    this.pruneDictionaryFile(FileUtils.getTranslatedPath(this.config, this.isCustom), orphanSet);
    this.pruneDictionaryFile(FileUtils.getUntranslatedPath(this.config, this.isCustom), orphanSet);
  }

  /** 从 translations.json / untranslated.json（{key: {locale: value}} 字典）删除孤儿 key。 */
  private pruneDictionaryFile(filePath: string, orphanSet: Set<string>): void {
    if (!fs.existsSync(filePath)) return;
    const data = FileUtils.safeLoadJsonFile<Translations>(filePath, { silent: true });
    let removed = 0;
    for (const k of orphanSet) {
      // 用 hasOwnProperty.call 而非 `in`：`in` 走原型链，孤儿 key 恰为 'constructor'/
      // 'toString' 等 Object.prototype 同名成员时会假命中，虚增 removed 并触发无谓重写。
      // 与 Doctor/GenerateProcessor.writePlan 的口径一致。
      if (Object.prototype.hasOwnProperty.call(data, k)) {
        delete data[k];
        removed++;
      }
    }
    if (removed === 0) return;
    FileUtils.writeTranslationsFile(filePath, data);
    LoggerUtils.success(`✅ ${path.basename(filePath)}: 删除 ${removed} 个 key`);
  }

  /** 从单个 locale 删除孤儿 key 并写回（桶式复用既有桶写 + 孤儿桶清理）。 */
  private pruneLocale(locale: string, orphanSet: Set<string>): void {
    if (this.config.buckets) {
      const { flat, keyBucketMap } = LanguageFileManager.readBucketedLocaleWithBucketMap(
        this.config,
        this.isCustom,
        locale,
      );
      let removed = 0;
      for (const k of orphanSet) {
        // hasOwnProperty.call 而非 `in`（避免原型链假命中，见 pruneDictionaryFile 注释）。
        if (Object.prototype.hasOwnProperty.call(flat, k)) {
          delete flat[k];
          delete keyBucketMap[k];
          removed++;
        }
      }
      if (removed === 0) return;
      LanguageFileManager.writeLocaleFile(this.config, this.isCustom, flat, locale, keyBucketMap);
      LoggerUtils.success(`✅ ${locale}: 删除 ${removed} 个 key`);
      return;
    }

    const map: LocaleMap =
      LanguageFileManager.readLocaleFile(this.config, this.isCustom, locale) ?? {};
    let removed = 0;
    for (const k of orphanSet) {
      // hasOwnProperty.call 而非 `in`（避免原型链假命中，见 pruneDictionaryFile 注释）。
      if (Object.prototype.hasOwnProperty.call(map, k)) {
        delete map[k];
        removed++;
      }
    }
    if (removed === 0) return;
    LanguageFileManager.writeLocaleFile(this.config, this.isCustom, map, locale);
    LoggerUtils.success(`✅ ${locale}: 删除 ${removed} 个 key`);
  }
}
