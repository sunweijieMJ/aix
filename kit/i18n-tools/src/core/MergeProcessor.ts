import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { FILES } from '../utils/constants';
import { FileUtils } from '../utils/file-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import type { Translations } from '../utils/types';
import { FileProcessor } from './FileProcessor';

/**
 * 合并处理器
 * 负责将翻译好的文件合并到translations中，并更新语言包
 */
export class MergeProcessor extends FileProcessor {
  constructor(config: ResolvedConfig, isCustom: boolean = false) {
    super(config, isCustom);
  }

  protected getOperationName(): string {
    return '合并翻译文件';
  }

  async execute(): Promise<void> {
    return this.executeWithLifecycle(() => this._execute());
  }

  private _execute(): void {
    this.mergeTranslationData();
  }

  private mergeTranslationData(): void {
    const untranslatedPath = FileUtils.getUntranslatedPath(this.config, this.isCustom);
    const translatedPath = FileUtils.getTranslatedPath(this.config, this.isCustom);

    LoggerUtils.info(`正在合并翻译数据...`);

    if (!fs.existsSync(untranslatedPath)) {
      throw new Error(`待翻译文件不存在: ${untranslatedPath}，请先运行 pick 命令生成。`);
    }

    const untranslatedData = this.loadUntranslatedData(untranslatedPath);
    if (!untranslatedData) return;

    const totalCount = Object.keys(untranslatedData).length;
    if (totalCount === 0) {
      LoggerUtils.warn('待翻译文件为空，没有需要处理的翻译。');
      return;
    }

    LoggerUtils.info(`📄 待翻译文件: ${untranslatedPath}`);
    LoggerUtils.info(`📊 发现 ${totalCount} 个待翻译条目`);

    const existingTranslations = this.loadExistingTranslations(translatedPath);
    const analysisResult = this.analyzeTranslationStatus(untranslatedData);

    if (analysisResult.newTranslatedCount === 0) {
      LoggerUtils.warn('没有新完成的翻译可以合并。');
      return;
    }

    this.performMerge(analysisResult, existingTranslations, translatedPath);
    // existingTranslations 包含 pick 阶段通过 glossary 预填的条目，这些条目
    // 不经过 translate，但同样需要写入目标语言文件。合并后一并同步。
    const allTranslations = { ...existingTranslations, ...analysisResult.newlyTranslated };
    this.updateLanguagePackage(allTranslations);
    this.displayMergeResult(analysisResult);
  }

  private loadUntranslatedData(filePath: string): Translations | null {
    try {
      if (!fs.existsSync(filePath)) {
        LoggerUtils.error(`❌ 待翻译文件不存在: ${filePath}`);
        return null;
      }
      return FileUtils.safeLoadJsonFile<Translations>(filePath, {
        errorMessage: '读取待翻译文件失败',
      });
    } catch {
      return null;
    }
  }

  private loadExistingTranslations(filePath: string): Translations {
    if (!fs.existsSync(filePath)) {
      LoggerUtils.info(`创建新的 ${FILES.TRANSLATIONS_JSON} 文件`);
      return {};
    }
    return FileUtils.safeLoadJsonFile<Translations>(filePath, {
      errorMessage: '读取现有translations文件失败，将创建新文件',
      logSuccess: true,
    });
  }

