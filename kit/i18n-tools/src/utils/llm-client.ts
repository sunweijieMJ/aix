import OpenAI from 'openai';
import type { ResolvedConfig, ResolvedLLMTaskConfig } from '../config';
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
 *
 * 构造器接受单个 ResolvedLLMTaskConfig（含 concurrency/batchSize/throttleMs/prompt）
 * + locales（用于 prompt 中的语种展示名）。任务级 headers 透传到 OpenAI SDK，
 * 支持 OpenAI dialect 扩展。
 */
export class LLMClient {
  private openai: OpenAI;
  private task: ResolvedLLMTaskConfig;
  private locales: ResolvedConfig['locales'];

  /**
   * 外层任务并发控制器：用于 generateSemanticIdsForFiles / batchTranslate
   * 这类"每个输入一个 task"的顶层任务。
   */
  private outerController: ConcurrencyController;

  /**
   * 内层批次并发控制器：用于 generateSemanticIds 内部对单文件文本数 > batchSize
   * 时的拆批任务。
   *
   * Why 双池：若内外层共用同一个 controller，会出现经典递归死锁——
   *   - 外层 N 个文件 task 把槽位占满
   *   - 其中含 >batchSize 文本的 task 通过 add() 把内层批次入队
   *   - 内层批次永远拿不到槽位（外层 task 还在 await 它们）→ 进程挂死
   * 双池物理隔离后内外层各自有槽位，外层 await 即可正常推进。
   */
  private innerController: ConcurrencyController;

  /** 上一次实际派发请求的时间戳，用于实现 throttleMs 限流 */
  private lastCallTimestamp: number = 0;

  constructor(task: ResolvedLLMTaskConfig, locales: ResolvedConfig['locales']) {
    this.task = task;
    this.locales = locales;

    this.openai = new OpenAI({
      apiKey: task.apiKey,
      baseURL: task.baseURL,
      timeout: task.timeout,
      maxRetries: task.maxRetries,
      defaultHeaders: task.headers,
    });

    this.outerController = new ConcurrencyController(task.concurrency);
    this.innerController = new ConcurrencyController(task.concurrency);
  }

