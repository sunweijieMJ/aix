import OpenAI from 'openai';
import type { ResolvedConfig, ResolvedLLMTaskConfig } from '../config';
import { ConcurrencyController } from './concurrency-controller';
import { extractSafeError, LoggerUtils } from './logger';
import {
  getIdGenerationSystemPrompt,
  getIdGenerationUserPrompt,
  getTranslationSystemPrompt,
  getTranslationUserPrompt,
} from './prompts';
import type { Translations } from './types';

/**
 * 连接层故障的 errno 集合：DNS 解析不到、端口拒绝、握手超时。
 * 都属于「换个批次重试同样打不通」，与 4xx / 解析失败这类逐条业务错误分开处理。
 */
const CONNECTION_ERROR_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT']);

/**
 * 是否为「连不上 LLM 服务」这一类错误（网络不通 / 代理未开 / baseURL 写错）。
 *
 * openai SDK 把 fetch 层失败统一包成 APIConnectionError（含子类
 * APIConnectionTimeoutError），底层 errno 留在 cause 链上；直接冒上来的 node 错误
 * 则只有 code。判定沿 cause 链逐层查这两条线索——批次聚合错误（"N/M 个批次处理失败"）
 * 把真正的原因挂在 cause 上，只看最外层会把连接故障误判成业务错误。
 *
 * Why 要单独识别：这类错误对**所有**批次同样成立，逐批继续只会把同一个错误刷 N 遍
 * （每批还各自带 maxRetries 次退避），用户要等很久才看到一个早就确定的结论。
 */
export function isLLMConnectionError(error: unknown): boolean {
  return findConnectionCause(error) !== undefined;
}