  private analyzeTranslationStatus(untranslatedData: Translations): {
    newlyTranslated: Translations;
    stillUntranslated: Translations;
    newTranslatedCount: number;
    stillUntranslatedCount: number;
  } {
    const sourceLocale = this.config.locale.source;
    const targetLocale = this.config.locale.target;
    const newlyTranslated: Translations = {};
    const stillUntranslated: Translations = {};
    let newTranslatedCount = 0;
    let stillUntranslatedCount = 0;

    LoggerUtils.info('🔍 正在分析翻译状态...');

    for (const [key, data] of Object.entries(untranslatedData)) {
      const zhValue = data[sourceLocale];
      const enValue = data[targetLocale];

      if (enValue && FileUtils.isValidTranslation(enValue)) {
        newlyTranslated[key] = {
          [sourceLocale]: zhValue ?? '',
          [targetLocale]: enValue,
        };
        newTranslatedCount++;
      } else {
        stillUntranslated[key] = {
          [sourceLocale]: zhValue ?? '',
          [targetLocale]: enValue || '',
        };
        stillUntranslatedCount++;
      }
    }

    LoggerUtils.success(`✅ 新翻译完成: ${newTranslatedCount} 个`);
    LoggerUtils.info(`📝 仍需翻译: ${stillUntranslatedCount} 个`);

    return {
      newlyTranslated,
      stillUntranslated,
      newTranslatedCount,
      stillUntranslatedCount,
    };
  }

  private performMerge(
    analysisResult: ReturnType<typeof MergeProcessor.prototype.analyzeTranslationStatus>,
    existingTranslations: Translations,
    translatedPath: string,
  ): void {
    const finalTranslations = {
      ...existingTranslations,
      ...analysisResult.newlyTranslated,
    };
    FileUtils.writeJsonFile(translatedPath, finalTranslations);
    LoggerUtils.info(
      `📄 已更新 ${FILES.TRANSLATIONS_JSON}，现有 ${Object.keys(finalTranslations).length} 个翻译条目`,
    );

    const untranslatedFilePath = FileUtils.getUntranslatedPath(this.config, this.isCustom);
    this.updateUntranslatedFile(untranslatedFilePath, analysisResult);
  }

  private updateUntranslatedFile(
    filePath: string,
    analysisResult: ReturnType<typeof MergeProcessor.prototype.analyzeTranslationStatus>,
  ): void {
    if (analysisResult.stillUntranslatedCount > 0) {
      FileUtils.writeJsonFile(filePath, analysisResult.stillUntranslated);
      LoggerUtils.info(
        `📝 已更新 ${FILES.UNTRANSLATED_JSON}，剩余 ${analysisResult.stillUntranslatedCount} 个待翻译条目`,
      );
    } else {
      FileUtils.createOrEmptyFile(filePath, '{}');
      LoggerUtils.success(`🎉 所有条目已翻译完成，已清空 ${FILES.UNTRANSLATED_JSON}`);
    }
  }

  private updateLanguagePackage(newlyTranslated: Translations): void {
    const targetLocale = this.config.locale.target;

    if (this.config.modules) {
      this.updateModularLanguagePackage(newlyTranslated, targetLocale);
      return;
    }

    this.updateFlatLanguagePackage(newlyTranslated, targetLocale);
  }

  private updateModularLanguagePackage(newlyTranslated: Translations, targetLocale: string): void {
    const sourceLocale = this.config.locale.source;

    // 读取现有 target locale 数据（不依赖其文件分桶，只取扁平值）
    const { flat: targetMessages } = LanguageFileManager.readModularLocaleWithModuleMap(
      this.config,
      this.isCustom,
      targetLocale,
    );

    let updatedCount = 0;
    for (const [key, data] of Object.entries(newlyTranslated)) {
      const translatedValue = data[targetLocale];
      if (
        translatedValue &&
        typeof translatedValue === 'string' &&
        targetMessages[key] !== translatedValue
      ) {
        targetMessages[key] = translatedValue;
        updatedCount++;
      }
    }

    // 用 ModuleResolver 重新计算 keyModuleMap：source locale 的文本驱动分桶，
    // 与 generate/export 阶段一致；若用 target locale 文本（英文），matchKey
    // 规则若依赖中文内容会出现 source/target 分桶不一致的边界 bug。
    const sourceMessages = LanguageFileManager.readLocaleFile(
      this.config,
      this.isCustom,
      sourceLocale,
    );
    // sourceMessages 为 null 时（极少见的 source 文件损坏）回落到用 target 内容反推，
    // 至少能维持现状不阻塞合并流程。
    const messagesForBucketing = sourceMessages ?? targetMessages;
    const keyModuleMap = LanguageFileManager.buildKeyModuleMap(this.config, messagesForBucketing);

    LanguageFileManager.writeLocaleFile(
      this.config,
      this.isCustom,
      targetMessages,
      targetLocale,
      keyModuleMap,
    );
    LoggerUtils.info(`📄 已更新 ${targetLocale} 模块化语言包，更新 ${updatedCount} 个条目`);
  }

