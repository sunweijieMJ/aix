import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { FileUtils } from '../utils/file-utils';
import { InteractiveUtils } from '../utils/interactive-utils';
import { LoggerUtils } from '../utils/logger';
import type { Translations } from '../utils/types';
import { decodeUtf8Strict, parseCsv } from '../utils/csv-utils';
import { FileProcessor } from './FileProcessor';

export interface CsvImportOptions {
  /** CSV 文件路径（必填） */
  input: string;
  /** 限定回写的目标语言；不传 = CSV 表头里命中的全部 target */
  langs?: string[];
  /** 只报告不写 */
  dryRun: boolean;
  /** 跳过 y/N 确认 */
  ci: boolean;
}

/**
 * CSV 回流处理器：把审核/翻译好的 CSV 写回 untranslated.json（= 人工版 translate）。
 *
 * 保守合并：非空译文覆盖；空单元格跳过保留原值；CSV 多余 key 警告不新建；
 * 源语言列忽略。写回前出预览报告，确认后用 writeJsonFile（内置原子写）落盘。
 */
export class CsvImportProcessor extends FileProcessor {
  private readonly options: CsvImportOptions;

  constructor(config: ResolvedConfig, isCustom: boolean, options: CsvImportOptions) {
    super(config, isCustom);
    this.options = options;
  }

  protected getOperationName(): string {
    return 'CSV 回流';
  }

  async execute(): Promise<void> {
    return this.executeWithLifecycle(() => this.run());
  }

  private async run(): Promise<void> {
    const rows = this.readRows();
    const header = rows[0];
    if (!header) {
      throw new Error(`[i18n-tools] CSV 为空：${this.options.input}`);
    }

    const keyIdx = header.indexOf('key');
    if (keyIdx === -1) {
      throw new Error(`[i18n-tools] CSV 缺少 "key" 列：${this.options.input}`);
    }
    const sourceLocale = this.config.locales.source;
    if (!header.includes(sourceLocale)) {
      throw new Error(`[i18n-tools] CSV 缺少源语言列 "${sourceLocale}"：${this.options.input}`);
    }

    // 表头里命中的目标语言列（按列名），可被 --langs 进一步收窄
    const targets = this.config.locales.targets;
    let langCols = header
      .map((name, idx) => ({ name, idx }))
      .filter((c) => targets.includes(c.name));
    if (this.options.langs && this.options.langs.length > 0) {
      langCols = langCols.filter((c) => this.options.langs!.includes(c.name));
    }
    if (langCols.length === 0) {
      throw new Error(`[i18n-tools] CSV 表头未匹配到任何目标语言列（${targets.join(', ')}）`);
    }

    // 同时加载两份字典：CSV 既可能来自 untranslated（待翻）导出，也可能来自 translations
    // （--source translations 审核已翻）导出。按 key 实际归属自动路由写回，避免「审核
    // translations 导出的 CSV 回流时全部命中 untranslated.json 的 if(!entry) 被静默丢弃」。
    const untranslatedPath = FileUtils.getUntranslatedPath(this.config, this.isCustom);
    const translatedPath = FileUtils.getTranslatedPath(this.config, this.isCustom);
    const untranslated = FileUtils.safeLoadJsonFile<Translations>(untranslatedPath, {
      errorMessage: '读取 untranslated.json 失败',
    });
    const translated = FileUtils.safeLoadJsonFile<Translations>(translatedPath, {
      errorMessage: '读取 translations.json 失败',
    });

    // 应用保守合并，收集统计
    let updated = 0;
    let skippedEmpty = 0;
    const missingKeys: string[] = [];
    let untranslatedDirty = false;
    let translatedDirty = false;

    for (const row of rows.slice(1)) {
      const key = (row[keyIdx] ?? '').trim();
      if (key === '') continue;
      // 路由：优先 untranslated（待翻流程主路径），否则落到 translations（审核流程）。
      // 二者 key 互斥（pick 按 hasUntranslated 二选一），不会双写。
      const inUntranslated = Object.prototype.hasOwnProperty.call(untranslated, key);
      const entry = inUntranslated ? untranslated[key] : translated[key];
      if (!entry) {
        missingKeys.push(key);
        continue;
      }
      for (const col of langCols) {
        const value = row[col.idx] ?? '';
        if (value.trim() === '') {
          skippedEmpty++;
          continue;
        }
        entry[col.name] = value;
        updated++;
        if (inUntranslated) untranslatedDirty = true;
        else translatedDirty = true;
      }
    }

    const writeTargets: string[] = [];
    if (untranslatedDirty) writeTargets.push(untranslatedPath);
    if (translatedDirty) writeTargets.push(translatedPath);

    this.reportPreview(
      writeTargets.length > 0 ? writeTargets : [untranslatedPath, translatedPath],
      langCols.map((c) => c.name),
      updated,
      skippedEmpty,
      missingKeys,
    );

    if (this.options.dryRun) {
      LoggerUtils.info('🧪 --dry-run：仅预览，未写回');
      return;
    }
    if (updated === 0) {
      LoggerUtils.warn('没有可写回的非空译文，跳过写盘');
      return;
    }
    if (!this.options.ci) {
      const ok = await InteractiveUtils.promptForGenericConfirmation(
        `确认写回 ${writeTargets.map((p) => FileUtils.getRelativePath(p)).join(' / ')}？`,
      );
      if (!ok) {
        LoggerUtils.warn('操作已取消');
        return;
      }
    }

    if (untranslatedDirty) FileUtils.writeTranslationsFile(untranslatedPath, untranslated);
    if (translatedDirty) FileUtils.writeTranslationsFile(translatedPath, translated);
    LoggerUtils.success(
      `✅ 已写回 ${updated} 处译文到 ${writeTargets.map((p) => FileUtils.getRelativePath(p)).join(' / ')}`,
    );
  }

  private readRows(): string[][] {
    if (!fs.existsSync(this.options.input)) {
      throw new Error(`[i18n-tools] CSV 文件不存在：${this.options.input}`);
    }
    const buf = fs.readFileSync(this.options.input);
    return parseCsv(decodeUtf8Strict(buf, this.options.input));
  }

  private reportPreview(
    targetPaths: string[],
    langs: string[],
    updated: number,
    skippedEmpty: number,
    missingKeys: string[],
  ): void {
    LoggerUtils.info('csv-import 预览：');
    LoggerUtils.info(`  ✏️  将更新   ${updated} 处译文 (${langs.join(', ')})`);
    LoggerUtils.info(`  ⏭️  忽略空值 ${skippedEmpty} 条`);
    if (missingKeys.length > 0) {
      const sample = missingKeys.slice(0, 5).join(' / ');
      LoggerUtils.warn(
        `  ⚠️  CSV 中存在但 untranslated.json / translations.json 均无此 key  ${missingKeys.length} 条：${sample}` +
          (missingKeys.length > 5 ? ' …' : ''),
      );
    }
    LoggerUtils.info(`  📄 目标文件: ${targetPaths.join(' / ')}`);
  }
}
