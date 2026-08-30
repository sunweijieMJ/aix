import type { ResolvedConfig } from '../config';
import { FILES } from '../utils/constants';
import { FileUtils } from '../utils/file-utils';
import { Glossary, type GlossaryMap } from '../utils/glossary';
import { LoggerUtils } from '../utils/logger';
import type { Translations } from '../utils/types';
import { FileProcessor } from './FileProcessor';
import { loadJsonDictOrThrow, writeTranslationsFile } from '../utils/json-io';

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

    // locale 损坏防护：getMessages 走 safeLoadJsonFile(silent)，损坏文件被静默当成
    // {}。源损坏 → sourceMessages 为空 → 写出两个空字典；任一 target 损坏 → 该 target 全部
    // key 在 analyzeTranslationStatus 里读成 undefined、判为未翻译 → 同样无条件覆写
    // untranslated.json，销毁尚未 merge 的在途译文并伪报成功。故 source 与所有 target 一并
    // 校验（探测口径统一收口于 LanguageFileManager.findCorruptLocale）。
    this.langFiles.assertLocalesNotCorrupt([sourceLocale, ...targets], {
      checkLegacy: true,
      buildMessage: (locale, file) =>
        `locale「${locale}」解析失败：${file}，已中止 pick 以防销毁 untranslated.json 在途译文 / 伪报成功。请先修复 JSON 格式。`,
    });

    const messages = this.langFiles.getMessages();
    const sourceMessages = (messages[sourceLocale] || {}) as Record<string, string>;

    // 在途译文保护（读入口）：translate 会把 LLM 译文写回 untranslated.json、由 merge 才合入
    // locale。这里必须严格读取——损坏时中止（与 merge/translate 的 loadJsonDictOrThrow 口径
    // 一致）：损坏文件里同样可能藏着在途译文，降级为 {} 再覆写等于销毁且无提示。
    // 读取结果同时供下方「合法空源」安全闸与 analyzeTranslationStatus 的保留逻辑复用。
    const existingUntranslated = loadJsonDictOrThrow<Translations>(
      untranslatedPath,
      (p) =>
        `待翻译文件解析失败（JSON 格式错误）: ${p}\n` +
        '👉 该文件可能含 translate 已写入、尚未 merge 的在途译文；已中止 pick 以防覆写销毁。' +
        '请修复 JSON 格式后重试。',
    );

    // 安全闸：源 locale 合法但为空（如被误清空 / 重置为 {}）时，下方分析会产出两个空字典并
    // 无条件覆写 untranslated.json / translations.json，销毁尚未 merge 的在途译文且伪报成功。
    // 上面的损坏守卫只拦 JSON 解析失败，挡不住「合法空」这一入口；此处与 PruneProcessor 的
    // usedKeys===0 安全闸对齐：源为空且已存在非空在途文件时中止，宁可报错不静默破坏。
    if (Object.keys(sourceMessages).length === 0) {
      // 与上方 untranslated 同为严格读取：silent 降级会把损坏的 translations.json 当 {}，
      // 安全闸随之判「无在途译文」放行，下方无条件覆写把损坏文件里的译文一并抹掉。
      const existingTranslated = loadJsonDictOrThrow<Record<string, unknown>>(
        translatedPath,
        (p) =>
          `已翻译文件解析失败（JSON 格式错误）: ${p}\n` +
          '👉 该文件可能含尚未合入 locale 的译文；已中止 pick 以防覆写销毁。请修复 JSON 格式后重试。',
      );
      if (
        Object.keys(existingUntranslated).length > 0 ||
        Object.keys(existingTranslated).length > 0
      ) {
        throw new Error(
          `源 locale「${sourceLocale}」为空（0 个条目），但已存在非空 ${FILES.UNTRANSLATED_JSON} / ` +
            `${FILES.TRANSLATIONS_JSON}；已中止 pick 以防销毁在途译文。若确需以空源重置，` +
            `请先手动清空或备份上述文件。`,
        );
      }
    }

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
      existingUntranslated,
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
    inFlight: Translations = {},
  ): {
    untranslatedEntries: Translations;
    translatedEntries: Translations;
    untranslatedCount: number;
    translatedCount: number;
    glossaryHits: number;
    glossaryOverrides: number;
    preservedInFlight: number;
    perTargetUntranslated: Record<string, number>;
  } {
    const sourceLocale = this.config.locales.source;
    const targets = this.config.locales.targets;
    const { override, normalize } = this.config.glossary;
    const untranslatedEntries: Translations = {};
    const translatedEntries: Translations = {};
    let glossaryHits = 0;
    let glossaryOverrides = 0;
    let preservedInFlight = 0;
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
          // 在途译文保护：locale 无有效值、词表也未命中时，若旧 untranslated.json 已有
          // translate 写入的有效译文，且源文案未变（变了说明译文已陈旧、不可复用），原样
          // 保留——否则重跑 pick 会把 LLM 已产出、尚未 merge 的译文静默清空。
          // 条目仍留在 untranslated.json（hasUntranslated=true）等 merge 合入；translate
          // 对已填有效值的条目会经 isValidTranslation 跳过，不会重复翻译。
          // 优先级：词表 > 在途译文 > 置空待翻（词表命中走不到本分支，天然高于在途）。
          const inFlightEntry = inFlight[key];
          const inFlightValue = inFlightEntry?.[target];
          if (
            inFlightEntry?.[sourceLocale] === sourceValue &&
            typeof inFlightValue === 'string' &&
            FileUtils.isValidTranslation(inFlightValue)
          ) {
            perTargetValue[target] = inFlightValue;
            hasUntranslated = true;
            preservedInFlight++;
          } else {
            // 一律置空，不回写 existing：走到这里说明 existing 未过 isValidTranslation（纯标点 /
            // 空白等垃圾值）。原样带进 untranslated.json 会与翻译 prompt 规则 3「目标已有值则
            // 原样保留」合谋——LLM 把垃圾值当既有译文返回，merge 侧的 isValidTranslation 再拒收，
            // 该 key 在 warn-only 策略下永远翻不出来而统计全绿。置空后 LLM 才会真正翻译它。
            perTargetValue[target] = '';
            hasUntranslated = true;
            perTargetUntranslated[target] = (perTargetUntranslated[target] ?? 0) + 1;
          }
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
      preservedInFlight,
      perTargetUntranslated,
    };
  }

  private saveFiles(
    untranslatedPath: string,
    translatedPath: string,
    analysisResult: ReturnType<typeof PickProcessor.prototype.analyzeTranslationStatus>,
  ): void {
    writeTranslationsFile(untranslatedPath, analysisResult.untranslatedEntries);
    LoggerUtils.info(
      `📄 生成 ${FILES.UNTRANSLATED_JSON} 文件成功 (${this.getDirectoryDescription()})`,
    );
    LoggerUtils.info(`📝 待翻译条目: ${analysisResult.untranslatedCount} 个`);

    writeTranslationsFile(translatedPath, analysisResult.translatedEntries);
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
    if (analysisResult.preservedInFlight > 0) {
      LoggerUtils.info(
        `   🛡️  在途译文保留: ${analysisResult.preservedInFlight} 处（translate 已翻、待 merge，未计入待翻译数)`,
      );
    }
  }
}
