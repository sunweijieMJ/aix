import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { LOCALE_TYPE } from '../utils/constants';
import { DifyClient } from '../utils/dify-client';
import { FileUtils } from '../utils/file-utils';
import { LoggerUtils } from '../utils/logger';
import type { Translations } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';

/**
 * 翻译处理器
 * 负责处理待翻译文件的翻译工作
 */
export class TranslateProcessor extends BaseProcessor {
  private difyClient: DifyClient;
  private batchConfig: { size: number; delay: number };

  constructor(config: ResolvedConfig, isCustom: boolean = false) {
    super(config, isCustom);
    this.difyClient = new DifyClient(
      config.dify.translation,
      config.concurrency.translation,
    );
    this.batchConfig = {
      size: config.batchSize,
      delay: 500,
    };
  }

  protected getOperationName(): string {
    return '翻译';
  }

  async _execute(filePath?: string): Promise<void> {
    const targetPath =
      filePath || FileUtils.getUntranslatedPath(this.config, this.isCustom);

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

    const result = await this.performBatchTranslation(toTranslate, targetPath);
    this.logTranslationResult(result);
  }

  private filterUntranslatedItems(data: Translations): Translations {
    const toTranslate: Translations = {};
    for (const [key, item] of Object.entries(data)) {
      if (!item[LOCALE_TYPE.EN_US]?.trim()) {
        toTranslate[key] = item;
      }
    }
    return toTranslate;
  }

  private async performBatchTranslation(
    toTranslate: Translations,
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
    LoggerUtils.info(
      `🔄 最大并发数: ${this.difyClient.getConcurrencyStatus().maxConcurrency}`,
    );

    try {
      const translatedBatches = await this.difyClient.batchTranslate(
        batches,
        (current, total) => {
          LoggerUtils.info(
            `📈 翻译进度: ${current}/${total} (${Math.round((current / total) * 100)}%)`,
          );
        },
      );

      for (let i = 0; i < translatedBatches.length; i++) {
        try {
          const translated = await this.processBatchResult(
            translatedBatches[i]!,
            batches[i]!,
            i,
            batches.length,
            filePath,
          );
          totalTranslated += translated;
          successBatches++;
        } catch (error) {
          LoggerUtils.error(
            `批次 ${i + 1} 结果处理失败:`,
            error instanceof Error ? error.message : error,
          );
        }
      }
    } catch (error) {
      LoggerUtils.error(`并发翻译失败，回退到串行处理:`, error);

      for (let i = 0; i < batches.length; i++) {
        try {
          const translated = await this.processBatch(
            batches[i]!,
            i,
            batches.length,
            filePath,
          );
          totalTranslated += translated;
          successBatches++;

          if (i < batches.length - 1) {
            await this.delay(this.batchConfig.delay);
          }
        } catch (error) {
          LoggerUtils.error(
            `批次 ${i + 1} 失败:`,
            error instanceof Error ? error.message : error,
          );
        }
      }
    }

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

  private async processBatch(
    batch: Translations,
    batchIndex: number,
    totalBatches: number,
    filePath: string,
  ): Promise<number> {
    LoggerUtils.info(
      `🔄 处理批次 ${batchIndex + 1}/${totalBatches} (${Object.keys(batch).length} 条目)`,
    );

    try {
      const jsonText = JSON.stringify(batch, null, 2);
      const translatedJsonText = await this.difyClient.translateJson(jsonText);
      const translatedBatch: Translations = JSON.parse(translatedJsonText);

      if (typeof translatedBatch !== 'object' || translatedBatch === null) {
        throw new Error(`批次 ${batchIndex + 1} 翻译结果格式错误`);
      }

      const translatedCount = this.updateFileWithTranslations(
        filePath,
        batch,
        translatedBatch,
      );
      LoggerUtils.success(
        `✅ 批次 ${batchIndex + 1} 完成，翻译 ${translatedCount} 个条目`,
      );
      return translatedCount;
    } catch (error) {
      LoggerUtils.error(`批次 ${batchIndex + 1} 处理失败:`, error);
      throw error;
    }
  }

  private async processBatchResult(
    translatedBatch: Translations,
    originalBatch: Translations,
    batchIndex: number,
    totalBatches: number,
    filePath: string,
  ): Promise<number> {
    LoggerUtils.info(
      `🔄 处理批次 ${batchIndex + 1}/${totalBatches} 的翻译结果...`,
    );

    try {
      if (typeof translatedBatch !== 'object' || translatedBatch === null) {
        throw new Error(`批次 ${batchIndex + 1} 翻译结果格式错误`);
      }

      const translatedCount = this.updateFileWithTranslations(
        filePath,
        originalBatch,
        translatedBatch,
      );
      LoggerUtils.success(
        `✅ 批次 ${batchIndex + 1} 结果处理完成，翻译 ${translatedCount} 个条目`,
      );
      return translatedCount;
    } catch (error) {
      LoggerUtils.error(`批次 ${batchIndex + 1} 结果处理失败:`, error);
      throw error;
    }
  }

  private updateFileWithTranslations(
    filePath: string,
    originalBatch: Translations,
    translatedBatch: Translations,
  ): number {
    const currentData = FileUtils.safeLoadJsonFile<Translations>(filePath, {
      errorMessage: '读取翻译文件失败',
      silent: true,
    });
    let translatedCount = 0;

    for (const [key] of Object.entries(originalBatch)) {
      const newEnValue = translatedBatch[key]?.[LOCALE_TYPE.EN_US];
      if (newEnValue?.trim()) {
        currentData[key]![LOCALE_TYPE.EN_US] = newEnValue;
        translatedCount++;
      }
    }

    FileUtils.createOrEmptyFile(filePath, JSON.stringify(currentData, null, 2));
    return translatedCount;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
