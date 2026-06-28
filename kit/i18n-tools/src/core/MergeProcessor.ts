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

    // 损坏即在写回前中止：performMerge 会先清空 untranslated.json 并写 translations.json，
    // 之后才同步到 target locale；若把损坏 target locale 的检测留在 updateLanguagePackage 内部
    // （那里只 log+return、不抛错），会出现 CI 伪成功（exit 0）+ 运行时漏译。与 Pick/Prune 的
    // 「损坏即变更前抛错」口径对齐：source + 所有 target 任一损坏即 fail-fast。
    this.assertLocalesNotCorrupt();

    if (!fs.existsSync(untranslatedPath)) {
      throw new Error(`待翻译文件不存在: ${untranslatedPath}，请先运行 pick 命令生成。`);
    }

    const untranslatedData = this.loadUntranslatedData(untranslatedPath);

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

  private loadUntranslatedData(filePath: string): Translations {
    // 必须区分「损坏」与「空/缺失」：不能用 safeLoadJsonFile，因为它对解析失败
    // 返回默认值 {}（而非抛错），会让本文件被当成空文件继续——下游
    // updateUntranslatedFile 随即用 '{}' 覆写、销毁在途译文（含已填/已翻译的
    // target 值，pick 无法重生成）。loadJsonDictOrThrow 对「有内容却解析失败」抛错中止。
    // （文件存在性已由 run() 在调用前校验，缺失视为 {} 不影响。）
    return FileUtils.loadJsonDictOrThrow<Translations>(
      filePath,
      (p) =>
        `待翻译文件解析失败（JSON 格式错误）: ${p}\n` +
        '👉 为防止销毁在途翻译数据，已中止 merge。请修复该文件的 JSON 格式后重试。',
    );
  }

  private loadExistingTranslations(filePath: string): Translations {
    if (!fs.existsSync(filePath)) {
      LoggerUtils.info(`创建新的 ${FILES.TRANSLATIONS_JSON} 文件`);
      return {};
    }
    // 必须区分「损坏」与「空」：损坏时若降级为 {}，performMerge 的 {...existing, ...newly}
    // 会用空对象覆写、销毁此前所有已合并条目。与姊妹方法一致：有内容却解析失败即中止。
    return FileUtils.loadJsonDictOrThrow<Translations>(
      filePath,
      (p) =>
        `${FILES.TRANSLATIONS_JSON} 解析失败（JSON 格式错误）: ${p}\n` +
        '👉 为防止销毁已合并的翻译条目，已中止 merge。请修复该文件的 JSON 格式后重试。',
    );
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
    FileUtils.writeTranslationsFile(translatedPath, finalTranslations);
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
      FileUtils.writeTranslationsFile(filePath, analysisResult.stillUntranslated);
      LoggerUtils.info(
        `📝 已更新 ${FILES.UNTRANSLATED_JSON}，剩余 ${analysisResult.stillUntranslatedCount} 个待翻译条目`,
      );
    } else {
      FileUtils.createOrEmptyFile(filePath, '{}');
      LoggerUtils.success(`🎉 所有条目已翻译完成，已清空 ${FILES.UNTRANSLATED_JSON}`);
    }
  }

  /**
   * 写回前损坏守卫：source + 所有 target locale 任一解析失败即抛错中止。
   * 探测口径（桶式 / 遗留单文件 / 单文件）统一收口于 LanguageFileManager.findCorruptLocale。
   */
  private assertLocalesNotCorrupt(): void {
    const locales = [this.config.locales.source, ...this.config.locales.targets];
    const suffix =
      '\n👉 为避免 CI 伪成功与运行时漏译，已在写回前中止 merge。请先修复该文件的 JSON 格式后重试。';
    LanguageFileManager.assertLocalesNotCorrupt(this.config, this.isCustom, locales, {
      checkLegacy: true,
      buildMessage: (locale, file) =>
        this.config.buckets
          ? `locale「${locale}」的桶文件解析失败：${file}${suffix}`
          : `locale「${locale}」解析失败（JSON 格式错误）：${file}${suffix}`,
    });
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

    // 损坏即中止：与扁平路径 updateFlatLanguagePackage 的 `=== null` 守卫对齐。
    // 桶式读取默认 silent 降级（损坏当 {}），若不拦截，损坏 bucket 会在重写时被
    // 静默丢弃。检测到损坏则跳过该 target，不做任何写回。
    const corruptFile = LanguageFileManager.findCorruptBucketFile(
      this.config,
      this.isCustom,
      target,
    );
    if (corruptFile) {
      LoggerUtils.error(`❌ 目标语言桶文件解析失败（JSON 格式错误）: ${corruptFile}`);
      LoggerUtils.error(
        '👉 为防止数据丢失，本次不会更新该 target 的桶式语言包。请检查 JSON 格式。',
      );
      return;
    }

    // 同样守卫 source locale 桶损坏：下方用 source 文本驱动 keyBucketMap 分桶，桶式读取默认
    // silent 降级（损坏当 {}，见 readBucketedLocaleFlat），若 source 桶损坏会得到空表，导致
    // 所有 key 塌缩进 defaultBucket、其余桶被 prune 成 .bak（伪报成功）。与 target 守卫对称。
    const corruptSourceFile = LanguageFileManager.findCorruptBucketFile(
      this.config,
      this.isCustom,
      sourceLocale,
    );
    if (corruptSourceFile) {
      LoggerUtils.error(`❌ 源语言桶文件解析失败（JSON 格式错误）: ${corruptSourceFile}`);
      LoggerUtils.error(
        '👉 为防止桶分布塌缩，本次不会更新该 target 的桶式语言包。请检查 JSON 格式。',
      );
      return;
    }

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
