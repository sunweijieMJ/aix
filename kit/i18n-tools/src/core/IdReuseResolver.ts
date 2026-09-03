import fs from 'fs';
import type { ResolvedConfig } from '../config';
import { IdGenerator } from '../utils/id-generator';
import { LanguageFileManager } from '../utils/language-file-manager';
import {
  hasNonI18nTranslationBinding,
  scanKeyReferencesInContent,
  stripCommentsForScan,
} from '../utils/source-key-scanner';
import { collapseWhitespace } from '../utils/text-normalize';

/**
 * 语义 ID 复用决策器
 *
 * 负责：对一段已提取的中文文案，决定是复用历史 key 还是分配新 key。
 *
 * 状态：内部维护两份累积索引，单次 Generate 流程内复用：
 *  - existingIds：已占用的 ID 集合（防新生成 ID 与之冲突）
 *  - messageToKeysMap：原文 → 历史 key[] 的反向映射
 *  - messageToPrefixes：原文 → 本轮新分配 key 的真实目录前缀集合（用于 promoteToCommon 决策）
 *  - messageToLocaleKeys：原文 → 语言文件里的历史 key（前缀在决策时按 knownPrefixes 归属）
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
  /** 本轮新分配的 key 数（registerNewId 次数）：与「本轮转换的调用点数」是两个口径 */
  private newlyRegisteredIds: number = 0;
  /** 本轮由真实文件路径派生出的目录前缀集合，供历史 key 的前缀归属做最长匹配 */
  private readonly knownPrefixes: Set<string> = new Set();
  /** 原文 → 语言文件里的历史 key（前缀需按 knownPrefixes 延迟归属，故不在构造期定型） */
  private readonly messageToLocaleKeys: Map<string, string[]> = new Map();
  /**
   * separator 是否可能出现在语义段内部。
   * sanitizeSemanticId 只产出 [A-Za-z0-9_]，故 `_` 与字母数字型 separator 无法靠
   * 「最后一个 separator」反推目录前缀（`pages_a_confirm_order` 会被切成 `pages_a_confirm`）。
   */
  private readonly separatorAmbiguous: boolean;

  constructor(config: ResolvedConfig, isCustom: boolean) {
    this.config = config;
    this.isCustom = isCustom;
    this.allowGlobalReuse = config.keys.reuse.acrossDirectories;
    this.idGenerator = new IdGenerator(config);
    this.separatorAmbiguous = /[A-Za-z0-9_]/.test(config.keys.separator);

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

  /**
   * 把原文规范化为查表键，防止「电话号码」与「电话号码 」（多了空格）被识别成两条不同条目。
   *
   * 口径必须与 Glossary / LocaleValueLinter 的查表键一致，故一律收口在 collapseWhitespace；
   * 上层（GenerateProcessor 的复用查找）走本方法，不要另起归一化。
   */
  static normalizeKey(text: string): string {
    return collapseWhitespace(text);
  }

  /**
   * 扫描多个源文件中已存在的 i18n key 引用，加入 existingIds 并累计调用点（覆盖率分子）。
   *
   * 口径与 source-key-scanner（doctor/prune 对账）统一：除 `t()/$t()` 外，也覆盖
   * react-intl 的 `intl.formatMessage({ id })` / `<FormattedMessage id>`、react-i18next
   * 的 `<Trans i18nKey>`、vue 的 `<i18n-t keypath>` / `v-t`。若只认 `t()/$t()`，
   * react-intl 项目 alreadyI18n 会恒为 0、覆盖率被系统性低估而误触 CI 卡点。
   *
   * i18nModules（工具注入的全局 t 路径 + i18n 库包名）用于识别「顶层把 t 绑定到非 i18n
   * 来源」的文件：那种文件里的裸 `t('你好 {name}')` 是本地模板函数调用，计进 alreadyI18n
   * 会把未国际化的文件报成已国际化（覆盖率虚高 → CI 假绿）。不传则不做该识别。
   */
  scanExistingCallsInSources(filePaths: Iterable<string>, i18nModules?: readonly string[]): void {
    for (const filePath of filePaths) {
      // 顺带登记本轮涉及的真实目录前缀：历史 key 的前缀归属靠这份集合做最长匹配，
      // 集合越全，反推越准（见 prefixOfKey）。
      this.prefixForFile(filePath);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        // 剥除注释，避免被注释掉的引用污染 existingIds 与覆盖率统计。
        // 走按文件类型分流的入口：.vue 模板段不能进 JS 词法状态机（裸 URL 的 //
        // 会被误当行注释吞掉行尾 t() 引用），详见 stripCommentsForScan。
        const content = stripCommentsForScan(filePath, raw);
        const skipBareTranslationCalls =
          i18nModules !== undefined && hasNonI18nTranslationBinding(filePath, raw, i18nModules);
        for (const ref of scanKeyReferencesInContent(content, { skipBareTranslationCalls })) {
          this.existingIds.add(ref);
          this.existingCallSites++;
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

  /** 本轮新分配（未复用历史 key）的 key 数，供覆盖率总览与「转换处数」并列展示 */
  getNewlyRegisteredIdCount(): number {
    return this.newlyRegisteredIds;
  }

  /**
   * 在历史 key 集合中挑选与当前文件目录前缀匹配的那个。
   *
   * 优先级：
   *  1. 当前文件无前缀（派生结果为空串）→ 同样无前缀的历史 key（「无前缀」是一个合法域）
   *  2. 同目录前缀的历史 key（startsWith 比较）
   *  3. 启用 promoteToCommon 且历史已有 common-namespace key → 任意目录可复用
   *  4. acrossDirectories=true → 第一个历史 key
   *  5. 否则 undefined（视为未命中，触发新生成）
   */
  pickReusableKey(message: string, filePath: string): string | undefined {
    const candidates = this.messageToKeysMap.get(collapseWhitespace(message));
    if (!candidates || candidates.length === 0) return undefined;

    const currentPrefix = this.prefixForFile(filePath);
    if (!currentPrefix) {
      // 前缀派生结果为空串：文件不在 anchor 之下、take/transform 把所有段过滤掉、或
      // custom 策略返回 []。「无前缀」本身是一个合法的同前缀域，在候选里挑同样无前缀的
      // 既有 key；否则同一原文每轮都会新分配 key、靠 ensureUniqueId 累积 _1/_2 后缀。
      // 只认「同样无前缀」的候选：带前缀的候选属于别的目录域，跨域复用仍须由
      // acrossDirectories 显式授权（下方 fallback 不变）。
      const prefixlessHit = candidates.find((k) => this.isPrefixlessKey(k));
      if (prefixlessHit) return prefixlessHit;
      return this.allowGlobalReuse ? candidates[0] : undefined;
    }

    // 必须带 separator 边界，否则 `pages.order` 会 startsWith 命中兄弟目录
    // `pages.orderDetail.xxx`，把 order 目录的文案误复用到 orderDetail 的历史 key。
    // 与下方 commonHit 的边界写法保持一致。
    const dirSep = this.config.keys.separator;
    const sameDirHit = candidates.find(
      (k) => k === currentPrefix || k.startsWith(`${currentPrefix}${dirSep}`),
    );
    if (sameDirHit) return sameDirHit;

    // 已被提升到 common 的 key：跨目录可见，避免新分配产生 _N 后缀
    const promote = this.config.keys.reuse.promoteToCommon;
    if (promote && promote.threshold >= 2) {
      // 必须复用 getCommonNamespace()（`?? 'common'`），与「生成端」同一解析口径。
      // 若这里改用 `||`，显式配成空串的 namespace 会被退回 'common'，而生成端用 `??`
      // 保留 ''、产出无前缀提升键 —— commonHit 永远命中不到，提升键跨运行累积 _N 后缀，
      // 去重收益归零。
      const ns = this.getCommonNamespace();
      const sep = this.config.keys.separator;
      const commonHit = candidates.find((k) => k === ns || k.startsWith(`${ns}${sep}`));
      if (commonHit) return commonHit;
    }

    return this.allowGlobalReuse ? candidates[0] : undefined;
  }

  /**
   * 把本次新生成的 finalId 注册到索引中，使后续相同原文（同批或跨批）能复用。
   *
   * 前缀记的是 filePath 派生的**真实目录前缀**，不从 finalId 反推：提升到 common 的 key
   * 反推只会得到 namespace，丢掉「这条原文出现在哪个模块」这一 promoteToCommon 的唯一判据。
   */
  registerNewId(message: string, finalId: string, filePath: string): void {
    this.newlyRegisteredIds++;
    this.existingIds.add(finalId);
    const lookupKey = collapseWhitespace(message);
    const arr = this.messageToKeysMap.get(lookupKey);
    if (arr) arr.push(finalId);
    else this.messageToKeysMap.set(lookupKey, [finalId]);
    this.recordPrefix(lookupKey, this.prefixForFile(filePath));
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

    const currentPrefix = this.prefixForFile(filePath);
    const lookupKey = collapseWhitespace(message);
    // 历史 key 的前缀在此刻才归属：knownPrefixes 随本轮扫描增长，构造期定型会用不上它。
    const known = new Set(this.messageToPrefixes.get(lookupKey) ?? []);
    for (const key of this.messageToLocaleKeys.get(lookupKey) ?? []) {
      known.add(this.prefixOfKey(key));
    }
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

  /** 派生并登记某文件的真实目录前缀（登记后即成为历史 key 的归属判据）。 */
  private prefixForFile(filePath: string): string {
    const prefix = this.idGenerator.getDirectoryPrefix(filePath);
    if (prefix) this.knownPrefixes.add(prefix);
    return prefix;
  }

  /**
   * 反推语言文件里历史 key 的目录前缀（`pages.foo.bar.submit` → `pages.foo.bar`）。
   *
   * 判定顺序：
   *  1. knownPrefixes 中带 separator 边界的**最长**匹配——本轮真实见过的目录，可靠；
   *  2. 未命中且 separator 不可能出现在语义段里时，按最后一个 separator 反推；
   *  3. 否则归入「未知域」（空串）：`_` 这类 separator 下 `pages_a_confirm_order` 反推会
   *     切出 `pages_a_confirm`，把同一目录的两个 key 数成两个模块而误触发 promoteToCommon。
   *     无法判定时宁可少提升。
   */
  private prefixOfKey(key: string): string {
    const sep = this.config.keys.separator;
    let best = '';
    for (const prefix of this.knownPrefixes) {
      if (prefix.length <= best.length) continue;
      if (key === prefix || key.startsWith(`${prefix}${sep}`)) best = prefix;
    }
    if (best) return best;
    if (this.separatorAmbiguous) return '';
    const idx = key.lastIndexOf(sep);
    return idx <= 0 ? '' : key.substring(0, idx);
  }

  /**
   * key 是否确定不带目录前缀（「无前缀」是一个独立的复用域）。
   *
   * separator 可能出现在语义段里时无从反推，改用「整段不含 separator」的保守判据：
   * 判不准就当作带前缀，宁可新生成 key 也不跨域错误复用。
   */
  private isPrefixlessKey(key: string): boolean {
    const sep = this.config.keys.separator;
    if (this.prefixOfKey(key)) return false;
    return this.separatorAmbiguous ? !key.includes(sep) : key.lastIndexOf(sep) <= 0;
  }

  private loadFromLocaleFile(): void {
    const localeMap = new LanguageFileManager(this.config, this.isCustom).readLocaleFile();
    if (!localeMap) return;

    for (const [key, value] of Object.entries(localeMap)) {
      this.existingIds.add(key);
      if (typeof value === 'string') {
        const normalized = collapseWhitespace(value);
        const arr = this.messageToKeysMap.get(normalized);
        if (arr) arr.push(key);
        else this.messageToKeysMap.set(normalized, [key]);
        const localeKeys = this.messageToLocaleKeys.get(normalized);
        if (localeKeys) localeKeys.push(key);
        else this.messageToLocaleKeys.set(normalized, [key]);
      }
    }
  }
}
