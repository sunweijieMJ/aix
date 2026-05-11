import type { ExtractedString } from '../../utils/types';
import type { ITextExtractor } from '../../adapters/FrameworkAdapter';

/**
 * 文本提取器抽象基类
 *
 * 提供 extractFromFiles 的默认串行实现，子类只需实现 extractFromFile。
 * 之前 Vue/React 各自维护一份相同的 for-await 样板，统一到本基类。
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
export abstract class BaseTextExtractor implements ITextExtractor {
  private pendingWarnings: string[] = [];
  private readonly rejectPatterns: readonly RegExp[];

  constructor(rejectPatterns: readonly RegExp[] = []) {
    this.rejectPatterns = rejectPatterns;
  }

  abstract extractFromFile(filePath: string): Promise<ExtractedString[]>;

  /**
   * 业务侧通过 config.extraction.rejectPatterns 声明的黑名单命中检测。
   *
   * 子类的 shouldExtract 在自身规则判定"可提取"后，必须调用本方法做最后一道拒收检查；
   * 不在 shouldExtract 内嵌做的原因是：工具内部的安全规则（如 isComparisonOperand）
   * 必须先于用户黑名单生效，避免黑名单意外放过会破坏运行时逻辑的字面量。
   */
  protected isRejectedByConfig(text: string): boolean {
    if (this.rejectPatterns.length === 0) return false;
    return this.rejectPatterns.some((re) => {
      // RegExp 带 g 标志会在多次 test 间保留 lastIndex，跨字符串调用结果不稳定；
      // 拷贝一份新建实例规避此副作用，对用户透明。
      const probe = re.global ? new RegExp(re.source, re.flags.replace('g', '')) : re;
      return probe.test(text);
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

  /** 取出累积的 warning 并清空缓冲区，供 Processor 写入 RunReport。 */
  drainWarnings(): string[] {
    const out = this.pendingWarnings;
    this.pendingWarnings = [];
    return out;
  }
}
