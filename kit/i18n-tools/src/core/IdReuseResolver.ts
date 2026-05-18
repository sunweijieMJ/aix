import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { CommonASTUtils } from '../utils/common-ast-utils';
import { IdGenerator } from '../utils/id-generator';
import { LanguageFileManager } from '../utils/language-file-manager';

/**
 * 把原文规范化为查表键：去首尾空白、压缩空白序列。
 *
 * 防止「电话号码」与「电话号码 」（多了空格）被识别成两条不同条目。
 */
const normalizeKey = (text: string): string => text.trim().replace(/\s+/g, ' ');

/**
 * 语义 ID 复用决策器
 *
 * 负责：对一段已提取的中文文案，决定是复用历史 key 还是分配新 key。
 *
 * 状态：内部维护两份累积索引，单次 Generate 流程内复用：
 *  - existingIds：已占用的 ID 集合（防新生成 ID 与之冲突）
 *  - messageToKeysMap：原文 → 历史 key[] 的反向映射
 *  - messageToPrefixes：原文 → 已分配过 key 的目录前缀集合（用于 promoteToCommon 决策）
 */
export class IdReuseResolver {
  private readonly config: ResolvedConfig;
  private readonly isCustom: boolean;
  private readonly allowGlobalReuse: boolean;
  private readonly existingIds: Set<string> = new Set();
  private readonly messageToKeysMap: Map<string, string[]> = new Map();
  private readonly messageToPrefixes: Map<string, Set<string>> = new Map();
  /** IdGenerator 实例，封装 prefix strategy 缓存 */
  private readonly idGenerator: IdGenerator;
  /** 已扫描的 t()/$t() 调用次数（不去重，用于覆盖率分子） */
  private existingCallSites: number = 0;

  constructor(config: ResolvedConfig, isCustom: boolean) {
    this.config = config;
    this.isCustom = isCustom;
    this.allowGlobalReuse = config.keys.reuse.acrossDirectories;
    this.idGenerator = new IdGenerator(config);

    this.loadFromLocaleFile();
  }

  /** 暴露 IdGenerator 给上层（GenerateProcessor），避免重复构造 */
  getIdGenerator(): IdGenerator {
    return this.idGenerator;
  }

  /** 暴露 existingIds 给 IdGenerator，用于生成新 ID 时回避冲突 */
  getExistingIds(): Set<string> {
    return this.existingIds;
  }

  /** 把规范化键暴露给上层，确保跨模块归一化逻辑一致 */
  static normalizeKey(text: string): string {
    return normalizeKey(text);
  }

  /**
   * 扫描多个源文件中已存在的 t() / $t() 调用，加入 existingIds。
   */
  scanExistingCallsInSources(filePaths: Iterable<string>): void {
    for (const filePath of filePaths) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        // 剥除注释，避免被注释掉的 t('foo') 污染 existingIds 与覆盖率统计
        const content = CommonASTUtils.stripComments(raw);
        const i18nKeyPattern = /(?:\$t|(?<!\w)t)\s*\(\s*['"]([^'"]+)['"]/g;
        let match;
        while ((match = i18nKeyPattern.exec(content)) !== null) {
          if (match[1]) {
            this.existingIds.add(match[1]);
            this.existingCallSites++;
          }
        }
      } catch {
        /* 忽略读取失败 */
      }
    }
  }

  /** 本轮源码扫描到的「已国际化调用点」总次数（覆盖率分子的一部分） */
  getExistingCallSiteCount(): number {
    return this.existingCallSites;
  }

  /**
   * 在历史 key 集合中挑选与当前文件目录前缀匹配的那个。
   *
   * 优先级：
   *  1. 同目录前缀的历史 key（startsWith 比较）
   *  2. 启用 promoteToCommon 且历史已有 common-namespace key → 任意目录可复用
   *  3. acrossDirectories=true → 第一个历史 key
   *  4. 否则 undefined（视为未命中，触发新生成）
   */
  pickReusableKey(message: string, filePath: string): string | undefined {
    const candidates = this.messageToKeysMap.get(normalizeKey(message));
    if (!candidates || candidates.length === 0) return undefined;

    const currentPrefix = this.idGenerator.getDirectoryPrefix(filePath);
    if (!currentPrefix) {
      return this.allowGlobalReuse ? candidates[0] : undefined;
    }

    const sameDirHit = candidates.find((k) => k.startsWith(currentPrefix));
    if (sameDirHit) return sameDirHit;

    // 已被提升到 common 的 key：跨目录可见，避免新分配产生 _N 后缀
    const promote = this.config.keys.reuse.promoteToCommon;
    if (promote && promote.threshold >= 2) {
      const ns = promote.namespace || 'common';
      const sep = this.config.keys.separator;
      const commonHit = candidates.find((k) => k === ns || k.startsWith(`${ns}${sep}`));
      if (commonHit) return commonHit;
    }

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
    this.recordPrefix(lookupKey, this.derivePrefixFromKey(finalId));
  }

  /**
   * 判断当前调用是否应被提升到 common namespace。
   *
   * 判定逻辑：
   *  - 未配置 promoteToCommon 或 threshold < 2 → 永远不提升
   *  - 当前 filePath 推出的目录前缀已在该原文的 prefixes 集合中 → 不提升
   *  - 否则若"加上当前前缀"后集合大小 ≥ threshold → 触发提升
   */
  shouldPromoteToCommon(message: string, filePath: string): boolean {
    const promote = this.config.keys.reuse.promoteToCommon;
    if (!promote || promote.threshold < 2) return false;

    const currentPrefix = this.idGenerator.getDirectoryPrefix(filePath) ?? '';
    const known = this.messageToPrefixes.get(normalizeKey(message)) ?? new Set<string>();
    if (known.has(currentPrefix)) return false;
    return known.size + 1 >= promote.threshold;
  }

  /** 返回已配置的 common namespace（默认 'common'） */
  getCommonNamespace(): string {
    return this.config.keys.reuse.promoteToCommon?.namespace ?? 'common';
  }

  private recordPrefix(lookupKey: string, prefix: string): void {
    const set = this.messageToPrefixes.get(lookupKey);
    if (set) set.add(prefix);
    else this.messageToPrefixes.set(lookupKey, new Set([prefix]));
  }

  /**
   * 把完整 key（如 `pages.foo.bar.submit`）拆出目录前缀部分（`pages.foo.bar`）。
   *
   * 用 keys.separator 切分；最后一段视为 semanticId，其余拼回作为前缀。
   * 空字符串表示该 key 无目录前缀。
   */
  private derivePrefixFromKey(key: string): string {
    const sep = this.config.keys.separator;
    const idx = key.lastIndexOf(sep);
    return idx <= 0 ? '' : key.substring(0, idx);
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
        this.recordPrefix(normalized, this.derivePrefixFromKey(key));
      }
    }
  }
}
