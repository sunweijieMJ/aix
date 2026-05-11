import path from 'path';
import { createHash } from 'crypto';
import type { IdPrefixConfig } from '../config/types';
import { DEFAULT_ID_PREFIX } from '../config/defaults';
import { FileUtils } from './file-utils';

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
  private static getChineseMappings(prefixConfig?: IdPrefixConfig): Record<string, string> {
    return prefixConfig?.chineseMappings ?? DEFAULT_ID_PREFIX.chineseMappings;
  }

  /**
   * 清理语义ID
   * @param id - 原始ID
   * @param preserveCase - 是否保留大小写
   * @returns 清理后的ID
   */
  private static sanitizeSemanticId(id: string, preserveCase: boolean = false): string {
    let result = id;

    // 去除前导序号噪音：「9. 消息提示」「9、消息」「9) 消息」「9）消息」 → 「消息」
    // 否则会生成形如 messageprompt9 / 9message 这种带序号的 key
    result = result.replace(/^\s*\d+\s*[.、。)）:：、\s]+/, '');

    if (!preserveCase) {
      result = result.toLowerCase();
    }

    return result
      .replace(/[^a-zA-Z0-9\s_]/g, '') // 保留下划线和大小写字母
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_{3,}/g, '__') // 将3个或更多连续下划线压缩为__
      .replace(/^_+|_+$/g, ''); // 删除开头和结尾的下划线
  }

  /**
   * 按段清理目录前缀（保持每段的大小写，去除非字母数字字符）
   *
   * 目录前缀的段数由 extractDirectoryPrefix 决定（可变），不再硬编码 2 段。
   * 用 split(separator) 严格反推：semanticPart 单段不含 separator，因此
   * `<directoryPrefix><separator><semanticPart>` 的前 N-1 段即目录段。
   */
  private static cleanDirectoryPrefix(prefix: string, prefixConfig?: IdPrefixConfig): string {
    const separator = this.getSeparator(prefixConfig);
    return prefix
      .split(separator)
      .map((part) => part.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(Boolean)
      .join(separator);
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
    return this._createFullId(filePath, semanticPart, existingIds, prefixConfig);
  }

  /**
   * 提取目录前缀（公开版本，供外部用于 ID 复用约束）
   *
   * 返回的是「清理后」的前缀，与实际写入 key 时的段格式一致。否则
   * `IdReuseResolver.pickReusableKey` 用 `startsWith` 与 locale key 对比时，
   * 含连字符 / 非字母数字字符的目录段会匹配失败（例如原始 `flipped-course`
   * 与 key 中的 `flippedcourse`），导致同前缀历史 key 无法复用。
   *
   * 例：filePath = `apps/client/src/views/demo/test-fn.ts`，anchor = `src`，
   * separator = `__` 时返回 `views__demo`。
   */
  static getDirectoryPrefix(filePath: string, prefixConfig?: IdPrefixConfig): string {
    const raw = this.extractDirectoryPrefix(filePath, prefixConfig);
    if (!raw) return '';
    return this.cleanDirectoryPrefix(raw, prefixConfig);
  }

  /**
   * 提取目录前缀
   *
   * 策略：取 anchor 之后到文件所在目录的全部路径段，按 separator 拼接。
   * 支持 maxDepth 截断，0 或不设表示不限制。
   *
   * 例（anchor='src', separator='.'）：
   *   src/pages/flipped-course/components/Map2D.vue
   *     → ['pages', 'flipped-course', 'components']
   *     → 'pages.flipped-course.components'
   *
   * 边界：
   *   - 文件直接在 anchor 下（如 src/foo.vue）：dirParts 为空 → 退化为文件名（去扩展名）
   *   - 未找到 anchor：返回空串，下游不附加目录前缀
   *
   * @param filePath - 文件路径
   * @param prefixConfig - ID 前缀配置
   * @returns 目录前缀
   */
  private static extractDirectoryPrefix(filePath: string, prefixConfig?: IdPrefixConfig): string {
    if (!filePath) return '';

    // 如果配置了自定义固定前缀，直接使用
    if (prefixConfig?.value) {
      return prefixConfig.value;
    }

    const separator = this.getSeparator(prefixConfig);
    // 同时按 `/` 和 `\` 切分：path.normalize + path.sep 在 Linux 上不会把 `\` 当
    // 分隔符（path.sep === '/'），导致开发者从 Windows 提交的混合路径在 CI/Linux
    // 上整段被当作单一目录名，前缀提取失败。归一化双分隔符后跨平台一致。
    const parts = filePath.split(/[\\/]/).filter(Boolean);

    const anchor = prefixConfig?.anchor || 'src';
    const anchorIndex = parts.findIndex((part) => part === anchor);
    if (anchorIndex === -1 || anchorIndex >= parts.length - 1) {
      return '';
    }

    // anchor 之后到文件名之前的所有目录段
    const fileIndex = parts.length - 1;
    let dirParts = parts.slice(anchorIndex + 1, fileIndex);

    // 文件直接在 anchor 下：退化为「文件名」（去扩展名），避免前缀为空
    if (dirParts.length === 0) {
      const fileName = parts[fileIndex]!;
      return path.parse(fileName).name;
    }

    // maxDepth > 0 时截断到指定层级（≤ 0 视为不限制）
    const maxDepth = prefixConfig?.maxDepth ?? 0;
    if (maxDepth > 0 && dirParts.length > maxDepth) {
      dirParts = dirParts.slice(0, maxDepth);
    }

    return dirParts.join(separator);
  }

  /**
   * 短哈希：对 SHA-256 的 base36 编码取前 8 位。
   * Why: 原 simpleHash（DJB2 风格）对短中文文本碰撞率显著（如 "按钮"/"钮按"），
   *      会产生重复 ID。SHA-256 在保持稳定确定性的同时，碰撞概率可忽略。
   */
  private static simpleHash(str: string): string {
    const hex = createHash('sha256').update(str, 'utf8').digest('hex');
    // 取前 16 位 hex（64 bit）转 base36，截 8 位以保持原 API 输出长度量级
    return BigInt('0x' + hex.slice(0, 16))
      .toString(36)
      .slice(0, 8);
  }

  /**
   * 提取语义部分
   * @param text - 文本内容
   * @param prefixConfig - ID 前缀配置
   * @returns 语义部分
   */
  private static extractSemanticPart(text: string, prefixConfig?: IdPrefixConfig): string {
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
    // 复用 FileUtils.containsChinese，避免与 file-utils / constants 多处定义中文判定
    // 正则带来语义漂移（例如未来若需扩到日韩字符，得改三处保持一致）。
    if (!FileUtils.containsChinese(cleanText)) {
      return this.sanitizeSemanticId(cleanText);
    }

    // 中文文本：使用 "t_" + 短哈希，保证不同文本生成不同 ID
    return `t_${this.simpleHash(cleanText)}`;
  }

  /**
   * 确保ID唯一性（输入已是清理后的 id）
   *
   * 此方法只做去重，不再做清理——清理由调用方在拼接前按段完成
   * （cleanDirectoryPrefix + sanitizeSemanticId），避免 sanitize 误把可变段数的
   * 目录前缀当成固定 2 段。
   */
  private static ensureUniqueId(cleanedId: string, existingIds: Set<string>): string {
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
   * 使用固定前缀（如 `common`）生成 ID，绕过基于 filePath 的目录前缀推导。
   *
   * 用于 promoteToCommon：当一段原文被多个模块复用、需要统一进入 common
   * namespace 时，调用方提供固定前缀；ID 拼装与 ensureUniqueId 行为与
   * _createFullId 一致。
   */
  static generateWithFixedPrefix(
    prefix: string,
    semanticPart: string,
    existingIds: Set<string>,
    prefixConfig?: IdPrefixConfig,
  ): string {
    const separator = this.getSeparator(prefixConfig);
    const cleanedSemanticId = this.sanitizeSemanticId(semanticPart);
    const cleanedPrefix = this.cleanDirectoryPrefix(prefix, prefixConfig);
    const fullId = cleanedPrefix
      ? `${cleanedPrefix}${separator}${cleanedSemanticId}`
      : cleanedSemanticId;
    return this.ensureUniqueId(fullId, existingIds);
  }

  /**
   * 创建完整的、唯一的ID
   *
   * 流程：
   * 1. extractDirectoryPrefix 拿到原始前缀（可能含多段，如 `pages.flipped-course.components`）
   * 2. cleanDirectoryPrefix 按段保留大小写去非法字符
   * 3. sanitizeSemanticId 把语义部分转小写、压缩空白
   * 4. 拼接 + ensureUniqueId 去重
   */
  private static _createFullId(
    filePath: string,
    semanticPart: string,
    existingIds: Set<string>,
    prefixConfig?: IdPrefixConfig,
  ): string {
    const separator = this.getSeparator(prefixConfig);
    const rawDirectoryPrefix = this.extractDirectoryPrefix(filePath, prefixConfig);
    const cleanedSemanticId = this.sanitizeSemanticId(semanticPart);

    if (rawDirectoryPrefix) {
      const cleanedDirectoryPrefix = this.cleanDirectoryPrefix(rawDirectoryPrefix, prefixConfig);
      const fullId = cleanedDirectoryPrefix
        ? `${cleanedDirectoryPrefix}${separator}${cleanedSemanticId}`
        : cleanedSemanticId;
      return this.ensureUniqueId(fullId, existingIds);
    }
    return this.ensureUniqueId(cleanedSemanticId, existingIds);
  }
}
