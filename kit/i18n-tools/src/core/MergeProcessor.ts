import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { FILES } from '../utils/constants';
import { FileUtils } from '../utils/file-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import type { LocaleMap, Translations } from '../utils/types';
import { FileProcessor } from './FileProcessor';
import { createOrEmptyFile, loadJsonDictOrThrow, writeTranslationsFile } from '../utils/json-io';

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

    // existingTranslations 包含 pick 阶段通过 glossary 预填的条目；合并后一并同步
    const allTranslations = { ...existingTranslations, ...analysisResult.newlyTranslated };

    // 与损坏守卫同样属于「变更前中止」：nested 前缀冲突要到 updateLanguagePackage 的
    // serialize 才抛，那时 untranslated.json / translations.json 已被 performMerge 改写，
    // 多 target 还会前几个已写、后几个没写，且重跑恒在同一处失败。
    this.assertTargetsSerializable(allTranslations);

    this.performMerge(analysisResult, existingTranslations, translatedPath);
    this.updateLanguagePackage(allTranslations);
    this.displayMergeResult(analysisResult);
  }

  private loadUntranslatedData(filePath: string): Translations {
    // 必须区分「损坏」与「空/缺失」：不能用 safeLoadJsonFile，因为它对解析失败
    // 返回默认值 {}（而非抛错），会让本文件被当成空文件继续——下游
    // updateUntranslatedFile 随即用 '{}' 覆写、销毁在途译文（含已填/已翻译的
    // target 值，pick 无法重生成）。loadJsonDictOrThrow 对「有内容却解析失败」抛错中止。
    // （文件存在性已由 mergeTranslationData 在调用前校验，缺失视为 {} 不影响。）
    return loadJsonDictOrThrow<Translations>(
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
    return loadJsonDictOrThrow<Translations>(
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
      if (!MergeProcessor.isEntryObject(key, data)) {
        // 原样留在 untranslated.json：本轮不合并它，也不因跳过而把用户手写的内容写没。
        stillUntranslated[key] = data;
        stillUntranslatedCount++;
        continue;
      }
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
    writeTranslationsFile(translatedPath, finalTranslations);
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
      writeTranslationsFile(filePath, analysisResult.stillUntranslated);
      LoggerUtils.info(
        `📝 已更新 ${FILES.UNTRANSLATED_JSON}，剩余 ${analysisResult.stillUntranslatedCount} 个待翻译条目`,
      );
    } else {
      createOrEmptyFile(filePath, '{}');
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
    this.langFiles.assertLocalesNotCorrupt(locales, {
      checkLegacy: true,
      buildMessage: (locale, file) =>
        this.config.buckets
          ? `locale「${locale}」的桶文件解析失败：${file}${suffix}`
          : `locale「${locale}」解析失败（JSON 格式错误）：${file}${suffix}`,
    });
  }

  /**
   * 写盘前预检：按 updateLanguagePackage 的实际写入口径算出每个 target 的最终 key 集合，
   * 校验 nested 落盘无前缀冲突。只在 nested 下有意义（flat 不做 unflatten）。
   */
  private assertTargetsSerializable(allTranslations: Translations): void {
    if (this.config.io.format === 'flat') return;

    // 与 updateLanguagePackage 的桶式分支同口径：source 非空时分桶表对所有 target 相同，
    // 为空则回退到各 target 自身内容计算。
    const sourceMessages = this.config.buckets
      ? this.langFiles.readLocaleFile(this.config.locales.source)
      : null;
    const sharedKeyBucketMap =
      sourceMessages && Object.keys(sourceMessages).length > 0
        ? LanguageFileManager.buildKeyBucketMap(this.config, sourceMessages)
        : null;

    for (const target of this.config.locales.targets) {
      const targetMessages = this.langFiles.readLocaleFile(target);
      // null = 该 locale 解析失败，由顶层 assertLocalesNotCorrupt 负责中止，此处不重复报错。
      if (targetMessages === null) continue;

      // 最终 key 集 = 现有 key ∪ 本轮真正写入该 target 的 key（applyTranslations 的口径：
      // 只写非空字符串译文）。
      const finalKeys = new Set(Object.keys(targetMessages));
      for (const [key, data] of Object.entries(allTranslations)) {
        // 形态非法的条目不贡献 key，此处也不重复告警
        if (!data || typeof data !== 'object') continue;
        const value = data[target];
        if (typeof value === 'string' && value) finalKeys.add(key);
      }

      const keyBucketMap = this.config.buckets
        ? (sharedKeyBucketMap ?? LanguageFileManager.buildKeyBucketMap(this.config, targetMessages))
        : undefined;
      this.langFiles.assertKeysSerializable(finalKeys, keyBucketMap, `目标语言 [${target}]`);
    }
  }

  /**
   * 同步翻译到目标语言文件：对每个 target 独立写入。
   */
  private updateLanguagePackage(newlyTranslated: Translations): void {
    const targets = this.config.locales.targets;

    if (!this.config.buckets) {
      for (const target of targets) {
        this.updateFlatLanguagePackage(newlyTranslated, target);
      }
      return;
    }

    // 桶式路径：source 派生的损坏检查、读取、keyBucketMap 对所有 target 完全一致，提到
    // 循环外算一次，避免原 per-target 重复造成的 O(targets × sourceSize) 读解析与分桶。
    const sourceLocale = this.config.locales.source;

    // 冗余防御（normally unreachable）：顶层 assertLocalesNotCorrupt 已覆盖 source。语义上若
    // source 桶损坏被 silent 降级当 {}，下方用 source 文本驱动 keyBucketMap 分桶会得到空表，
    // 导致所有 key 塌缩进 defaultBucket、其余桶被 prune 成 .bak（伪报成功）——保留作 safety net。
    // 抛错而非 return：仅 log 后返回会让 merge 以 exit 0 收尾，CI 判绿而语言包实际一条未写。
    const corruptSourceFile = this.langFiles.findCorruptBucketFile(sourceLocale);
    if (corruptSourceFile) {
      throw new Error(
        `源语言桶文件解析失败（JSON 格式错误）: ${corruptSourceFile}` +
          '\n👉 为防止桶分布塌缩，已中止 merge，未更新任何桶式语言包。请先修复该文件的 JSON 格式。',
      );
    }

    // source 文本驱动分桶（与 generate/export 一致）。source 非空时分桶表对所有 target 相同，
    // 预算一次；为空时回退到各 target 的 targetMessages，留到 per-target 内部计算。
    const sourceMessages = this.langFiles.readLocaleFile(sourceLocale);
    const sharedKeyBucketMap =
      sourceMessages && Object.keys(sourceMessages).length > 0
        ? LanguageFileManager.buildKeyBucketMap(this.config, sourceMessages)
        : null;

    for (const target of targets) {
      this.updateBucketedLanguagePackage(newlyTranslated, target, sharedKeyBucketMap);
    }
  }

  private updateBucketedLanguagePackage(
    newlyTranslated: Translations,
    target: string,
    sharedKeyBucketMap: ReturnType<typeof LanguageFileManager.buildKeyBucketMap> | null,
  ): void {
    // 冗余防御（normally unreachable）：真正 load-bearing 的损坏守卫是 mergeTranslationData()
    // 顶层的 assertLocalesNotCorrupt（写回前对 source + 所有 target 做 checkLegacy 探测、损坏即抛错），
    // 而 performMerge 只写 translations.json/untranslated.json、不触碰 locale 桶，故执行到这里时
    // 桶文件必未损坏、下面的 if 分支正常不会命中。保留此处 per-target 探测仅作 belt-and-suspenders：
    // 万一顶层集中守卫被重构移除/绕过，这里仍能拦住「损坏 bucket 被 silent 降级当 {} 后静默丢弃」。
    const corruptFile = this.langFiles.findCorruptBucketFile(target);
    // 同上：抛错而非 return，避免「该 target 一条没写」被 exit 0 掩盖成成功。
    if (corruptFile) {
      throw new Error(
        `目标语言桶文件解析失败（JSON 格式错误）: ${corruptFile}` +
          `\n👉 为防止数据丢失，已中止 merge，未更新 [${target}] 的桶式语言包。请先修复该文件的 JSON 格式。`,
      );
    }

    // 走 readLocaleFile 而非只读桶目录：桶式分支 = 桶 ∪「未迁移 legacy 只读并入」。
    // 迁移窗口内（legacy 单文件还在、无 .bak）只读桶会看不到存量 key，写回时
    // writeBucketedLocaleFile 用这份残缺 map 整写各桶，legacy 里的历史译文永远进不了桶；
    // 等 pick/export 触发迁移后又只剩「桶优先」的并集，读写视图分裂的窗口越长越难查。
    const targetMessages = this.langFiles.readLocaleFile(target);
    if (targetMessages === null) {
      // 未迁移 legacy 单文件损坏（桶损坏已被上方 findCorruptBucketFile 拦下）。与扁平路径
      // 同口径抛错：静默 return 会让本轮译文全部丢失而 merge 仍 exit 0。
      throw new Error(
        `目标语言文件解析失败（JSON 格式错误）: locale「${target}」` +
          `\n👉 为防止译文丢失，已中止 merge，未更新 [${target}] 的桶式语言包。请先修复该文件的 JSON 格式。`,
      );
    }

    const updatedCount = MergeProcessor.applyTranslations(targetMessages, newlyTranslated, target);

    // source 为空时无共享分桶表，回退到当前 target 的消息计算（与原回退语义一致）。
    const keyBucketMap =
      sharedKeyBucketMap ?? LanguageFileManager.buildKeyBucketMap(this.config, targetMessages);

    this.langFiles.writeLocaleFile(targetMessages, target, keyBucketMap);
    LoggerUtils.info(`📄 已更新 [${target}] 桶式语言包，更新 ${updatedCount} 个条目`);
  }

  /**
   * 把 newlyTranslated 里某 target 语言的非空字符串译文写入 targetMessages，返回更新条目数。
   * 桶式 / 扁平两条写回路径共用，仅 targetMessages 来源不同。
   */
  private static applyTranslations(
    targetMessages: LocaleMap,
    newlyTranslated: Translations,
    target: string,
  ): number {
    let updatedCount = 0;
    for (const [key, data] of Object.entries(newlyTranslated)) {
      // translations.json 可被人工编辑，条目值可能不是对象（如 null），读属性前须挡住。
      if (!MergeProcessor.isEntryObject(key, data)) continue;
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
    return updatedCount;
  }

  private updateFlatLanguagePackage(newlyTranslated: Translations, target: string): void {
    const targetMessages = this.langFiles.readLocaleFile(target);
    if (targetMessages === null) {
      // 文件存在但解析失败。与桶式路径同口径抛错：静默 return 会让本轮译文全部丢失、
      // 而 merge 仍以 exit 0 收尾，CI 与人都看不出语言包没被更新。
      throw new Error(
        `目标语言文件解析失败（JSON 格式错误）: locale「${target}」` +
          '\n👉 为防止译文丢失，已中止 merge。请先修复该文件的 JSON 格式后重试。',
      );
    }

    const updatedCount = MergeProcessor.applyTranslations(targetMessages, newlyTranslated, target);

    this.langFiles.writeLocaleFile(targetMessages, target);
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