  private updateFlatLanguagePackage(newlyTranslated: Translations, targetLocale: string): void {
    const sourceLocale = this.config.locale.source;
    const targetPath = FileUtils.getLocaleFilePath(this.config, this.isCustom, targetLocale);
    const sourcePath = FileUtils.getLocaleFilePath(this.config, this.isCustom, sourceLocale);

    // 优先以 target locale 现有文件的结构（嵌套/扁平）为模板；
    // 不存在时回落到 source locale 文件结构，保证 zh-CN/en-US 格式一致。
    const targetInfo = LanguageFileManager.readFlatLocale(
      targetPath,
      `读取${targetLocale}.json失败`,
    );
    const targetMessages = targetInfo.flat;
    let isNested = targetInfo.isNested;
    if (Object.keys(targetMessages).length > 0 || fs.existsSync(targetPath)) {
      LoggerUtils.info(`📋 参考 ${targetLocale}.json 格式: ${isNested ? '嵌套结构' : '扁平结构'}`);
    } else if (fs.existsSync(sourcePath)) {
      const sourceInfo = LanguageFileManager.readFlatLocale(
        sourcePath,
        `读取${sourceLocale}.json失败`,
      );
      isNested = sourceInfo.isNested;
      LoggerUtils.info(
        `📋 ${targetLocale}.json 不存在，参考 ${sourceLocale}.json 格式: ${isNested ? '嵌套结构' : '扁平结构'}`,
      );
    }

    let updatedCount = 0;
    for (const [key, data] of Object.entries(newlyTranslated)) {
      const translatedValue = data[targetLocale];
      if (
        translatedValue &&
        typeof translatedValue === 'string' &&
        targetMessages[key] !== translatedValue
      ) {
        targetMessages[key] = translatedValue;
        updatedCount++;
      }
    }

    const outputMessages: Record<string, any> = isNested
      ? FileUtils.unflattenObject(targetMessages)
      : targetMessages;

    if (isNested) {
      LoggerUtils.info('📝 保存为嵌套结构');
    }

    FileUtils.writeJsonFile(targetPath, outputMessages);
    LoggerUtils.info(`📄 已更新 ${targetLocale}.json，更新 ${updatedCount} 个条目`);
  }

  private displayMergeResult(
    analysisResult: ReturnType<typeof MergeProcessor.prototype.analyzeTranslationStatus>,
  ): void {
    const sourceLocale = this.config.locale.source;
    const targetLocale = this.config.locale.target;
    const newTranslatedExamples = Object.keys(analysisResult.newlyTranslated).slice(0, 3);
    if (newTranslatedExamples.length > 0) {
      LoggerUtils.info('\n✅ 新翻译完成示例:');
      newTranslatedExamples.forEach((key) => {
        const item = analysisResult.newlyTranslated[key]!;
        LoggerUtils.info(`  ${key}:`);
        LoggerUtils.info(`    ${sourceLocale}: "${item[sourceLocale]}"`);
        LoggerUtils.info(`    ${targetLocale}: "${item[targetLocale]}"`);
      });
    }

    LoggerUtils.info(`\n📊 合并结果:`);
    LoggerUtils.info(`   - ✅ 新合并翻译: ${analysisResult.newTranslatedCount} 个`);
    LoggerUtils.info(`   - 📝 仍需翻译: ${analysisResult.stillUntranslatedCount} 个`);
  }
}
