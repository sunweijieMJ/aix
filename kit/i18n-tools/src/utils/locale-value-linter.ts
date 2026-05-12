import { CommonASTUtils } from './common-ast-utils';
import { LoggerUtils } from './logger';
import type { RunReport } from './run-report';
import type { LocaleMap } from './types';

/**
 * 语言文件 value 健康度检查。
 *
 * 在 generate 流程末尾对最终落盘的 source locale map 跑一遍 lint，输出 warning：
 * - 语义重复 key：value 在「占位符位置标准化 + 邻接空白剥离」后相同 → 多个 key
 *   实际对应同一句中文，常见于源码使用了不同变量名的同义插值（如
 *   "节点{ni1}" / "节点 {_ni1}" / "节点 {nodeIndex1}"）。
 *
 *   工具不自动合并：vue-i18n / react-intl 的 named placeholder 在运行时按名匹配，
 *   call site 用 `{_ni1}` 而 stored value 是 `{ni1}` 会导致占位符不替换。
 *   合并需要同步改 call site 发射代码，风险大；这里只提示，由用户决策。
 *
 * - 异常 value：含 HTML 标签 / 过长 → 提示拆分。innerHTML = t('...') 这种用法
 *   会把样式 / SVG 灌进 i18n value，LLM 翻译质量受 HTML 噪声干扰，且多语言下
 *   样式结构不可控。
 */
export class LocaleValueLinter {
  /** value 长度告警阈值（字符数）。超过即提示拆分。 */
  private static readonly LONG_VALUE_THRESHOLD = 200;

  /** 命中即视为 value 含 HTML 标签。\w+ 至少匹配一个标签名字符。 */
  private static readonly HTML_TAG_PATTERN = /<\s*\/?\s*[a-zA-Z][\w-]*(\s|>|\/)/;

