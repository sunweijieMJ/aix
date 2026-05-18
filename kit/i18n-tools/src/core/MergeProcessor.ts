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
 *
 * 把 untranslated.json 中已翻译的条目合并到 translations.json 并同步到目标语言文件。
 *
 * 多目标语种处理约定：
 *  - analyzeTranslationStatus 按 target 循环：每个 target 独立判定 newly/rejected/still-untranslated
 *  - 同一 key 不同 target 状态各异时：仅当所有 target 都翻译完成才从 untranslated.json 移除
 *  - updateLanguagePackage 对每个 target 单独写目标语言文件
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
      LoggerUtils.warn('待翻译文件为空，仅同步 translations.json 中已有条目到目标语言文件。');
    } else {
      LoggerUtils.info(`📄 待翻译文件: ${untranslatedPath}`);
      LoggerUtils.info(`📊 发现 ${totalCount} 个待翻译条目`);
    }

    const existingTranslations = this.loadExistingTranslations(translatedPath);
    const analysisResult = this.analyzeTranslationStatus(untranslatedData);

    if (analysisResult.newTranslatedCount === 0 && analysisResult.rejectedFallbackCount === 0) {
      LoggerUtils.warn(
        '本轮没有新增翻译或回填，将仅同步 translations.json 中已有条目到目标语言文件。',
      );
    }

    this.performMerge(analysisResult, existingTranslations, translatedPath);
    // existingTranslations 包含 pick 阶段通过 glossary 预填的条目；合并后一并同步
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

  /**
   * 多 target 分析：
   *  - 对每个 (key, target) 组合判定 newly / rejected / untranslated
   *  - 一个 key 的所有 target 都翻译完成 → 整条进入 newlyTranslated 并从 untranslated 移除
   *  - 否则保留在 untranslated（含尚未翻译的 target 字段）
   */
  private analyzeTranslationStatus(untranslatedData: Translations): {
    newlyTranslated: Translations;
    stillUntranslated: Translations;
    newTranslatedCount: number;
    stillUntranslatedCount: number;
    /** 拒收条目按 fallback-to-source 策略用源文本回填的数量（汇总跨 target） */
    rejectedFallbackCount: number;
  } {
    const sourceLocale = this.config.locales.source;
    const targets = this.config.locales.targets;
    const strategy = this.config.merge.onLlmRejected;
    const newlyTranslated: Translations = {};
    const stillUntranslated: Translations = {};
    let newTranslatedCount = 0;
    let stillUntranslatedCount = 0;
    let rejectedFallbackCount = 0;
    const rejected: Array<{ key: string; target: string; source: string; value: string }> = [];

    LoggerUtils.info('🔍 正在分析翻译状态...');

    for (const [key, data] of Object.entries(untranslatedData)) {
      const sourceValue = data[sourceLocale];
      const finalEntry: Translations[string] = { [sourceLocale]: sourceValue ?? '' };
      let allTranslated = true;

      for (const target of targets) {
        const value = data[target];

        if (value && FileUtils.isValidTranslation(value)) {
          finalEntry[target] = value;
          continue;
        }

        const isRejected = typeof value === 'string' && value.trim().length > 0;
        if (isRejected) {
          rejected.push({ key, target, source: sourceValue ?? '', value });

          if (
            strategy === 'fallback-to-source' &&
            typeof sourceValue === 'string' &&
            sourceValue.trim().length > 0
          ) {
            // 注意：回填后该 target 进入 finalEntry，allTranslated 不变；
            // key 会被移出 untranslated.json（视为「翻译终态：以源文本兜底」）。
            // 该决策意味着用户后续重跑 translate 不会自动续翻此 key —— 因为
            // FileUtils.isValidTranslation 只判字母/数字存在性、不分辨语言，
            // 源语言文本回填到 target 后会被识别为合法翻译，无法触发再翻。
            // 如需重新翻译，必须手动从 locale 文件中移除该 key 并重跑 generate。
            // reportRejectedTranslations 会在控制台明确提示这一行为。
            finalEntry[target] = sourceValue;
            rejectedFallbackCount++;
            continue;
          }
        }

        finalEntry[target] = value || '';
        allTranslated = false;
      }

      if (allTranslated) {
        newlyTranslated[key] = finalEntry;
        newTranslatedCount++;
      } else {
        stillUntranslated[key] = finalEntry;
        stillUntranslatedCount++;
      }
    }

    LoggerUtils.success(`✅ 全部 target 已完成的 key: ${newTranslatedCount} 个`);
    if (rejectedFallbackCount > 0) {
      LoggerUtils.info(`🔁 LLM 拒收已用源文本回填: ${rejectedFallbackCount} 个 target 位`);
    }
    LoggerUtils.info(`📝 仍有 target 未完成的 key: ${stillUntranslatedCount} 个`);

    if (rejected.length > 0) {
      this.reportRejectedTranslations(rejected, sourceLocale, strategy);
    }

    return {
      newlyTranslated,
      stillUntranslated,
      newTranslatedCount,
      stillUntranslatedCount,
      rejectedFallbackCount,
    };
  }

  /**
   * 对「LLM 翻译被 isValidTranslation 拒收」的条目输出 warn + 落盘到 RunReport。
   */
  private reportRejectedTranslations(
    rejected: Array<{ key: string; target: string; source: string; value: string }>,
    sourceLocale: string,
    strategy: 'fallback-to-source' | 'warn-only',
  ): void {
    const emit = (line: string): void => {
      LoggerUtils.warn(line);
      this.report.addWarning(line);
    };

    const targetSet = [...new Set(rejected.map((r) => r.target))].join(', ');
    if (strategy === 'fallback-to-source') {
      emit(
        `\n🔁 ${rejected.length} 个翻译被判无效（LLM 返回纯标点 / 空白），已用 ${sourceLocale} 源文本回填到 ${targetSet}：`,
      );
      emit(
        `   ⚠️  以下 key 视为「翻译终态」并从 ${FILES.UNTRANSLATED_JSON} 移除；重跑 translate 不会自动续翻，如需重译请手动从 locale 文件删除该 key 后重跑 generate。`,
      );
    } else {
      emit(
        `\n⚠️  ${rejected.length} 个翻译被判无效（LLM 返回纯标点 / 空白），未合并到 ${targetSet}：`,
      );
    }
    for (const { key, target, source, value } of rejected) {
      emit(`   - ${key} → [${target}]`);
      emit(`     ${sourceLocale}: ${JSON.stringify(source)}`);
      emit(`     ${target}: ${JSON.stringify(value)}   ← 已被 isValidTranslation 拒收`);
    }
    emit('   💡 处理建议：');
    if (strategy === 'fallback-to-source') {
      emit(`     a) 源码改造（推荐）：把片段（如 "吧！"）合并到上下文整句中，消除片段化提取`);
      emit(
        `     b) 接受源文本兜底：当前已自动回填，运行时不再出现 missing key；但 target 模式下显示 ${sourceLocale} 文本`,
      );
      emit(`     c) 严格模式：在 i18n.config 设置 merge.onLlmRejected: 'warn-only' 关闭自动回填`);
    } else {
      emit(`     a) 编辑 ${FILES.UNTRANSLATED_JSON}，把 target 值改成有效翻译后重跑 merge`);
      emit(`     b) 或源码改造：把片段合并到上下文整句中，消除片段化提取`);
      emit(
        `     c) 启用回填：在 i18n.config 设置 merge.onLlmRejected: 'fallback-to-source' 用源文本兜底`,
      );
    }
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

  /**
   * 同步翻译到目标语言文件：对每个 target 独立写入。
   */
  private updateLanguagePackage(newlyTranslated: Translations): void {
    const targets = this.config.locales.targets;

    for (const target of targets) {
      if (this.config.buckets) {
        this.updateBucketedLanguagePackage(newlyTranslated, target);
      } else {
        this.updateFlatLanguagePackage(newlyTranslated, target);
      }
    }
  }

  private updateBucketedLanguagePackage(newlyTranslated: Translations, target: string): void {
    const sourceLocale = this.config.locales.source;

    // 读取现有 target locale 数据
    const { flat: targetMessages } = LanguageFileManager.readBucketedLocaleWithBucketMap(
      this.config,
      this.isCustom,
      target,
    );

    let updatedCount = 0;
    for (const [key, data] of Object.entries(newlyTranslated)) {
      const translatedValue = data[target];
      if (
        translatedValue &&
        typeof translatedValue === 'string' &&
        targetMessages[key] !== translatedValue
      ) {
        targetMessages[key] = translatedValue;
        updatedCount++;
      }
    }

    // 用 BucketResolver 重新计算 keyBucketMap：source locale 的文本驱动分桶，
    // 与 generate/export 阶段一致
    const sourceMessages = LanguageFileManager.readLocaleFile(
      this.config,
      this.isCustom,
      sourceLocale,
    );
    const messagesForBucketing = sourceMessages ?? targetMessages;
    const keyBucketMap = LanguageFileManager.buildKeyBucketMap(this.config, messagesForBucketing);

    LanguageFileManager.writeLocaleFile(
      this.config,
      this.isCustom,
      targetMessages,
      target,
      keyBucketMap,
    );
    LoggerUtils.info(`📄 已更新 [${target}] 桶式语言包，更新 ${updatedCount} 个条目`);
  }

  private updateFlatLanguagePackage(newlyTranslated: Translations, target: string): void {
    const targetMessages = LanguageFileManager.readLocaleFile(this.config, this.isCustom, target);
    if (targetMessages === null) {
      // 文件存在但解析失败：readLocaleFile 已打印错误
      return;
    }

    let updatedCount = 0;
    for (const [key, data] of Object.entries(newlyTranslated)) {
      const translatedValue = data[target];
      if (
        translatedValue &&
        typeof translatedValue === 'string' &&
        targetMessages[key] !== translatedValue
      ) {
        targetMessages[key] = translatedValue;
        updatedCount++;
      }
    }

    LanguageFileManager.writeLocaleFile(this.config, this.isCustom, targetMessages, target);
    LoggerUtils.info(
      `📄 已更新 [${target}].json（${this.config.io.format}），更新 ${updatedCount} 个条目`,
    );
  }

  private displayMergeResult(
    analysisResult: ReturnType<typeof MergeProcessor.prototype.analyzeTranslationStatus>,
  ): void {
    const sourceLocale = this.config.locales.source;
    const targets = this.config.locales.targets;
    const newTranslatedExamples = Object.keys(analysisResult.newlyTranslated).slice(0, 3);
    if (newTranslatedExamples.length > 0) {
      LoggerUtils.info('\n✅ 新翻译完成示例:');
      newTranslatedExamples.forEach((key) => {
        const item = analysisResult.newlyTranslated[key]!;
        LoggerUtils.info(`  ${key}:`);
        LoggerUtils.info(`    ${sourceLocale}: "${item[sourceLocale]}"`);
        for (const target of targets) {
          LoggerUtils.info(`    ${target}: "${item[target]}"`);
        }
      });
    }

    LoggerUtils.info(`\n📊 合并结果:`);
    LoggerUtils.info(`   - ✅ 新合并翻译: ${analysisResult.newTranslatedCount} 个`);
    if (analysisResult.rejectedFallbackCount > 0) {
      LoggerUtils.info(
        `   - 🔁 拒收用源文本回填: ${analysisResult.rejectedFallbackCount} 个 target 位`,
      );
    }
    LoggerUtils.info(`   - 📝 仍需翻译: ${analysisResult.stillUntranslatedCount} 个`);
  }
}
