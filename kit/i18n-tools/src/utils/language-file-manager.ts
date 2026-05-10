import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import { FileUtils } from './file-utils';
import { LoggerUtils } from './logger';
import type { ExtractedString, ILangMap, LocaleMap } from './types';
import { CommonASTUtils } from './common-ast-utils';

/**
 * 语言文件管理器
 * 整合语言文件的所有操作，包括读取、写入、合并、备份等功能
 *
 * 所有路径通过 ResolvedConfig 传入，不再使用硬编码路径
 */
export class LanguageFileManager {
  /**
   * 获取语言消息
   * 读取指定目录下的语言文件，自动扁平化嵌套结构
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @returns 语言映射对象（扁平化后）
   */
  static getMessages(config: ResolvedConfig, isCustom: boolean): ILangMap {
    const translationsDirectory = FileUtils.getDirectoryPath(config, isCustom);
    const sourceLocale = config.locale.source;
    const targetLocale = config.locale.target;
    const sourcePath = path.join(translationsDirectory, `${sourceLocale}.json`);
    const targetPath = path.join(translationsDirectory, `${targetLocale}.json`);

    // 加载JSON文件
    const sourceData = FileUtils.safeLoadJsonFile<Record<string, any>>(sourcePath, {
      silent: true,
    });
    const targetData = FileUtils.safeLoadJsonFile<Record<string, any>>(targetPath, {
      silent: true,
    });

    // 自动扁平化嵌套结构（支持 layout.systemTitle 格式）
    return {
      [sourceLocale]: FileUtils.flattenObject(sourceData),
      [targetLocale]: FileUtils.flattenObject(targetData),
    };
  }

  /**
   * 读取语言文件内容
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @param locale - 语言代码
   * @returns 语言映射对象, 如果文件存在但解析失败则返回null
   */
  static readLocaleFile(
    config: ResolvedConfig,
    isCustom: boolean,
    locale?: string,
  ): LocaleMap | null {
    locale = locale || config.locale.source;
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);
    const localeFilePath = path.join(workingDir, `${locale}.json`);

    try {
      if (!fs.existsSync(localeFilePath)) {
        LoggerUtils.warn(`语言文件不存在，将创建新文件: ${localeFilePath}`);
        return {};
      }
      const content = fs.readFileSync(localeFilePath, 'utf-8');
      return FileUtils.safeParseJson(content);
    } catch (error) {
      LoggerUtils.error(`❌ 读取语言文件失败: ${localeFilePath}`, error);
      LoggerUtils.error('👉 为防止数据丢失，本次将不会更新语言文件。请检查JSON文件格式是否正确。');
      return null;
    }
  }

  /**
   * 写入语言文件内容
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @param localeMap - 要写入的语言映射对象
   * @param locale - 语言代码
   */
  static writeLocaleFile(
    config: ResolvedConfig,
    isCustom: boolean,
    localeMap: LocaleMap,
    locale?: string,
  ): void {
    locale = locale || config.locale.source;
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);
    const localeFilePath = path.join(workingDir, `${locale}.json`);

    try {
      // 不对 key 排序，保持原始顺序并追加新条目；使用 writeJsonFile 走原子写入
      FileUtils.writeJsonFile(localeFilePath, localeMap);
    } catch (error) {
      // 必须抛出：调用方（如 GenerateProcessor）会在此之后写源码文件，若 locale
      // 写入静默失败，会产出 t('key') 但 locale 中无对应条目的"撕裂代码"。
      LoggerUtils.error(`❌ 写入语言文件失败: ${localeFilePath}`, error);
      throw error;
    }
  }

  /**
   * 更新语言文件
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @param extractedStrings - 提取的字符串数组
   */
  static updateLanguageFiles(
    config: ResolvedConfig,
    isCustom: boolean,
    extractedStrings: ExtractedString[],
  ): void {
    if (extractedStrings.length === 0) return;

    // 读取阶段：readLocaleFile 已经吞掉异常并返回 null。null 表示"文件存在但解析
    // 失败"，此时不应继续覆写——防止把 LocaleMap 用空对象重置丢数据。
    const localeMap = this.readLocaleFile(config, isCustom);
    if (localeMap === null) return;

    const newEntries: LocaleMap = {};
    let updatedCount = 0;
    let addedCount = 0;

    for (const extracted of extractedStrings) {
      if (!extracted.semanticId) continue;

      const rawMessage = extracted.processedMessage || extracted.original;

      // 占位符替换（${expr} → {key}）和变量名去重逻辑全部委托给
      // CommonASTUtils.createMessageWithOptions，避免与代码侧参数名不一致。
      const { message } =
        extracted.isTemplateString && extracted.templateVariables
          ? CommonASTUtils.createMessageWithOptions(rawMessage, extracted.templateVariables)
          : { message: rawMessage.replace(/^['"`]|['"`]$/g, '') };

      if (!localeMap[extracted.semanticId]) {
        newEntries[extracted.semanticId] = message;
        addedCount++;
      } else if (localeMap[extracted.semanticId] !== message) {
        localeMap[extracted.semanticId] = message;
        updatedCount++;
      }
    }

    if (addedCount === 0 && updatedCount === 0) {
      LoggerUtils.info('✅ 语言文件已是最新状态，无需更新');
      return;
    }

    // 写入阶段：必须把 writeLocaleFile 的异常向上抛出。writeLocaleFile 自己注释也
    // 明确"必须抛出，否则会产出 t('key') 但 locale 无对应条目的撕裂代码"。原先
    // 在此 try-catch 静默吞错，恰好破坏该契约——上层 GenerateProcessor 误以为
    // locale 已写入，继续覆写源码，最终产生不一致状态。
    const finalMap = { ...localeMap, ...newEntries };
    this.writeLocaleFile(config, isCustom, finalMap);

    LoggerUtils.success(`✅ 语言文件更新成功！`);
    if (addedCount > 0) LoggerUtils.info(`   - 新增条目: ${addedCount}`);
    if (updatedCount > 0) LoggerUtils.info(`   - 更新条目: ${updatedCount}`);
  }
}
