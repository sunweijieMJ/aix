import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import type { ResolvedConfig } from '../config';
import type { FrameworkAdapter } from '../adapters';
import { formatWithPrettier } from '../utils/command-utils';
import { buildLocaleMessage } from '../utils/message-shape';
import { FileUtils } from '../utils/file-utils';
import { groupBy } from '../utils/collections';
import { LLMClient } from '../utils/llm-client';
import { normalizePosix } from '../utils/path-matcher';
import { InteractiveUtils } from '../utils/interactive-utils';
import { LoggerUtils } from '../utils/logger';
import { BucketResolver } from '../utils/bucket-resolver';
import type { ExtractedString } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';
import { CoverageReporter } from './CoverageReporter';
import { PlanApplier } from './PlanApplier';
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
  /** 覆盖率账本：持有本轮跳过项快照，负责统计与总览渲染。 */
  private coverage: CoverageReporter;
  /** plan 侧：dry-run 写 plan 与 apply-plan 回放。 */
  private planApplier: PlanApplier;

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
    this.coverage = new CoverageReporter(config, isCustom, this.report);
    // PlanApplier 不直接持有 processor：落盘与文案定稿以 hooks 注入，保证 plan 回放
    // 与普通 commit 走同一条 commitToDisk 路径（事务语义只有一份实现）。
    this.planApplier = new PlanApplier(config, isCustom, this.report, {
      toLocaleMessage: (item) => this.toLocaleMessage(item),
      commitToDisk: (results, extractedStrings, keyBucketMap, options) =>
        this.commitToDisk(results, extractedStrings, keyBucketMap, options),
      // getToolVersion 依赖本文件的 import.meta.url 相对位置，故留在本类、以 hook 提供。
      getToolVersion: () => GenerateProcessor.getToolVersion(),
    });
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
      throw new Error(validation.error ?? `无效的目标路径: ${targetPath}`);
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
      // 抛错而非 log+return：_execute 已校验过存在性，走到这里说明校验窗口后文件被并发
      // 删除。静默 return 会让 executeWithLifecycle 照常打印「✅ 代码生成完成」并以 0 退出
      // （CI 假绿）。与 _execute 的 invalid 分支同口径 fail-fast。
      throw new Error(`文件不存在: ${filePath}`);
    }

    try {
      await this.runPipeline([filePath], skipLLM, 'file');
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
      // default: true —— generate 的确认是推进型（且事务化可回滚），沿用回车即继续的
      // 历史 UX；通用确认的缺省 No 只面向 prune/csv-import 这类不可撤销操作。
      const shouldProceed = await InteractiveUtils.promptForGenericConfirmation(
        '是否继续分析这些文件？',
        { default: true },
      );
      if (!shouldProceed) {
        // 置位后 return：executeWithLifecycle 收尾改打「已取消」，否则取消的运行被打成
        // 「✅ 代码生成完成」，人与 CI 都会误判源码已被改写（与 prune/csv-import 同口径）。
        this.cancelled = true;
        LoggerUtils.warn('操作已取消');
        return;
      }
    }

    await this.runPipeline(frameworkFiles, skipLLM, 'directory');
  }

  /**
   * generate 的公共流水线：drain 诊断 → 空提取分支 → 生成 ID → 展示 → 确认 → 应用 → 覆盖率。
   *
   * 单文件与目录两条入口的差异只剩「入口前置」（单文件的存在性检查与错误包裹 / 目录的
   * 文件扫描与继续确认）和本方法内按 mode 分叉的四处，其余逐字共用：
   *  - 提取调用：单文件 extractFromFile，目录 extractFromFiles。不强行统一成后者——
   *    adapter 可自定义 extractFromFiles 实现，统一会让单文件路径行为随之漂移。
   *  - 空提取日志：'✅ 未发现需要提取的文本' vs '✅ 所有文件均未发现需要提取的文本'。
   *  - 结果展示：单文件平铺，目录按文件分组。
   *  - 应用目标与完成日志：单文件就处理入参那一个文件、日志不带数量；目录以
   *    extractedStrings 的 filePath 去重（见下方 path.normalize 注释）、日志带文件数。
   */
  private async runPipeline(
    files: string[],
    skipLLM: boolean,
    mode: 'file' | 'directory',
  ): Promise<void> {
    const extractor = this.adapter.getTextExtractor();
    const sourceSnapshots = this.captureSourceSnapshots(files);
    const extractedStrings =
      mode === 'file'
        ? await extractor.extractFromFile(files[0]!)
        : await extractor.extractFromFiles(files);
    // 把 extractor 累积的结构性 warning（如跳过含 HTML 的模板字符串）排空进 RunReport。
    // 终端已经实时打印过；这里只为落盘留痕到 `<rootDir>/.i18n-tools/logs/`，便于事后回查。
    for (const w of extractor.drainWarnings()) this.report.addWarning(w);
    // 提取后立即 drain 出快照交给 CoverageReporter 持有，供 commitToDisk / lint / 覆盖率共享。
    // 收集器挂在 extractor 实例上（ExtractionDiagnostics），drain 一次分发给多个消费者，
    // 而不是让各消费者各自去取——drain 是消耗性的，谁先取谁独吞。
    const manualSkips = extractor.drainManualSkips();
    const diagnostics = extractor.getDiagnostics();
    this.coverage.setExtractionSnapshots({
      manualSkips,
      skippedComparisons: diagnostics.drainSkippedComparisonOperands(),
      skippedNestedChinese: diagnostics.drainSkippedNestedChinese(),
    });

    if (extractedStrings.length === 0) {
      // 仍要汇报覆盖率：空提取也意味着「文件无中文 / 已全部国际化」，是一种有效结果。
      // 必须扫描已有 t()/$t() 调用点填充 alreadyI18n，否则「已全量国际化 + 仅剩比较运算符
      // 跳过项」的文件会因 skipped>0、alreadyI18n=0 被算成 0% 覆盖率，误触 --coverage-threshold。
      this.coverage.recordAndRender(files, [], this.coverage.buildScanResolver(files));
      LoggerUtils.info(
        mode === 'file' ? '✅ 未发现需要提取的文本' : '✅ 所有文件均未发现需要提取的文本',
      );
      return;
    }

    const reuseResolver = await this.generateIdsForStrings(extractedStrings, skipLLM, files);
    this.displayResults(extractedStrings, mode === 'directory');

    const shouldApply = this.interactive
      ? await InteractiveUtils.promptForGenericConfirmation('是否应用这些转换？', {
          default: true,
        })
      : true;

    if (shouldApply) {
      // 目录路径的 path.normalize 兜底：上游 ExtractedString.filePath 可能因为来源路径不同
      // （例如 ts.createSourceFile 内部 normalizePath 把 \ 替换成 /）出现同一文
      // 件被记成两条不同字符串。Set 直接用 === 去重会漏掉，导致同一文件被
      // transform 多次、第二次在已被改写的源码上越界。
      const processedFiles =
        mode === 'file'
          ? files
          : Array.from(new Set(extractedStrings.map((s) => path.normalize(s.filePath))));
      await this.applyTransformations(processedFiles, extractedStrings, sourceSnapshots);
      LoggerUtils.success(
        mode === 'file' ? `✅ 转换完成！` : `✅ 转换完成！处理了 ${processedFiles.length} 个文件`,
      );
    } else {
      // 用户选择不应用：同上置位，避免收尾打「✅ 完成」让人以为转换已落盘。
      // 覆盖率仍照常统计渲染——它反映的是本次扫描结果，与是否落盘无关。
      this.cancelled = true;
      LoggerUtils.warn('操作已取消');
    }

    this.coverage.recordAndRender(files, extractedStrings, reuseResolver);
  }

  /**
   * 把原文清理成「给 LLM 看的版本」：去除前导序号噪音。
   *
   * 例：「9. 消息提示」→「消息提示」。LLM 据此生成 `messagePrompt` 而非
   * `messagePrompt9`（LLM 会把序号 9 挪到末尾，sanitize 也无法去除）。
   * locale 文件中的 value 仍是原文「9. 消息提示」，仅 ID 命名脱敏。
   */
  private static cleanForLLM(text: string): string {
    // 剥离前导列表序号（「9. 消息提示」→「消息提示」）。首个分隔符要么是非小数点的列表标点，
    // 要么是「后面不跟数字的点」——借 `\.(?!\d)` 排除小数：避免 `3.14元` 被 `\d+` 吃掉整数部分后
    // 把小数点连同 `3` 一起删成 `14元`。首个分隔符之后才允许任意点号（如 `9... 提示`）。
    return (
      text.replace(/^\s*\d+(?:[、。)）:：、\s]|\.(?!\d))[.、。)）:：、\s]*/, '').trim() || text
    );
  }

  /**
   * 把一条提取结果规整为「最终 locale 形态」的文案：
   *  - 模板串的 ${var} 占位符 → {var}（按 i18n 库做方言适配）、字面量插值内联；
   *  - 普通字符串去除两端引号。
   *
   * Why（关键）：复用查找（resolveSemanticId）与 locale 落盘（buildLocaleDelta）必须用同一
   * canonical 形态。否则模板/占位符串两边形态不一致——反查表（IdReuseResolver.loadFromLocaleFile
   * 用 {var} 形态建表）永远 miss，跨运行重复生成 _N 后缀 key：旧 key（带译文）成孤儿、源码改指向
   * 无译文的新 key。两处统一走本方法，杜绝形态漂移。
   */
  private toLocaleMessage(item: ExtractedString): string {
    return buildLocaleMessage(item, this.adapter.getLibrary());
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
    scannedFilePaths?: string[],
  ): Promise<IdReuseResolver> {
    const fileGroups = groupBy(extractedStrings, (str) => str.filePath);
    const textToIdMap = new Map<string, string>();

    const reuseResolver = new IdReuseResolver(this.config, this.isCustom);
    // 覆盖率分子（已国际化调用点）应覆盖全部被扫描文件，而非仅「还含新中文」的文件。
    // 否则已 100% 国际化的文件被算进扫描分母却不计其 t() 调用点 → 覆盖率被系统性低估，
    // 会误触 --coverage-threshold 的 CI 卡点。无显式入参时回退到有提取的文件（兼容旧调用）。
    reuseResolver.scanExistingCallsInSources(scannedFilePaths ?? Object.keys(fileGroups));

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
        const rawIds = idResults[filePath] || [];

        // 数量不匹配（LLM 丢/多一条）时，id_list 是位置数组，按位 ids[index] 取值会把
        // 错位的有效 id 当语义 ID 写成 key。此处整文件丢弃 LLM 结果、强制本地回退，
        // 兑现下方警告承诺（而非只警告却仍按位错配）。
        const mismatched = !skipLLM && rawIds.length !== strings.length;
        if (mismatched) {
          LoggerUtils.warn(
            `[${FileUtils.getRelativePath(filePath)}] LLM返回的ID数量与文本数量不匹配 (期望 ${strings.length}, 收到 ${rawIds.length})，将使用本地ID生成进行回退。`,
          );
        }
        const ids = mismatched ? [] : rawIds;

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
    // 复用查找键须用「最终 locale 形态」（{var} 占位符），与 buildLocaleDelta 落盘值及
    // IdReuseResolver 反查表保持一致；否则占位符串跨运行重复生成 _N 后缀 key。
    const messageForId = this.toLocaleMessage(item);
    const normalized = IdReuseResolver.normalizeKey(messageForId);

    // 优先级 1 缓存键：acrossDirectories=false 时必须带目录前缀，否则同一原文会跨目录命中
    // 错误复用（把 order 模块的 key 种进 user 模块），绕过下方 pickReusableKey 的目录隔离。
    // acrossDirectories=true 时全局复用本就是预期，用裸 normalized 即可。
    // 用空格拼接安全无歧义：目录前缀是经 sanitize 的标识符段（不含空格），故空格分隔不会与
    // 原文里的空格混淆造成碰撞。
    const lookupKey = this.config.keys.reuse.acrossDirectories
      ? normalized
      : `${normalized} ${reuseResolver.getIdGenerator().getDirectoryPrefix(item.filePath) ?? ''}`;

    // 优先级 1：本批次内同原文 + 同目录前缀已生成 → 直接复用
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
          // `||` 而非 `??`：llm-client 对 LLM 漏答的条目显式置 ''，空串必须与下方
          // 非提升分支同口径走本地兜底，否则 sanitize('') 恒回退 t_<hash('')>，
          // 所有漏答原文共用同一基名、只靠顺序相关的 _N 后缀区分。
          llmId || GenerateProcessor.cleanForLLM(messageForId),
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
      const fileGroups = groupBy(extractedStrings, (str) => str.filePath);

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
        const relPath = normalizePosix(path.relative(this.config.root, item.filePath));
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

  /** 在提取前固定源码快照，后续转换只允许消费同一份内容。 */
  private captureSourceSnapshots(filePaths: string[]): Map<string, string> {
    const snapshots = new Map<string, string>();
    for (const filePath of filePaths) {
      snapshots.set(path.normalize(filePath), fs.readFileSync(filePath, 'utf-8'));
    }
    return snapshots;
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
    sourceSnapshots?: Map<string, string>,
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
        const extractedSnapshot = sourceSnapshots?.get(path.normalize(filePath));
        if (extractedSnapshot !== undefined && originalContent !== extractedSnapshot) {
          throw new Error(
            `源码已变化，已中止转换以避免覆盖外部修改: ${FileUtils.getRelativePath(filePath)}`,
          );
        }
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
          failures
            .map(
              (f) =>
                `  - ${FileUtils.getRelativePath(f.file)}: ${f.error instanceof Error ? f.error.message : String(f.error)}`,
            )
            .join('\n'),
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
    results: Array<{ file: string; code: string; originalContent?: string }>,
    extractedStrings: ExtractedString[],
    keyBucketMap: Record<string, string> | undefined,
    options?: { preFinalizedLocale?: boolean },
  ): Promise<void> {
    // 阶段 1.4（写源码前损坏守卫）：桶式读取默认 silent 降级（损坏 JSON 当 {}）；缺这层守卫时，
    // 损坏 bucket 的存量 key 会在重写时被静默丢弃/覆盖（连 .bak 都没有，真丢）。
    // 与 Merge/Pick/Prune 的「损坏即中止」对齐，且必须前移到写源码之前，避免留下「源码已改、
    // locale 未写」的不一致态。generate 仅更新 source locale，故只校验 source 桶。
    // 非桶式同样需要前置守卫（与桶式 / PickProcessor 对齐）：source locale「有内容却
    // 解析失败」时 readLocaleFile 返回 null，而阶段 3 的 updateLanguageFiles 对 null 静默
    // return（不写、不抛）。若放任继续，会把源码改写成 t() 调用却一个 locale key 都不落、
    // 且无异常触发回滚、命令仍报成功——留下「源码已改、locale 未写」的不一致态。
    // 探测口径（桶式 / 遗留单文件 / 单文件）统一收口于 findCorruptLocale；generate 仅更新
    // source locale，故只校验 source。
    const corruptSource = this.langFiles.findCorruptLocale(this.config.locales.source, {
      checkLegacy: true,
    });
    if (corruptSource) {
      throw new Error(
        this.config.buckets
          ? `语言文件损坏，已中止 generate（避免覆盖丢失存量翻译，请用 git 修复后重试）: ${FileUtils.getRelativePath(corruptSource)}`
          : `语言文件损坏，已中止 generate（避免源码已改写而 locale 未更新的不一致态，请用 git 修复后重试）: ${FileUtils.getRelativePath(corruptSource)}`,
      );
    }

    // 阶段 1.5（写源码前预检）：把 nested 前缀冲突这类确定性、可预判的 locale 序列化错误
    // 前移到源码尚未改写时暴露。否则先写源码、阶段 3 才在 updateLanguageFiles 内做前缀冲突
    // 校验，一旦抛错会留下「源码已改、locale 未写」的不一致态（重跑找不到中文、需 git 回滚）。
    this.langFiles.assertSerializableUpdate(extractedStrings, keyBucketMap);

    // 阶段 2：原子地写所有源码——单文件写失败立即停止并回滚已写文件，确保「要么全改、
    // 要么全不改」；此时语言文件尚未更新，不会留下源码-语言文件不一致的污染态。
    const written: Array<{ file: string; original: string }> = [];
    let writeFailure: { file: string; error: unknown } | null = null;
    for (const { file, code, originalContent } of results) {
      // 回滚基线：commit 路径与 apply 路径均已带 originalContent（apply 取自 verifyFingerprint
      // 校验时读取的同一快照，消除「校验→读取」窗口）。`??` 仅作防御性兜底；读不到则无法
      // 保证可回滚，判失败不写。
      let original: string;
      try {
        const currentContent = fs.readFileSync(file, 'utf-8');
        original = originalContent ?? currentContent;
        if (currentContent !== original) {
          writeFailure = {
            file,
            error: new Error(
              `源码已变化，已中止写入以避免覆盖外部修改: ${FileUtils.getRelativePath(file)}`,
            ),
          };
          break;
        }
      } catch (error) {
        writeFailure = { file, error };
        break;
      }
      try {
        fs.writeFileSync(file, code, 'utf-8');
        written.push({ file, original });
      } catch (error) {
        writeFailure = { file, error };
        break;
      }
    }

    if (writeFailure) {
      LoggerUtils.error(
        `❌ 写入失败 ${FileUtils.getRelativePath(writeFailure.file)}:`,
        writeFailure.error,
      );
      this.report.addFailure({
        stage: 'write',
        file: FileUtils.getRelativePath(writeFailure.file),
        error: writeFailure.error,
      });
      // 回滚已写文件至原始内容，恢复「全不改」状态
      const rollbackFailures = this.rollbackWritten(written);
      const rollbackNote =
        rollbackFailures.length > 0
          ? this.rollbackFailureNote(rollbackFailures)
          : `\n（已写入的 ${written.length} 个源文件已回滚至原始内容，源码与语言文件均未变更）`;
      throw new Error(
        `写入阶段失败（语言文件未变更）: ${FileUtils.getRelativePath(writeFailure.file)}: ${
          writeFailure.error instanceof Error
            ? writeFailure.error.message
            : String(writeFailure.error)
        }` + rollbackNote,
      );
    }

    // 阶段 3：源码全部落盘后才更新语言文件，保持两者强一致。
    // updateLanguageFiles 失败（磁盘 I/O、权限、多 bucket 写到一半抛错等非确定性错误）时，
    // 源码已落盘但 locale 未写，会留下「源码已变 t()、locale 缺失」的污染态，破坏阶段 2
    // 宣称的「要么全改、要么全不改」。故与阶段 2 对称：捕获失败并按 written[] 回滚源码。
    try {
      this.langFiles.updateLanguageFiles(
        extractedStrings,
        keyBucketMap,
        this.report,
        this.adapter.getLibrary(),
        {
          preFinalized: Boolean(options?.preFinalizedLocale),
          // 把提取阶段 drain 的快照交给 linter，让它与 coverage 看到同一份比较运算符跳过项。
          skippedComparisons: this.coverage.getSkippedComparisons(),
        },
      );
    } catch (error) {
      LoggerUtils.error('❌ 语言文件写入失败，回滚已写源码:', error);
      this.report.addFailure({ stage: 'write', error });
      const rollbackFailures = this.rollbackWritten(written);
      const rollbackNote =
        rollbackFailures.length > 0
          ? this.rollbackFailureNote(rollbackFailures)
          : `\n（已写入的 ${written.length} 个源文件已回滚至原始内容；但语言文件可能已部分写入` +
            `（多 bucket 顺序落盘时中途失败），请用 git 核查 locale 是否残留本轮新增 key）`;
      throw new Error(`语言文件写入阶段失败（源码已回滚）` + rollbackNote, { cause: error });
    }

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
   * 把 written[] 中已落盘的源文件逐个写回原始内容（事务回滚）。
   * 返回回滚失败的文件相对路径列表，供调用方拼提示。
   * 阶段 2（写源码失败）与阶段 3（写语言文件失败）共用同一回滚逻辑。
   */
  private rollbackWritten(written: { file: string; original: string }[]): string[] {
    const rollbackFailures: string[] = [];
    for (const { file, original } of written) {
      try {
        fs.writeFileSync(file, original, 'utf-8');
      } catch (rbError) {
        rollbackFailures.push(FileUtils.getRelativePath(file));
        LoggerUtils.error(`❌ 回滚失败 ${FileUtils.getRelativePath(file)}:`, rbError);
      }
    }
    return rollbackFailures;
  }

  /** 回滚存在失败时的统一提示文案（成功提示因阶段而异，由各调用方自行拼接）。 */
  private rollbackFailureNote(rollbackFailures: string[]): string {
    return (
      `\n⚠️  以下 ${rollbackFailures.length} 个文件回滚失败，请用 git 手动还原:\n` +
      rollbackFailures.map((f) => `  - ${f}`).join('\n')
    );
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
    sourceSnapshots?: Map<string, string>,
  ): Promise<void> {
    LoggerUtils.info(`\n🔄 开始应用转换...`);
    const keyBucketMap = this.buildKeyBucketMap(extractedStrings);
    const { results, uniqueFilePaths } = this.transformToMemory(
      filePaths,
      extractedStrings,
      sourceSnapshots,
    );

    if (this.runMode === 'dry-run') {
      // 与 commitToDisk 阶段 1.5 同一道预检：nested 前缀冲突 / 保留段是确定性错误，
      // dry-run 跳过它只会产出一份注定 apply 失败的 plan（用户 review 完才在 apply 时踩雷）。
      // 提前到 writePlan 前跑，让错误在 dry-run 当场暴露。
      this.langFiles.assertSerializableUpdate(extractedStrings, keyBucketMap);
      this.planApplier.writePlan(uniqueFilePaths, results, extractedStrings, keyBucketMap, {
        planOutputDir: this.planOutputDir,
        skipLLM: this.lastSkipLLM,
        // 与 commitToDisk 同源：linter 与 coverage 共享同一份比较运算符跳过项快照。
        skippedComparisons: this.coverage.getSkippedComparisons(),
      });
      return;
    }

    // 传入 originalContent 作为写失败时的回滚基线（commitToDisk 据此保证源码原子写）
    await this.commitToDisk(results, extractedStrings, keyBucketMap);
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
    // 必须真用 createRequire：本包 "type":"module"，裸 require 在源码直跑（tsx / vitest）
    // 下是 ReferenceError（此前只在 dist 里靠打包器把 package.json 内联才碰巧工作，
    // toolVersion 在源码运行时恒为 undefined）。
    // 多候选相对路径：源码运行时本文件在 src/core/（../../ 到包根），构建产物在 dist/
    // （../ 到包根）。按包名校验命中，避免误读消费项目的 package.json。
    // 注意：包若改名需同步下方字面量，否则本方法静默退化为恒 undefined（有回归测试钉住）。
    const requireFromHere = createRequire(import.meta.url);
    for (const rel of ['../../package.json', '../package.json']) {
      try {
        const pkg = requireFromHere(rel) as { name?: string; version?: string };
        if (pkg.name === '@kit/i18n-tools' && pkg.version) return pkg.version;
      } catch {
        // 尝试下一个候选路径
      }
    }
    return undefined;
  }

  /**
   * apply-plan 入口：从已有 plan.json 直接回放，跳过 AST 解析与 LLM 调用。
   *
   * 本方法只负责套上 Processor 的生命周期外壳（RunReport 落盘、成功/失败收尾），
   * 回放流程与其取舍详见 PlanApplier.apply。
   */
  async applyFromPlan(planPath: string, options: { keepPlan?: boolean } = {}): Promise<void> {
    return this.executeWithLifecycle(async () => {
      const outcome = await this.planApplier.apply(planPath, {
        keepPlan: Boolean(options.keepPlan),
        interactive: this.interactive,
      });
      // locale 漂移确认里选了否：置位让收尾打「已取消」而非「✅ 完成」。
      if (outcome === 'cancelled') this.cancelled = true;
    });
  }
}