  /**
   * 在发起请求前按 task.throttleMs 等待最小间隔。
   * 每次请求保证与上一次至少相隔 throttleMs 毫秒。
   */
  private async throttle(): Promise<void> {
    if (this.task.throttleMs <= 0) return;
    const now = Date.now();
    const earliest = this.lastCallTimestamp + this.task.throttleMs;
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
    // lazy 校验：apiKey 在 config.resolveLLM 阶段允许为空（不调 LLM 的命令无需配置），
    // 真正发起请求时再拦截，给出精准的错误信息。
    if (!this.task.apiKey) {
      throw new Error(
        '调用 LLM 但未配置 apiKey。请在配置文件的 llm.shared 或对应任务（llm.idGeneration / llm.translation）中设置 apiKey。',
      );
    }
    await this.throttle();
    const response = await this.openai.chat.completions.create({
      model: this.task.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.task.temperature,
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
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return cleaned.trim();
  }

  /**
   * 生成语义ID列表（支持并发分批）。
   *
   * 批次大小从 task.batchSize 取，调用方可通过显式参数覆盖。
   */
  async generateSemanticIds(textList: string[], batchSize?: number): Promise<string[]> {
    if (textList.length === 0) return [];

    const effectiveBatchSize = batchSize ?? this.task.batchSize;
    if (textList.length <= effectiveBatchSize) {
      return this.generateSemanticIdsBatch(textList);
    }

    const batches: string[][] = [];
    const totalBatches = Math.ceil(textList.length / effectiveBatchSize);

    for (let i = 0; i < totalBatches; i++) {
      const startIndex = i * effectiveBatchSize;
      const endIndex = Math.min(startIndex + effectiveBatchSize, textList.length);
      batches.push(textList.slice(startIndex, endIndex));
    }

    LoggerUtils.info(`📊 需要分 ${totalBatches} 批次处理，每批 ${effectiveBatchSize} 个文本`);
    LoggerUtils.info(
      `🔄 使用并发处理，最大并发数: ${this.innerController.getStatus().maxConcurrency}`,
    );

    const batchPromises = batches.map((batch, index) =>
      this.innerController.add(async () => {
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
   * 1) `{ id_list: string[] }`（位置数组）
   * 2) `{ id_map: { [text]: id } }`（键值对，更鲁棒）
   *
   * id_map 防御 LLM 偶发乱序返回 id_list 的错配；缺失项显式置空让上层走兜底。
   */
  private async generateSemanticIdsBatch(textList: string[]): Promise<string[]> {
    const rawContent = await this.chatCompletion(
      getIdGenerationSystemPrompt(this.locales, this.task),
      getIdGenerationUserPrompt(textList, this.locales, this.task),
    );

    try {
      const cleaned = this.cleanJsonResponse(rawContent);
      const parsed = JSON.parse(cleaned);

      // 防御性 null 检查：JSON.parse('null') 返回 null（合法 JSON），
      // 直接访问 parsed.id_list 会抛 TypeError 而不是预期的格式错误。
      if (parsed === null || typeof parsed !== 'object') {
        throw new Error('LLM 返回格式错误：响应不是 JSON 对象');
      }

      if (parsed.id_map && typeof parsed.id_map === 'object') {
        const map = parsed.id_map as Record<string, string>;
        return textList.map((t) => (typeof map[t] === 'string' ? map[t] : ''));
      }

      if (parsed.id_list && Array.isArray(parsed.id_list)) {
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
   * 批量翻译（支持并发）。
   *
   * @param targetLocale 单次翻译的目标语种；多目标场景由调用方循环
   * @returns 与输入 batches 一一对应，失败批次为 undefined
   */
  async batchTranslate(
    batches: Translations[],
    targetLocale: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<Array<Translations | undefined>> {
    if (batches.length === 0) return [];

    LoggerUtils.info(`🔄 开始批量翻译 ${targetLocale}，共 ${batches.length} 批次`);
    LoggerUtils.info(
      `🔄 使用并发处理，最大并发数: ${this.outerController.getStatus().maxConcurrency}`,
    );

    const results: Array<Translations | undefined> = new Array(batches.length);
    let successCount = 0;
    let failedCount = 0;

    const batchPromises = batches.map((batch, index) =>
      this.outerController.add(async () => {
        const jsonText = JSON.stringify(batch, null, 2);

        try {
          const translatedJsonText = await this.translateJson(jsonText, targetLocale);
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

    if (failedCount > 0) {
      LoggerUtils.warn(`⚠️ 批量翻译完成: ${successCount} 个批次成功, ${failedCount} 个批次失败`);
    } else {
      LoggerUtils.success(`🎉 批量翻译完成，全部 ${successCount} 个批次成功`);
    }
    return results;
  }

  /**
   * 翻译 JSON 文本（单目标）。
   */
  async translateJson(jsonText: string, targetLocale: string): Promise<string> {
    const rawContent = await this.chatCompletion(
      getTranslationSystemPrompt(this.locales, this.task, targetLocale),
      getTranslationUserPrompt(jsonText, this.locales, this.task, targetLocale),
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
   * 获取并发控制器状态（对外暴露外层池）
   */
  getConcurrencyStatus(): {
    running: number;
    queued: number;
    maxConcurrency: number;
  } {
    return this.outerController.getStatus();
  }

  /**
   * 为文件生成语义ID。
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

    // 外层文件级任务走 outerController，与 generateSemanticIds 内部的拆批
    // innerController 隔离，杜绝递归死锁
    const promises = Object.entries(fileGroups).map(([filePath, texts]) =>
      this.outerController.add(async () => {
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
