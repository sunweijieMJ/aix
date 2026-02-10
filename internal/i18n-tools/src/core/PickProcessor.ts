import type { ResolvedConfig } from '../config';
import { FILES, LOCALE_TYPE } from '../utils/constants';
import { FileUtils } from '../utils/file-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import type { Translations } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';

/**
 * Pick处理器
 * 负责生成待翻译文件，将已翻译和待翻译的条目分离
 */
export class PickProcessor extends BaseProcessor {
  constructor(config: ResolvedConfig, isCustom: boolean = false) {
    super(config, isCustom);
  }

  protected getOperationName(): string {
    return '生成待翻译文件';
  }

  protected async _execute(): Promise<void> {
    this.generateUntranslatedFile();
  }

  private generateUntranslatedFile(): void {
    const untranslatedPath = FileUtils.getUntranslatedPath(
      this.config,
      this.isCustom,
    );
    const translatedPath = FileUtils.getTranslatedPath(
      this.config,
      this.isCustom,
    );
    this.ensureWorkingDirectory();

    const messages = LanguageFileManager.getMessages(
      this.config,
      this.isCustom,
    );
    const zhCNMessages = messages[LOCALE_TYPE.ZH_CN] || {};
    const enUSMessages = messages[LOCALE_TYPE.EN_US] || {};

    LoggerUtils.info(
      `📋 开始分析语言条目，共 ${Object.keys(zhCNMessages).length} 个zh-CN条目`,
    );

    const analysisResult = this.analyzeTranslationStatus(
      zhCNMessages,
      enUSMessages,
    );
    this.saveFiles(untranslatedPath, translatedPath, analysisResult);
    this.displayResults(analysisResult);
  }

  private analyzeTranslationStatus(
    zhCNMessages: Record<string, any>,
    enUSMessages: Record<string, any>,
  ): {
    untranslatedEntries: Translations;
    translatedEntries: Translations;
    untranslatedCount: number;
    translatedCount: number;
  } {
    const untranslatedEntries: Translations = {};
    const translatedEntries: Translations = {};
    let untranslatedCount = 0;
    let translatedCount = 0;

    for (const key in zhCNMessages) {
      if (Object.prototype.hasOwnProperty.call(zhCNMessages, key)) {
        const zhValue = zhCNMessages[key];
        const enValue = enUSMessages[key];

        if (typeof zhValue !== 'string') continue;

        if (
          !enValue ||
          typeof enValue !== 'string' ||
          !FileUtils.isValidEnglishTranslation(enValue)
        ) {
          untranslatedEntries[key] = {
            [LOCALE_TYPE.ZH_CN]: zhValue,
            [LOCALE_TYPE.EN_US]: typeof enValue === 'string' ? enValue : '',
          };
          untranslatedCount++;
        } else {
          translatedEntries[key] = {
            [LOCALE_TYPE.ZH_CN]: zhValue,
            [LOCALE_TYPE.EN_US]: enValue,
          };
          translatedCount++;
        }
      }
    }

    return {
      untranslatedEntries,
      translatedEntries,
      untranslatedCount,
      translatedCount,
    };
  }

  private saveFiles(
    untranslatedPath: string,
    translatedPath: string,
    analysisResult: ReturnType<
      typeof PickProcessor.prototype.analyzeTranslationStatus
    >,
  ): void {
    FileUtils.createOrEmptyFile(
      untranslatedPath,
      JSON.stringify(analysisResult.untranslatedEntries, null, 2),
    );
    LoggerUtils.info(
      `📄 生成 ${FILES.UNTRANSLATED_JSON} 文件成功 (${this.getDirectoryDescription()})`,
    );
    LoggerUtils.info(`📝 待翻译条目: ${analysisResult.untranslatedCount} 个`);

    FileUtils.createOrEmptyFile(
      translatedPath,
      JSON.stringify(analysisResult.translatedEntries, null, 2),
    );
    LoggerUtils.info(
      `📄 生成 ${FILES.TRANSLATIONS_JSON} 文件成功 (${this.getDirectoryDescription()})`,
    );
    LoggerUtils.info(`✅ 已翻译条目: ${analysisResult.translatedCount} 个`);
  }

  private displayResults(
    analysisResult: ReturnType<
      typeof PickProcessor.prototype.analyzeTranslationStatus
    >,
  ): void {
    const untranslatedExamples = Object.keys(
      analysisResult.untranslatedEntries,
    ).slice(0, 3);
    if (untranslatedExamples.length > 0) {
      LoggerUtils.info('\n📝 待翻译条目示例:');
      untranslatedExamples.forEach((key) => {
        const item = analysisResult.untranslatedEntries[key]!;
        LoggerUtils.info(`  ${key}:`);
        LoggerUtils.info(`    zh-CN: "${item[LOCALE_TYPE.ZH_CN]}"`);
        LoggerUtils.info(`    en-US: "${item[LOCALE_TYPE.EN_US] || '(空)'}"`);
      });
    }

    const translatedExamples = Object.keys(
      analysisResult.translatedEntries,
    ).slice(0, 3);
    if (translatedExamples.length > 0) {
      LoggerUtils.info('\n✅ 已翻译条目示例:');
      translatedExamples.forEach((key) => {
        const item = analysisResult.translatedEntries[key]!;
        LoggerUtils.info(`  ${key}:`);
        LoggerUtils.info(`    zh-CN: "${item[LOCALE_TYPE.ZH_CN]}"`);
        LoggerUtils.info(`    en-US: "${item[LOCALE_TYPE.EN_US]}"`);
      });
    }

    LoggerUtils.info(`\n📊 统计信息:`);
    LoggerUtils.info(`   📝 待翻译: ${analysisResult.untranslatedCount} 个`);
    LoggerUtils.info(`   ✅ 已翻译: ${analysisResult.translatedCount} 个`);
    LoggerUtils.info(
      `   📋 总计: ${analysisResult.untranslatedCount + analysisResult.translatedCount} 个`,
    );
  }
}
