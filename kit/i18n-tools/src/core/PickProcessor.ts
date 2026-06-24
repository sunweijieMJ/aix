import type { ResolvedConfig } from '../config';
import { FILES } from '../utils/constants';
import { FileUtils } from '../utils/file-utils';
import { Glossary, type GlossaryMap } from '../utils/glossary';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import type { Translations } from '../utils/types';
import { FileProcessor } from './FileProcessor';

/**
 * Pick 处理器
 *
 * 负责把 locale 文件中"已翻译"与"待翻译"条目分离到 translations.json /
 * untranslated.json。
 *
 * 多目标语种处理约定：
 *  - untranslated.json schema：每个条目内层包含 source + 所有 targets 字段
 *  - 判定"待翻译"：任一 target 缺失即视为待翻译条目
 *  - 词表 lookup 按 target 循环：每个 target 单独命中
 *  - 统计字段按 target 分组打印
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

    const sourceLocale = this.config.locales.source;
    const targets = this.config.locales.targets;
    const messages = LanguageFileManager.getMessages(this.config, this.isCustom);
    const sourceMessages = (messages[sourceLocale] || {}) as Record<string, string>;

    LoggerUtils.info(
      `📋 开始分析语言条目，共 ${Object.keys(sourceMessages).length} 个 ${sourceLocale} 条目，目标 ${targets.length} 个语种`,
    );

    const glossary = Glossary.load(this.config);
    // getMessages 返回 ILangMap（含 string | ILangMsg 嵌套类型），但桶式与单文件
    // 路径都已 flatten 为 Record<string, string>。这里显式收窄类型以匹配下游签名。
    const analysisResult = this.analyzeTranslationStatus(
      sourceMessages,
      messages as unknown as Record<string, Record<string, string>>,
      glossary,
    );
    this.saveFiles(untranslatedPath, translatedPath, analysisResult);
    this.displayResults(analysisResult);
  }

  /**
   * 多 target 分析：对每个 source key，遍历所有 target locale。
   *
   * 入口条件：
   *  - source value 必须是字符串
   *  - 任一 target 缺失（或被 isValidTranslation 拒收）且未命中词表 → 该 key 进入 untranslated
   *
   * 词表 lookup 用 per-target 维度：词表本身支持 `{[locale]: value}`，
   * 单 target 也可用简化 string 形式（隐式对应 targets[0]）。
   */
  private analyzeTranslationStatus(
    sourceMessages: Record<string, string>,
    allMessages: Record<string, Record<string, string>>,
    glossary: GlossaryMap | null,
  ): {
    untranslatedEntries: Translations;
    translatedEntries: Translations;
    untranslatedCount: number;
    translatedCount: number;
    glossaryHits: number;
    glossaryOverrides: number;
    perTargetUntranslated: Record<string, number>;
  } {
    const sourceLocale = this.config.locales.source;
    const targets = this.config.locales.targets;
    const { override, normalize } = this.config.glossary;
    const untranslatedEntries: Translations = {};
    const translatedEntries: Translations = {};
    let glossaryHits = 0;
    let glossaryOverrides = 0;
    const perTargetUntranslated: Record<string, number> = Object.fromEntries(
      targets.map((t) => [t, 0]),
    );

    for (const key in sourceMessages) {
      if (!Object.prototype.hasOwnProperty.call(sourceMessages, key)) continue;

      const sourceValue = sourceMessages[key];
      if (typeof sourceValue !== 'string') continue;

      const perTargetValue: Record<string, string> = {};
      let hasUntranslated = false;

      for (const target of targets) {
        const existing = allMessages[target]?.[key];
        const valid = typeof existing === 'string' && FileUtils.isValidTranslation(existing);
        const glossaryHit = glossary
          ? Glossary.lookup(glossary, sourceValue, target, normalize)
          : undefined;

        let finalValue: string | undefined;
        if (glossaryHit !== undefined) {
          if (!valid) {
            finalValue = glossaryHit;
            glossaryHits++;
          } else if (override === 'always' && existing !== glossaryHit) {
            LoggerUtils.info(
              `🔁 [glossary][${target}] 覆盖 ${key}: "${existing}" → "${glossaryHit}"`,
            );
            finalValue = glossaryHit;
            glossaryOverrides++;
          } else {
            finalValue = existing as string;
          }
        } else if (valid) {
          finalValue = existing as string;
        }

        if (finalValue !== undefined) {
          perTargetValue[target] = finalValue;
        } else {
          perTargetValue[target] = typeof existing === 'string' ? existing : '';
          hasUntranslated = true;
          perTargetUntranslated[target] = (perTargetUntranslated[target] ?? 0) + 1;
        }
      }

      const entry: Translations[string] = {
        [sourceLocale]: sourceValue,
        ...perTargetValue,
      };

      if (hasUntranslated) {
        untranslatedEntries[key] = entry;
      } else {
        translatedEntries[key] = entry;
      }
    }

    return {
      untranslatedEntries,
      translatedEntries,
      untranslatedCount: Object.keys(untranslatedEntries).length,
      translatedCount: Object.keys(translatedEntries).length,
      glossaryHits,
      glossaryOverrides,
      perTargetUntranslated,
    };
  }

  private saveFiles(
    untranslatedPath: string,
    translatedPath: string,
    analysisResult: ReturnType<typeof PickProcessor.prototype.analyzeTranslationStatus>,
  ): void {
    FileUtils.writeTranslationsFile(untranslatedPath, analysisResult.untranslatedEntries);
    LoggerUtils.info(
      `📄 生成 ${FILES.UNTRANSLATED_JSON} 文件成功 (${this.getDirectoryDescription()})`,
    );
    LoggerUtils.info(`📝 待翻译条目: ${analysisResult.untranslatedCount} 个`);

    FileUtils.writeTranslationsFile(translatedPath, analysisResult.translatedEntries);
    LoggerUtils.info(
      `📄 生成 ${FILES.TRANSLATIONS_JSON} 文件成功 (${this.getDirectoryDescription()})`,
    );
    LoggerUtils.info(`✅ 已翻译条目: ${analysisResult.translatedCount} 个`);
  }

  private displayResults(
    analysisResult: ReturnType<typeof PickProcessor.prototype.analyzeTranslationStatus>,
  ): void {
    const sourceLocale = this.config.locales.source;
    const targets = this.config.locales.targets;

    const untranslatedExamples = Object.keys(analysisResult.untranslatedEntries).slice(0, 3);
    if (untranslatedExamples.length > 0) {
      LoggerUtils.info('\n📝 待翻译条目示例:');
      untranslatedExamples.forEach((key) => {
        const item = analysisResult.untranslatedEntries[key]!;
        LoggerUtils.info(`  ${key}:`);
        LoggerUtils.info(`    ${sourceLocale}: "${item[sourceLocale]}"`);
        for (const target of targets) {
          LoggerUtils.info(`    ${target}: "${item[target] || '(空)'}"`);
        }
      });
    }

    const translatedExamples = Object.keys(analysisResult.translatedEntries).slice(0, 3);
    if (translatedExamples.length > 0) {
      LoggerUtils.info('\n✅ 已翻译条目示例:');
      translatedExamples.forEach((key) => {
        const item = analysisResult.translatedEntries[key]!;
        LoggerUtils.info(`  ${key}:`);
        LoggerUtils.info(`    ${sourceLocale}: "${item[sourceLocale]}"`);
        for (const target of targets) {
          LoggerUtils.info(`    ${target}: "${item[target]}"`);
        }
      });
    }

    LoggerUtils.info(`\n📊 统计信息:`);
    LoggerUtils.info(`   📝 待翻译: ${analysisResult.untranslatedCount} 个`);
    LoggerUtils.info(`   ✅ 已翻译: ${analysisResult.translatedCount} 个`);
    LoggerUtils.info(
      `   📋 总计: ${analysisResult.untranslatedCount + analysisResult.translatedCount} 个`,
    );
    if (targets.length > 1) {
      LoggerUtils.info(`   📍 按 target 拆分（待翻译数）:`);
      for (const target of targets) {
        LoggerUtils.info(
          `      - ${target}: ${analysisResult.perTargetUntranslated[target] ?? 0} 个`,
        );
      }
    }
    if (analysisResult.glossaryHits > 0 || analysisResult.glossaryOverrides > 0) {
      LoggerUtils.info(
        `   📚 词表命中: ${analysisResult.glossaryHits} 个` +
          ` (覆盖原值: ${analysisResult.glossaryOverrides})`,
      );
    }
  }
}
