import OpenAI from 'openai';
import type { LLMConfig, LocaleConfig, PromptsConfig } from '../config';
import {
  DEFAULT_LLM_MAX_RETRIES,
  DEFAULT_LLM_TEMPERATURE,
  DEFAULT_LLM_TIMEOUT,
} from '../config';
import { ConcurrencyController } from './concurrency-controller';
import { LoggerUtils } from './logger';
import {
  getIdGenerationSystemPrompt,
  getIdGenerationUserPrompt,
  getTranslationSystemPrompt,
  getTranslationUserPrompt,
} from './prompts';
import type { Translations } from './types';

/**
 * LLM 客户端
 */
export class LLMClient {
  private openai: OpenAI;
  private model: string;
  private temperature: number;
  private concurrencyController: ConcurrencyController;
  private locale?: LocaleConfig;
  private prompts?: PromptsConfig;

  constructor(
    config: LLMConfig,
    maxConcurrency: number = 5,
    locale?: LocaleConfig,
    prompts?: PromptsConfig,
  ) {
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout ?? DEFAULT_LLM_TIMEOUT,
      maxRetries: config.maxRetries ?? DEFAULT_LLM_MAX_RETRIES,
    });
    this.model = config.model;
    this.temperature = config.temperature ?? DEFAULT_LLM_TEMPERATURE;
    this.concurrencyController = new ConcurrencyController(maxConcurrency);
    this.locale = locale;
    this.prompts = prompts;
  }

  /**
   * 调用 LLM chat completion
   */
  private async chatCompletion(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.temperature,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('LLM 返回内容为空');
    }
    return content;
  }

  /**
   * 清理 LLM 返回的 JSON 文本（去除 markdown code fence 等）
   */
  private cleanJsonResponse(text: string): string {
    let cleaned = text.trim();
    // 去除 markdown code fence
    if (cleaned.startsWith('```')) {
      cleaned = cleaned
        .replace(/^```(?:json)?\s*\n?/, '')
        .replace(/\n?```\s*$/, '');
    }
    return cleaned.trim();
  }

  /**
   * 生成语义ID列表（支持并发分批）
   */
  async generateSemanticIds(
    textList: string[],
    batchSize: number = 10,
  ): Promise<string[]> {
    if (textList.length === 0) return [];

    if (textList.length <= batchSize) {
      return this.generateSemanticIdsBatch(textList);
    }

    const batches: string[][] = [];
    const totalBatches = Math.ceil(textList.length / batchSize);

    for (let i = 0; i < totalBatches; i++) {
      const startIndex = i * batchSize;
      const endIndex = Math.min(startIndex + batchSize, textList.length);
      batches.push(textList.slice(startIndex, endIndex));
    }

    LoggerUtils.info(
      `📊 需要分 ${totalBatches} 批次处理，每批 ${batchSize} 个文本`,
    );
    LoggerUtils.info(
      `🔄 使用并发处理，最大并发数: ${this.concurrencyController.getStatus().maxConcurrency}`,
    );

    const batchPromises = batches.map((batch, index) =>
      this.concurrencyController.add(async () => {
        LoggerUtils.info(
          `🔄 正在处理第 ${index + 1}/${totalBatches} 批次 (${batch.length} 个文本)...`,
        );

        try {
          const results = await this.generateSemanticIdsBatch(batch);
          LoggerUtils.success(`✅ 第 ${index + 1} 批次处理完成`);
          return results;
        } catch (error) {
          LoggerUtils.error(`❌ 第 ${index + 1} 批次处理失败:`, error);
          throw error;
        }
      }),
    );

    const settledResults = await Promise.allSettled(batchPromises);

    const failedBatches = settledResults.filter((r) => r.status === 'rejected');
    if (failedBatches.length > 0) {
      throw new Error(`${failedBatches.length}/${totalBatches} 个批次处理失败`);
    }

    const results = settledResults
      .filter(
        (r): r is PromiseFulfilledResult<string[]> => r.status === 'fulfilled',
      )
      .map((r) => r.value)
      .flat();

    LoggerUtils.success(
      `🎉 所有批次处理完成，共生成 ${results.length} 个语义ID`,
    );
    return results;
  }

  /**
   * 处理单个批次的语义ID生成
   */
  private async generateSemanticIdsBatch(
    textList: string[],
  ): Promise<string[]> {
    const rawContent = await this.chatCompletion(
      getIdGenerationSystemPrompt(this.locale, this.prompts),
      getIdGenerationUserPrompt(textList, this.locale, this.prompts),
    );

    try {
      const cleaned = this.cleanJsonResponse(rawContent);
      const parsed = JSON.parse(cleaned);

      if (!parsed.id_list || !Array.isArray(parsed.id_list)) {
        throw new Error('LLM 返回格式错误：缺少 id_list 数组');
      }

      return parsed.id_list as string[];
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `LLM 返回的 JSON 解析失败: ${rawContent.slice(0, 200)}`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  /**
   * 批量翻译（支持并发）
   */
  async batchTranslate(
    batches: Translations[],
    onProgress?: (current: number, total: number) => void,
  ): Promise<Translations[]> {
    if (batches.length === 0) return [];

    LoggerUtils.info(`🔄 开始批量翻译，共 ${batches.length} 批次`);
    LoggerUtils.info(
      `🔄 使用并发处理，最大并发数: ${this.concurrencyController.getStatus().maxConcurrency}`,
    );

    const results: Translations[] = new Array(batches.length);
    let successCount = 0;
    let failedCount = 0;

    const failedIndices: number[] = [];

    const batchPromises = batches.map((batch, index) =>
      this.concurrencyController.add(async () => {
        const jsonText = JSON.stringify(batch, null, 2);

        try {
          const translatedJsonText = await this.translateJson(jsonText);
          const translatedBatch: Translations = JSON.parse(translatedJsonText);
          results[index] = translatedBatch;
          successCount++;

          if (onProgress) {
            onProgress(successCount + failedCount, batches.length);
          }

          LoggerUtils.success(
            `✅ 翻译批次 ${index + 1}/${batches.length} 完成`,
          );
        } catch (error) {
          LoggerUtils.error(`❌ 翻译批次 ${index + 1} 失败:`, error);
          failedCount++;
          failedIndices.push(index);

          if (onProgress) {
            onProgress(successCount + failedCount, batches.length);
          }
        }
      }),
    );

    await Promise.all(batchPromises);

    // 从结果中移除失败的批次（保留为 undefined），调用方需要处理
    // 用原始数据填充失败批次，但标记 en-US 为空以避免误写入
    for (const idx of failedIndices) {
      results[idx] = batches[idx]!;
    }

    if (failedCount > 0) {
      LoggerUtils.warn(
        `⚠️ 批量翻译完成: ${successCount} 个批次成功, ${failedCount} 个批次失败`,
      );
    } else {
      LoggerUtils.success(`🎉 批量翻译完成，全部 ${successCount} 个批次成功`);
    }
    return results;
  }

  /**
   * 翻译JSON文本
   */
  async translateJson(jsonText: string): Promise<string> {
    const rawContent = await this.chatCompletion(
      getTranslationSystemPrompt(this.locale, this.prompts),
      getTranslationUserPrompt(jsonText, this.locale, this.prompts),
    );

    try {
      const cleaned = this.cleanJsonResponse(rawContent);
      // 验证返回的是有效 JSON
      JSON.parse(cleaned);
      return cleaned;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `LLM 翻译返回的 JSON 解析失败: ${rawContent.slice(0, 200)}`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  /**
   * 获取并发控制器状态
   */
  getConcurrencyStatus(): {
    running: number;
    queued: number;
    maxConcurrency: number;
  } {
    return this.concurrencyController.getStatus();
  }

  /**
   * 调整并发数
   */
  adjustConcurrency(newMaxConcurrency: number): void {
    if (newMaxConcurrency < 1) {
      LoggerUtils.warn(`⚠️ 无效的并发数: ${newMaxConcurrency}，必须大于0`);
      return;
    }
    LoggerUtils.info(
      `🔧 调整最大并发数: ${this.concurrencyController.getStatus().maxConcurrency} -> ${newMaxConcurrency}`,
    );
    this.concurrencyController = new ConcurrencyController(newMaxConcurrency);
  }

  /**
   * 为文件生成语义ID
   */
  async generateSemanticIdsForFiles(
    fileGroups: Record<string, string[]>,
    skipLLM: boolean = false,
  ): Promise<Record<string, string[]>> {
    const results: Record<string, string[]> = {};

    if (skipLLM) {
      LoggerUtils.info('🔄 检测到 --skip-llm，将由调用方使用本地ID生成策略...');
      for (const filePath of Object.keys(fileGroups)) {
        results[filePath] = [];
      }
      return results;
    }

    LoggerUtils.info(
      `🚀 开始通过LLM为 ${Object.keys(fileGroups).length} 个文件生成语义ID...`,
    );

    const promises = Object.entries(fileGroups).map(([filePath, texts]) =>
      this.concurrencyController.add(async () => {
        LoggerUtils.info(
          `🔄 正在处理文件: ${filePath} (${texts.length} 个文本)...`,
        );

        try {
          const allIds = await this.generateSemanticIds(texts);
          results[filePath] = allIds;
          LoggerUtils.success(
            `✅ 文件 ${filePath} 的语义ID生成完成，共 ${allIds.length} 个ID`,
          );
        } catch {
          LoggerUtils.warn(
            `⚠️ 文件 ${filePath} 的LLM API调用失败，将由调用方使用本地ID生成兜底`,
          );
          results[filePath] = [];
        }
      }),
    );

    await Promise.all(promises);
    LoggerUtils.success(
      `🎉 所有文件的语义ID生成完成，共 ${Object.values(results).flat().length} 个ID`,
    );
    return results;
  }
}
