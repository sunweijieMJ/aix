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
    // 注意：即使 untranslated 为空，也不能早退——translations.json 里可能仍有
    // pick 阶段被 glossary 命中后预填、但尚未同步到目标语言文件的条目。
    if (totalCount === 0) {
      LoggerUtils.warn('待翻译文件为空，仅同步 translations.json 中已有条目到目标语言文件。');
    } else {
      LoggerUtils.info(`📄 待翻译文件: ${untranslatedPath}`);
      LoggerUtils.info(`📊 发现 ${totalCount} 个待翻译条目`);
    }

    const existingTranslations = this.loadExistingTranslations(translatedPath);
    const analysisResult = this.analyzeTranslationStatus(untranslatedData);

    // 同样不能在 newTranslatedCount === 0 时早退：本轮虽无 LLM 翻译完成，
    // 但 existingTranslations 中的 glossary 预填条目仍可能未同步到目标语言文件。
    // 历史 bug：早退导致 glossary 命中条目永远卡在 translations.json，en-US.json 缺失。
    // 判定"无新增写入"时也要把 rejectedFallback 计入——它们也是本轮新写入。
    if (analysisResult.newTranslatedCount === 0 && analysisResult.rejectedFallbackCount === 0) {
      LoggerUtils.warn(
        '本轮没有新增翻译或回填，将仅同步 translations.json 中已有条目到目标语言文件。',
      );
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
    /** 拒收条目按 fallback-to-source 策略用源文本回填的数量（warn-only 策略下为 0） */
    rejectedFallbackCount: number;
  } {
    const sourceLocale = this.config.locale.source;
    const targetLocale = this.config.locale.target;
    const strategy = this.config.merge.rejectedStrategy;
    const newlyTranslated: Translations = {};
    const stillUntranslated: Translations = {};
    let newTranslatedCount = 0;
    let stillUntranslatedCount = 0;
    let rejectedFallbackCount = 0;
    // 单独收集「LLM 给了 target 值但被 isValidTranslation 判无效」的条目。
    // 这类条目 LLM 已经"翻过"但被工具拒收（纯标点 / 空白等），如不告知用户，
    // 每次 merge 看到的现象是「仍需翻译 N 个」却不知道是 LLM 还没翻还是被拒，
    // 也不知道怎么破——会永久卡在 untranslated.json 里循环往复。
    const rejected: Array<{ key: string; zh: string; en: string }> = [];

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
        continue;
      }

      // 区分「LLM 还没翻」与「LLM 翻了但被拒收」：前者 enValue 为空 / 缺失，
      // 后者 enValue 是非空字符串但 isValidTranslation 返回 false（典型：
      // 纯标点 "!" / 纯空白）。
      const isRejected = typeof enValue === 'string' && enValue.trim().length > 0;

      if (isRejected) {
        rejected.push({ key, zh: zhValue ?? '', en: enValue });

        // fallback-to-source：拒收条目用源文本回填到目标语言文件，避免运行时显示
        // key 字符串。同时从 untranslated.json 移除（不进入 stillUntranslated），
        // 否则每次 merge 都重新走拒收警告，且 pick 也无法把它当"已处理"。
        // 仅当源文本是非空字符串时才回填——zh 为空时回填没有意义。
        if (
          strategy === 'fallback-to-source' &&
          typeof zhValue === 'string' &&
          zhValue.trim().length > 0
        ) {
          newlyTranslated[key] = {
            [sourceLocale]: zhValue,
            [targetLocale]: zhValue,
          };
          rejectedFallbackCount++;
          continue;
        }
      }

      // 默认归入 stillUntranslated（含：真未翻译、warn-only 策略下的拒收、
      // fallback-to-source 但源文本也为空的拒收）
      stillUntranslated[key] = {
        [sourceLocale]: zhValue ?? '',
        [targetLocale]: enValue || '',
      };
      stillUntranslatedCount++;
    }

    LoggerUtils.success(`✅ 新翻译完成: ${newTranslatedCount} 个`);
    if (rejectedFallbackCount > 0) {
      LoggerUtils.info(`🔁 LLM 拒收已用源文本回填: ${rejectedFallbackCount} 个`);
    }
    LoggerUtils.info(`📝 仍需翻译: ${stillUntranslatedCount} 个`);

    if (rejected.length > 0) {
      this.reportRejectedTranslations(rejected, sourceLocale, targetLocale, strategy);
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
   *
   * 为什么单独搞这个：被拒条目会永远卡在 untranslated.json，下次跑 LLM 大概率
   * 还是返回纯标点（语义本身就是片段），形成"merge 看到仍需翻译 N 个" → 用户
   * 重跑 translate → LLM 还是返回 ! → 还是被拒 的死循环。必须显式告知用户
   * "这些需要人工介入"。
   */
  private reportRejectedTranslations(
    rejected: Array<{ key: string; zh: string; en: string }>,
    sourceLocale: string,
    targetLocale: string,
    strategy: 'fallback-to-source' | 'warn-only',
  ): void {
    // emit 同时写 console（即时反馈）与 RunReport（落盘到 .i18n-tools/logs/，
    // 终端刷新后仍可回查）。与 LocaleValueLinter 走同一模式。
    const emit = (line: string): void => {
      LoggerUtils.warn(line);
      this.report.addWarning(line);
    };

    if (strategy === 'fallback-to-source') {
      emit(
        `\n🔁 ${rejected.length} 个翻译被判无效（LLM 返回纯标点 / 空白），已用 ${sourceLocale} 源文本回填到 ${targetLocale}：`,
      );
    } else {
      emit(
        `\n⚠️  ${rejected.length} 个翻译被判无效（LLM 返回纯标点 / 空白），未合并到 ${targetLocale}：`,
      );
    }
    for (const { key, zh, en } of rejected) {
      emit(`   - ${key}`);
      emit(`     ${sourceLocale}: ${JSON.stringify(zh)}`);
      emit(`     ${targetLocale}: ${JSON.stringify(en)}   ← 已被 isValidTranslation 拒收`);
    }
    emit('   💡 处理建议：');
    if (strategy === 'fallback-to-source') {
      emit(`     a) 源码改造（推荐）：把片段（如 "吧！"）合并到上下文整句中，消除片段化提取`);
      emit(
        `     b) 接受源文本兜底：当前已自动回填，运行时不再出现 missing key；但 ${targetLocale} 模式下显示 ${sourceLocale} 文本`,
      );
      emit(
        `     c) 严格模式：在 i18n.config 设置 merge.rejectedStrategy: 'warn-only' 关闭自动回填`,
      );
    } else {
      emit(
        `     a) 编辑 ${FILES.UNTRANSLATED_JSON}，把 ${targetLocale} 值改成有效翻译后重跑 merge`,
      );
      emit(`     b) 或源码改造：把片段（如 "吧！"）合并到上下文整句中，消除片段化提取`);
      emit(
        `     c) 启用回填：在 i18n.config 设置 merge.rejectedStrategy: 'fallback-to-source' 用源文本兜底`,
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
    // 读出现有 target 扁平内容，与新翻译合并后交给 writeLocaleFile 序列化。
    // 落盘格式（nested / flat）由 config.output.format 在 serialize() 中统一决定，
    // 不再从现有文件结构嗅探——否则历史扁平文件会让 nested 配置永远无法生效。
    const targetMessages = LanguageFileManager.readLocaleFile(
      this.config,
      this.isCustom,
      targetLocale,
    );
    if (targetMessages === null) {
      // 文件存在但解析失败：readLocaleFile 已打印错误。
      // 防止覆盖损坏的源文件，直接中断本次同步。
      return;
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

    LanguageFileManager.writeLocaleFile(this.config, this.isCustom, targetMessages, targetLocale);
    LoggerUtils.info(
      `📄 已更新 ${targetLocale}.json（${this.config.output.format}），更新 ${updatedCount} 个条目`,
    );
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
    if (analysisResult.rejectedFallbackCount > 0) {
      LoggerUtils.info(`   - 🔁 拒收用源文本回填: ${analysisResult.rejectedFallbackCount} 个`);
    }
    LoggerUtils.info(`   - 📝 仍需翻译: ${analysisResult.stillUntranslatedCount} 个`);
  }
}
