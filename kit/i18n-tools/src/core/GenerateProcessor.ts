import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import type { FrameworkAdapter } from '../adapters';
import { formatWithPrettier } from '../utils/command-utils';
import { CommonASTUtils } from '../utils/common-ast-utils';
import { FileUtils } from '../utils/file-utils';
import { LLMClient } from '../utils/llm-client';
import { InteractiveUtils } from '../utils/interactive-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import { BucketResolver } from '../utils/bucket-resolver';
import { RunReport, type CoverageMetric } from '../utils/run-report';
import type { ExtractedString } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';
import {
  GeneratePlanWriter,
  type GeneratePlan,
  type GeneratePlanFileEntry,
  type GeneratePlanHit,
} from './GeneratePlan';
import { IdReuseResolver } from './IdReuseResolver';

/**
 * 语义化ID生成处理器
 * 负责从 React/Vue 文件中提取文本并生成多语言组件
 */
export class GenerateProcessor extends BaseProcessor {
  /** LLM客户端实例 */
  private llmClient: LLMClient;
  /** 是否为交互模式（自动模式下为 false，跳过确认提示） */
  private interactive: boolean;

  /**
   * 构造函数
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @param interactive - 是否启用交互确认（默认 true）
   * @param adapter - 可选的框架适配器，未提供则按 config.framework 自动构建（CLI 复用预构造适配器以避免重复创建策略链）
   */
  constructor(
    config: ResolvedConfig,
    isCustom: boolean = false,
    interactive: boolean = true,
    adapter?: FrameworkAdapter,
  ) {
    super(config, isCustom, adapter);
    this.interactive = interactive;
    // LLM 任务级配置（concurrency/batchSize/throttleMs/prompt）已内化在 task
    this.llmClient = new LLMClient(config.llm.idGeneration, config.locales);
  }

  protected getOperationName(): string {
    return '代码生成';
  }

  /** 当前运行模式：'commit'（默认，正常落盘） | 'dry-run'（产 plan 不落盘） */
  private runMode: 'commit' | 'dry-run' = 'commit';
  /** dry-run 模式下，plan 输出根目录（未指定则用默认 `.i18n-tools/plans/` 下时间戳目录） */
  private planOutputDir?: string;
  /**
   * 本次 generate 是否启用了 --skip-llm。
   *
   * 用 instance field 而非函数参数透传：writePlan 由 applyTransformations 调用，
   * 调用栈深，逐层透传一个 boolean 让所有中间方法都得改签名。skipLLM 又是单次
   * execute 的运行参数（不在 config 中），故 instance field 是恰当的取舍。
   */
  private lastSkipLLM: boolean = false;

  async execute(
    targetPath: string,
    skipLLM: boolean = false,
    options: { dryRun?: boolean; planOutputDir?: string } = {},
  ): Promise<void> {
    this.runMode = options.dryRun ? 'dry-run' : 'commit';
    this.planOutputDir = options.planOutputDir;
    this.lastSkipLLM = skipLLM;
    return this.executeWithLifecycle(() => this._execute(targetPath, skipLLM));
  }

  private async _execute(targetPath: string, skipLLM: boolean = false): Promise<void> {
    const validation = FileUtils.validateTargetPath(
      targetPath,
      this.adapter.getSupportedExtensions(),
      this.adapter.getDisplayName(),
    );
    if (!validation.isValid) {
      LoggerUtils.error(`❌ ${validation.error}`);
      return;
    }

    if (validation.type === 'file') {
      await this.runSingleFile(targetPath, skipLLM);
    } else if (validation.type === 'directory') {
      await this.runDirectory(targetPath, skipLLM);
    }
  }

  async runSingleFile(filePath: string, skipLLM: boolean = false): Promise<void> {
    LoggerUtils.info(`🚀 开始分析文件: ${FileUtils.getRelativePath(filePath)}`);

    if (!fs.existsSync(filePath)) {
      LoggerUtils.error(`文件不存在: ${filePath}`);
      return;
    }

    try {
      const extractor = this.adapter.getTextExtractor();
      const extractedStrings = await extractor.extractFromFile(filePath);
      // 把 extractor 累积的结构性 warning（如跳过含 HTML 的模板字符串）排空进 RunReport。
      // 终端已经实时打印过；这里只为落盘留痕到 `.i18n-tools/logs/`。
      for (const w of extractor.drainWarnings()) this.report.addWarning(w);

      if (extractedStrings.length === 0) {
        // 仍要汇报覆盖率：空提取也意味着「文件无中文 / 已全部国际化」，
        // 是一种有效结果。reuseResolver 此时为空（未做 scan），coverage 把
        // 该文件归到「全已国际化」一侧。
        this.recordAndRenderCoverage([filePath], [], null);
        LoggerUtils.info('✅ 未发现需要提取的文本');
        return;
      }

      const reuseResolver = await this.generateIdsForStrings(extractedStrings, skipLLM);
      this.displayResults(extractedStrings);

      const shouldApply = this.interactive
        ? await InteractiveUtils.promptForGenericConfirmation('是否应用这些转换？')
        : true;

      if (shouldApply) {
        await this.applyTransformations([filePath], extractedStrings);
        LoggerUtils.success(`✅ 转换完成！`);
      }

      this.recordAndRenderCoverage([filePath], extractedStrings, reuseResolver);
    } catch (error) {
      LoggerUtils.error(`处理文件时发生错误: ${error}`);
      throw error;
    }
  }

