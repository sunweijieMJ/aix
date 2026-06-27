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
 * 简化版 string 形式按 `config.locales.targets[0]` 决定语种，等价于
 * `{ [firstTarget]: value }`。完整版直接给 locale → 译文映射，多目标场景推荐使用。
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
   * - 未配置 `glossary.file` 或文件不存在 → 静默返回 `null`（与 io.customDir 同样的"显式启用"语义）
   * - JSON 解析失败 → 抛错（safeLoadJsonFile 已记录错误）
   * - 归一化后键冲突 → 抛错，提醒用户清理重复项
   */
  static load(config: ResolvedConfig): GlossaryMap | null {
    const filePath = config.glossary.file;
    if (!filePath || !fs.existsSync(filePath)) return null;

    // 文件已确认存在（上方 existsSync 守卫）。损坏 JSON 必须抛错而非静默吞成空词表——
    // 否则用户配了词表却因文件存坏导致所有 lookup 静默 miss、术语全部回退 LLM 而无从察觉，
    // 违反本方法文档承诺的 fail-fast 语义（safeLoadJsonFile 会把损坏静默降级为 {}，不可用）。
    const cls = FileUtils.classifyJsonFile<RawGlossaryFile>(filePath);
    if (cls.status === 'corrupt') {
      throw new Error(
        `词表文件解析失败（JSON 格式损坏，请修复后重试）: ${FileUtils.getRelativePath(filePath)}`,
      );
    }
    // 空文件视为空词表；missing 已被上方 existsSync 守卫拦下，这里兜底也按空处理。
    const raw: RawGlossaryFile = cls.status === 'ok' ? cls.data : ({} as RawGlossaryFile);
    if (typeof raw !== 'object') return null;

    // 简化版 string 形式默认对应「首个 target locale」；多目标场景下用户应用
    // 完整版 `{ [locale]: value }` 形式以避免歧义。
    const fallbackTarget = config.locales.targets[0] ?? '';
    const normalize = config.glossary.normalize;
    const map: GlossaryMap = new Map();

    for (const [src, value] of Object.entries(raw)) {
      const key = this.normalizeKey(src, normalize);
      const entry: Record<string, string> =
        typeof value === 'string'
          ? { [fallbackTarget]: value }
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
