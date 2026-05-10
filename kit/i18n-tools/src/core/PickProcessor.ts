import type { ResolvedConfig } from '../config';
import { FILES } from '../utils/constants';
import { FileUtils } from '../utils/file-utils';
import { Glossary, type GlossaryMap } from '../utils/glossary';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import type { Translations } from '../utils/types';
import { FileProcessor } from './FileProcessor';

/**
 * Pick处理器
 * 负责生成待翻译文件，将已翻译和待翻译的条目分离
 */
export class PickProcessor extends FileProcessor {
  constructor(config: ResolvedConfig, isCustom: boolean = false) {
    super(config, isCustom);
  }

  protected getOperationName(): string {
    return '生成待翻译文件';
  }

  async execute(): Promise<void> {
    return this.executeWithLifecycle(() => this._execute());
  }

  private _execute(): void {
    this.generateUntranslatedFile();
  }

  private generateUntranslatedFile(): void {
    const untranslatedPath = FileUtils.getUntranslatedPath(this.config, this.isCustom);
    const translatedPath = FileUtils.getTranslatedPath(this.config, this.isCustom);
    this.ensureWorkingDirectory();

    const sourceLocale = this.config.locale.source;
    const targetLocale = this.config.locale.target;
    const messages = LanguageFileManager.getMessages(this.config, this.isCustom);
    const zhCNMessages = messages[sourceLocale] || {};
    const enUSMessages = messages[targetLocale] || {};

    LoggerUtils.info(
      `📋 开始分析语言条目，共 ${Object.keys(zhCNMessages).length} 个${sourceLocale}条目`,
    );

    const glossary = Glossary.load(this.config);
    const analysisResult = this.analyzeTranslationStatus(zhCNMessages, enUSMessages, glossary);
    this.saveFiles(untranslatedPath, translatedPath, analysisResult);
    this.displayResults(analysisResult);
  }

  private analyzeTranslationStatus(
    zhCNMessages: Record<string, any>,
    enUSMessages: Record<string, any>,
    glossary: GlossaryMap | null,
  ): {
    untranslatedEntries: Translations;
    translatedEntries: Translations;
    untranslatedCount: number;
    translatedCount: number;
    glossaryHits: number;
    glossaryOverrides: number;
  } {
    const sourceLocale = this.config.locale.source;
    const targetLocale = this.config.locale.target;
    const { override, normalize } = this.config.glossary;
    const untranslatedEntries: Translations = {};
    const translatedEntries: Translations = {};
    let untranslatedCount = 0;
    let translatedCount = 0;
    let glossaryHits = 0;
    let glossaryOverrides = 0;

    for (const key in zhCNMessages) {
      if (!Object.prototype.hasOwnProperty.call(zhCNMessages, key)) continue;

      const zhValue = zhCNMessages[key];
      const enValueRaw = enUSMessages[key];
      if (typeof zhValue !== 'string') continue;

      const enValid = typeof enValueRaw === 'string' && FileUtils.isValidTranslation(enValueRaw);
      const glossaryHit = glossary
        ? Glossary.lookup(glossary, zhValue, targetLocale, normalize)
        : undefined;

      let finalEn: string | undefined;
      if (glossaryHit !== undefined) {
        if (!enValid) {
          finalEn = glossaryHit;
          glossaryHits++;
        } else if (override === 'always' && enValueRaw !== glossaryHit) {
          LoggerUtils.info(`🔁 [glossary] 覆盖 ${key}: "${enValueRaw}" → "${glossaryHit}"`);
          finalEn = glossaryHit;
          glossaryOverrides++;
        } else {
          finalEn = enValueRaw as string;
        }
      } else if (enValid) {
        finalEn = enValueRaw as string;
      }

      if (finalEn !== undefined) {
        translatedEntries[key] = {
          [sourceLocale]: zhValue,
          [targetLocale]: finalEn,
        };
        translatedCount++;
      } else {
        untranslatedEntries[key] = {
          [sourceLocale]: zhValue,
          [targetLocale]: typeof enValueRaw === 'string' ? enValueRaw : '',
        };
        untranslatedCount++;
      }
    }

    return {
      untranslatedEntries,
      translatedEntries,
      untranslatedCount,
      translatedCount,
      glossaryHits,
      glossaryOverrides,
    };
  }

  private saveFiles(
    untranslatedPath: string,
    translatedPath: string,
    analysisResult: ReturnType<typeof PickProcessor.prototype.analyzeTranslationStatus>,
  ): void {
    FileUtils.writeJsonFile(untranslatedPath, analysisResult.untranslatedEntries);
    LoggerUtils.info(
      `📄 生成 ${FILES.UNTRANSLATED_JSON} 文件成功 (${this.getDirectoryDescription()})`,
    );
    LoggerUtils.info(`📝 待翻译条目: ${analysisResult.untranslatedCount} 个`);

    FileUtils.writeJsonFile(translatedPath, analysisResult.translatedEntries);
    LoggerUtils.info(
      `📄 生成 ${FILES.TRANSLATIONS_JSON} 文件成功 (${this.getDirectoryDescription()})`,
    );
    LoggerUtils.info(`✅ 已翻译条目: ${analysisResult.translatedCount} 个`);
  }

  private displayResults(
    analysisResult: ReturnType<typeof PickProcessor.prototype.analyzeTranslationStatus>,
  ): void {
    const sourceLocale = this.config.locale.source;
    const targetLocale = this.config.locale.target;
    const untranslatedExamples = Object.keys(analysisResult.untranslatedEntries).slice(0, 3);
    if (untranslatedExamples.length > 0) {
      LoggerUtils.info('\n📝 待翻译条目示例:');
      untranslatedExamples.forEach((key) => {
        const item = analysisResult.untranslatedEntries[key]!;
        LoggerUtils.info(`  ${key}:`);
        LoggerUtils.info(`    ${sourceLocale}: "${item[sourceLocale]}"`);
        LoggerUtils.info(`    ${targetLocale}: "${item[targetLocale] || '(空)'}"`);
      });
    }

    const translatedExamples = Object.keys(analysisResult.translatedEntries).slice(0, 3);
    if (translatedExamples.length > 0) {
      LoggerUtils.info('\n✅ 已翻译条目示例:');
      translatedExamples.forEach((key) => {
        const item = analysisResult.translatedEntries[key]!;
        LoggerUtils.info(`  ${key}:`);
        LoggerUtils.info(`    ${sourceLocale}: "${item[sourceLocale]}"`);
        LoggerUtils.info(`    ${targetLocale}: "${item[targetLocale]}"`);
      });
    }

    LoggerUtils.info(`\n📊 统计信息:`);
    LoggerUtils.info(`   📝 待翻译: ${analysisResult.untranslatedCount} 个`);
    LoggerUtils.info(`   ✅ 已翻译: ${analysisResult.translatedCount} 个`);
    LoggerUtils.info(
      `   📋 总计: ${analysisResult.untranslatedCount + analysisResult.translatedCount} 个`,
    );
    if (analysisResult.glossaryHits > 0 || analysisResult.glossaryOverrides > 0) {
      LoggerUtils.info(
        `   📚 词表命中: ${analysisResult.glossaryHits} 个` +
          ` (覆盖原值: ${analysisResult.glossaryOverrides})`,
      );
    }
  }
}
