import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { FileUtils } from './file-utils';
import { LoggerUtils } from './logger';

/**
 * 内部归一化后的词表结构：
 *   normalizedSourceText → { [locale]: translation }
 */
export type GlossaryMap = Map<string, Record<string, string>>;

/** 词表原始文件支持的两种值形态 */
type RawGlossaryValue = string | Record<string, string>;
type RawGlossaryFile = Record<string, RawGlossaryValue>;

/**
 * 翻译词表加载与查询工具。
 *
 * 词表文件格式（任选其一，可混用）：
 *   {
 *     "按钮": "Button",
 *     "确认": { "en-US": "Confirm", "ja-JP": "確認" }
 *   }
 *
 * 简化版 string 形式由 `config.locale.target` 决定语种，等价于
 * `{ [target]: value }`。完整版直接给 locale → 译文映射。
 */
export class Glossary {
  /**
   * 把原文规范化为查表键。开启 normalize 时去除首尾空白并把连续空白压缩为单空格，
   * 避免「按钮」与「按钮 」（多个空格）被识别成两条不同条目。
   */
  static normalizeKey(text: string, normalize: boolean): string {
    return normalize ? text.trim().replace(/\s+/g, ' ') : text;
  }

  /**
   * 加载并归一化词表。
   *
   * - 未配置 `paths.glossary` 或文件不存在 → 静默返回 `null`（与 customLocale 同样的"显式启用"语义）
   * - JSON 解析失败 → 抛错（safeLoadJsonFile 已记录错误）
   * - 归一化后键冲突 → 抛错，提醒用户清理重复项
   */
  static load(config: ResolvedConfig): GlossaryMap | null {
    const filePath = config.paths.glossary;
    if (!filePath || !fs.existsSync(filePath)) return null;

    const raw = FileUtils.safeLoadJsonFile<RawGlossaryFile>(filePath, {
      errorMessage: '词表文件解析失败',
    });
    if (!raw || typeof raw !== 'object') return null;

    const targetLocale = config.locale.target;
    const normalize = config.glossary.normalize;
    const map: GlossaryMap = new Map();

    for (const [src, value] of Object.entries(raw)) {
      const key = this.normalizeKey(src, normalize);
      const entry: Record<string, string> =
        typeof value === 'string'
          ? { [targetLocale]: value }
          : { ...(value as Record<string, string>) };

      if (map.has(key)) {
        throw new Error(
          `词表存在归一化后冲突的键: "${src}" 与已有条目映射到同一规范化键 "${key}"，` +
            '请合并或调整其中一条。',
        );
      }
      map.set(key, entry);
    }

    LoggerUtils.info(`📚 加载词表: ${FileUtils.getRelativePath(filePath)} (${map.size} 条)`);
    return map;
  }

  /**
   * 查询某条原文在指定 locale 下的译文，未命中或该 locale 无译文时返回 undefined。
   */
  static lookup(
    map: GlossaryMap,
    sourceText: string,
    locale: string,
    normalize: boolean,
  ): string | undefined {
    const entry = map.get(this.normalizeKey(sourceText, normalize));
    return entry?.[locale];
  }
}
