import path from 'path';
import type { IdPrefixConfig } from '../config/types';
import { DEFAULT_ID_PREFIX } from '../config/defaults';

/**
 * ID生成器工具类
 * 提供语义ID生成功能，支持目录前缀和唯一性保证
 */
export class IdGenerator {
  /**
   * 获取分隔符
   */
  private static getSeparator(prefixConfig?: IdPrefixConfig): string {
    return prefixConfig?.separator ?? DEFAULT_ID_PREFIX.separator;
  }

  /**
   * 获取中文映射表
   */
  private static getChineseMappings(
    prefixConfig?: IdPrefixConfig,
  ): Record<string, string> {
    return prefixConfig?.chineseMappings ?? DEFAULT_ID_PREFIX.chineseMappings;
  }

  /**
   * 清理语义ID
   * @param id - 原始ID
   * @param preserveCase - 是否保留大小写
   * @returns 清理后的ID
   */
  private static sanitizeSemanticId(
    id: string,
    preserveCase: boolean = false,
  ): string {
    let result = id;

    if (!preserveCase) {
      result = result.toLowerCase();
    }

    return result
      .replace(/[^a-zA-Z0-9\s_]/g, '') // 保留下划线和大小写字母
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_{3,}/g, '__') // 将3个或更多连续下划线替换为__
      .replace(/^_+|_+$/g, '') // 删除开头和结尾的下划线
      .replace(/([^_])_(?=[^_])/g, '$1'); // 删除单个下划线，但保留__（使用前瞻避免消费后续字符）
  }

  /**
   * 清理完整的ID，保留目录前缀的大小写
   * @param id - 完整的ID（包含目录前缀）
   * @param prefixConfig - ID 前缀配置
   * @returns 清理后的ID
   */
  private static sanitizeFullId(
    id: string,
    prefixConfig?: IdPrefixConfig,
  ): string {
    const separator = this.getSeparator(prefixConfig);
    // 检查是否包含目录分隔符
    if (id.includes(separator)) {
      const parts = id.split(separator);

      // 前两部分是目录前缀，保持大小写
      const directoryParts = parts.slice(0, 2);

      // 语义部分转小写
      const semanticParts = parts.slice(2);

      const cleanedDirectoryParts = directoryParts.map((part) =>
        part.replace(/[^a-zA-Z0-9]/g, ''),
      );

      const cleanedSemanticParts = semanticParts.map(
        (part) => this.sanitizeSemanticId(part, false), // 语义部分转小写
      );

      return [...cleanedDirectoryParts, ...cleanedSemanticParts].join(
        separator,
      );
    }
    // 没有目录前缀，直接清理
    return this.sanitizeSemanticId(id, false);
  }

  /**
   * 使用默认策略生成ID
   * @param filePath - 文件路径
   * @param text - 文本内容
   * @param existingIds - 已有的ID集合
   * @param prefixConfig - ID 前缀配置
   * @returns 生成的ID
   */
  private static generateDefault(
    filePath: string,
    text: string,
    existingIds: Set<string>,
    prefixConfig?: IdPrefixConfig,
  ): string {
    const semanticPart = this.extractSemanticPart(text, prefixConfig);
    return this._createFullId(
      filePath,
      semanticPart,
      existingIds,
      prefixConfig,
    );
  }

  /**
   * 提取目录前缀
   * @param filePath - 文件路径
   * @param prefixConfig - ID 前缀配置
   * @returns 目录前缀
   */
  private static extractDirectoryPrefix(
    filePath: string,
    prefixConfig?: IdPrefixConfig,
  ): string {
    if (!filePath) return '';

    // 如果配置了自定义固定前缀，直接使用
    if (prefixConfig?.value) {
      return prefixConfig.value;
    }

    const separator = this.getSeparator(prefixConfig);
    const normalizedPath = path.normalize(filePath);
    const parts = normalizedPath.split(path.sep);

    // 使用配置的锚点目录或默认 'src'
    const anchor = prefixConfig?.anchor || 'src';
    const anchorIndex = parts.findIndex((part) => part === anchor);
    if (anchorIndex === -1 || anchorIndex >= parts.length - 1) {
      return '';
    }

    // 锚点下的一级目录
    const firstLevelDir = parts[anchorIndex + 1];

    // 当前文件所在目录（不包括文件名）
    const fileIndex = parts.length - 1; // 文件名的索引
    const currentDir = parts[fileIndex - 1]; // 文件所在目录

    // 如果当前目录就是一级目录，则使用文件名（去掉扩展名）
    if (currentDir === firstLevelDir) {
      const fileName = parts[fileIndex]!;
      const fileNameWithoutExt = path.parse(fileName).name;
      return `${firstLevelDir}${separator}${fileNameWithoutExt}`;
    }

    return `${firstLevelDir}${separator}${currentDir}`;
  }

  /**
   * 简单哈希函数，将字符串转为短哈希
   */
  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 提取语义部分
   * @param text - 文本内容
   * @param prefixConfig - ID 前缀配置
   * @returns 语义部分
   */
  private static extractSemanticPart(
    text: string,
    prefixConfig?: IdPrefixConfig,
  ): string {
    const cleanText = text.replace(/[^\u4e00-\u9fff\w\s]/g, '').trim();
    const chineseMappings = this.getChineseMappings(prefixConfig);

    // 检查是否有直接的中文映射
    for (const [chinese, english] of Object.entries(chineseMappings)) {
      if (cleanText === chinese) {
        return english;
      }
    }

    // 包含中文映射关键词时，用映射 + 哈希后缀区分
    for (const [chinese, english] of Object.entries(chineseMappings)) {
      if (cleanText.includes(chinese)) {
        return `${english}_${this.simpleHash(cleanText)}`;
      }
    }

    // 如果是纯英文，直接处理
    if (!/[\u4e00-\u9fff]/.test(cleanText)) {
      return this.sanitizeSemanticId(cleanText);
    }

    // 中文文本：使用 "t_" + 短哈希，保证不同文本生成不同 ID
    return `t_${this.simpleHash(cleanText)}`;
  }

  /**
   * 确保ID唯一性
   * @param baseId - 基础ID
   * @param existingIds - 已有的ID集合
   * @param prefixConfig - ID 前缀配置
   * @returns 唯一ID
   */
  private static ensureUniqueId(
    baseId: string,
    existingIds: Set<string>,
    prefixConfig?: IdPrefixConfig,
  ): string {
    // 先清理ID，保留目录前缀的大小写
    const cleanedId = this.sanitizeFullId(baseId, prefixConfig);

    if (!existingIds.has(cleanedId)) {
      existingIds.add(cleanedId);
      return cleanedId;
    }

    let counter = 1;
    let uniqueId = `${cleanedId}_${counter}`;
    while (existingIds.has(uniqueId)) {
      counter++;
      uniqueId = `${cleanedId}_${counter}`;
    }

    existingIds.add(uniqueId);
    return uniqueId;
  }

  /**
   * 生成带文件路径的ID
   * @param filePath - 文件路径
   * @param text - 文本内容
   * @param existingIds - 已有的ID集合
   * @param prefixConfig - ID 前缀配置
   * @returns 生成的ID
   */
  static generateWithFilePath(
    filePath: string,
    text: string,
    existingIds: Set<string>,
    prefixConfig?: IdPrefixConfig,
  ): string {
    return this.generateDefault(filePath, text, existingIds, prefixConfig);
  }

  /**
   * 为语义ID添加目录前缀
   * @param filePath - 文件路径
   * @param semanticId - 语义ID
   * @param existingIds - 已有的ID集合
   * @param prefixConfig - ID 前缀配置
   * @returns 带目录前缀的完整ID
   */
  static addDirectoryPrefixToId(
    filePath: string,
    semanticId: string,
    existingIds: Set<string>,
    prefixConfig?: IdPrefixConfig,
  ): string {
    return this._createFullId(filePath, semanticId, existingIds, prefixConfig);
  }

  /**
   * 创建完整的、唯一的ID
   * @param filePath - 文件路径
   * @param semanticPart - 语义部分
   * @param existingIds - 已有的ID集合
   * @param prefixConfig - ID 前缀配置
   * @returns 完整的唯一ID
   */
  private static _createFullId(
    filePath: string,
    semanticPart: string,
    existingIds: Set<string>,
    prefixConfig?: IdPrefixConfig,
  ): string {
    const separator = this.getSeparator(prefixConfig);
    const directoryPrefix = this.extractDirectoryPrefix(filePath, prefixConfig);
    const cleanedSemanticId = this.sanitizeSemanticId(semanticPart);

    if (directoryPrefix) {
      const fullId = `${directoryPrefix}${separator}${cleanedSemanticId}`;
      return this.ensureUniqueId(fullId, existingIds, prefixConfig);
    }
    return this.ensureUniqueId(cleanedSemanticId, existingIds, prefixConfig);
  }
}
