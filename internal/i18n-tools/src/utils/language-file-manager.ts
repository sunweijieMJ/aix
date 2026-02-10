import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import { FILES, LOCALE_TYPE } from './constants';
import { FileUtils } from './file-utils';
import { LoggerUtils } from './logger';
import { ExtractedString, ILangMap, LocaleMap, Translations } from './types';

/**
 * 语言文件管理器
 * 整合语言文件的所有操作，包括读取、写入、合并、备份等功能
 *
 * 所有路径通过 ResolvedConfig 传入，不再使用硬编码路径
 */
export class LanguageFileManager {
  /**
   * 获取目录描述
   * @returns 目录描述字符串
   */
  static getDirDescription(isCustom: boolean): string {
    return isCustom ? '(定制目录)' : '(主目录)';
  }

  /**
   * 获取语言消息
   * 读取指定目录下的语言文件，自动扁平化嵌套结构
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @returns 语言映射对象（扁平化后）
   */
  static getMessages(config: ResolvedConfig, isCustom: boolean): ILangMap {
    const translationsDirectory = FileUtils.getDirectoryPath(config, isCustom);
    const enUSPath = path.join(translationsDirectory, FILES.EN_US_JSON);
    const zhCNPath = path.join(translationsDirectory, FILES.ZH_CN_JSON);

    // 加载JSON文件
    const enUS = FileUtils.loadJsonFile(enUSPath);
    const zhCN = FileUtils.loadJsonFile(zhCNPath);

    // 自动扁平化嵌套结构（支持 layout.systemTitle 格式）
    return {
      'en-US': FileUtils.flattenObject(enUS),
      'zh-CN': FileUtils.flattenObject(zhCN),
    };
  }

  /**
   * 清空语言文件
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   */
  static clearMessages(config: ResolvedConfig, isCustom: boolean): void {
    const messages = this.getMessages(config, isCustom);
    const dirDescription = this.getDirDescription(isCustom);
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);

    Object.keys(messages).forEach((locale) => {
      FileUtils.createOrEmptyFile(
        path.join(workingDir, `${locale}.json`),
        '{}',
      );
      LoggerUtils.info(`已清空 ${locale}.json 文件 ${dirDescription}`);
    });
  }

  /**
   * 生成语言文件
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   */
  static generateMessages(config: ResolvedConfig, isCustom: boolean): void {
    try {
      const languages = Object.keys(this.getMessages(config, isCustom));
      const dirDescription = this.getDirDescription(isCustom);
      const workingDir = FileUtils.getDirectoryPath(config, isCustom);
      const compileDir = FileUtils.getCompileDir(config, isCustom);

      if (
        !fs.existsSync(compileDir) ||
        fs.readdirSync(compileDir).length === 0
      ) {
        LoggerUtils.warn(
          `${compileDir} 目录下没有找到消息文件，跳过生成步骤。`,
        );
        return;
      }

      const jsonFiles = fs
        .readdirSync(compileDir)
        .filter((file) => file.endsWith('.json'));
      if (jsonFiles.length === 0) {
        LoggerUtils.warn(
          `${compileDir} 目录下没有找到JSON文件，跳过生成步骤。`,
        );
        return;
      }

      const mergedContent = jsonFiles.reduce((acc, file) => {
        const filePath = path.join(compileDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        return { ...acc, ...FileUtils.safeParseJson(content) };
      }, {} as Translations);

      languages.forEach((lang) => {
        fs.writeFileSync(
          path.join(workingDir, `${lang}.json`),
          JSON.stringify(mergedContent, null, 2) + '\n',
        );
      });

      LoggerUtils.success(
        `成功生成 ${languages.join(' 和 ')} 语言文件 ${dirDescription}`,
      );
    } catch (error) {
      LoggerUtils.error(`生成语言文件时发生错误:`, error);
    }
  }

  /**
   * 完成语言文件的处理
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   */
  static completeMessages(config: ResolvedConfig, isCustom: boolean): void {
    const translatedPath = FileUtils.getTranslatedPath(config, isCustom);
    const dirDescription = this.getDirDescription(isCustom);
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);

    if (!fs.existsSync(translatedPath)) {
      FileUtils.createOrEmptyFile(translatedPath);
      LoggerUtils.info(`创建空的 translations.json 文件 ${dirDescription}`);
    }

    const translations = FileUtils.loadJsonFile(translatedPath);
    const messages = this.getMessages(config, isCustom);

    Object.entries(messages).forEach(([locale, translation]) => {
      Object.entries(translation).forEach(([key, message]) => {
        messages[locale]![key] =
          (translations[key] && translations[key]![locale]) || message;
      });
    });

    Object.entries(messages).forEach(([locale, messageMap]) => {
      fs.writeFileSync(
        path.join(workingDir, `${locale}.json`),
        JSON.stringify(messageMap, null, 2) + '\n',
      );
      LoggerUtils.info(`完成 ${locale}.json 文件处理 ${dirDescription}`);
    });

    const dirsToDelete = [
      path.join(workingDir, 'compile'),
      path.join(workingDir, 'extract'),
    ];
    FileUtils.deleteDirs(dirsToDelete);
  }

  /**
   * 合并消息，生成translations.json
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   */
  static combineMessages(config: ResolvedConfig, isCustom: boolean): void {
    const result: Translations = {};
    const targetFile = FILES.TRANSLATIONS_JSON;
    const dirDescription = this.getDirDescription(isCustom);
    const messages = this.getMessages(config, isCustom);
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);

    Object.entries(messages).forEach(([locale, translationMap]) => {
      Object.entries(translationMap).forEach(([id, message]) => {
        result[id] = result[id] || {};
        result[id][locale] = message as string;
      });
    });

    fs.writeFileSync(
      path.join(workingDir, targetFile),
      JSON.stringify(result, null, 2) + '\n',
    );
    LoggerUtils.info(`合并生成 ${targetFile} 文件成功 ${dirDescription}`);
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
    locale: string = LOCALE_TYPE.ZH_CN,
  ): LocaleMap | null {
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
      LoggerUtils.error(
        '👉 为防止数据丢失，本次将不会更新语言文件。请检查JSON文件格式是否正确。',
      );
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
    locale: string = LOCALE_TYPE.ZH_CN,
  ): void {
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
  static backupFile(
    config: ResolvedConfig,
    isCustom: boolean,
    locale: string = LOCALE_TYPE.ZH_CN,
  ): void {
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
            // 从表达式文本中提取一个合理的变量名
            let key = variableExpr
              .replace(/\(.*\)/g, '')
              .replace(/\?\.|\?/g, '.')
              .split('.')
              .filter((p) => p.trim() !== '')
              .pop()
              ?.replace(/[^a-zA-Z0-9_]/g, '');

            if (!key) key = 'val';

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
