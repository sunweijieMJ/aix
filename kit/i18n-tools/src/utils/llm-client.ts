import OpenAI from 'openai';
import type { LLMConfig, LocaleConfig, PromptsConfig } from '../config';
import { DEFAULT_LLM_MAX_RETRIES, DEFAULT_LLM_TEMPERATURE, DEFAULT_LLM_TIMEOUT } from '../config';
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
  /** 批次间最小间隔（毫秒），用于限流敏感的 LLM 端点 */
  private batchDelay: number = 0;

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
   * 设置批次间最小间隔（毫秒）。0 表示不延迟。
   *
   * 注意：仅在 add() 进入并发控制器之前生效——只有空闲槽位被占用时才会触发等待，
   * 因此对低并发（如 1）的限流场景更显著；高并发下 delay 会被并行性掩盖。
   */
  setBatchDelay(delayMs: number): void {
    this.batchDelay = Math.max(0, delayMs | 0);
  }

  /** 上一次实际派发请求的时间戳，用于实现 batchDelay 限流 */
  private lastCallTimestamp: number = 0;

  /**
   * 在发起请求前按 batchDelay 等待最小间隔。
   * 不依赖并发控制：每次请求保证与上一次至少相隔 batchDelay 毫秒。
   */
  private async throttle(): Promise<void> {
    if (this.batchDelay <= 0) return;
    const now = Date.now();
    const earliest = this.lastCallTimestamp + this.batchDelay;
    // 立即占位，避免并发任务挤在同一时间点
    this.lastCallTimestamp = Math.max(now, earliest);
    const wait = earliest - now;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  /**
   * 调用 LLM chat completion
   */
  private async chatCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
    await this.throttle();
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
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return cleaned.trim();
  }

  /**
   * 生成语义ID列表（支持并发分批）
   */
  async generateSemanticIds(textList: string[], batchSize: number = 10): Promise<string[]> {
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

    LoggerUtils.info(`📊 需要分 ${totalBatches} 批次处理，每批 ${batchSize} 个文本`);
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
      .filter((r): r is PromiseFulfilledResult<string[]> => r.status === 'fulfilled')
      .map((r) => r.value)
      .flat();

    LoggerUtils.success(`🎉 所有批次处理完成，共生成 ${results.length} 个语义ID`);
    return results;
  }

  /**
   * 处理单个批次的语义ID生成
   *
   * LLM 返回兼容两种格式：
   * 1) `{ id_list: string[] }`（位置数组，原始约定）
   * 2) `{ id_map: { [text]: id } }`（键值对，更鲁棒）
   *
   * 当 LLM 偶发乱序返回 id_list 时，位置数组会引发原文与 ID 错配。新增 id_map
   * 兼容路径作为防御层：若返回了 id_map，则按输入文本逐项查表，缺失项显式置为
   * 空字符串让上层使用本地兜底 ID 生成。
   */
  private async generateSemanticIdsBatch(textList: string[]): Promise<string[]> {
    const rawContent = await this.chatCompletion(
      getIdGenerationSystemPrompt(this.locale, this.prompts),
      getIdGenerationUserPrompt(textList, this.locale, this.prompts),
    );

    try {
      const cleaned = this.cleanJsonResponse(rawContent);
      const parsed = JSON.parse(cleaned);

      if (parsed && parsed.id_map && typeof parsed.id_map === 'object') {
        const map = parsed.id_map as Record<string, string>;
        return textList.map((t) => (typeof map[t] === 'string' ? map[t] : ''));
      }

      if (parsed.id_list && Array.isArray(parsed.id_list)) {
        // 防御 LLM 偶发返回 null/number 等非字符串元素：非字符串项置为空串，
        // 由上层（IdGenerator）走本地兜底 ID 生成路径。
        return (parsed.id_list as unknown[]).map((v) => (typeof v === 'string' ? v : ''));
      }

      throw new Error('LLM 返回格式错误：缺少 id_list 数组或 id_map 对象');
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`LLM 返回的 JSON 解析失败: ${rawContent.slice(0, 200)}`, { cause: error });
      }
      throw error;
    }
  }

  /**
   * 批量翻译（支持并发）
   *
   * 返回数组与输入 batches 一一对应；失败批次返回 `undefined`，调用方需自行
   * 跳过或重试。早前签名为 `Translations[]` 但实际写入 `undefined`，与类型不符，
   * 现明确为 `(Translations | undefined)[]`。
   */
  async batchTranslate(
    batches: Translations[],
    onProgress?: (current: number, total: number) => void,
  ): Promise<Array<Translations | undefined>> {
    if (batches.length === 0) return [];

    LoggerUtils.info(`🔄 开始批量翻译，共 ${batches.length} 批次`);
    LoggerUtils.info(
      `🔄 使用并发处理，最大并发数: ${this.concurrencyController.getStatus().maxConcurrency}`,
    );

    const results: Array<Translations | undefined> = new Array(batches.length);
    let successCount = 0;
    let failedCount = 0;

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

          LoggerUtils.success(`✅ 翻译批次 ${index + 1}/${batches.length} 完成`);
        } catch (error) {
          LoggerUtils.error(`❌ 翻译批次 ${index + 1} 失败:`, error);
          failedCount++;

          if (onProgress) {
            onProgress(successCount + failedCount, batches.length);
          }
        }
      }),
    );

    await Promise.all(batchPromises);

    // 失败的批次保留为 undefined，调用方通过 `if (!translatedBatch) continue` 跳过

    if (failedCount > 0) {
      LoggerUtils.warn(`⚠️ 批量翻译完成: ${successCount} 个批次成功, ${failedCount} 个批次失败`);
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
        throw new Error(`LLM 翻译返回的 JSON 解析失败: ${rawContent.slice(0, 200)}`, {
          cause: error,
        });
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
    // 原地调整：保留已 enqueue 的任务与 running 计数，避免丢失任务导致 pending Promise
    this.concurrencyController.setMaxConcurrency(newMaxConcurrency);
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

    LoggerUtils.info(`🚀 开始通过LLM为 ${Object.keys(fileGroups).length} 个文件生成语义ID...`);

    const promises = Object.entries(fileGroups).map(([filePath, texts]) =>
      this.concurrencyController.add(async () => {
        LoggerUtils.info(`🔄 正在处理文件: ${filePath} (${texts.length} 个文本)...`);

        try {
          const allIds = await this.generateSemanticIds(texts);
          results[filePath] = allIds;
          LoggerUtils.success(`✅ 文件 ${filePath} 的语义ID生成完成，共 ${allIds.length} 个ID`);
        } catch {
          LoggerUtils.warn(`⚠️ 文件 ${filePath} 的LLM API调用失败，将由调用方使用本地ID生成兜底`);
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
