import { CommonASTUtils } from './common-ast-utils';
import { LoggerUtils } from './logger';
import { RunReport, type ManualCategory } from './run-report';
import type { LocaleMap } from './types';

/**
 * 结构化 lint 结果。analyze() 只返回数据，由 emit() 决定如何输出（console /
 * RunReport / doctor 命令的聚合视图）。
 *
 * Why 分层：
 *  - 原 lint() 同时承担「分析 + console.warn + 写 RunReport」三职，导致
 *    LanguageFileManager 与未来的 DoctorProcessor 无法复用纯分析逻辑——
 *    Doctor 想拿结构化结果做 --fix 决策；语言文件落盘时只需要 console + report。
 *  - 拆分后 analyze 是纯函数，可独立单测；emit 是 sink 适配层。
 */
export interface LinterFinding {
  category: ManualCategory;
  /** 一行简短描述，console / 日志通用 */
  title: string;
  /** 多行详情（含 value / 建议示例等），保留原换行 */
  details: string[];
  /** locale key（无对应 key 的全局问题填 '<global>'） */
  key: string;
  /** locale value 内容（含 HTML / 重复值等场景使用） */
  value?: string;
  /** 源码位置（仅 hardcoded-comparison 等附带文件位置的 finding 有） */
  file?: string;
  line?: number;
  column?: number;
}

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
   * 纯函数：跑全部检查并返回结构化结果。
   *
   * 不做任何 I/O / console，便于 doctor 命令在不同 sink（CI 文本/JSON/HTML）
   * 上复用，也便于单测断言结构。
   *
   * 注意：findHardcodedComparisons 会消费 CommonASTUtils.drainSkippedComparisonOperands。
   * 因此 analyze 是「一次性」操作：同一进程内第二次跑会返回空 hardcoded-comparison
   * 集合。如未来需要"重复 analyze"语义，需把 drain 解耦出去。
   */
  static analyze(localeMap: LocaleMap, options?: { separator?: string }): LinterFinding[] {
    const findings: LinterFinding[] = [];

    for (const group of this.findSemanticDuplicates(localeMap)) {
      findings.push({
        category: 'semantic-duplicate',
        title: `语义形态: "${group.canonical}"`,
        details: group.entries.map(({ key, value }) => `${key}  →  ${JSON.stringify(value)}`),
        // 取首个 key 作为定位锚点；details 已包含全部
        key: group.entries[0]?.key ?? '<global>',
      });
    }

    for (const { key, value, reasons } of this.findAnomalousValues(localeMap)) {
      const isHtml = reasons.some((r) => r.includes('HTML'));
      findings.push({
        category: isHtml ? 'html-tag-in-value' : 'long-value',
        title: `${key}  [${reasons.join(', ')}]`,
        details: [`value 预览: ${this.preview(value)}`],
        key,
        value,
      });
    }

    for (const { key, value } of this.findSuspiciousFragments(localeMap)) {
      // 短碎片归入 mixed-content：它们多是混合内容拆碎的产物
      findings.push({
        category: 'mixed-content',
        title: `${key}  →  ${JSON.stringify(value)}`,
        details: ['可能是 HTML 文本节点 + 插值被切碎的产物，建议检查源码该 key 的调用点'],
        key,
        value,
      });
    }

    if (options?.separator) {
      for (const c of this.findCrossModuleReuseCandidates(localeMap, options.separator)) {
        findings.push({
          category: 'cross-module-reuse',
          title: `value: ${JSON.stringify(c.value)}`,
          details: [`使用前缀: ${c.prefixes.join(', ')}`],
          key: '<global>',
          value: c.value,
        });
      }
    }

    for (const c of this.findHardcodedComparisons(localeMap)) {
      findings.push({
        category: 'hardcoded-comparison',
        title: `${c.filePath}:${c.line}:${c.column}`,
        details: [
          `位置硬编码: ${JSON.stringify(c.text)}`,
          `该文案已对应 key: ${c.matchedKeys.join(', ')}`,
        ],
        key: c.matchedKeys[0] ?? '<global>',
        value: c.text,
        file: c.filePath,
        line: c.line,
        column: c.column,
      });
    }

    for (const c of this.findNestedInterpolationChinese()) {
      findings.push({
        category: 'nested-interpolation-chinese',
        title: `${c.filePath}:${c.line}:${c.column}`,
        details: [
          `未提取的嵌套中文: ${JSON.stringify(c.text)}`,
          '该中文位于插值表达式（如三元分支）内，会作为运行时参数渲染出未翻译原文',
        ],
        key: '<global>',
        value: c.text,
        file: c.filePath,
        line: c.line,
        column: c.column,
      });
    }

    return findings;
  }

  /**
   * 把 analyze 的结果发送到 sink（console 与可选 RunReport）。
   *
   * console 输出按类别可读分组：先按类别小标题再展开 details；
   * RunReport 接收每条 finding 转成的 ManualEntry，落盘到 `.i18n-tools/logs/`
   * 供事后回查与 doctor 聚合。
   *
   * 不区分 sink 全为 no-op 的场景——空 findings 时返回即止，避免输出空标题。
   */
  static emit(findings: LinterFinding[], sinks: { console?: boolean; report?: RunReport }): void {
    if (findings.length === 0) return;
    const wantConsole = sinks.console !== false;

    const grouped: Record<ManualCategory, LinterFinding[]> = {} as Record<
      ManualCategory,
      LinterFinding[]
    >;
    for (const f of findings) {
      (grouped[f.category] ||= []).push(f);
    }

    if (wantConsole) {
      LoggerUtils.warn('\n📋 语言文件健康度检查发现以下问题（不阻塞流程，建议手动处理）：');
    }

    for (const [category, list] of Object.entries(grouped) as Array<
      [ManualCategory, LinterFinding[]]
    >) {
      if (wantConsole) {
        const label = RunReport.MANUAL_LABELS[category];
        LoggerUtils.warn(`\n⚠️  [${category}] 发现 ${list.length} 条 — ${label}`);
        for (const f of list) {
          LoggerUtils.warn(`   ${f.title}`);
          for (const line of f.details) LoggerUtils.warn(`     ${line}`);
        }
      }

      if (sinks.report) {
        for (const f of list) {
          sinks.report.addManualEntry({
            category,
            file: f.file ?? '<locale>',
            line: f.line,
            column: f.column,
            text: f.value ?? f.key,
            reason: f.title,
            suggestion: RunReport.MANUAL_DEFAULT_SUGGESTIONS[category],
          });
        }
      }
    }
  }

  /**
   * 兼容入口：保持旧签名 lint(localeMap, report?, options?) 不变。
   * 内部直接组合 analyze + emit。新代码请优先用 analyze + emit。
   */
  static lint(localeMap: LocaleMap, report?: RunReport, options?: { separator?: string }): void {
    const findings = this.analyze(localeMap, options);
    this.emit(findings, { console: true, report });
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
   * 取出提取阶段记录的「被插值占位符吞掉的嵌套中文字面量」。
   *
   * 与 findHardcodedComparisons 不同，这里无需与 locale map 交叉：嵌套中文必然是
   * 展示文案，作为运行时参数渲染出未翻译原文即问题，全部上报。
   *
   * 注意：drain 是消耗性操作，调用后 collector 清空，避免下次 lint 重复报警。
   */
  private static findNestedInterpolationChinese(): Array<{
    text: string;
    filePath: string;
    line: number;
    column: number;
  }> {
    return CommonASTUtils.drainSkippedNestedChinese();
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
