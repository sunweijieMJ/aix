import type { ResolvedConfig } from '../config';
import type { FrameworkAdapter } from '../adapters';
import { InteractiveUtils } from '../utils/interactive-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import { collectUsedKeys, matchesDynamicAllowlist } from '../utils/source-key-scanner';
import type { LocaleMap } from '../utils/types';
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
        if (k in flat) {
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
      if (k in map) {
        delete map[k];
        removed++;
      }
    }
    if (removed === 0) return;
    LanguageFileManager.writeLocaleFile(this.config, this.isCustom, map, locale);
    LoggerUtils.success(`✅ ${locale}: 删除 ${removed} 个 key`);
  }
}
