import type { ResolvedConfig } from '../config';
import type { ManualSkipDiagnostic } from '../adapters/FrameworkAdapter';
import type { SkippedTextLocation } from '../utils/extraction-diagnostics';
import { FileUtils } from '../utils/file-utils';
import { RunReport, type CoverageMetric, type ManualCategory } from '../utils/run-report';
import type { ExtractedString } from '../utils/types';
import { IdReuseResolver } from './IdReuseResolver';
import { renderCoveragePanel } from './coverage-panel';

/**
 * generate 的覆盖率账本：持有本轮「跳过项」快照，汇总覆盖率指标写入 RunReport 并渲染总览。
 *
 * 职责边界：只统计与渲染，不改源码、不写 locale。跳过项快照由 GenerateProcessor 在提取
 * 之后一次性 drain 进来（drain 是消耗性的，谁先取谁独吞），本对象随后作为唯一持有者，
 * 供覆盖率统计与 commit / dry-run 路径的 linter 共享同一份数据。
 */
export class CoverageReporter {
  /**
   * 本轮提取出的「比较运算符跳过的中文」快照。提取后立即从 extractor 的
   * ExtractionDiagnostics drain 到此处，供 commitToDisk（linter 交叉）与
   * recordAndRender（覆盖率统计）共享同一份——drain 是消耗性的，
   * 若让二者各自去 drain，后读者恒拿空数组。
   */
  private skippedComparisons: SkippedTextLocation[] = [];
  /** 本轮插值表达式中无法安全自动改写的嵌套中文。 */
  private skippedNestedChinese: SkippedTextLocation[] = [];
  /** 本轮由 extractor 结构化上报、需要人工处理的跳过项。 */
  private manualSkips: ManualSkipDiagnostic[] = [];

  constructor(
    private readonly config: ResolvedConfig,
    private readonly isCustom: boolean,
    private readonly report: RunReport,
  ) {}

  /** 装载本轮提取阶段 drain 出的跳过项快照（每轮 pipeline 开始处调用一次）。 */
  setExtractionSnapshots(snapshots: {
    skippedComparisons: SkippedTextLocation[];
    skippedNestedChinese: SkippedTextLocation[];
    manualSkips: ManualSkipDiagnostic[];
  }): void {
    this.skippedComparisons = snapshots.skippedComparisons;
    this.skippedNestedChinese = snapshots.skippedNestedChinese;
    this.manualSkips = snapshots.manualSkips;
  }

  /**
   * 把比较运算符跳过项快照交给 commit / dry-run 路径的 LocaleValueLinter，
   * 让它与覆盖率看到同一份数据（而非各自去 drain 已被清空的收集器）。
   */
  getSkippedComparisons(): SkippedTextLocation[] {
    return this.skippedComparisons;
  }

  /**
   * 仅用于覆盖率统计的轻量 resolver：构造 IdReuseResolver 并扫描已有 t()/$t() 调用点，
   * 不参与 ID 生成 / 落盘。供空提取分支（无 ExtractedString，故不会走 generateIdsForStrings）
   * 复用——让 alreadyI18n 反映真实已国际化量，避免 skipped 把覆盖率误算成 0。
   */
  buildScanResolver(filePaths: string[], i18nModules?: readonly string[]): IdReuseResolver {
    const resolver = new IdReuseResolver(this.config, this.isCustom);
    resolver.scanExistingCallsInSources(filePaths, i18nModules);
    return resolver;
  }

