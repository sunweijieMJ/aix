import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import type { FrameworkAdapter } from '../adapters';
import { formatWithPrettier } from '../utils/command-utils';
import { FileUtils } from '../utils/file-utils';
import { LLMClient } from '../utils/llm-client';
import { IdGenerator } from '../utils/id-generator';
import { InteractiveUtils } from '../utils/interactive-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import { ModuleResolver } from '../utils/module-resolver';
import type { ExtractedString } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';
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
    this.llmClient = new LLMClient(
      config.llm.idGeneration,
      config.concurrency.idGeneration,
      config.locale,
      config.prompts,
    );
    // 全局 batchDelay 同样应用到 ID 生成的 LLM 调用
    this.llmClient.setBatchDelay(config.batchDelay);
  }

  protected getOperationName(): string {
    return '代码生成';
  }

  async execute(targetPath: string, skipLLM: boolean = false): Promise<void> {
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
        LoggerUtils.info('✅ 未发现需要提取的文本');
        return;
      }

      await this.generateIdsForStrings(extractedStrings, skipLLM);
      this.displayResults(extractedStrings);

      const shouldApply = this.interactive
        ? await InteractiveUtils.promptForGenericConfirmation('是否应用这些转换？')
        : true;

      if (shouldApply) {
        await this.applyTransformations([filePath], extractedStrings);
        LoggerUtils.success(`✅ 转换完成！`);
      }
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
      this.config.exclude,
      this.config.include,
      this.config.rootDir,
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
      LoggerUtils.info('✅ 所有文件均未发现需要提取的文本');
      return;
    }

    await this.generateIdsForStrings(extractedStrings, skipLLM);
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
  ): Promise<void> {
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
    // 不回迁历史 key（见 IdPrefixConfig.promoteToCommon 注释）。
    const promoteToCommon = reuseResolver.shouldPromoteToCommon(messageForId, item.filePath);
    const finalId = promoteToCommon
      ? IdGenerator.generateWithFixedPrefix(
          reuseResolver.getCommonNamespace(),
          llmId ?? GenerateProcessor.cleanForLLM(messageForId),
          existingIds,
          this.config.idPrefix,
        )
      : llmId
        ? IdGenerator.addDirectoryPrefixToId(
            item.filePath,
            llmId,
            existingIds,
            this.config.idPrefix,
          )
        : IdGenerator.generateWithFilePath(
            item.filePath,
            GenerateProcessor.cleanForLLM(messageForId),
            existingIds,
            this.config.idPrefix,
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

  private async applyTransformations(
    filePaths: string[],
    extractedStrings: ExtractedString[],
  ): Promise<void> {
    LoggerUtils.info(`\n🔄 开始应用转换...`);

    let keyModuleMap: Record<string, string> | undefined;
    if (this.config.modules) {
      const resolver = new ModuleResolver(this.config.modules);
      keyModuleMap = {};
      for (const item of extractedStrings) {
        if (item.semanticId) {
          // glob 规则用相对路径（如 src/views/order/**），必须转成相对 rootDir 的路径才能命中
          const relPath = path.relative(this.config.rootDir, item.filePath).replace(/\\/g, '/');
          keyModuleMap[item.semanticId] = resolver.resolve(
            relPath,
            item.semanticId,
            item.processedMessage || item.original,
          );
        }
      }
    }

    const transformer = this.adapter.getTransformer();
    // 最后一道闸：即便调用方传入了重复路径（包括 normalize 后仍不一致的情况），
    // 也确保每个文件只 transform 一次——避免在已被改写的源码上重新 parse 时越界。
    const uniqueFilePaths = Array.from(new Set(filePaths.map((p) => path.normalize(p))));

    // 事务语义：先把全部源码 transform 到内存，全部成功后再落盘 + 更新语言文件。
    // Why：AST 转换失败是最常见的运行时错误（语法边界 case、第三方 AST 库异常等），
    // 若按"边算边写"流程，前 N 个文件成功落盘 + 语言文件被污染，第 N+1 个失败
    // 抛错——会留下"语言文件有 key 但源码无 t() 调用"的孤儿 key，污染后续 pick/
    // translate/export，且重 generate 不会自愈（updateLanguageFiles 只追加）。
    // 现在阶段 1 拦截最常见的失败，源码与语言文件双双保持原状，可安全重试。

    // 阶段 1：transform 到内存
    const transformResults: Array<{ file: string; code: string }> = [];
    const transformFailures: Array<{ file: string; error: unknown }> = [];
    for (const filePath of uniqueFilePaths) {
      try {
        const code = transformer.transform(filePath, extractedStrings);
        transformResults.push({ file: filePath, code });
      } catch (error) {
        LoggerUtils.error(`❌ 转换失败 ${FileUtils.getRelativePath(filePath)}:`, error);
        transformFailures.push({ file: filePath, error });
        this.report.addFailure({
          stage: 'transform',
          file: FileUtils.getRelativePath(filePath),
          error,
        });
      }
    }

    if (transformFailures.length > 0) {
      throw new Error(
        `转换阶段有 ${transformFailures.length}/${uniqueFilePaths.length} 个文件失败（语言文件未变更）:\n` +
          transformFailures.map((f) => `  - ${FileUtils.getRelativePath(f.file)}`).join('\n'),
      );
    }

    // 阶段 2：原子地写所有源码。任一写失败立即抛错，此时语言文件仍未更新，
    // 不会留下源码-语言文件不一致的污染态（已落盘的部分源码 + 未污染的语言文件，
    // 重试时 transformer 在已修改源码上跑也能正确处理已有 t() 调用）。
    const writeFailures: Array<{ file: string; error: unknown }> = [];
    for (const { file, code } of transformResults) {
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
        `写入阶段有 ${writeFailures.length}/${transformResults.length} 个文件失败（语言文件未变更）:\n` +
          writeFailures.map((f) => `  - ${FileUtils.getRelativePath(f.file)}`).join('\n'),
      );
    }

    // 阶段 3：源码全部落盘后才更新语言文件，保持两者强一致。
    // 透传 RunReport：LocaleValueLinter 检出的 warning 会同时落盘到
    // `.i18n-tools/logs/`，事后可回查（仅 console 会被终端刷掉）。
    LanguageFileManager.updateLanguageFiles(
      this.config,
      this.isCustom,
      extractedStrings,
      keyModuleMap,
      this.report,
    );

    // 阶段 4：格式化是美化步骤，单个失败不影响数据正确性，仅警告。
    if (this.config.format) {
      for (const { file } of transformResults) {
        try {
          await formatWithPrettier(file);
        } catch (error) {
          LoggerUtils.warn(`⚠️  格式化失败（已忽略）${FileUtils.getRelativePath(file)}: ${error}`);
        }
      }
    }

    for (const { file } of transformResults) {
      LoggerUtils.success(`✅ 已转换: ${FileUtils.getRelativePath(file)}`);
    }
    LoggerUtils.success('✅ 应用转换完成');
    LoggerUtils.info(`✨ 处理文件列表: \n- ${uniqueFilePaths.join('\n- ')}`);
  }
}
