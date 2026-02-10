import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { ReactAdapter, VueAdapter } from '../adapters';
import type { FrameworkAdapter } from '../adapters';
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
  /** 框架类型 */
  private framework: 'react' | 'vue';
  /** 框架适配器 */
  private adapter: FrameworkAdapter;

  /**
   * 构造函数
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   */
  constructor(config: ResolvedConfig, isCustom: boolean = false) {
    super(config, isCustom);
    this.framework = config.framework;
    this.adapter =
      config.framework === 'vue'
        ? new VueAdapter(config.paths.tImport, config.vue.library, {
            namespace: config.vue.namespace || undefined,
          })
        : new ReactAdapter(config.paths.tImport, config.react.library, {
            namespace: config.react.namespace || undefined,
          });
    this.llmClient = new LLMClient(
      config.llm.idGeneration,
      config.concurrency.idGeneration,
      config.locale,
      config.prompts,
    );
  }

  protected getOperationName(): string {
    return '代码生成';
  }

  async execute(targetPath: string, skipLLM: boolean = false): Promise<void> {
    return this.executeWithLifecycle(() => this._execute(targetPath, skipLLM));
  }

  private async _execute(
    targetPath: string,
    skipLLM: boolean = false,
  ): Promise<void> {
    const validation = FileUtils.validateTargetPath(targetPath, this.framework);
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

  async runSingleFile(
    filePath: string,
    skipLLM: boolean = false,
  ): Promise<void> {
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

      const shouldApply =
        await InteractiveUtils.promptForGenericConfirmation(
          '是否应用这些转换？',
        );

      if (shouldApply) {
        await this.applyTransformations([filePath], extractedStrings);
        LoggerUtils.success(`✅ 转换完成！`);
      }
    } catch (error) {
      LoggerUtils.error(`处理文件时发生错误: ${error}`);
      throw error;
    }
  }

  private async runDirectory(
    dirPath: string,
    skipLLM: boolean = false,
  ): Promise<void> {
    LoggerUtils.info(`🚀 开始分析目录: ${FileUtils.getRelativePath(dirPath)}`);

    const frameworkFiles = FileUtils.getFrameworkFiles(
      dirPath,
      this.framework,
      this.config.exclude,
    );
    const frameworkName = this.framework === 'vue' ? 'Vue' : 'React';

    if (frameworkFiles.length === 0) {
      LoggerUtils.info(`✅ 目录中未找到${frameworkName}文件`);
      return;
    }

    LoggerUtils.info(
      `📁 找到 ${frameworkFiles.length} 个${frameworkName}文件:`,
    );
    frameworkFiles.forEach((file, index) => {
      LoggerUtils.info(`  ${index + 1}. ${FileUtils.getRelativePath(file)}`);
    });

    const shouldProceed =
      await InteractiveUtils.promptForGenericConfirmation(
        '是否继续分析这些文件？',
      );
    if (!shouldProceed) {
      LoggerUtils.warn('❌ 已取消操作');
      return;
    }

    const extractor = this.adapter.getTextExtractor();
    const extractedStrings = await extractor.extractFromFiles(frameworkFiles);

    if (extractedStrings.length === 0) {
      LoggerUtils.info('✅ 所有文件均未发现需要提取的文本');
      return;
    }

    await this.generateIdsForStrings(extractedStrings, skipLLM);
    this.displayResults(extractedStrings, true);

    const shouldApply =
      await InteractiveUtils.promptForGenericConfirmation('是否应用这些转换？');

    if (shouldApply) {
      const processedFiles = Array.from(
        new Set(extractedStrings.map((s) => s.filePath)),
      );
      await this.applyTransformations(processedFiles, extractedStrings);
      LoggerUtils.success(
        `✅ 转换完成！处理了 ${processedFiles.length} 个文件`,
      );
    }
  }

  private async generateIdsForStrings(
    extractedStrings: ExtractedString[],
    skipLLM: boolean = false,
  ): Promise<void> {
    const fileGroups = FileUtils.groupBy(
      extractedStrings,
      (str) => str.filePath,
    );
    const textToIdMap = new Map<string, string>();
    const existingIds = new Set<string>();

    // 从 locale 文件读取已有 ID，防止增量运行时键值冲突
    const localeMap = LanguageFileManager.readLocaleFile(
      this.config,
      this.isCustom,
    );
    if (localeMap) {
      for (const key of Object.keys(localeMap)) {
        existingIds.add(key);
      }
    }

    // 从源文件中扫描已有的 t()/$t() 调用
    const i18nKeyPattern = /(?:\$t|(?<!\w)t)\s*\(\s*['"]([^'"]+)['"]/g;
    for (const filePath of Object.keys(fileGroups)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let match;
        while ((match = i18nKeyPattern.exec(content)) !== null) {
          if (match[1]) existingIds.add(match[1]);
        }
        i18nKeyPattern.lastIndex = 0;
      } catch {
        /* 忽略读取失败 */
      }
    }

    const textGroups: Record<string, string[]> = {};
    Object.entries(fileGroups).forEach(([filePath, strings]) => {
      textGroups[filePath] = strings.map((item) => item.original);
    });

    LoggerUtils.info(
      `📊 开始并发处理 ${Object.keys(fileGroups).length} 个文件的语义ID生成`,
    );

    try {
      const idResults = await this.llmClient.generateSemanticIdsForFiles(
        textGroups,
        skipLLM,
      );

      Object.entries(fileGroups).forEach(([filePath, strings]) => {
        const ids = idResults[filePath] || [];

        if (!skipLLM && ids.length !== strings.length) {
          LoggerUtils.warn(
            `[${FileUtils.getRelativePath(filePath)}] LLM返回的ID数量与文本数量不匹配 (期望 ${strings.length}, 收到 ${ids.length})，将使用本地ID生成进行回退。`,
          );
        }

        strings.forEach((item, index) => {
          const messageForId = item.processedMessage || item.original;

          if (textToIdMap.has(messageForId)) {
            item.semanticId = textToIdMap.get(messageForId)!;
          } else {
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
                messageForId,
                existingIds,
                this.config.idPrefix,
              );
            }

            textToIdMap.set(messageForId, finalId);
            item.semanticId = finalId;
          }
        });
      });

      LoggerUtils.success(
        `✅ 并发处理完成，共生成 ${textToIdMap.size} 个唯一语义ID`,
      );
    } catch (error) {
      LoggerUtils.error(`处理文件时发生严重错误:`, error);
      throw new Error('语义ID生成失败', { cause: error });
    }
  }

  private formatResultLine(item: ExtractedString): string {
    return `"${item.original}" -> ${item.semanticId} (${item.context})`;
  }

  private displayResults(
    extractedStrings: ExtractedString[],
    groupByFile: boolean = false,
  ): void {
    LoggerUtils.info(`\n📋 共提取 ${extractedStrings.length} 个字符串:`);

    if (groupByFile) {
      const fileGroups = FileUtils.groupBy(
        extractedStrings,
        (str) => str.filePath,
      );

      for (const [filePath, strings] of Object.entries(fileGroups)) {
        LoggerUtils.info(
          `\n📄 ${FileUtils.getRelativePath(filePath)} (${strings.length} 个):`,
        );
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

    LanguageFileManager.updateLanguageFiles(
      this.config,
      this.isCustom,
      extractedStrings,
    );

    const transformer = this.adapter.getTransformer();
    for (const filePath of filePaths) {
      try {
        const transformedCode = transformer.transform(
          filePath,
          extractedStrings,
          false,
        );
        fs.writeFileSync(filePath, transformedCode, 'utf-8');
        await CommandUtils.formatWithPrettier(filePath);
        LoggerUtils.success(
          `✅ 已转换: ${FileUtils.getRelativePath(filePath)}`,
        );
      } catch (error) {
        LoggerUtils.error(
          `❌ 转换失败 ${FileUtils.getRelativePath(filePath)}:`,
          error,
        );
      }
    }
    LoggerUtils.success('✅ 应用转换完成');
    LoggerUtils.info(`✨ 处理文件列表: \n- ${filePaths.join('\n- ')}`);
  }
}
