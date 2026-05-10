import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import { CommandUtils } from '../utils/command-utils';
import { FileUtils } from '../utils/file-utils';
import { LLMClient } from '../utils/llm-client';
import { IdGenerator } from '../utils/id-generator';
import { InteractiveUtils } from '../utils/interactive-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import type { ExtractedString } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';

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
   */
  constructor(config: ResolvedConfig, isCustom: boolean = false, interactive: boolean = true) {
    super(config, isCustom);
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

  private async generateIdsForStrings(
    extractedStrings: ExtractedString[],
    skipLLM: boolean = false,
  ): Promise<void> {
    const fileGroups = FileUtils.groupBy(extractedStrings, (str) => str.filePath);
    const textToIdMap = new Map<string, string>();
    const existingIds = new Set<string>();

    /**
     * 把原文规范化为查表键：去首尾空白、压缩空白序列。
     *
     * 防止「电话号码」与「电话号码 」（多了空格）这类视觉相同但字符串不等的
     * 文本被分配两个不同的 key。
     */
    const normalizeKey = (text: string): string => text.trim().replace(/\s+/g, ' ');

    /**
     * 把原文清理成「给 LLM 看的版本」：去除前导序号噪音。
     *
     * 例：「9. 消息提示」→「消息提示」。LLM 据此生成 `messagePrompt` 而非
     * `messagePrompt9`（原先 LLM 把 9 挪到末尾，sanitize 也无法去除）。
     * locale 文件中的 value 仍是原文「9. 消息提示」，仅 ID 命名脱敏。
     */
    const cleanForLLM = (text: string): string =>
      text.replace(/^\s*\d+\s*[.、。)）:：、\s]+/, '').trim() || text;

    /**
     * 复用 ID 时的目录前缀约束策略。
     *
     * - `sameDir`（默认）：仅当历史 key 的目录前缀与当前文件相同才复用。
     *   避免出现 `views/demo/` 下的代码引用 `components/ButtonDemo/` 的 key。
     * - `global`：全局复用，相同原文必复用同一 key（最大去重，但跨包引用）。
     *
     * 通过 `i18n.config.ts` 的 `idPrefix.reuseAcrossDirectories` 控制（默认 false）。
     */
    const allowGlobalReuse = this.config.idPrefix?.reuseAcrossDirectories === true;

    /**
     * 已有原文 → 候选 key 列表。
     * 同一原文历史上可能在多个目录下有不同 key（如 components__X__submit 与
     * views__demo__submit 都对应「提交」），需要按当前文件的目录前缀挑选。
     */
    const messageToKeysMap = new Map<string, string[]>();

    // 从 locale 文件读取已有 ID，防止增量运行时键值冲突
    const localeMap = LanguageFileManager.readLocaleFile(this.config, this.isCustom);
    if (localeMap) {
      for (const [key, value] of Object.entries(localeMap)) {
        existingIds.add(key);
        if (typeof value === 'string') {
          const normalized = normalizeKey(value);
          const arr = messageToKeysMap.get(normalized);
          if (arr) arr.push(key);
          else messageToKeysMap.set(normalized, [key]);
        }
      }
    }

    /**
     * 在历史 key 集合中挑选与当前文件目录前缀匹配的那个；若 allowGlobalReuse 为
     * true 或没有同前缀候选，回退到第一个历史 key。
     */
    const pickReusableKey = (message: string, filePath: string): string | undefined => {
      const candidates = messageToKeysMap.get(normalizeKey(message));
      if (!candidates || candidates.length === 0) return undefined;

      const currentPrefix = IdGenerator.getDirectoryPrefix(filePath, this.config.idPrefix);
      if (!currentPrefix) {
        return allowGlobalReuse ? candidates[0] : undefined;
      }

      const sameDirHit = candidates.find((k) => k.startsWith(currentPrefix));
      if (sameDirHit) return sameDirHit;
      return allowGlobalReuse ? candidates[0] : undefined;
    };

    // 从源文件中扫描已有的 t()/$t() 调用
    for (const filePath of Object.keys(fileGroups)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const i18nKeyPattern = /(?:\$t|(?<!\w)t)\s*\(\s*['"]([^'"]+)['"]/g;
        let match;
        while ((match = i18nKeyPattern.exec(content)) !== null) {
          if (match[1]) existingIds.add(match[1]);
        }
      } catch {
        /* 忽略读取失败 */
      }
    }

    const textGroups: Record<string, string[]> = {};
    Object.entries(fileGroups).forEach(([filePath, strings]) => {
      // 给 LLM 的文本去序号噪音，但保留 locale value 中的原文
      textGroups[filePath] = strings.map((item) =>
        cleanForLLM(item.processedMessage || item.original),
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
          const messageForId = item.processedMessage || item.original;
          const lookupKey = normalizeKey(messageForId);

          // 优先级 1：本批次内已生成（同一原文跨文件复用，受同 prefix 约束）
          if (textToIdMap.has(lookupKey)) {
            item.semanticId = textToIdMap.get(lookupKey)!;
            return;
          }

          // 优先级 2：locale 文件中已有相同原文（按目录前缀挑选最合适的历史 key）
          const reusedId = pickReusableKey(messageForId, item.filePath);
          if (reusedId) {
            textToIdMap.set(lookupKey, reusedId);
            item.semanticId = reusedId;
            return;
          }

          // 优先级 3：本次新生成
          let finalId: string;
          const llmId = ids[index];

          if (llmId) {
            // LLM 返回的是纯语义 ID，需要添加目录前缀
            finalId = IdGenerator.addDirectoryPrefixToId(
              item.filePath,
              llmId,
              existingIds,
              this.config.idPrefix,
            );
          } else {
            // LLM 未返回或跳过，本地生成（内部已包含目录前缀）
            finalId = IdGenerator.generateWithFilePath(
              item.filePath,
              cleanForLLM(messageForId),
              existingIds,
              this.config.idPrefix,
            );
          }

          textToIdMap.set(lookupKey, finalId);
          // 同次内后续文件也能复用：把刚生成的 finalId 也加入候选集
          const arr = messageToKeysMap.get(lookupKey);
          if (arr) arr.push(finalId);
          else messageToKeysMap.set(lookupKey, [finalId]);
          item.semanticId = finalId;
        });
      });

      LoggerUtils.success(`✅ 并发处理完成，共生成 ${textToIdMap.size} 个唯一语义ID`);
    } catch (error) {
      LoggerUtils.error(`处理文件时发生严重错误:`, error);
      throw new Error('语义ID生成失败', { cause: error });
    }
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

    LanguageFileManager.updateLanguageFiles(this.config, this.isCustom, extractedStrings);

    const transformer = this.adapter.getTransformer();
    const failures: Array<{ file: string; error: unknown }> = [];
    // 最后一道闸：即便调用方传入了重复路径（包括 normalize 后仍不一致的情况），
    // 也确保每个文件只 transform 一次——避免在已被改写的源码上重新 parse 时越界。
    const uniqueFilePaths = Array.from(new Set(filePaths.map((p) => path.normalize(p))));
    for (const filePath of uniqueFilePaths) {
      try {
        const transformedCode = transformer.transform(filePath, extractedStrings);
        fs.writeFileSync(filePath, transformedCode, 'utf-8');
        if (this.config.format) {
          await CommandUtils.formatWithPrettier(filePath);
        }
        LoggerUtils.success(`✅ 已转换: ${FileUtils.getRelativePath(filePath)}`);
      } catch (error) {
        LoggerUtils.error(`❌ 转换失败 ${FileUtils.getRelativePath(filePath)}:`, error);
        failures.push({ file: filePath, error });
      }
    }

    if (failures.length > 0) {
      // 部分失败必须上抛，避免 AutomaticProcessor 在残缺转换结果上继续推进 pick → translate
      throw new Error(
        `转换阶段有 ${failures.length}/${uniqueFilePaths.length} 个文件失败:\n` +
          failures.map((f) => `  - ${FileUtils.getRelativePath(f.file)}`).join('\n'),
      );
    }

    LoggerUtils.success('✅ 应用转换完成');
    LoggerUtils.info(`✨ 处理文件列表: \n- ${uniqueFilePaths.join('\n- ')}`);
  }
}
