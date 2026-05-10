import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { IdGenerator } from '../utils/id-generator';
import { LanguageFileManager } from '../utils/language-file-manager';

/**
 * 把原文规范化为查表键：去首尾空白、压缩空白序列。
 *
 * 防止「电话号码」与「电话号码 」（多了空格）这类视觉相同但字符串不等的
 * 文本被分配两个不同的 key。
 */
const normalizeKey = (text: string): string => text.trim().replace(/\s+/g, ' ');

/**
 * 语义 ID 复用决策器
 *
 * 负责"对一段已提取的中文文案，决定是复用历史 key 还是分配新 key"。从
 * GenerateProcessor.generateIdsForStrings 中拆出，理由：
 *
 *  - 该方法此前承担 LLM 调度 + ID 复用 + 本地兜底 三职，约 165 行；
 *    复用决策具有明确边界（输入：原文 + 文件路径；输出：可复用 key 或 undefined），
 *    适合独立成类；
 *  - 拆出后 GenerateProcessor 只剩"LLM 编排 + 调用 resolver"，便于单测；
 *  - resolver 自身可独立测试，无需 mock LLMClient。
 *
 * 状态：内部维护两份累积索引，单一 Generate 流程内复用：
 *  - existingIds：已占用的 ID 集合（防新生成 ID 与之冲突）
 *  - messageToKeysMap：原文 → 历史 key[] 的反向映射，用于命中复用
 */
export class IdReuseResolver {
  private readonly config: ResolvedConfig;
  private readonly isCustom: boolean;
  private readonly allowGlobalReuse: boolean;
  private readonly existingIds: Set<string> = new Set();
  /**
   * 已有原文 → 候选 key 列表。
   * 同一原文历史上可能在多个目录下有不同 key（如 components__X__submit 与
   * views__demo__submit 都对应「提交」），需要按当前文件的目录前缀挑选。
   */
  private readonly messageToKeysMap: Map<string, string[]> = new Map();

  constructor(config: ResolvedConfig, isCustom: boolean) {
    this.config = config;
    this.isCustom = isCustom;
    this.allowGlobalReuse = config.idPrefix?.reuseAcrossDirectories === true;

    this.loadFromLocaleFile();
  }

  /** 暴露 existingIds 给 IdGenerator，用于生成新 ID 时回避冲突 */
  getExistingIds(): Set<string> {
    return this.existingIds;
  }

  /** 把规范化键暴露给上层，确保跨模块的归一化逻辑一致 */
  static normalizeKey(text: string): string {
    return normalizeKey(text);
  }

  /**
   * 扫描多个源文件中已存在的 t() / $t() 调用，把这些 key 加入 existingIds，
   * 防止新生成的 ID 与源码里硬编码的 key 冲突。
   */
  scanExistingCallsInSources(filePaths: Iterable<string>): void {
    for (const filePath of filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const i18nKeyPattern = /(?:\$t|(?<!\w)t)\s*\(\s*['"]([^'"]+)['"]/g;
        let match;
        while ((match = i18nKeyPattern.exec(content)) !== null) {
          if (match[1]) this.existingIds.add(match[1]);
        }
      } catch {
        /* 忽略读取失败 */
      }
    }
  }

  /**
   * 在历史 key 集合中挑选与当前文件目录前缀匹配的那个；若 allowGlobalReuse 为
   * true 或没有同前缀候选，回退到第一个历史 key。
   */
  pickReusableKey(message: string, filePath: string): string | undefined {
    const candidates = this.messageToKeysMap.get(normalizeKey(message));
    if (!candidates || candidates.length === 0) return undefined;

    const currentPrefix = IdGenerator.getDirectoryPrefix(filePath, this.config.idPrefix);
    if (!currentPrefix) {
      return this.allowGlobalReuse ? candidates[0] : undefined;
    }

    const sameDirHit = candidates.find((k) => k.startsWith(currentPrefix));
    if (sameDirHit) return sameDirHit;
    return this.allowGlobalReuse ? candidates[0] : undefined;
  }

  /**
   * 把本次新生成的 finalId 注册到索引中，使后续相同原文（同批或跨批）能复用。
   */
  registerNewId(message: string, finalId: string): void {
    this.existingIds.add(finalId);
    const lookupKey = normalizeKey(message);
    const arr = this.messageToKeysMap.get(lookupKey);
    if (arr) arr.push(finalId);
    else this.messageToKeysMap.set(lookupKey, [finalId]);
  }

  private loadFromLocaleFile(): void {
    const localeMap = LanguageFileManager.readLocaleFile(this.config, this.isCustom);
    if (!localeMap) return;

    for (const [key, value] of Object.entries(localeMap)) {
      this.existingIds.add(key);
      if (typeof value === 'string') {
        const normalized = normalizeKey(value);
        const arr = this.messageToKeysMap.get(normalized);
        if (arr) arr.push(key);
        else this.messageToKeysMap.set(normalized, [key]);
      }
    }
  }
}
