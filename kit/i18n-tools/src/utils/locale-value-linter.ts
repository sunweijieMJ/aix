import { LoggerUtils } from './logger';
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
   * 对扁平 locale map 做 value 健康度检查，发现问题以 warning 输出。
   *
   * 注意：本检查不影响落盘流程——即使发现问题，调用方仍可继续写入文件。
   */
  static lint(localeMap: LocaleMap): void {
    const duplicates = this.findSemanticDuplicates(localeMap);
    const anomalies = this.findAnomalousValues(localeMap);

    if (duplicates.length === 0 && anomalies.length === 0) return;

    LoggerUtils.warn('\n📋 语言文件健康度检查发现以下问题（不阻塞流程，建议手动处理）：');

    if (duplicates.length > 0) {
      LoggerUtils.warn(`\n⚠️  发现 ${duplicates.length} 组语义重复 key（占位符变量名/空白差异）：`);
      for (const group of duplicates) {
        LoggerUtils.warn(`   语义形态: "${group.canonical}"`);
        for (const { key, value } of group.entries) {
          LoggerUtils.warn(`     - ${key}  →  ${JSON.stringify(value)}`);
        }
        LoggerUtils.warn(
          '     💡 建议在源码中统一变量名 / 空白，重跑 generate 即可自动复用同一 key',
        );
      }
    }

    if (anomalies.length > 0) {
      LoggerUtils.warn(`\n⚠️  发现 ${anomalies.length} 个 value 异常（HTML 标签 / 长度超标）：`);
      for (const { key, value, reasons } of anomalies) {
        LoggerUtils.warn(`   - ${key}  [${reasons.join(', ')}]`);
        LoggerUtils.warn(`     value 预览: ${this.preview(value)}`);
      }
      LoggerUtils.warn(
        '     💡 含 HTML 的 value 建议改造源码：模板字符串包裹结构，只把文案放入 t() 调用',
      );
    }
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

  private static preview(value: string): string {
    const single = value.replace(/\s+/g, ' ').trim();
    return single.length > 80 ? `${single.slice(0, 80)}…` : single;
  }
}
