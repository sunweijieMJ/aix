/**
 * 提取阶段记录的「被跳过的中文字面量」位置（比较运算操作数 / 嵌套插值中文）。
 * 供 linter / coverage 跨阶段消费时共享同一份快照，避免依赖 drain 的消费顺序。
 */
export interface SkippedTextLocation {
  text: string;
  filePath: string;
  line: number;
  column: number;
  /** 同一外层表达式中位置和文本相同时的稳定分支标识，仅用于去重。 */
  occurrence?: number;
}

/**
 * 一轮提取过程中「有意跳过、但需要向用户暴露」的中文字面量收集器。
 *
 * 每个 extractor 实例持有一份（见 BaseTextExtractor.diagnostics），消费方通过
 * `adapter.getTextExtractor().getDiagnostics()` 拿到同一实例后 drain。
 *
 * Why 是实例而非模块级单例：这两个集合此前是 CommonASTUtils 上的 private static
 * Map，即进程级可变全局状态。后果是
 *  - 「谁先 drain 谁拿到」——linter 抢在 coverage 之前 drain，覆盖率的 skipped 恒为 0；
 *    generate 路径不得不提前 drain 出快照再层层透传，才躲开这个竞争；
 *  - doctor 与 generate 在同进程内先后运行时互相污染（前者的残留计入后者）；
 *  - 单测必须在每个用例前手动 drain 清场，漏一处就串味。
 * 收敛到 extractor 实例上后，生命周期与「一轮提取」严格对齐，消费顺序不再有隐含约束。
 */
export class ExtractionDiagnostics {
  /**
   * 因比较运算符被跳过的中文字面量位置。
   *
   * Why: isComparisonOperand 跳过 `status === '进行中'` 这类位置是为了避免
   *      翻译后分支失效；但同一句中文若在别处（如 tabs 数组初值）被提取，
   *      就会出现「script 端值已 i18n 化，template 端仍硬编码中文比较」的
   *      非对称——切语言后分支永远不命中。lint 阶段把本集合与 source locale
   *      map values 交叉，命中即告警，让用户改用 key 比较或索引比较。
   *
   * 用 Map 去重（同一位置多次访问 AST 时只记录一次）。
   */
  private readonly comparisonOperands = new Map<string, SkippedTextLocation>();

  /**
   * 被「插值表达式整体占位符化」吞掉的嵌套中文字面量位置。
   *
   * Why: `操作失败：${cond ? '内部错误' : '网络异常'}` 这类模板字符串，整段会被
   *      processTemplateExpression 转成 `操作失败：{value}`，三元里的中文分支既不
   *      提取、也不内联，而是作为运行时参数原样塞进 {value}——切到非源语种后渲染出
   *      未翻译的中文，且没有任何告警（静默泄漏）。这里记录位置，lint / doctor 阶段
   *      显式暴露，提示用户手动把分支拆成 t(...)。
   *
   * 与 comparisonOperands 不同：本集合无需与 locale map 交叉——嵌套中文
   * 必然是展示文案，泄漏即问题，全部上报。用 Map 去重。
   */
  private readonly nestedChinese = new Map<string, SkippedTextLocation>();

  /**
   * 记录一处「因比较运算符被跳过」的中文字面量位置。
   * 仅当 text 含中文时建议记录（调用方自行判定，避免把英文枚举值记进来产生噪音）。
   */
  recordSkippedComparisonOperand(
    text: string,
    filePath: string,
    line: number,
    column: number,
  ): void {
    const key = `${filePath}:${line}:${column}:${text}`;
    if (!this.comparisonOperands.has(key)) {
      this.comparisonOperands.set(key, { text, filePath, line, column });
    }
  }

  /** 取出当前累积的跳过记录并清空（供 lint 阶段一次性消费）。 */
  drainSkippedComparisonOperands(): SkippedTextLocation[] {
    const items = Array.from(this.comparisonOperands.values());
    this.comparisonOperands.clear();
    return items;
  }

  /** 记录一处「被插值占位符吞掉的嵌套中文字面量」位置。 */
  recordSkippedNestedChinese(
    text: string,
    filePath: string,
    line: number,
    column: number,
    occurrence?: number,
  ): void {
    const key = `${filePath}:${line}:${column}:${occurrence ?? ''}:${text}`;
    if (!this.nestedChinese.has(key)) {
      this.nestedChinese.set(key, { text, filePath, line, column, occurrence });
    }
  }

  /** 取出当前累积的嵌套中文记录并清空（供 lint 阶段一次性消费）。 */
  drainSkippedNestedChinese(): SkippedTextLocation[] {
    const items = Array.from(this.nestedChinese.values());
    this.nestedChinese.clear();
    return items;
  }
}