  private async runDirectory(dirPath: string, skipLLM: boolean = false): Promise<void> {
    LoggerUtils.info(`🚀 开始分析目录: ${FileUtils.getRelativePath(dirPath)}`);

    const frameworkFiles = FileUtils.getFrameworkFiles(
      dirPath,
      this.adapter.getSupportedExtensions(),
      this.config.io.exclude,
      this.config.io.include,
      this.config.root,
    );
    const frameworkName = this.adapter.getDisplayName();

    if (frameworkFiles.length === 0) {
      LoggerUtils.info(`✅ 目录中未找到${frameworkName}文件`);
      return;
    }

    LoggerUtils.info(`📁 找到 ${frameworkFiles.length} 个${frameworkName}文件:`);
    frameworkFiles.forEach((file, index) => {
      LoggerUtils.info(`  ${index + 1}. ${FileUtils.getRelativePath(file)}`);
    });

    if (this.interactive) {
      const shouldProceed =
        await InteractiveUtils.promptForGenericConfirmation('是否继续分析这些文件？');
      if (!shouldProceed) {
        LoggerUtils.warn('❌ 已取消操作');
        return;
      }
    }

    const extractor = this.adapter.getTextExtractor();
    const extractedStrings = await extractor.extractFromFiles(frameworkFiles);
    // 同 runSingleFile：把 extractor 累积的结构性 warning 排空进 RunReport，
    // 落盘到 `<rootDir>/.i18n-tools/logs/` 便于事后回查。
    for (const w of extractor.drainWarnings()) this.report.addWarning(w);

    if (extractedStrings.length === 0) {
      this.recordAndRenderCoverage(frameworkFiles, [], null);
      LoggerUtils.info('✅ 所有文件均未发现需要提取的文本');
      return;
    }

    const reuseResolver = await this.generateIdsForStrings(extractedStrings, skipLLM);
    this.displayResults(extractedStrings, true);

    const shouldApply = this.interactive
      ? await InteractiveUtils.promptForGenericConfirmation('是否应用这些转换？')
      : true;

    if (shouldApply) {
      // path.normalize 兜底：上游 ExtractedString.filePath 可能因为来源路径不同
      // （例如 ts.createSourceFile 内部 normalizePath 把 \ 替换成 /）出现同一文
      // 件被记成两条不同字符串。Set 直接用 === 去重会漏掉，导致同一文件被
      // transform 多次、第二次在已被改写的源码上越界。
      const processedFiles = Array.from(
        new Set(extractedStrings.map((s) => path.normalize(s.filePath))),
      );
      await this.applyTransformations(processedFiles, extractedStrings);
      LoggerUtils.success(`✅ 转换完成！处理了 ${processedFiles.length} 个文件`);
    }

    this.recordAndRenderCoverage(frameworkFiles, extractedStrings, reuseResolver);
  }

