import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { LLMClient } from '../utils/llm-client';
import { FileUtils } from '../utils/file-utils';
import { LoggerUtils } from '../utils/logger';
import type { Translations } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';

/**
 * 翻译处理器
 * 负责处理待翻译文件的翻译工作
 */
export class TranslateProcessor extends BaseProcessor {
  private llmClient: LLMClient;
  private batchConfig: { size: number; delay: number };

  constructor(config: ResolvedConfig, isCustom: boolean = false) {
    super(config, isCustom);
    this.llmClient = new LLMClient(
      config.llm.translation,
      config.concurrency.translation,
      config.locale,
      config.prompts,
    );
    this.batchConfig = {
      size: config.batchSize,
      delay: config.batchDelay,
    };
  }

  protected getOperationName(): string {
    return '翻译';
  }

  async execute(filePath?: string): Promise<void> {
    return this.executeWithLifecycle(() => this._execute(filePath));
  }

  private async _execute(filePath?: string): Promise<void> {
    const targetPath = filePath || FileUtils.getUntranslatedPath(this.config, this.isCustom);

    if (!fs.existsSync(targetPath)) {
      LoggerUtils.error(`文件不存在: ${targetPath}`);
      LoggerUtils.info('请先运行 pick 命令生成待翻译文件。');
      return;
    }

    const data = FileUtils.safeLoadJsonFile<Translations>(targetPath, {
      errorMessage: '读取待翻译文件失败',
      logSuccess: true,
    });
    const totalCount = Object.keys(data).length;

    if (totalCount === 0) {
      LoggerUtils.warn('文件为空，无需处理。');
      return;
    }

    const toTranslate = this.filterUntranslatedItems(data);
    const needsTranslation = Object.keys(toTranslate).length;

    if (needsTranslation === 0) {
      LoggerUtils.warn('所有条目已翻译完成。');
      return;
    }

    LoggerUtils.info(`📋 总条目: ${totalCount}, 需翻译: ${needsTranslation}`);
    LoggerUtils.info(
      `⚙️  批次设置: ${this.batchConfig.size} 条目/批次, ${this.batchConfig.delay}ms 延时`,
    );

    const result = await this.performBatchTranslation(toTranslate, data, targetPath);
    this.logTranslationResult(result);
  }

  private filterUntranslatedItems(data: Translations): Translations {
    const targetLocale = this.config.locale.target;
    const toTranslate: Translations = {};
    for (const [key, item] of Object.entries(data)) {
      if (!item[targetLocale]?.trim()) {
        toTranslate[key] = item;
      }
    }
    return toTranslate;
  }

  private async performBatchTranslation(
    toTranslate: Translations,
    currentData: Translations,
    filePath: string,
  ): Promise<{
    totalTranslated: number;
    successBatches: number;
    totalBatches: number;
  }> {
    const batches = this.chunkData(toTranslate, this.batchConfig.size);
    let totalTranslated = 0;
    let successBatches = 0;

    LoggerUtils.info(`📦 共 ${batches.length} 个批次，使用并发处理`);
    LoggerUtils.info(`🔄 最大并发数: ${this.llmClient.getConcurrencyStatus().maxConcurrency}`);

    const translatedBatches = await this.llmClient.batchTranslate(batches, (current, total) => {
      LoggerUtils.info(
        `📈 翻译进度: ${current}/${total} (${Math.round((current / total) * 100)}%)`,
      );
    });

    for (let i = 0; i < translatedBatches.length; i++) {
      const translatedBatch = translatedBatches[i];
      if (!translatedBatch) continue;

      try {
        const translated = this.processBatchResult(
          currentData,
          translatedBatch,
          batches[i]!,
          i,
          batches.length,
        );
        totalTranslated += translated;
        if (translated > 0) {
          successBatches++;
        }
      } catch (error) {
        LoggerUtils.error(
          `批次 ${i + 1} 结果处理失败:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    // 统一写入文件
    FileUtils.createOrEmptyFile(filePath, JSON.stringify(currentData, null, 2));

    return { totalTranslated, successBatches, totalBatches: batches.length };
  }

  private chunkData(data: Translations, chunkSize: number): Translations[] {
    const entries = Object.entries(data);
    const chunks: Translations[] = [];
    for (let i = 0; i < entries.length; i += chunkSize) {
      chunks.push(Object.fromEntries(entries.slice(i, i + chunkSize)));
    }
    return chunks;
  }

  private processBatchResult(
    currentData: Translations,
    translatedBatch: Translations,
    originalBatch: Translations,
    batchIndex: number,
    totalBatches: number,
  ): number {
    LoggerUtils.info(`🔄 处理批次 ${batchIndex + 1}/${totalBatches} 的翻译结果...`);

    if (typeof translatedBatch !== 'object' || translatedBatch === null) {
      throw new Error(`批次 ${batchIndex + 1} 翻译结果格式错误`);
    }

    const translatedCount = this.mergeTranslations(currentData, originalBatch, translatedBatch);
    LoggerUtils.success(`✅ 批次 ${batchIndex + 1} 结果处理完成，翻译 ${translatedCount} 个条目`);
    return translatedCount;
  }

  /**
   * 将翻译结果合并到内存数据中（纯内存操作，不涉及文件 I/O）
   */
  private mergeTranslations(
    currentData: Translations,
    originalBatch: Translations,
    translatedBatch: Translations,
  ): number {
    let translatedCount = 0;
    const targetLocale = this.config.locale.target;

    for (const [key] of Object.entries(originalBatch)) {
      const newEnValue = translatedBatch[key]?.[targetLocale];
      if (newEnValue?.trim()) {
        if (!currentData[key]) {
          currentData[key] = {};
        }
        currentData[key][targetLocale] = newEnValue;
        translatedCount++;
      }
    }

    return translatedCount;
  }

  private logTranslationResult(result: {
    totalTranslated: number;
    successBatches: number;
    totalBatches: number;
  }): void {
    LoggerUtils.info(`\n📊 翻译结果统计:`);
    LoggerUtils.info(`   - 总批次数: ${result.totalBatches}`);
    LoggerUtils.info(`   - 成功批次数: ${result.successBatches}`);
    LoggerUtils.info(`   - 新翻译条目: ${result.totalTranslated}`);
    LoggerUtils.success(`\n✅ 翻译操作完成`);
  }
}
