import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { LLMClient } from '../utils/llm-client';
import { FileUtils } from '../utils/file-utils';
import { Glossary } from '../utils/glossary';
import { LoggerUtils } from '../utils/logger';
import { extractPlaceholderNames } from '../utils/placeholder-utils';
import type { Translations } from '../utils/types';
import { FileProcessor } from './FileProcessor';

/**
 * 翻译处理器
 *
 * 多目标语种处理约定：
 *  - 外层 for target 循环：每个 target 独立做 glossary / chunkData / batchTranslate / merge
 *  - filterUntranslatedItems 为 per-target 判定
 *  - 占位符校验在 mergeTranslations 内部针对当前 target 应用
 */
export class TranslateProcessor extends FileProcessor {
  private llmClient: LLMClient;
  private batchConfig: { size: number; delay: number };

  constructor(config: ResolvedConfig, isCustom: boolean = false) {
    super(config, isCustom);
    // LLM 任务级配置（concurrency/batchSize/throttleMs/prompt）已内化在 task
    this.llmClient = new LLMClient(config.llm.translation, config.locales);
    this.batchConfig = {
      size: config.llm.translation.batchSize,
      delay: config.llm.translation.throttleMs,
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

    const targets = this.config.locales.targets;
    LoggerUtils.info(`📋 总条目: ${totalCount}，目标语种: ${targets.join(', ')}`);

    let totalNewlyTranslated = 0;
    let allSuccessBatches = 0;
    let allTotalBatches = 0;
    const allFailedBatches: string[] = [];

    for (const target of targets) {
      LoggerUtils.info(`\n══════ 翻译目标：${target} ══════`);

      // 词表预填（per-target）
      const glossaryFilled = this.applyGlossary(data, target);
      if (glossaryFilled > 0) {
        LoggerUtils.info(`📚 [${target}] 词表预填 ${glossaryFilled} 条，剩余条目走 LLM`);
        FileUtils.writeTranslationsFile(targetPath, data);
      }

      const toTranslate = this.filterUntranslatedItems(data, target);
      const needsTranslation = Object.keys(toTranslate).length;

      if (needsTranslation === 0) {
        LoggerUtils.warn(`[${target}] 所有条目已翻译完成。`);
        continue;
      }

      LoggerUtils.info(`📋 [${target}] 需翻译: ${needsTranslation}`);
      LoggerUtils.info(
        `⚙️  批次设置: ${this.batchConfig.size} 条目/批次, ${this.batchConfig.delay}ms 延时`,
      );

      const result = await this.performBatchTranslation(toTranslate, data, targetPath, target);
      totalNewlyTranslated += result.totalTranslated;
      allSuccessBatches += result.successBatches;
      allTotalBatches += result.totalBatches;
      for (const idx of result.failedBatches) {
        allFailedBatches.push(`${target}#${idx}`);
      }

      this.logTargetResult(target, result);
    }

    this.logTranslationSummary({
      totalTranslated: totalNewlyTranslated,
      successBatches: allSuccessBatches,
      totalBatches: allTotalBatches,
      failedBatches: allFailedBatches,
      targets,
    });

    // 全部批次失败时抛错（非零退出），与 restore（failedFiles>0）/ doctor（CI error>0）对齐，
    // 避免 CI 把「所有翻译都失败」误判为成功（Bug B6）。部分失败（仍有成功）不抛错，
    // 保留断点续翻设计——失败明细已落 RunReport，重跑会继续翻译剩余条目。
    if (allFailedBatches.length > 0 && allSuccessBatches === 0) {
      throw new Error(
        `翻译全部 ${allFailedBatches.length} 个批次均失败（0 个成功），已中止。详见 RunReport 失败明细。`,
      );
    }
  }

  /**
   * 加载词表并直接填入 data 中目标语种为空的条目。
   * 返回填入的条目数；词表未配置或无命中时为 0。
   */
  private applyGlossary(data: Translations, targetLocale: string): number {
    const glossary = Glossary.load(this.config);
    if (!glossary) return 0;

    const sourceLocale = this.config.locales.source;
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

  private filterUntranslatedItems(data: Translations, targetLocale: string): Translations {
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
    targetLocale: string,
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

    LoggerUtils.info(`📦 [${targetLocale}] 共 ${batches.length} 个批次，使用并发处理`);
    LoggerUtils.info(`🔄 最大并发数: ${this.llmClient.getConcurrencyStatus().maxConcurrency}`);

    const translatedBatches = await this.llmClient.batchTranslate(
      batches,
      targetLocale,
      (current, total) => {
        LoggerUtils.info(
          `📈 [${targetLocale}] 翻译进度: ${current}/${total} (${Math.round((current / total) * 100)}%)`,
        );
      },
    );

    for (let i = 0; i < translatedBatches.length; i++) {
      const translatedBatch = translatedBatches[i];
      if (!translatedBatch) {
        failedBatches.push(i + 1);
        this.report.addFailure({
          stage: 'translate',
          batchIndex: i + 1,
          keys: Object.keys(batches[i] ?? {}),
          error: new Error(`LLM 返回空批次（null/undefined）[${targetLocale}]`),
        });
        continue;
      }

      try {
        const translated = this.processBatchResult(
          currentData,
          translatedBatch,
          batches[i]!,
          i,
          batches.length,
          targetLocale,
        );
        totalTranslated += translated;
        if (translated > 0) {
          successBatches++;
        } else {
          // LLM 返回了结构合法的批次，但 0 条写入（全部条目因占位符不一致被 mergeTranslations
          // 丢弃，或 LLM 未返回任何译文）。此前这种「产出但全拒」既不计 success 也不计 failed
          // → 不进 RunReport、不触发退出守卫；当所有批次/所有 target 都如此时，进程会以 exit 0
          // 退出却什么都没写。计为失败并上报，让 CI 能发现「翻译跑了但一条没落」。
          failedBatches.push(i + 1);
          this.report.addFailure({
            stage: 'translate',
            batchIndex: i + 1,
            keys: Object.keys(batches[i] ?? {}),
            error: new Error(
              `批次 ${i + 1} 未产出任何可用翻译（0 条写入；可能占位符不一致被丢弃或 LLM 未返回译文）[${targetLocale}]`,
            ),
          });
        }
      } catch (error) {
        LoggerUtils.error(
          `[${targetLocale}] 批次 ${i + 1} 结果处理失败:`,
          error instanceof Error ? error.message : error,
        );
        failedBatches.push(i + 1);
        this.report.addFailure({
          stage: 'translate',
          batchIndex: i + 1,
          keys: Object.keys(batches[i] ?? {}),
          error,
        });
      }
    }

    // 写入文件（每个 target 完成后落盘一次，便于断点续翻）
    FileUtils.writeTranslationsFile(filePath, currentData);

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
    targetLocale: string,
  ): number {
    LoggerUtils.info(
      `🔄 [${targetLocale}] 处理批次 ${batchIndex + 1}/${totalBatches} 的翻译结果...`,
    );

    if (typeof translatedBatch !== 'object' || translatedBatch === null) {
      throw new Error(`批次 ${batchIndex + 1} 翻译结果格式错误`);
    }

    const translatedCount = this.mergeTranslations(
      currentData,
      originalBatch,
      translatedBatch,
      targetLocale,
    );
    LoggerUtils.success(
      `✅ [${targetLocale}] 批次 ${batchIndex + 1} 结果处理完成，翻译 ${translatedCount} 个条目`,
    );
    return translatedCount;
  }

  /**
   * 将翻译结果合并到内存数据中（纯内存操作）。
   *
   * 占位符一致性校验：占位符集合（按 key 集合而非序列）必须与源语保持一致；
   * 不一致则丢弃该条翻译，留待下一次断点续翻人工/重译处理。
   */
  private mergeTranslations(
    currentData: Translations,
    originalBatch: Translations,
    translatedBatch: Translations,
    targetLocale: string,
  ): number {
    let translatedCount = 0;
    let placeholderMismatches = 0;
    const sourceLocale = this.config.locales.source;

    for (const [key, originalItem] of Object.entries(originalBatch)) {
      const newValue = translatedBatch[key]?.[targetLocale];
      if (!newValue?.trim()) continue;

      const sourceText = originalItem[sourceLocale];
      if (typeof sourceText === 'string' && sourceText) {
        // 用深度感知的 extractPlaceholderNames（与 doctor 同一套）只比对顶层参数名：
        // 朴素正则 /\{([^{}]+)\}/ 无法处理 ICU `{count, plural, one {# item} ...}`，
        // 会误采子消息字面量（# item / # items），译文子消息随语言改变即被判失配、
        // 导致所有 plural/select 文案被永久丢弃、无法翻译。
        const expected = extractPlaceholderNames(sourceText);
        const actual = extractPlaceholderNames(newValue);
        if (!TranslateProcessor.placeholdersMatch(expected, actual)) {
          placeholderMismatches++;
          LoggerUtils.warn(
            `⚠️ [${targetLocale}] 占位符不匹配，丢弃翻译 [${key}]:\n` +
              `   源文: ${sourceText}\n` +
              `   译文: ${newValue}\n` +
              `   期望占位符: {${[...expected].join('}, {')}}\n` +
              `   实际占位符: {${[...actual].join('}, {')}}`,
          );
          continue;
        }
      }

      if (!currentData[key]) {
        currentData[key] = {};
      }
      currentData[key][targetLocale] = newValue;
      translatedCount++;
    }

    if (placeholderMismatches > 0) {
      LoggerUtils.warn(
        `   [${targetLocale}] 共丢弃 ${placeholderMismatches} 条因占位符被翻译而失效的结果，可重新运行 translate 续翻。`,
      );
    }

    return translatedCount;
  }

  private static placeholdersMatch(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const k of a) {
      if (!b.has(k)) return false;
    }
    return true;
  }

  private logTargetResult(
    target: string,
    result: {
      totalTranslated: number;
      successBatches: number;
      totalBatches: number;
      failedBatches: number[];
    },
  ): void {
    LoggerUtils.info(`\n📊 [${target}] 翻译结果:`);
    LoggerUtils.info(`   - 总批次数: ${result.totalBatches}`);
    LoggerUtils.info(`   - 成功批次数: ${result.successBatches}`);
    LoggerUtils.info(`   - 新翻译条目: ${result.totalTranslated}`);
    if (result.failedBatches.length > 0) {
      LoggerUtils.warn(
        `   - ⚠️ 失败批次（${result.failedBatches.length} 个）: [${result.failedBatches.join(', ')}]`,
      );
    }
  }

  private logTranslationSummary(result: {
    totalTranslated: number;
    successBatches: number;
    totalBatches: number;
    failedBatches: string[];
    targets: string[];
  }): void {
    LoggerUtils.info(`\n📊 整体翻译统计:`);
    LoggerUtils.info(`   - 处理目标语种: ${result.targets.join(', ')}`);
    LoggerUtils.info(`   - 总批次数: ${result.totalBatches}`);
    LoggerUtils.info(`   - 成功批次数: ${result.successBatches}`);
    LoggerUtils.info(`   - 新翻译条目（跨 target 总和）: ${result.totalTranslated}`);
    if (result.failedBatches.length > 0) {
      LoggerUtils.warn(
        `   - ⚠️ 失败批次（${result.failedBatches.length} 个，含 target 标识）: [${result.failedBatches.join(', ')}]`,
      );
      LoggerUtils.warn(
        `   提示: 已成功的翻译已写入文件；重新运行 translate 可对剩余条目断点续翻。`,
      );
    }
    LoggerUtils.success(`\n✅ 翻译操作完成`);
  }
}
