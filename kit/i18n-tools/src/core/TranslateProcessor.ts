import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { LLMClient } from '../utils/llm-client';
import { FileUtils } from '../utils/file-utils';
import { Glossary } from '../utils/glossary';
import { LoggerUtils } from '../utils/logger';
import type { Translations } from '../utils/types';
import { FileProcessor } from './FileProcessor';

/**
 * 翻译处理器
 * 负责处理待翻译文件的翻译工作
 */
export class TranslateProcessor extends FileProcessor {
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
    // 把 batchDelay 注入 LLMClient，使其在每次 chatCompletion 之前节流。
    // 之前该字段虽然有默认值且会被打印，但从未生效（"幽灵配置"）。
    this.llmClient.setBatchDelay(config.batchDelay);
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
      throw new Error(`待翻译文件不存在: ${targetPath}，请先运行 pick 命令生成。`);
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

    // LLM 调用前用词表做二次拦截，命中条目直接落盘，避免无谓的 API 调用。
    const glossaryFilled = this.applyGlossary(data);
    if (glossaryFilled > 0) {
      LoggerUtils.info(`📚 词表预填 ${glossaryFilled} 条，剩余条目走 LLM`);
      FileUtils.writeJsonFile(targetPath, data);
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

  /**
   * 加载词表并直接填入 data 中目标语种为空的条目。
   * 返回填入的条目数；词表未配置或无命中时为 0。
   *
   * 注意：此处只处理"目标语种缺失"的情况；override='always' 的覆盖策略由
   * pick 阶段统一负责，避免两处都做覆盖导致语义模糊。
   */
  private applyGlossary(data: Translations): number {
    const glossary = Glossary.load(this.config);
    if (!glossary) return 0;

    const sourceLocale = this.config.locale.source;
    const targetLocale = this.config.locale.target;
    const { normalize } = this.config.glossary;
    let filled = 0;

    for (const item of Object.values(data)) {
      if (item[targetLocale]?.trim()) continue;
      const src = item[sourceLocale];
      if (typeof src !== 'string' || !src) continue;
      const hit = Glossary.lookup(glossary, src, targetLocale, normalize);
      if (hit !== undefined) {
        item[targetLocale] = hit;
        filled++;
      }
    }

    return filled;
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
    failedBatches: number[];
  }> {
    const batches = this.chunkData(toTranslate, this.batchConfig.size);
    let totalTranslated = 0;
    let successBatches = 0;
    const failedBatches: number[] = [];

    LoggerUtils.info(`📦 共 ${batches.length} 个批次，使用并发处理`);
    LoggerUtils.info(`🔄 最大并发数: ${this.llmClient.getConcurrencyStatus().maxConcurrency}`);

    const translatedBatches = await this.llmClient.batchTranslate(batches, (current, total) => {
      LoggerUtils.info(
        `📈 翻译进度: ${current}/${total} (${Math.round((current / total) * 100)}%)`,
      );
    });

    for (let i = 0; i < translatedBatches.length; i++) {
      const translatedBatch = translatedBatches[i];
      if (!translatedBatch) {
        // LLM 端整批返回 null/undefined，记为失败以便上层感知
        failedBatches.push(i + 1);
        continue;
      }

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
        failedBatches.push(i + 1);
      }
    }

    // 统一写入文件（即便部分批次失败，已成功的翻译也会持久化，便于断点续翻）
    FileUtils.writeJsonFile(filePath, currentData);

    return { totalTranslated, successBatches, totalBatches: batches.length, failedBatches };
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
    failedBatches: number[];
  }): void {
    LoggerUtils.info(`\n📊 翻译结果统计:`);
    LoggerUtils.info(`   - 总批次数: ${result.totalBatches}`);
    LoggerUtils.info(`   - 成功批次数: ${result.successBatches}`);
    LoggerUtils.info(`   - 新翻译条目: ${result.totalTranslated}`);
    if (result.failedBatches.length > 0) {
      LoggerUtils.warn(
        `   - ⚠️ 失败批次（${result.failedBatches.length} 个）: [${result.failedBatches.join(', ')}]`,
      );
      LoggerUtils.warn(
        `   提示: 已成功的翻译已写入文件；可重新运行 translate 命令对剩余条目断点续翻。`,
      );
    }
    LoggerUtils.success(`\n✅ 翻译操作完成`);
  }
}
