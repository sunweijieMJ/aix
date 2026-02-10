import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { FILES } from '../utils/constants';
import { FileUtils } from '../utils/file-utils';
import { LoggerUtils } from '../utils/logger';
import type { Translations } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';

/**
 * 合并处理器
 * 负责将翻译好的文件合并到translations中，并更新语言包
 */
export class MergeProcessor extends BaseProcessor {
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
    const untranslatedPath = FileUtils.getUntranslatedPath(
      this.config,
      this.isCustom,
    );
    const translatedPath = FileUtils.getTranslatedPath(
      this.config,
      this.isCustom,
    );

    LoggerUtils.info(`正在合并翻译数据...`);

    if (!fs.existsSync(untranslatedPath)) {
      LoggerUtils.error(`待翻译文件不存在: ${untranslatedPath}`);
      LoggerUtils.info('请先运行 pick 命令生成待翻译文件。');
      return;
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
    this.updateLanguagePackage(analysisResult.newlyTranslated);
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

      if (enValue && FileUtils.isValidEnglishTranslation(enValue)) {
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
    analysisResult: ReturnType<
      typeof MergeProcessor.prototype.analyzeTranslationStatus
    >,
    existingTranslations: Translations,
    translatedPath: string,
  ): void {
    const finalTranslations = {
      ...existingTranslations,
      ...analysisResult.newlyTranslated,
    };
    FileUtils.createOrEmptyFile(
      translatedPath,
      JSON.stringify(finalTranslations, null, 2),
    );
    LoggerUtils.info(
      `📄 已更新 ${FILES.TRANSLATIONS_JSON}，现有 ${Object.keys(finalTranslations).length} 个翻译条目`,
    );

    const untranslatedFilePath = FileUtils.getUntranslatedPath(
      this.config,
      this.isCustom,
    );
    this.updateUntranslatedFile(untranslatedFilePath, analysisResult);
  }

  private updateUntranslatedFile(
    filePath: string,
    analysisResult: ReturnType<
      typeof MergeProcessor.prototype.analyzeTranslationStatus
    >,
  ): void {
    if (analysisResult.stillUntranslatedCount > 0) {
      FileUtils.createOrEmptyFile(
        filePath,
        JSON.stringify(analysisResult.stillUntranslated, null, 2),
      );
      LoggerUtils.info(
        `📝 已更新 ${FILES.UNTRANSLATED_JSON}，剩余 ${analysisResult.stillUntranslatedCount} 个待翻译条目`,
      );
    } else {
      FileUtils.createOrEmptyFile(filePath, '{}');
      LoggerUtils.success(
        `🎉 所有条目已翻译完成，已清空 ${FILES.UNTRANSLATED_JSON}`,
      );
    }
  }

  private updateLanguagePackage(newlyTranslated: Translations): void {
    const sourceLocale = this.config.locale.source;
    const targetLocale = this.config.locale.target;
    const targetPath = FileUtils.getLocaleFilePath(
      this.config,
      this.isCustom,
      targetLocale,
    );
    const sourcePath = FileUtils.getLocaleFilePath(
      this.config,
      this.isCustom,
      sourceLocale,
    );

    let originalMessages: Record<string, any> = {};
    let isNested = false;

    if (fs.existsSync(targetPath)) {
      try {
        const fileContent = fs.readFileSync(targetPath, 'utf-8');
        originalMessages = JSON.parse(fileContent);
        isNested = FileUtils.isNestedStructure(originalMessages);
        LoggerUtils.info(
          `📋 参考 ${targetLocale}.json 格式: ${isNested ? '嵌套结构' : '扁平结构'}`,
        );
      } catch (error) {
        LoggerUtils.warn(`读取${targetLocale}.json失败: ${error}`);
      }
    } else if (fs.existsSync(sourcePath)) {
      // 目标语言文件不存在时，参考源语言的结构
      try {
        const sourceContent = fs.readFileSync(sourcePath, 'utf-8');
        const sourceMessages = JSON.parse(sourceContent);
        isNested = FileUtils.isNestedStructure(sourceMessages);
        LoggerUtils.info(
          `📋 ${targetLocale}.json 不存在，参考 ${sourceLocale}.json 格式: ${isNested ? '嵌套结构' : '扁平结构'}`,
        );
      } catch (error) {
        LoggerUtils.warn(`读取${sourceLocale}.json失败: ${error}`);
      }
    }

    let targetMessages: Record<string, string>;
    if (Object.keys(originalMessages).length > 0) {
      const flattenedMessages = FileUtils.flattenObject(originalMessages);
      targetMessages = Object.fromEntries(
        Object.entries(flattenedMessages)
          .filter(([, value]) => typeof value === 'string')
          .map(([key, value]) => [key, String(value)]),
      );
    } else {
      targetMessages = {};
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

    let outputMessages: Record<string, any>;
    if (isNested) {
      outputMessages = FileUtils.unflattenObject(targetMessages);
      LoggerUtils.info('📝 保存为嵌套结构');
    } else {
      outputMessages = targetMessages;
      LoggerUtils.info('📝 保存为扁平结构');
    }

    fs.writeFileSync(
      targetPath,
      JSON.stringify(outputMessages, null, 2) + '\n',
      'utf8',
    );
    LoggerUtils.info(
      `📄 已更新 ${targetLocale}.json，更新 ${updatedCount} 个条目`,
    );
  }

  private displayMergeResult(
    analysisResult: ReturnType<
      typeof MergeProcessor.prototype.analyzeTranslationStatus
    >,
  ): void {
    const sourceLocale = this.config.locale.source;
    const targetLocale = this.config.locale.target;
    const newTranslatedExamples = Object.keys(
      analysisResult.newlyTranslated,
    ).slice(0, 3);
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
    LoggerUtils.info(
      `   - ✅ 新合并翻译: ${analysisResult.newTranslatedCount} 个`,
    );
    LoggerUtils.info(
      `   - 📝 仍需翻译: ${analysisResult.stillUntranslatedCount} 个`,
    );
  }
}
