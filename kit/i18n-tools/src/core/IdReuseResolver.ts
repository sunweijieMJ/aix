import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { CommonASTUtils } from '../utils/common-ast-utils';
import { IdGenerator } from '../utils/id-generator';
import { LanguageFileManager } from '../utils/language-file-manager';

/**
 * 把原文规范化为查表键：去首尾空白、压缩空白序列。
 *
 * 防止「电话号码」与「电话号码 」（多了空格）这类视觉相同但字符串不等的
 * 文本被分配两个不同的 key。
 *
 * 注意：曾尝试抹平占位符名（`{xxx}` → `{}`）让 `节点 {_ni1}` 与 `节点 {nodeIndex1}`
 * 落到同一 key。但当 dedup 命中时，不同调用点的 createMessageWithOptions 会按各
 * 自源表达式生成不同 placeholder 名（如 value vs nodeIndex），而 locale 文件只
 * 保留一份 message，运行时 t() 调用的 options 对象 key 与 locale 中 `{name}` 不
 * 匹配 → 占位符不被替换 → 输出残留 `{name}` 字面量。要安全启用此特性，必须配套
 * 让 Transformer 在 reuse 命中时采用 locale 已有的 placeholder 名（"canonical
 * placeholder"），目前由 #3（low-signal identifier 退到 value）做部分缓解：
 * `_ni`、`ni`、`i` 等会统一为 value，使部分场景下 dedup 自然命中。
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
  /**
   * 已有原文 → 已分配过 key 的"目录前缀"集合。用于 promoteToCommon 决策：
   * 判断一段中文是否已被 ≥N 个不同模块使用过、是否到了应该提升到 common
   * namespace 的阈值。集合内容由 loadFromLocaleFile 与 registerNewId 共同累积。
   *
   * 注意：集合元素是"目录前缀"（如 `pages.foo.bar`），而非完整 key。空字符串
   * 表示无前缀（key 直接是 semanticId）；common namespace 自身也作为一个前缀
   * 参与计数，避免重复提升。
   */
  private readonly messageToPrefixes: Map<string, Set<string>> = new Map();

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
   * 源码扫描阶段命中的「已存在 t()/$t() 调用」总次数（不去重）。
   *
   * Why 不去重：覆盖率统计的口径是「中文片段调用点」而非「key 数量」。同一个
   * key 在 5 个地方调用 t('xxx') 就算 5 次已国际化。existingIds 集合是去重的，
   * 不能直接用作覆盖率分子，故这里单独累加调用次数。
   */
  private existingCallSites: number = 0;

  /**
   * 扫描多个源文件中已存在的 t() / $t() 调用，把这些 key 加入 existingIds，
   * 防止新生成的 ID 与源码里硬编码的 key 冲突。
   */
  scanExistingCallsInSources(filePaths: Iterable<string>): void {
    for (const filePath of filePaths) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        // 剥除注释，避免被注释掉的 t('foo') 调用污染 existingIds 与覆盖率统计。
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
   * 在历史 key 集合中挑选与当前文件目录前缀匹配的那个；若 allowGlobalReuse 为
   * true 或没有同前缀候选，回退到第一个历史 key。
   *
   * 若启用了 promoteToCommon 且历史候选中存在 common-namespace key，则视为
   * "已经跨模块归一"，应被任意目录复用——否则后续使用点会生成 common.xx_1/_2
   * 等无意义后缀，违背 promoteToCommon 的归一意图。
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

    // 已被提升到 common 的 key：跨目录可见，避免新分配产生 _N 后缀
    const promote = this.config.idPrefix.promoteToCommon;
    if (promote && promote.threshold >= 2) {
      const ns = promote.namespace || 'common';
      const sep = this.config.idPrefix.separator;
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
   *    （同目录内重复使用不应跨模块化）
   *  - 否则若"加上当前前缀"后集合大小 ≥ threshold → 触发提升
   *
   * 仅判定，不执行任何写入；调用方决定如何拼装 ID。
   */
  shouldPromoteToCommon(message: string, filePath: string): boolean {
    const promote = this.config.idPrefix.promoteToCommon;
    if (!promote || promote.threshold < 2) return false;

    const currentPrefix = IdGenerator.getDirectoryPrefix(filePath, this.config.idPrefix) ?? '';
    // 跨多次 generate，本地 prefix 已在集合中表示已经计过数；不计第二次
    const known = this.messageToPrefixes.get(normalizeKey(message)) ?? new Set<string>();
    if (known.has(currentPrefix)) return false;
    return known.size + 1 >= promote.threshold;
  }

  /** 返回已配置的 common namespace（默认 `'common'`） */
  getCommonNamespace(): string {
    return this.config.idPrefix.promoteToCommon?.namespace ?? 'common';
  }

  private recordPrefix(lookupKey: string, prefix: string): void {
    const set = this.messageToPrefixes.get(lookupKey);
    if (set) set.add(prefix);
    else this.messageToPrefixes.set(lookupKey, new Set([prefix]));
  }

  /**
   * 把完整 key（如 `pages.foo.bar.submit`）拆出目录前缀部分（`pages.foo.bar`）。
   *
   * 用 `idPrefix.separator` 切分；最后一段视为 semanticId，其余拼回作为前缀。
   * 空字符串表示该 key 无目录前缀。
   */
  private derivePrefixFromKey(key: string): string {
    const sep = this.config.idPrefix.separator;
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