/** cause 链上第一个连接类错误；没有则 undefined。 */
function findConnectionCause(error: unknown): unknown {
  let current: unknown = error;
  // 深度上限防御自引用 cause 链造成的死循环
  for (let depth = 0; current && depth < 5; depth++) {
    if (current instanceof OpenAI.APIConnectionError) return current;
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && CONNECTION_ERROR_CODES.has(code)) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * 面向用户的连接故障文案：取 cause 链上的连接错误本身，而不是外层聚合包装
 * （"N/M 个批次处理失败" 对排障没有信息量）。
 */
function describeConnectionFailure(error: unknown): string {
  return extractSafeError(findConnectionCause(error) ?? error).message;
}

/**
 * 因连接类故障中止批量翻译。
 *
 * 携带已完成批次的结果：中止的是「继续发请求」，不是「丢掉已经翻好的内容」——
 * 调用方仍要把成功批次落盘，断点续翻的语义才不被这条快速失败路径破坏。
 */
export class LLMConnectionAbortError extends Error {
  constructor(
    message: string,
    readonly partialResults: Array<Translations | undefined>,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'LLMConnectionAbortError';
  }
}

/**
 * LLM 客户端
 *
 * 构造器接受单个 ResolvedLLMTaskConfig（含 concurrency/batchSize/throttleMs/prompt）
 * + locales（用于 prompt 中的语种展示名）。任务级 headers 透传到 OpenAI SDK，
 * 支持 OpenAI dialect 扩展。
 */
export class LLMClient {
  private openai?: OpenAI;
  private task: ResolvedLLMTaskConfig;
  private locales: ResolvedConfig['locales'];
  /**
   * 当前 i18n 库的插值占位符语法是否为双花括号 `{{name}}`（react-i18next /
   * vue-i18next）。用于翻译 prompt 精确描述占位符规则，避免把源文里恰好出现
   * 的单花括号字面量文本误当占位符保护，导致其内容（可能是中文）漏翻译。
   * 仅翻译任务需要（ID 生成 prompt 不涉及占位符规则），故默认 false。
   */
  private usesDoubleBracePlaceholders: boolean;

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

  constructor(
    task: ResolvedLLMTaskConfig,
    locales: ResolvedConfig['locales'],
    usesDoubleBracePlaceholders: boolean = false,
  ) {
    this.task = task;
    this.locales = locales;
    this.usesDoubleBracePlaceholders = usesDoubleBracePlaceholders;

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

    const openai = (this.openai ??= new OpenAI({
      apiKey: this.task.apiKey,
      baseURL: this.task.baseURL,
      timeout: this.task.timeout,
      maxRetries: this.task.maxRetries,
      defaultHeaders: this.task.headers,
    }));

    await this.throttle();
    const response = await openai.chat.completions.create({
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

    // 与 batchTranslate 同一条快速失败纪律：连不上服务时剩余批次不再发请求。
    let connectionFailure: unknown;
    const batchPromises = batches.map((batch, index) =>
      this.innerController.add(async () => {
        // 直接把首个连接错误抛给本批，使聚合判定与错误分类都保持一致
        if (connectionFailure !== undefined) throw connectionFailure;
        LoggerUtils.info(
          `🔄 正在处理第 ${index + 1}/${totalBatches} 批次 (${batch.length} 个文本)...`,
        );

        try {
          const results = await this.generateSemanticIdsBatch(batch);
          LoggerUtils.success(`✅ 第 ${index + 1} 批次处理完成`);
          return results;
        } catch (error) {
          if (isLLMConnectionError(error)) {
            connectionFailure ??= error;
          } else {
            LoggerUtils.error(`❌ 第 ${index + 1} 批次处理失败:`, error);
          }
          throw error;
        }
      }),
    );

    const settledResults = await Promise.allSettled(batchPromises);

    const failedBatches = settledResults.filter((r) => r.status === 'rejected');
    if (failedBatches.length > 0) {
      // 把首个失败原因挂到 cause 上（连接类优先）：调用方据此区分「连不上」与业务错误，
      // 只给一句聚合文案会让分类信息在这一层丢失。
      const rejected = failedBatches as PromiseRejectedResult[];
      const cause =
        rejected.find((r) => isLLMConnectionError(r.reason))?.reason ?? rejected[0]!.reason;
      throw new Error(`${failedBatches.length}/${totalBatches} 个批次处理失败`, { cause });
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
        // id_list 是位置数组，必须与 textList 等长才能按位对齐。长度不符在此立即抛错让本批
        // reject（→ allSettled 失败聚合 → 整文件本地回退），而非交给上层聚合长度校验——
        // 后者在「多批数量互相补偿、合计相等」时会失效，导致跨批 semanticId 错位。
        if (parsed.id_list.length !== textList.length) {
          throw new Error(
            `LLM 返回的 id_list 数量(${parsed.id_list.length})与文本数(${textList.length})不一致`,
          );
        }
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
    // 首个连接类故障即熄火：其余批次不再发请求，整体以 LLMConnectionAbortError 中止。
    // 已在途的批次仍会跑完（无法取消），故这里只保证「不再新开」。
    let connectionFailure: unknown;

    const batchPromises = batches.map((batch, index) =>
      this.outerController.add(async () => {
        if (connectionFailure !== undefined) return;
        const jsonText = JSON.stringify(batch, null, 2);

        try {
          // 复用 requestTranslation 的单次解析结果，避免对译文 JSON 二次 JSON.parse
          results[index] = await this.requestTranslation(jsonText, targetLocale);
          successCount++;

          if (onProgress) {
            onProgress(successCount + failedCount, batches.length);
          }

          LoggerUtils.success(`✅ 翻译批次 ${index + 1}/${batches.length} 完成`);
        } catch (error) {
          if (isLLMConnectionError(error)) {
            // 明细由下方统一的中止文案给出：逐批打同一个「连不上」只是噪音
            connectionFailure ??= error;
            return;
          }
          LoggerUtils.error(`❌ 翻译批次 ${index + 1} 失败:`, error);
          failedCount++;

          if (onProgress) {
            onProgress(successCount + failedCount, batches.length);
          }
        }
      }),
    );

    await Promise.all(batchPromises);

    if (connectionFailure !== undefined) {
      throw new LLMConnectionAbortError(
        `无法连接 LLM 服务（baseURL=${this.task.baseURL ?? 'OpenAI 默认地址'}），已中止剩余批次。\n` +
          `👉 请检查网络 / 代理 / baseURL 配置后重跑（已翻译完成的批次会落盘，重跑只续翻剩余条目）。\n` +
          `   原始错误：${describeConnectionFailure(connectionFailure)}`,
        results,
        { cause: connectionFailure },
      );
    }

    if (failedCount > 0) {
      LoggerUtils.warn(`⚠️ 批量翻译完成: ${successCount} 个批次成功, ${failedCount} 个批次失败`);
    } else {
      LoggerUtils.success(`🎉 批量翻译完成，全部 ${successCount} 个批次成功`);
    }
    return results;
  }

  /**
   * 请求翻译并解析一次，返回解析后的对象。
   *
   * 收口「chatCompletion → cleanJsonResponse → JSON.parse + 错误包装」唯一一处，
   * 避免调用方各自对返回串再解析一遍。
   */
  private async requestTranslation(jsonText: string, targetLocale: string): Promise<Translations> {
    const rawContent = await this.chatCompletion(
      getTranslationSystemPrompt(
        this.locales,
        this.task,
        targetLocale,
        this.usesDoubleBracePlaceholders,
      ),
      getTranslationUserPrompt(jsonText, this.locales, this.task, targetLocale),
    );

    try {
      return JSON.parse(this.cleanJsonResponse(rawContent)) as Translations;
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

    // 连不上服务时，剩余文件不再逐个重试同一个错误：ID 生成本就有本地兜底，
    // 空结果即触发调用方的本地策略。与 batchTranslate 的中止判据同一函数，但这里
    // 不抛错——generate 少了 LLM 命名仍能完整跑完，翻译却是没有产出的空转。
    let connectionFailure: unknown;

    // 外层文件级任务走 outerController，与 generateSemanticIds 内部的拆批
    // innerController 隔离，杜绝递归死锁
    const promises = Object.entries(fileGroups).map(([filePath, texts]) =>
      this.outerController.add(async () => {
        if (connectionFailure !== undefined) {
          results[filePath] = [];
          return;
        }
        LoggerUtils.info(`🔄 正在处理文件: ${filePath} (${texts.length} 个文本)...`);

        try {
          const allIds = await this.generateSemanticIds(texts);
          results[filePath] = allIds;
          LoggerUtils.success(`✅ 文件 ${filePath} 的语义ID生成完成，共 ${allIds.length} 个ID`);
        } catch (error) {
          if (isLLMConnectionError(error)) {
            connectionFailure ??= error;
          } else {
            LoggerUtils.warn(`⚠️ 文件 ${filePath} 的LLM API调用失败，将由调用方使用本地ID生成兜底`);
          }
          results[filePath] = [];
        }
      }),
    );

    await Promise.all(promises);
    if (connectionFailure !== undefined) {
      LoggerUtils.warn(
        `⚠️ 无法连接 LLM 服务（baseURL=${this.task.baseURL ?? 'OpenAI 默认地址'}），` +
          `剩余文件已跳过 LLM、改用本地ID生成兜底。原始错误：${describeConnectionFailure(connectionFailure)}`,
      );
    }
    LoggerUtils.success(
      `🎉 所有文件的语义ID生成完成，共 ${Object.values(results).flat().length} 个ID`,
    );
    return results;
  }
}