  /**
   * 汇总本轮 generate 的覆盖率指标并打印总览 summary。
   *
   * 计算口径（以「中文片段调用点」为单位）：
   *   alreadyI18n      = 源码中已存在的 t()/$t() 调用点数（IdReuseResolver 扫到）
   *   newlyGenerated   = 本轮 extractor 提取出的 ExtractedString 条目数
   *   skipped          = 工具确认属于文案、但无法安全自动改写的中文片段
   *
   * skipped 当前纳入比较运算符、嵌套插值中文、HTML 模板和类属性初始化器；注释、
   * console、import、类型字面量和用户 filterPatterns 等明确排除项不进入覆盖率分母。
   *
   * 同步把上述源码级跳过项作为 ManualEntry 写入 report，让最终落盘日志里能看到
   * 与 coverage.skipped 同口径的完整待人工清单。
   */
  recordAndRender(
    scannedFilePaths: string[],
    extractedStrings: ExtractedString[],
    reuseResolver: IdReuseResolver | null,
  ): void {
    // 1. 用提取阶段已 drain 的快照（this.skippedComparisons）填充比较运算符跳过项的
    //    结构化 ManualEntry 与覆盖率 skipped 计数。该快照在 extract 之后、apply/lint 之前
    //    就已从全局 collector drain 出来，故不会被 commitToDisk 里的 LocaleValueLinter
    //    抢先清空（两者共享同一份；linter 通过 options.skippedComparisons 拿到相同数据）。
    const skippedComparisons = this.skippedComparisons;
    for (const item of skippedComparisons) {
      this.report.addManualEntry({
        category: 'comparison-operand',
        file: FileUtils.getRelativePath(item.filePath),
        line: item.line,
        column: item.column,
        text: item.text,
        reason: '比较运算符两侧的中文翻译后会与状态值脱钩，工具主动跳过',
        suggestion: RunReport.MANUAL_DEFAULT_SUGGESTIONS['comparison-operand'],
      });
    }

    for (const item of this.skippedNestedChinese) {
      this.report.addManualEntry({
        category: 'nested-interpolation-chinese',
        file: FileUtils.getRelativePath(item.filePath),
        line: item.line,
        column: item.column,
        text: item.text,
        dedupeKey: item.occurrence === undefined ? undefined : String(item.occurrence),
        reason: '插值表达式内的中文会作为运行时参数原样渲染，工具无法安全递归改写',
        suggestion: RunReport.MANUAL_DEFAULT_SUGGESTIONS['nested-interpolation-chinese'],
      });
    }

    // manualSkips 不含插值内中文（那条走 diagnostics 通道，不在此重复计数，见
    // ManualSkipDiagnostic 的注释）。
    // 用 Record 查表：新增 category 时漏改是编译错（缺键）而非静默归错档。
    const manualSkipCategoryMap: Record<ManualSkipDiagnostic['category'], ManualCategory> = {
      'html-template': 'html-in-template',
      'non-html-template': 'non-html-template',
      'jsx-text-in-vue': 'jsx-text-in-vue',
      'class-property': 'class-property',
      'param-default': 'param-default',
      'conflicting-t-binding': 'conflicting-t-binding',
      'parse-error': 'parse-error',
    };
    for (const item of this.manualSkips) {
      const category = manualSkipCategoryMap[item.category];
      this.report.addManualEntry({
        category,
        file: '<source>',
        text: item.message,
        // message 已含 file:line，但同一行多处跳过的 message 相同；不带 dedupeKey 会被
        // RunReport.manualKey（file+text+dedupeKey）去重成一条，与 coverage.skipped 对不上账。
        dedupeKey: item.dedupeKey,
        reason: item.message,
        suggestion: RunReport.MANUAL_DEFAULT_SUGGESTIONS[category],
      });
    }

    const alreadyI18n = reuseResolver?.getExistingCallSiteCount() ?? 0;
    const newlyGenerated = extractedStrings.length;
    const skipped =
      skippedComparisons.length + this.skippedNestedChinese.length + this.manualSkips.length;
    const total = alreadyI18n + newlyGenerated + skipped;
    const coverageRate = total === 0 ? 1 : (alreadyI18n + newlyGenerated) / total;

    const metric: CoverageMetric = {
      scannedFiles: scannedFilePaths.length,
      totalChineseSegments: total,
      alreadyI18n,
      newlyGenerated,
      skipped,
      coverageRate,
    };
    this.report.setCoverage(metric);
    this.renderCoverageSummary(metric, reuseResolver?.getNewlyRegisteredIdCount());
  }

  private renderCoverageSummary(m: CoverageMetric, newKeys?: number): void {
    // 面板渲染只有 coverage-panel 一份实现，与 apply-plan 回放共用；这里只负责把
    // 本轮的 ManualEntry 明细折算成分类条数。
    const manualByCategory = Object.fromEntries(
      Object.entries(this.report.groupCoverageManualByCategory()).map(([category, list]) => [
        category,
        list.length,
      ]),
    );
    renderCoveragePanel(m, { newKeys, manualByCategory });
  }
}