  /**
   * 短碎片可疑 value：长度 ≤ 3 且 trim 后含至少一个标点。命中即提示"可能是
   * HTML 复合句切碎产物"（虽然 mixed-content 路径已基本消解此类，仍保留
   * 兜底诊断以覆盖那些不满足合并条件的边界用例，如跨行复合句）。
   */
  private static readonly SUSPICIOUS_FRAGMENT_MAX_LEN = 3;
  /** 中英文常见标点；命中作为"短碎片"判定附加条件。 */
  private static readonly PUNCT_PATTERN = /[（）()，,。.！!？?：:；;、,“”"'‘’`[\]【】《》<>%·…—]/;

  /** 跨模块复用候选的默认阈值（≥ N 个不同前缀使用同一 value）。 */
  private static readonly CROSS_MODULE_REUSE_THRESHOLD = 3;

  /**
   * 对扁平 locale map 做 value 健康度检查，发现问题以 warning 输出。
   *
   * 注意：本检查不影响落盘流程——即使发现问题，调用方仍可继续写入文件。
   *
   * @param localeMap 扁平 locale map
   * @param report    可选：传入则同时把每条 warning 加入 RunReport，落盘到
   *                  `<rootDir>/.i18n-tools/logs/` 供事后回查（不传则仅 console）
   * @param options   可选诊断参数：separator 用于跨模块复用检测的目录前缀切分
   */
  static lint(localeMap: LocaleMap, report?: RunReport, options?: { separator?: string }): void {
    const duplicates = this.findSemanticDuplicates(localeMap);
    const anomalies = this.findAnomalousValues(localeMap);
    const fragments = this.findSuspiciousFragments(localeMap);
    const reuseCandidates = options?.separator
      ? this.findCrossModuleReuseCandidates(localeMap, options.separator)
      : [];
    // 提取阶段记录的「比较运算符跳过的中文字面量」与 locale map values 做交叉，
    // 找出 `someVar === '中文'` 这类硬编码比较与他处已 i18n 化文案脱钩的风险位置。
    const hardcodedComparisons = this.findHardcodedComparisons(localeMap);

    if (
      duplicates.length === 0 &&
      anomalies.length === 0 &&
      fragments.length === 0 &&
      reuseCandidates.length === 0 &&
      hardcodedComparisons.length === 0
    ) {
      return;
    }

    // 同时往 console 和 RunReport 写——console 给即时反馈，RunReport 给磁盘留痕。
    // emit 函数封装这层一致性，避免每行 warning 都得手写两遍。
    const emit = (line: string): void => {
      LoggerUtils.warn(line);
      report?.addWarning(line);
    };

    emit('\n📋 语言文件健康度检查发现以下问题（不阻塞流程，建议手动处理）：');

    if (duplicates.length > 0) {
      emit(`\n⚠️  发现 ${duplicates.length} 组语义重复 key（占位符变量名/空白差异）：`);
      for (const group of duplicates) {
        emit(`   语义形态: "${group.canonical}"`);
        for (const { key, value } of group.entries) {
          emit(`     - ${key}  →  ${JSON.stringify(value)}`);
        }
        emit('     💡 建议在源码中统一变量名 / 空白，重跑 generate 即可自动复用同一 key');
      }
    }

    if (anomalies.length > 0) {
      emit(`\n⚠️  发现 ${anomalies.length} 个 value 异常（HTML 标签 / 长度超标）：`);
      for (const { key, value, reasons } of anomalies) {
        emit(`   - ${key}  [${reasons.join(', ')}]`);
        emit(`     value 预览: ${this.preview(value)}`);
      }
      emit('     💡 含 HTML 的 value 建议改造源码：模板字符串包裹结构，只把文案放入 t() 调用');
    }

    if (fragments.length > 0) {
      emit(
        `\n⚠️  发现 ${fragments.length} 个短碎片可疑 value（长度 ≤ ${this.SUSPICIOUS_FRAGMENT_MAX_LEN} 且含标点）：`,
      );
      for (const { key, value } of fragments) {
        emit(`   - ${key}  →  ${JSON.stringify(value)}`);
      }
      emit('     💡 可能是 HTML 文本节点 + 插值被切碎的产物。检查源码该 key 的调用点');
      emit('        是否能把周围文本与插值合并成单一 t() 调用（带占位符），以恢复语序与标点配平');
    }

    if (reuseCandidates.length > 0) {
      emit(
        `\n💡 发现 ${reuseCandidates.length} 组跨模块复用候选（同一 value 在 ≥ ${this.CROSS_MODULE_REUSE_THRESHOLD} 个不同目录前缀下都有 key）：`,
      );
      for (const c of reuseCandidates) {
        emit(`   value: ${JSON.stringify(c.value)}`);
        emit(`     使用前缀: ${c.prefixes.join(', ')}`);
      }
      emit('     💡 考虑在 i18n.config 启用 idPrefix.promoteToCommon = { threshold, namespace }，');
      emit('        让新增使用点自动归入 common namespace');
    }

    if (hardcodedComparisons.length > 0) {
      emit(
        `\n🚨 发现 ${hardcodedComparisons.length} 处「硬编码中文 ↔ i18n 文案」比较风险（切语言后分支永远不命中）：`,
      );
      for (const c of hardcodedComparisons) {
        emit(`   - ${c.filePath}:${c.line}:${c.column}`);
        emit(`     位置硬编码: ${JSON.stringify(c.text)}`);
        emit(`     该文案已对应 key: ${c.matchedKeys.join(', ')}`);
      }
      emit('     💡 比较运算符两侧字面量不会被工具提取（避免破坏分支判断），但同句中文若在');
      emit('        别处（如数组初值/ref 默认值）被提取为 t(...)，运行时切语言后比较一定为假。');
      emit('        建议改用 key 比较 / 索引比较 / 枚举常量，例如：');
      emit('           ❌  v-if="activeTab === \'教学路径\'"');
      emit('           ✅  v-if="activeTabKey === \'teachingpath\'"  或  v-if="activeIdx === 0"');
    }
  }

  /**
   * 把提取阶段记录的「比较运算符跳过的中文字面量」与最终 locale map values 交叉。
   *
   * 命中条件：跳过的中文 text 等于某个 key 的 value —— 说明同句中文已在他处被
   * i18n 化（如 `tabs = [t('...')]`），而此处仍硬编码做 === 比较，运行时切语言
   * 后必然脱钩。
   *
   * 注意：drain 是消耗性操作，调用后 collector 清空，避免下次 lint 重复报警。
   */
  private static findHardcodedComparisons(localeMap: LocaleMap): Array<{
    text: string;
    filePath: string;
    line: number;
    column: number;
    matchedKeys: string[];
  }> {
    const skipped = CommonASTUtils.drainSkippedComparisonOperands();
    if (skipped.length === 0) return [];

    // 反向索引 value → keys。同一 value 可能对应多个 key（重复中文），全部列出辅助定位。
    const valueToKeys = new Map<string, string[]>();
    for (const [key, value] of Object.entries(localeMap)) {
      if (typeof value !== 'string') continue;
      if (!valueToKeys.has(value)) valueToKeys.set(value, []);
      valueToKeys.get(value)!.push(key);
    }

    const result: Array<{
      text: string;
      filePath: string;
      line: number;
      column: number;
      matchedKeys: string[];
    }> = [];
    for (const item of skipped) {
      const matched = valueToKeys.get(item.text);
      if (matched && matched.length > 0) {
        result.push({ ...item, matchedKeys: matched });
      }
    }
    return result;
  }

  /**
   * 把 value 规范化为「占位符位置 + 邻接空白无关」的语义形态：
   *   "节点{ni1}"        → "节点{0}"
   *   "节点 {_ni1}"      → "节点{0}"
   *   "节点 {nodeIndex1}" → "节点{0}"
   *
   * 用于分组判定。规则：
   *  1. 占位符 `{anyName}` → `{i}`（i 按出现顺序递增）；
   *  2. 占位符两侧紧邻的空白删除（"节点 {0}" 与 "节点{0}" 视为等价）；
   *  3. trim + 多空白压缩为单空格。
   */
  private static canonicalize(value: string): string {
    let i = 0;
    return value
      .replace(/\{[^}]+\}/g, () => `{${i++}}`)
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\s*(\{\d+\})\s*/g, '$1');
  }

  private static findSemanticDuplicates(
    localeMap: LocaleMap,
  ): Array<{ canonical: string; entries: Array<{ key: string; value: string }> }> {
    const groups = new Map<string, Array<{ key: string; value: string }>>();
    for (const [key, value] of Object.entries(localeMap)) {
      if (typeof value !== 'string') continue;
      // 不含占位符且无空白噪声的短文本，规范化前后基本一致，纳入分组会产生
      // 大量「同字面同 key 数 = 1」的无效结果。仅对含占位符 / 含空白的 value
      // 做分组——这正是真重复发生的场景。
      if (!/[{}\s]/.test(value)) continue;
      const canonical = this.canonicalize(value);
      if (!groups.has(canonical)) groups.set(canonical, []);
      groups.get(canonical)!.push({ key, value });
    }

    return Array.from(groups.entries())
      .filter(([, entries]) => entries.length > 1)
      .map(([canonical, entries]) => ({ canonical, entries }));
  }

  private static findAnomalousValues(
    localeMap: LocaleMap,
  ): Array<{ key: string; value: string; reasons: string[] }> {
    const result: Array<{ key: string; value: string; reasons: string[] }> = [];
    for (const [key, value] of Object.entries(localeMap)) {
      if (typeof value !== 'string') continue;
      const reasons: string[] = [];
      if (this.HTML_TAG_PATTERN.test(value)) reasons.push('含 HTML 标签');
      if (value.length > this.LONG_VALUE_THRESHOLD) {
        reasons.push(`长度 ${value.length} > ${this.LONG_VALUE_THRESHOLD}`);
      }
      if (reasons.length > 0) result.push({ key, value, reasons });
    }
    return result;
  }

  /**
   * 找出"短碎片可疑 value"——长度 ≤ SUSPICIOUS_FRAGMENT_MAX_LEN 且含至少一个标点。
   * 用于事后诊断那些没被 mixed-content 合并路径捕获、但仍像被切碎的产物。
   */
  private static findSuspiciousFragments(
    localeMap: LocaleMap,
  ): Array<{ key: string; value: string }> {
    const result: Array<{ key: string; value: string }> = [];
    for (const [key, value] of Object.entries(localeMap)) {
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      if (trimmed.length > this.SUSPICIOUS_FRAGMENT_MAX_LEN) continue;
      if (!this.PUNCT_PATTERN.test(trimmed)) continue;
      result.push({ key, value });
    }
    return result;
  }

  /**
   * 找出跨模块复用候选：同一 value 在 ≥ CROSS_MODULE_REUSE_THRESHOLD 个不同
   * 目录前缀下都有 key。用于提示用户考虑启用 promoteToCommon。
   *
   * 目录前缀通过 separator 切分 key 取首段（如 separator='.' 时 `pages.foo.bar.x`
   * 的目录前缀视为 `pages.foo.bar`，前缀长度根据用户实际 maxDepth 而定，这里只是
   * "把最后一段视为 semanticId 之外都算前缀"）。空前缀（key 无 separator）视为
   * 同一桶。
   */
  private static findCrossModuleReuseCandidates(
    localeMap: LocaleMap,
    separator: string,
  ): Array<{ value: string; prefixes: string[] }> {
    if (!separator) return [];
    const valueToPrefixes = new Map<string, Set<string>>();
    for (const [key, value] of Object.entries(localeMap)) {
      if (typeof value !== 'string') continue;
      const idx = key.lastIndexOf(separator);
      const prefix = idx <= 0 ? '' : key.substring(0, idx);
      if (!valueToPrefixes.has(value)) valueToPrefixes.set(value, new Set());
      valueToPrefixes.get(value)!.add(prefix);
    }
    return Array.from(valueToPrefixes.entries())
      .filter(([, prefixes]) => prefixes.size >= this.CROSS_MODULE_REUSE_THRESHOLD)
      .map(([value, prefixes]) => ({ value, prefixes: Array.from(prefixes).sort() }));
  }

  private static preview(value: string): string {
    const single = value.replace(/\s+/g, ' ').trim();
    return single.length > 80 ? `${single.slice(0, 80)}…` : single;
  }
}