  /**
   * 把原文清理成「给 LLM 看的版本」：去除前导序号噪音。
   *
   * 例：「9. 消息提示」→「消息提示」。LLM 据此生成 `messagePrompt` 而非
   * `messagePrompt9`（原先 LLM 把 9 挪到末尾，sanitize 也无法去除）。
   * locale 文件中的 value 仍是原文「9. 消息提示」，仅 ID 命名脱敏。
   */
  private static cleanForLLM(text: string): string {
    return text.replace(/^\s*\d+\s*[.、。)）:：、\s]+/, '').trim() || text;
  }

  /**
   * 为提取出的字符串分配语义 ID。
   *
   * 流程：
   *  1. 用 IdReuseResolver 加载历史 locale + 扫描源码已存在的 t()/$t() key
   *  2. 把"去序号噪音后的"文本批量送给 LLM 生成候选 ID
   *  3. 对每个 string 按"本批 → 历史复用 → LLM/本地新生成"三优先级落最终 ID
   *
   * Resolver 持有索引状态，新生成的 ID 通过 registerNewId 回写索引，使同批后续
   * 文件能复用，避免重复生成。
   */
  private async generateIdsForStrings(
    extractedStrings: ExtractedString[],
    skipLLM: boolean = false,
  ): Promise<IdReuseResolver> {
    const fileGroups = FileUtils.groupBy(extractedStrings, (str) => str.filePath);
    const textToIdMap = new Map<string, string>();

    const reuseResolver = new IdReuseResolver(this.config, this.isCustom);
    reuseResolver.scanExistingCallsInSources(Object.keys(fileGroups));

    const textGroups: Record<string, string[]> = {};
    Object.entries(fileGroups).forEach(([filePath, strings]) => {
      // 给 LLM 的文本去序号噪音，但保留 locale value 中的原文
      textGroups[filePath] = strings.map((item) =>
        GenerateProcessor.cleanForLLM(item.processedMessage || item.original),
      );
    });

    LoggerUtils.info(`📊 开始并发处理 ${Object.keys(fileGroups).length} 个文件的语义ID生成`);

    try {
      const idResults = await this.llmClient.generateSemanticIdsForFiles(textGroups, skipLLM);

      Object.entries(fileGroups).forEach(([filePath, strings]) => {
        const ids = idResults[filePath] || [];

        if (!skipLLM && ids.length !== strings.length) {
          LoggerUtils.warn(
            `[${FileUtils.getRelativePath(filePath)}] LLM返回的ID数量与文本数量不匹配 (期望 ${strings.length}, 收到 ${ids.length})，将使用本地ID生成进行回退。`,
          );
        }

        strings.forEach((item, index) => {
          item.semanticId = this.resolveSemanticId(item, ids[index], textToIdMap, reuseResolver);
        });
      });

      LoggerUtils.success(`✅ 并发处理完成，共生成 ${textToIdMap.size} 个唯一语义ID`);
    } catch (error) {
      LoggerUtils.error(`处理文件时发生严重错误:`, error);
      throw new Error('语义ID生成失败', { cause: error });
    }

    return reuseResolver;
  }

  /**
   * 三级优先决策：本批同原文 → 历史 locale 复用 → LLM/本地新生成。
   * 副作用：把命中或新生成的 ID 写回 textToIdMap 与 reuseResolver。
   */
  private resolveSemanticId(
    item: ExtractedString,
    llmId: string | undefined,
    textToIdMap: Map<string, string>,
    reuseResolver: IdReuseResolver,
  ): string {
    const messageForId = item.processedMessage || item.original;
    const lookupKey = IdReuseResolver.normalizeKey(messageForId);

    // 优先级 1：本批次内已生成（同一原文跨文件复用，受同 prefix 约束）
    const cached = textToIdMap.get(lookupKey);
    if (cached) return cached;

    // 优先级 2：locale 文件中已有相同原文（按目录前缀挑选最合适的历史 key）
    const reusedId = reuseResolver.pickReusableKey(messageForId, item.filePath);
    if (reusedId) {
      textToIdMap.set(lookupKey, reusedId);
      return reusedId;
    }

    // 优先级 3：本次新生成
    const existingIds = reuseResolver.getExistingIds();

    // 跨模块 namespace 提升：若本次新分配会把原文带过 promoteToCommon.threshold
    // 个不同模块前缀，改用 common namespace 而非文件目录前缀。仅作用于"新分配"，
    // 不回迁历史 key（见 keys.reuse.promoteToCommon 注释）。
    const idGenerator = reuseResolver.getIdGenerator();
    const promoteToCommon = reuseResolver.shouldPromoteToCommon(messageForId, item.filePath);
    const finalId = promoteToCommon
      ? idGenerator.generateWithFixedPrefix(
          reuseResolver.getCommonNamespace(),
          llmId ?? GenerateProcessor.cleanForLLM(messageForId),
          existingIds,
        )
      : llmId
        ? idGenerator.addDirectoryPrefixToId(item.filePath, llmId, existingIds)
        : idGenerator.generateWithFilePath(
            item.filePath,
            GenerateProcessor.cleanForLLM(messageForId),
            existingIds,
          );

    textToIdMap.set(lookupKey, finalId);
    // 同次内后续文件也能复用：把刚生成的 finalId 注册回索引
    reuseResolver.registerNewId(messageForId, finalId);
    return finalId;
  }

  private formatResultLine(item: ExtractedString): string {
    return `"${item.original}" -> ${item.semanticId} (${item.context})`;
  }

  private displayResults(extractedStrings: ExtractedString[], groupByFile: boolean = false): void {
    LoggerUtils.info(`\n📋 共提取 ${extractedStrings.length} 个字符串:`);

    if (groupByFile) {
      const fileGroups = FileUtils.groupBy(extractedStrings, (str) => str.filePath);

      for (const [filePath, strings] of Object.entries(fileGroups)) {
        LoggerUtils.info(`\n📄 ${FileUtils.getRelativePath(filePath)} (${strings.length} 个):`);
        strings.forEach((item, index) => {
          LoggerUtils.info(`  ${index + 1}. ${this.formatResultLine(item)}`);
        });
      }
    } else {
      extractedStrings.forEach((item, index) => {
        LoggerUtils.info(`${index + 1}. ${this.formatResultLine(item)}`);
      });
    }
  }

  /**
   * 计算 extractedStrings 的 key → bucket 归属表（buckets 启用时）。
   * 抽出独立方法是因为 commit / dry-run / apply 三条路径都需要这份数据：
   *   - commit：直接传给 LanguageFileManager.updateLanguageFiles
   *   - dry-run：写入 plan.keyBucketMap
   *   - apply：从 plan 读取，跳过此计算
   */
  private buildKeyBucketMap(
    extractedStrings: ExtractedString[],
  ): Record<string, string> | undefined {
    if (!this.config.buckets) return undefined;
    const resolver = new BucketResolver(this.config.buckets);
    const keyBucketMap: Record<string, string> = {};
    let resolvedCount = 0;
    for (const item of extractedStrings) {
      if (item.semanticId) {
        // glob 规则用相对路径（如 src/views/order/**），必须转成相对 root 的路径才能命中
        const relPath = path.relative(this.config.root, item.filePath).replace(/\\/g, '/');
        keyBucketMap[item.semanticId] = resolver.resolve(
          relPath,
          item.semanticId,
          item.processedMessage || item.original,
        );
        resolvedCount++;
      }
    }

    // 真实路径下仍 0 命中的规则 = 用户配错（glob/matchKey 与实际不符）。
    // 只有 resolvedCount>0 时才告警——空 extractedStrings 下不告警避免噪音。
    if (resolvedCount > 0) {
      const zeroHit = resolver.getZeroHitRules();
      if (zeroHit.length > 0) {
        const msg =
          `[buckets] 以下规则在本轮 ${resolvedCount} 个新 key 的真实路径下 0 命中，` +
          `可能配错（match glob 与目录不符 / matchKey 前缀拼写错）：${zeroHit.join(', ')}`;
        LoggerUtils.warn(msg);
        this.report.addWarning(msg);
      }
    }

    return keyBucketMap;
  }

  /**
   * 阶段 1：把所有源文件 transform 到内存。
   *
   * 这是事务的「准备阶段」：AST 失败（最常见错误）在此拦截，源码与语言文件
   * 均未变更。返回结果交由 commit 路径写盘、或 dry-run 路径落 plan。
   *
   * 失败时抛错，由 caller 决定如何处理（commit 路径直接抛、dry-run 同样抛——
   * 不可能落一个有问题的 plan）。
   */
  private transformToMemory(
    filePaths: string[],
    extractedStrings: ExtractedString[],
  ): {
    results: Array<{ file: string; code: string; originalContent: string }>;
    uniqueFilePaths: string[];
  } {
    const transformer = this.adapter.getTransformer();
    // 即便调用方传入了重复路径（包括 normalize 后仍不一致的情况），也确保每个
    // 文件只 transform 一次——避免在已被改写的源码上重新 parse 时越界。
    const uniqueFilePaths = Array.from(new Set(filePaths.map((p) => path.normalize(p))));

    const results: Array<{ file: string; code: string; originalContent: string }> = [];
    const failures: Array<{ file: string; error: unknown }> = [];
    for (const filePath of uniqueFilePaths) {
      try {
        // 先一次性 read 原文：既作为 transform 的输入，也作为 dry-run plan 的 hash 基准。
        // 这样保证 plan 中记录的 sourceHash 与 transformedSources 来自同一文件快照，
        // 消除「transform 内部读 → writePlan 又读」窗口被外部并发改动导致的不一致。
        const originalContent = fs.readFileSync(filePath, 'utf-8');
        const code = transformer.transform(filePath, extractedStrings, originalContent);
        results.push({ file: filePath, code, originalContent });
      } catch (error) {
        LoggerUtils.error(`❌ 转换失败 ${FileUtils.getRelativePath(filePath)}:`, error);
        failures.push({ file: filePath, error });
        this.report.addFailure({
          stage: 'transform',
          file: FileUtils.getRelativePath(filePath),
          error,
        });
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `转换阶段有 ${failures.length}/${uniqueFilePaths.length} 个文件失败（语言文件未变更）:\n` +
          failures.map((f) => `  - ${FileUtils.getRelativePath(f.file)}`).join('\n'),
      );
    }

    return { results, uniqueFilePaths };
  }

  /**
   * 阶段 2~4：把已 transform 的代码写盘 + 更新语言文件 + 格式化。
   *
   * 入参 `extractedStrings` 在 commit 路径下是 transformToMemory 用过的同一份；
   * 在 apply 路径下，是从 plan 还原出来的合成数据（只需 semanticId + message
   * 即能驱动 LanguageFileManager.updateLanguageFiles，AST 字段无需复刻）。
   */
  private async commitToDisk(
    results: Array<{ file: string; code: string }>,
    extractedStrings: ExtractedString[],
    keyBucketMap: Record<string, string> | undefined,
  ): Promise<void> {
    // 阶段 2：原子地写所有源码。任一写失败立即抛错，此时语言文件仍未更新，
    // 不会留下源码-语言文件不一致的污染态。
    const writeFailures: Array<{ file: string; error: unknown }> = [];
    for (const { file, code } of results) {
      try {
        fs.writeFileSync(file, code, 'utf-8');
      } catch (error) {
        LoggerUtils.error(`❌ 写入失败 ${FileUtils.getRelativePath(file)}:`, error);
        writeFailures.push({ file, error });
        this.report.addFailure({
          stage: 'write',
          file: FileUtils.getRelativePath(file),
          error,
        });
      }
    }

    if (writeFailures.length > 0) {
      throw new Error(
        `写入阶段有 ${writeFailures.length}/${results.length} 个文件失败（语言文件未变更）:\n` +
          writeFailures.map((f) => `  - ${FileUtils.getRelativePath(f.file)}`).join('\n'),
      );
    }

    // 阶段 3：源码全部落盘后才更新语言文件，保持两者强一致。
    LanguageFileManager.updateLanguageFiles(
      this.config,
      this.isCustom,
      extractedStrings,
      keyBucketMap,
      this.report,
    );

    // 阶段 4：格式化是美化步骤，单个失败不影响数据正确性，仅警告。
    if (this.config.io.prettify) {
      for (const { file } of results) {
        try {
          await formatWithPrettier(file);
        } catch (error) {
          LoggerUtils.warn(`⚠️  格式化失败（已忽略）${FileUtils.getRelativePath(file)}: ${error}`);
        }
      }
    }

    for (const { file } of results) {
      LoggerUtils.success(`✅ 已转换: ${FileUtils.getRelativePath(file)}`);
    }
    LoggerUtils.success('✅ 应用转换完成');
    LoggerUtils.info(`✨ 处理文件列表: \n- ${results.map((r) => r.file).join('\n- ')}`);
  }

  /**
   * 入口：根据 runMode 分派到 commit 或 dry-run。
   *
   * 事务语义：先把全部源码 transform 到内存（阶段 1），全部成功后再落盘或
   * 写 plan。Why：AST 转换失败是最常见的运行时错误，按"边算边写"流程会留下
   * 部分文件已改、部分未改的污染态。
   */
  private async applyTransformations(
    filePaths: string[],
    extractedStrings: ExtractedString[],
  ): Promise<void> {
    LoggerUtils.info(`\n🔄 开始应用转换...`);
    const keyBucketMap = this.buildKeyBucketMap(extractedStrings);
    const { results, uniqueFilePaths } = this.transformToMemory(filePaths, extractedStrings);

    if (this.runMode === 'dry-run') {
      this.writePlan(uniqueFilePaths, results, extractedStrings, keyBucketMap);
      return;
    }

    // commitToDisk 不需要 originalContent，剥掉以维持其入参契约稳定
    await this.commitToDisk(
      results.map(({ file, code }) => ({ file, code })),
      extractedStrings,
      keyBucketMap,
    );
  }

  /**
   * dry-run 输出：把内存中的 transform 结果序列化为 plan + sources/。
   *
   * 设计要点：
   * - plan.json 完整保留 hits，每条 hit 都能反查到原文件的具体替换点
   * - sources/<relPath> 保留 transform 后完整文件内容，apply 时直接落盘
   * - sourceHash 用 transform 前的原始内容（apply 时校验源码未被外部改动）
   */
  private writePlan(
    uniqueFilePaths: string[],
    results: Array<{ file: string; code: string; originalContent: string }>,
    extractedStrings: ExtractedString[],
    keyBucketMap: Record<string, string> | undefined,
  ): void {
    const planRoot = this.planOutputDir ?? GeneratePlanWriter.getDefaultPlansRoot(this.config.root);
    const planDir = path.join(planRoot, GeneratePlanWriter.generateDirName());

    // 按文件归组 ExtractedString，便于在 entries 内挂载 hits
    const byFile = new Map<string, ExtractedString[]>();
    for (const s of extractedStrings) {
      const normalized = path.normalize(s.filePath);
      if (!byFile.has(normalized)) byFile.set(normalized, []);
      byFile.get(normalized)!.push(s);
    }

    const localeDelta: Record<string, string> = {};
    for (const item of extractedStrings) {
      if (!item.semanticId) continue;
      const raw = item.processedMessage || item.original;
      const { message } =
        item.isTemplateString && item.templateVariables
          ? CommonASTUtils.createMessageWithOptions(raw, item.templateVariables)
          : { message: raw.replace(/^['"`]|['"`]$/g, '') };
      // 重复 semanticId 取首次（generateIdsForStrings 已经保证同原文 → 同 key，
      // 不同原文 → 不同 key；这里的 first-wins 是冗余防御）
      if (!(item.semanticId in localeDelta)) {
        localeDelta[item.semanticId] = message;
      }
    }

    const transformedSources = new Map<string, string>();
    const entries: GeneratePlanFileEntry[] = [];

    for (const filePath of uniqueFilePaths) {
      const result = results.find((r) => r.file === filePath);
      if (!result) continue; // 理论不会发生（transformToMemory 失败已抛错）

      const relPosix = GeneratePlanWriter.toRelPosix(this.config.root, filePath);
      const transformedRef = `${GeneratePlanWriter.SOURCES_DIRNAME}/${relPosix}`;
      transformedSources.set(relPosix, result.code);

      // 复用 transformToMemory 阶段已读取的原文，与 sourceHash 共用同一份快照
      const sourceHash = GeneratePlanWriter.sha256(result.originalContent);

      const fileStrings = byFile.get(filePath) ?? [];
      const hits: GeneratePlanHit[] = fileStrings
        .filter((s) => Boolean(s.semanticId))
        .map((s) => ({
          semanticId: s.semanticId,
          original: s.original,
          processedMessage: s.processedMessage,
          context: s.context,
          templateContext: s.templateContext,
          componentType: s.componentType,
          line: s.line,
          column: s.column,
          isTemplateString: s.isTemplateString,
          templateVariables: s.templateVariables,
          attributeName: s.attributeName,
          module: keyBucketMap?.[s.semanticId],
        }));

      entries.push({
        file: relPosix,
        hits,
        transformedCodeRef: transformedRef,
        sourceHash,
      });
    }

    const plan: GeneratePlan = {
      schemaVersion: 2,
      command: 'generate',
      finishedAt: new Date().toISOString(),
      root: this.config.root,
      isCustom: this.isCustom,
      framework: this.config.framework.type,
      toolVersion: GenerateProcessor.getToolVersion(),
      // skipLLM 模式下记 'local'：与 LLMClient.generateSemanticIdsForFiles 的本地
      // 兜底路径对应，让 reviewer 知道本批 ID 没经过 LLM。
      llmModel: this.lastSkipLLM ? 'local' : this.config.llm.idGeneration.model,
      summary: {
        files: entries.length,
        hits: entries.reduce((sum, e) => sum + e.hits.length, 0),
        newKeys: Object.keys(localeDelta).length,
      },
      entries,
      localeDelta,
      keyBucketMap,
    };

    GeneratePlanWriter.write(planDir, plan, transformedSources);
    GeneratePlanWriter.logPlanReadyMessage(planDir);
  }

  /**
   * 读取 @kit/i18n-tools 包的 version 字段，写入 plan 元数据。
   *
   * 用 createRequire(import.meta.url) 是因为本包打包为 ESM（tsdown 生成 dist/index.js），
   * 直接 import package.json 在 strict ESM 下需要 import assertion，跨 node 版本
   * 支持参差；createRequire 是更稳的 ESM 兼容写法。
   *
   * 读失败时返回 undefined（而非抛错）：toolVersion 是辅助字段，不应阻断主流程。
   */
  private static getToolVersion(): string | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require('../../package.json') as { version?: string };
      return pkg.version;
    } catch {
      return undefined;
    }
  }

  /**
   * apply-plan 入口：从已有 plan.json 直接回放，跳过 AST 解析与 LLM 调用。
   *
   * 流程：
   *   1. 读取 plan.json + sources/
   *   2. 校验源文件 sha256 与 plan.entries[].sourceHash 一致
   *   3. 调用 commitToDisk 落盘
   *
   * Why 不在 apply 路径再跑 LocaleValueLinter：plan 是 dry-run 当时的事实快照，
   * apply 阶段只负责"原样落盘"，lint 应该在 dry-run 阶段就跑完（plan 中的
   * localeDelta 已经是经过提取流程的最终值）。
   */
  /**
   * apply 完成后是否保留 plan 目录。
   *
   * 默认 false（清理）：plan 的生命周期是「生成 → review → apply」，apply 完
   * 即终结；保留只在事后追溯有少量价值，但单 plan 体积大（含 sources/）容易
   * 累积。CLI 通过 `--keep-plan` 让用户显式保留。
   */
  private keepPlanAfterApply: boolean = false;

  async applyFromPlan(planPath: string, options: { keepPlan?: boolean } = {}): Promise<void> {
    this.keepPlanAfterApply = Boolean(options.keepPlan);
    return this.executeWithLifecycle(() => this._applyFromPlan(planPath));
  }

  private async _applyFromPlan(planPath: string): Promise<void> {
    LoggerUtils.info(`📂 加载 Plan: ${planPath}`);
    const { plan, transformedSources } = GeneratePlanWriter.read(planPath);

    if (plan.framework !== this.config.framework.type) {
      throw new Error(
        `Plan 框架 (${plan.framework}) 与当前配置 (${this.config.framework.type}) 不一致，拒绝 apply。`,
      );
    }
    if (plan.isCustom !== this.isCustom) {
      throw new Error(
        `Plan 目标目录 (${plan.isCustom ? 'custom' : 'main'}) 与当前 --custom 配置不一致，拒绝 apply。`,
      );
    }

    const { mismatched } = GeneratePlanWriter.verifyFingerprint(plan);
    if (mismatched.length > 0) {
      LoggerUtils.error('❌ Plan 生成后以下源文件已被外部修改，拒绝 apply：');
      for (const f of mismatched) LoggerUtils.error(`   - ${f}`);
      LoggerUtils.warn('💡 请重新运行 `generate --dry-run` 生成新 plan，确认无误后再 apply');
      throw new Error('Plan 指纹校验失败');
    }

    // 把 plan 还原成 commitToDisk 期望的入参：
    //   - results: 文件绝对路径 + transform 后代码
    //   - extractedStrings: 仅需 semanticId + 用于 message 还原的字段
    const results: Array<{ file: string; code: string }> = [];
    for (const entry of plan.entries) {
      const abs = GeneratePlanWriter.fromRelPosix(plan.root, entry.file);
      results.push({ file: abs, code: transformedSources.get(entry.file)! });
    }

    // 把 localeDelta 直接展开成 ExtractedString 列表（仅保留下游需要的字段）。
    // updateLanguageFiles 读取的字段：semanticId / processedMessage / original /
    // isTemplateString / templateVariables。这里把 message 直接放回 original，
    // 跳过模板字符串重新生成 placeholder 的路径——plan.localeDelta 已经是最终值。
    const syntheticStrings: ExtractedString[] = Object.entries(plan.localeDelta).map(
      ([semanticId, message]) => ({
        original: message,
        processedMessage: message,
        semanticId,
        filePath: '<plan>',
        line: 0,
        column: 0,
        context: 'js-code',
        componentType: 'other',
      }),
    );

    await this.commitToDisk(results, syntheticStrings, plan.keyBucketMap);
    LoggerUtils.success(
      `✅ Plan 回放完成：${plan.summary.files} 个文件、${plan.summary.newKeys} 个新 key`,
    );

    // 默认清理 plan 目录：commitToDisk 成功后 plan 已无价值，保留只会累积。
    // 用户通过 --keep-plan 显式保留（如希望事后审计 / 在 PR 中附带）。
    if (this.keepPlanAfterApply) {
      LoggerUtils.info(`📁 已保留 Plan 目录（--keep-plan）：${path.dirname(planPath)}`);
    } else {
      const planDir = path.dirname(planPath);
      GeneratePlanWriter.cleanup(planDir);
      LoggerUtils.info(`🗑️  Plan 目录已清理：${planDir}（如需保留请使用 --keep-plan）`);
    }
  }

  /**
   * 汇总本轮 generate 的覆盖率指标并打印总览 summary。
   *
   * 计算口径（以「中文片段调用点」为单位）：
   *   alreadyI18n      = 源码中已存在的 t()/$t() 调用点数（IdReuseResolver 扫到）
   *   newlyGenerated   = 本轮 extractor 提取出的 ExtractedString 条目数
   *   skipped          = 工具主动放弃的（被 needsManual 拒收 + 命中黑名单等）
   *
   * 这里把已知的两类「主动放弃」纳入 skipped：
   *  - drainSkippedComparisonOperands：=== / case 中跳过的中文字面量
   *  - extractor.drainWarnings 已在 runSingleFile/runDirectory 早期消费，
   *    但未结构化；本期先用 RunReport 已有 warnings 数量做粗估。后续重构
   *    drainWarnings → 结构化 ManualEntry 后会更精准。
   *
   * 同步把比较运算符跳过项作为 ManualEntry 写入 report，让最终落盘日志里
   * 用户能看到完整待人工清单。
   */
  private recordAndRenderCoverage(
    scannedFilePaths: string[],
    extractedStrings: ExtractedString[],
    reuseResolver: IdReuseResolver | null,
  ): void {
    // 1. 把「比较运算符跳过的中文字面量」从 CommonASTUtils 静态缓存里 drain 出来
    //    转成结构化 ManualEntry。注意 drain 是消耗性操作；LocaleValueLinter
    //    后续 lint 阶段还会再 drain 一次，会得到空数组——意味着同一条记录不会
    //    被报告两次。
    const skippedComparisons = CommonASTUtils.drainSkippedComparisonOperands();
    for (const item of skippedComparisons) {
      this.report.addManualEntry({
        category: 'comparison-operand',
        file: FileUtils.getRelativePath(item.filePath),
        line: item.line,
        column: item.column,
        text: item.text,
        reason: '比较运算符两侧的中文翻译后会与状态值脱钩，工具主动跳过',
        suggestion: RunReport.MANUAL_DEFAULT_SUGGESTIONS['comparison-operand'],
      });
    }

    const alreadyI18n = reuseResolver?.getExistingCallSiteCount() ?? 0;
    const newlyGenerated = extractedStrings.length;
    const skipped = skippedComparisons.length;
    const total = alreadyI18n + newlyGenerated + skipped;
    const coverageRate = total === 0 ? 1 : (alreadyI18n + newlyGenerated) / total;

    const metric: CoverageMetric = {
      scannedFiles: scannedFilePaths.length,
      totalChineseSegments: total,
      alreadyI18n,
      newlyGenerated,
      skipped,
      coverageRate,
    };
    this.report.setCoverage(metric);
    this.renderCoverageSummary(metric);
  }

  private renderCoverageSummary(m: CoverageMetric): void {
    const pct = (n: number, base: number): string =>
      base === 0 ? '0.0%' : `${((n / base) * 100).toFixed(1)}%`;
    const ratePct = `${(m.coverageRate * 100).toFixed(1)}%`;

    LoggerUtils.info('');
    LoggerUtils.info('📊 本次国际化覆盖率');
    LoggerUtils.info('────────────────────────────────────');
    LoggerUtils.info(`扫描文件          ${m.scannedFiles}`);
    LoggerUtils.info(`中文片段总数      ${m.totalChineseSegments}`);
    LoggerUtils.info(
      `  已国际化         ${m.alreadyI18n}  (${pct(m.alreadyI18n, m.totalChineseSegments)})`,
    );
    LoggerUtils.info(
      `  本轮新生成       ${m.newlyGenerated}  (${pct(m.newlyGenerated, m.totalChineseSegments)})`,
    );
    LoggerUtils.info(
      `  跳过/待人工      ${m.skipped}  (${pct(m.skipped, m.totalChineseSegments)})`,
    );
    LoggerUtils.info('────────────────────────────────────');
    LoggerUtils.info(`🎯 当前覆盖率   ${ratePct}`);

    // 按 category 聚合「待人工处理」清单
    const groups = this.report.groupManualByCategory();
    const entryCount = Object.values(groups).reduce((s, arr) => s + arr.length, 0);
    if (entryCount > 0) {
      LoggerUtils.info('');
      LoggerUtils.warn(`⚠️  待人工处理 ${entryCount} 条（详见 .i18n-tools/logs/）`);
      for (const [category, list] of Object.entries(groups)) {
        const label = RunReport.MANUAL_LABELS[category as keyof typeof RunReport.MANUAL_LABELS];
        LoggerUtils.warn(
          `   • ${category.padEnd(20)} ${String(list.length).padStart(4)}  — ${label}`,
        );
      }
    }
    LoggerUtils.info('');
  }
}
