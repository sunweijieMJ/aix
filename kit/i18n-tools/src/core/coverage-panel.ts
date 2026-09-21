import { LoggerUtils } from '../utils/logger';
import { RunReport, type CoverageMetric } from '../utils/run-report';

/**
 * 「本次国际化覆盖率」总览面板的唯一渲染实现。
 *
 * 两条路径共用同一份输出：generate 直跑（CoverageReporter 现算现渲）与 apply-plan 回放
 * （从 plan 的覆盖率快照回放）。面板是 CI / reviewer 判读的口径，两边各写一份必然漂移。
 *
 * 入参刻意只收「已算好的数值」（metric + 新增 key 数 + 待人工分类计数），不接 RunReport：
 * apply 路径手上只有 plan 里的快照，没有本轮的 ManualEntry 明细。
 */
export function renderCoveragePanel(
  metric: CoverageMetric,
  options: { newKeys?: number; manualByCategory?: Record<string, number> } = {},
): void {
  const { newKeys, manualByCategory } = options;
  const pct = (n: number, base: number): string =>
    base === 0 ? '0.0%' : `${((n / base) * 100).toFixed(1)}%`;
  const ratePct = `${(metric.coverageRate * 100).toFixed(1)}%`;

  LoggerUtils.info('');
  LoggerUtils.info('📊 本次国际化覆盖率');
  LoggerUtils.info('────────────────────────────────────');
  LoggerUtils.info(`扫描文件          ${metric.scannedFiles}`);
  LoggerUtils.info(`中文片段总数      ${metric.totalChineseSegments}`);
  LoggerUtils.info(
    `  已国际化         ${metric.alreadyI18n}  (${pct(metric.alreadyI18n, metric.totalChineseSegments)})`,
  );
  // 文案按口径直述「命中/转换」，不要写成「新生成」：newlyGenerated 是本轮提取并改写的
  // 中文片段数，重跑同一批文件（key 全部复用、locale 零新增）时它照样是 423，
  // 「新生成」会被读成「新增了 N 个 key」。
  LoggerUtils.info(
    `  本轮命中/转换    ${metric.newlyGenerated}  (${pct(metric.newlyGenerated, metric.totalChineseSegments)})`,
  );
  if (newKeys !== undefined) {
    // 两个数并列才看得出「重跑同一批文件」的形态：转换处数不变，新增 key 为 0。
    LoggerUtils.info(`    └ 其中新增 key ${newKeys}（其余复用已有 key）`);
  }
  LoggerUtils.info(
    `  跳过/待人工      ${metric.skipped}  (${pct(metric.skipped, metric.totalChineseSegments)})`,
  );
  LoggerUtils.info('────────────────────────────────────');
  LoggerUtils.info(`🎯 当前覆盖率   ${ratePct}`);

  const groups = Object.entries(manualByCategory ?? {});
  const entryCount = groups.reduce((sum, [, count]) => sum + count, 0);
  if (entryCount > 0) {
    LoggerUtils.info('');
    LoggerUtils.warn(`⚠️  覆盖率待人工 ${entryCount} 条（详见 .i18n-tools/logs/）`);
    for (const [category, count] of groups) {
      // plan 是跨版本数据：category 由生成 plan 的那个版本写入，本版本不认识时
      // 退回原始名，别在面板上打出 undefined。
      const label =
        RunReport.MANUAL_LABELS[category as keyof typeof RunReport.MANUAL_LABELS] ?? category;
      LoggerUtils.warn(`   • ${category.padEnd(20)} ${String(count).padStart(4)}  — ${label}`);
    }
  }
  LoggerUtils.info('');
}
