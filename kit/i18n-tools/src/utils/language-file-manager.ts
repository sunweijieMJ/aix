import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import { FileUtils } from './file-utils';
import { LoggerUtils } from './logger';
import type { ExtractedString, ILangMap, LocaleMap } from './types';
import { CommonASTUtils } from './ast';

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
      // 直接写入，不再对key进行排序，以保持原始顺序并追加新条目
      const content = JSON.stringify(localeMap, null, 2);
      fs.writeFileSync(localeFilePath, content + '\n', 'utf-8');
    } catch (error) {
      LoggerUtils.error(`❌ 写入语言文件失败: ${localeFilePath}`, error);
    }
  }

  /**
   * 备份当前的语言文件
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @param locale - 语言代码
   */
  static backupFile(config: ResolvedConfig, isCustom: boolean, locale?: string): void {
    locale = locale || config.locale.source;
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);
    const localeFilePath = path.join(workingDir, `${locale}.json`);
    const backupFilePath = path.join(workingDir, `${locale}.json.bak`);

    try {
      if (fs.existsSync(localeFilePath)) {
        fs.copyFileSync(localeFilePath, backupFilePath);
        LoggerUtils.success(`语言文件备份成功: ${backupFilePath}`);
      } else {
        LoggerUtils.warn(`语言文件不存在，无法备份: ${localeFilePath}`);
      }
    } catch (error) {
      LoggerUtils.error(`❌ 备份语言文件失败: ${localeFilePath}`, error);
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

    try {
      const localeMap = this.readLocaleFile(config, isCustom);
      if (localeMap === null) return; // 如果读取失败则中止

      const newEntries: LocaleMap = {};
      let updatedCount = 0;
      let addedCount = 0;

      for (const extracted of extractedStrings) {
        if (!extracted.semanticId) continue;

        // 使用processedMessage（字面量已内联）或original
        let message = extracted.processedMessage || extracted.original;
        // 移除原始文本两端的引号或反引号
        message = message.replace(/^['"`]|['"`]$/g, '');

        if (extracted.isTemplateString && extracted.templateVariables) {
          // 将模板字符串中的 ${...} 替换为 {key}
          const placeholderMap = new Map<string, string>();
          const usedNames = new Set<string>();

          extracted.templateVariables.forEach((variableExpr) => {
            // 复用 CommonASTUtils 的变量名提取逻辑，确保与代码侧参数名一致
            let key = CommonASTUtils.getVariableNameFromExpression(variableExpr);

            const originalKey = key;
            let count = 1;
            while (usedNames.has(key)) {
              key = `${originalKey}${count++}`;
            }
            usedNames.add(key);
            placeholderMap.set(variableExpr, key);
          });

          placeholderMap.forEach((placeholder, expression) => {
            message = message.replace(`\${${expression}}`, `{${placeholder}}`);
          });
        }

        if (!localeMap[extracted.semanticId]) {
          // 新增条目
          newEntries[extracted.semanticId] = message;
          addedCount++;
        } else if (localeMap[extracted.semanticId] !== message) {
          // 更新已存在的条目
          localeMap[extracted.semanticId] = message;
          updatedCount++;
        }
      }

      if (addedCount > 0 || updatedCount > 0) {
        // 合并旧条目和新条目，以保证顺序
        const finalMap = { ...localeMap, ...newEntries };
        this.writeLocaleFile(config, isCustom, finalMap);

        LoggerUtils.success(`✅ 语言文件更新成功！`);
        if (addedCount > 0) {
          LoggerUtils.info(`   - 新增条目: ${addedCount}`);
        }
        if (updatedCount > 0) {
          LoggerUtils.info(`   - 更新条目: ${updatedCount}`);
        }
      } else {
        LoggerUtils.info('✅ 语言文件已是最新状态，无需更新');
      }
    } catch (error) {
      LoggerUtils.error('❌ 更新语言文件时发生错误:', error);
    }
  }
}
