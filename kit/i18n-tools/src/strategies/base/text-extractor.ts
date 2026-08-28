import type ts from 'typescript';
import type { ExtractedString } from '../../utils/types';
import type { ITextExtractor, ManualSkipDiagnostic } from '../../adapters/FrameworkAdapter';
import { ExtractionDiagnostics } from '../../utils/extraction-diagnostics';
import { stripStatefulFlags } from '../../utils/path-matcher';

/**
 * 文本提取器抽象基类
 *
 * 提供 extractFromFiles 的默认串行实现，子类只需实现 extractFromFile。
 *
 * 放置在 strategies/base/ 而非 adapters/，以维持"策略层提供具体实现、
 * 适配器层定义抽象接口"的分层语义。adapters/ 仍然导出此类作为公共出口。
 *
 * ## warning 累积与排空
 *
 * 提取过程中遇到「不致命但值得用户关注」的情况（如跳过含 HTML 的模板字符串），
 * 子类调用 `recordWarning(msg)` 暂存到实例上；GenerateProcessor 在一轮提取
 * 结束后调用 `drainWarnings()` 取出并写入 RunReport，落盘到
 * `<rootDir>/.i18n-tools/logs/` 便于事后回查。
 *
 * 之所以走「累积 → 排空」而不是 callback / sink：
 *  - extractor 实例被 adapter 复用，回调 sink 容易在多次 generate 间残留；
 *  - drain 是显式动作，调用方明确控制收割时机，更易测试；
 *  - 子类不需要持有 RunReport 引用，依赖反转更干净。
 */
export abstract class BaseTextExtractor<
  TContext extends string = string,
> implements ITextExtractor {
  private pendingWarnings: string[] = [];
  private pendingManualSkips = new Map<string, ManualSkipDiagnostic>();
  private readonly rejectPatterns: readonly RegExp[];

  /**
   * 「有意跳过但需暴露给用户」的中文字面量收集器（比较运算操作数 / 嵌套插值中文）。
   *
   * 子类在提取过程中 record，消费方通过 getDiagnostics() 拿到同一实例 drain。
   * 生命周期绑在 extractor 实例上，故与本类的 warning / manualSkip 缓冲区一样，
   * 不存在跨 processor 串味或「谁先 drain 谁拿到」的竞争（详见 ExtractionDiagnostics）。
   */
  protected readonly diagnostics = new ExtractionDiagnostics();

  constructor(rejectPatterns: readonly RegExp[] = []) {
    this.rejectPatterns = rejectPatterns;
  }

  abstract extractFromFile(filePath: string): Promise<ExtractedString[]>;

  getDiagnostics(): ExtractionDiagnostics {
    return this.diagnostics;
  }

  /**
   * 提取判定的唯一入口，次序固定（模板方法，子类不要重写）：
   *   空串 → 子类 shouldExtractInternal（工具内置规则）→ 业务侧 rejectPatterns。
   *
   * Why 把次序固化在基类：rejectPatterns 必须**最后**生效——工具内部的安全规则
   * （isComparisonOperand / isInConsoleCall / 已 i18n 守卫）若被用户黑名单抢先放行，
   * 会提取出破坏运行时逻辑的字面量。此前 Vue / React 两端各写一份逐字相同的外壳，
   * 任一端改错次序都不会有测试拦住。
   */
  protected shouldExtract(
    str: string,
    context?: TContext,
    node?: ts.Node,
    templateContext?: string,
  ): boolean {
    if (!str.trim()) return false;
    if (!this.shouldExtractInternal(str, context, node, templateContext)) return false;
    return !this.isRejectedByConfig(str);
  }

  /**
   * 框架特有的内置判定规则。只回答「工具认为该不该提取」，不要在这里考虑
   * 业务侧 rejectPatterns——那由 shouldExtract 统一兜底。
   */
  protected abstract shouldExtractInternal(
    str: string,
    context?: TContext,
    node?: ts.Node,
    templateContext?: string,
  ): boolean;

  /**
   * 业务侧通过 config.extract.filterPatterns 声明的过滤模式命中检测。
   * 由 shouldExtract 在内置规则放行后调用（见其 Why）。
   */
  protected isRejectedByConfig(text: string): boolean {
    if (this.rejectPatterns.length === 0) return false;
    return this.rejectPatterns.some((re) => {
      // RegExp 带 g 或 y(sticky) 标志会在多次 test 间保留 lastIndex，跨字符串调用结果不稳定；
      // 用剥除这两个状态标志的副本规避此副作用，对用户透明。
      return stripStatefulFlags(re).test(text);
    });
  }

  async extractFromFiles(filePaths: string[]): Promise<ExtractedString[]> {
    const all: ExtractedString[] = [];
    for (const filePath of filePaths) {
      all.push(...(await this.extractFromFile(filePath)));
    }
    return all;
  }

  /** 子类向缓冲区追加一条 warning。已经通过 LoggerUtils 输出到 console 的内容也可重复登记，便于落盘。 */
  protected recordWarning(message: string): void {
    this.pendingWarnings.push(message);
  }

  /** 记录一类需要人工处理的跳过项；相同 category + 去重键在同一轮提取中只计一次。 */
  protected recordManualSkip(diagnostic: ManualSkipDiagnostic): void {
    const key = `${diagnostic.category}:${diagnostic.dedupeKey ?? diagnostic.message}`;
    if (!this.pendingManualSkips.has(key)) {
      this.pendingManualSkips.set(key, diagnostic);
    }
  }

  /** 取出累积的 warning 并清空缓冲区，供 Processor 写入 RunReport。 */
  drainWarnings(): string[] {
    const out = this.pendingWarnings;
    this.pendingWarnings = [];
    return out;
  }

  /** 取出累积的人工跳过项并清空缓冲区。 */
  drainManualSkips(): ManualSkipDiagnostic[] {
    const out = Array.from(this.pendingManualSkips.values());
    this.pendingManualSkips.clear();
    return out;
  }
}
