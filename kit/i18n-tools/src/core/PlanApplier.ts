import path from 'path';
import type { ResolvedConfig } from '../config';
import type { SkippedTextLocation } from '../utils/extraction-diagnostics';
import { FileUtils } from '../utils/file-utils';
import { InteractiveUtils } from '../utils/interactive-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LocaleValueLinter } from '../utils/locale-value-linter';
import { LoggerUtils } from '../utils/logger';
import { RunReport } from '../utils/run-report';
import type { ExtractedString } from '../utils/types';
import { renderCoveragePanel } from './coverage-panel';
import {
  GeneratePlanWriter,
  type GeneratePlan,
  type GeneratePlanCoverage,
  type GeneratePlanFileEntry,
  type GeneratePlanHit,
} from './GeneratePlan';

/** GenerateProcessor 注入的落盘与文案定稿能力（避免 PlanApplier 反向依赖 processor 全量状态）。 */
export interface PlanApplierHooks {
  /** 把一条提取结果规整为「最终 locale 形态」的文案（GenerateProcessor.toLocaleMessage）。 */
  toLocaleMessage(item: ExtractedString): string;
  /** 阶段 2~4：写源码 + 更新语言文件 + 格式化（GenerateProcessor.commitToDisk）。 */
  commitToDisk(
    results: Array<{ file: string; code: string; originalContent?: string }>,
    extractedStrings: ExtractedString[],
    keyBucketMap: Record<string, string> | undefined,
    options?: { preFinalizedLocale?: boolean },
  ): Promise<void>;
  /**
   * 读取 @kit/i18n-tools 包的 version 字段，写入 plan 元数据。
   * 由 GenerateProcessor 提供：其实现依赖 `import.meta.url` 的相对位置，绑定在调用方文件上。
   */
  getToolVersion(): string | undefined;
}

/**
 * generate 的 plan 侧：dry-run 写 plan、apply-plan 回放 plan，以及两者共用的
 * 「读当前 source locale key 集合」。
 *
 * 职责边界：只负责 plan 的序列化 / 反序列化与校验。真正的落盘（写源码 + 更新语言文件 +
 * 格式化）仍在 GenerateProcessor.commitToDisk，通过 hooks 注入——plan 回放与普通 commit
 * 必须走同一条落盘路径，否则两者的事务语义（原子写、回滚、损坏守卫）会各自漂移。
 *
 * 状态取舍：runMode / planOutputDir / skipLLM / keepPlan 都是**单次运行**的参数而非对象
 * 属性，故一律走方法入参传入，本类自身只持有 config / isCustom / report / hooks 这些
 * 整个 processor 生命周期不变的依赖。
 */
export class PlanApplier {
  constructor(
    private readonly config: ResolvedConfig,
    private readonly isCustom: boolean,
    private readonly report: RunReport,
    private readonly hooks: PlanApplierHooks,
  ) {
    this.langFiles = new LanguageFileManager(config, isCustom);
  }

  /** 绑定 (config, isCustom) 的语言文件读写入口（与 GenerateProcessor 的那份指向同一目录）。 */
  private readonly langFiles: LanguageFileManager;

  /**
   * dry-run 输出：把内存中的 transform 结果序列化为 plan + sources/。
   *
   * 设计要点：
   * - plan.json 完整保留 hits，每条 hit 都能反查到原文件的具体替换点
   * - sources/<relPath> 保留 transform 后完整文件内容，apply 时直接落盘
   * - sourceHash 用 transform 前的原始内容（apply 时校验源码未被外部改动）
   * - transformedHash 用 transform 后的内容（read 时校验 sources/ 副本未被外部改动）
   *
   * @param options.planOutputDir  plan 输出根目录（未指定则用默认 `.i18n-tools/plans/` 下时间戳目录）
   * @param options.skipLLM        本次 generate 是否启用了 --skip-llm（写入 plan.llmModel）
   * @param options.skippedComparisons 提取阶段已 drain 的比较运算符跳过项快照（供 lint 复用同一份）
   * @param options.coverage 本轮覆盖率账本，随 plan 落盘供 apply 回放面板与阈值卡点
   */
  writePlan(
    uniqueFilePaths: string[],
    results: Array<{ file: string; code: string; originalContent: string }>,
    extractedStrings: ExtractedString[],
    keyBucketMap: Record<string, string> | undefined,
    options: {
      planOutputDir?: string;
      skipLLM: boolean;
      skippedComparisons: SkippedTextLocation[];
      coverage?: GeneratePlanCoverage;
    },
  ): void {
    const planRoot =
      options.planOutputDir ?? GeneratePlanWriter.getDefaultPlansRoot(this.config.root);
    const planDir = path.join(planRoot, GeneratePlanWriter.generateDirName());

    // 按文件归组 ExtractedString，便于在 entries 内挂载 hits
    const byFile = new Map<string, ExtractedString[]>();
    for (const s of extractedStrings) {
      const normalized = path.normalize(s.filePath);
      if (!byFile.has(normalized)) byFile.set(normalized, []);
      byFile.get(normalized)!.push(s);
    }

    const localeDelta: Record<string, string> = {};
    for (const item of extractedStrings) {
      if (!item.semanticId) continue;
      // 与 resolveSemanticId 的复用查找键共用同一 canonical 形态（见 toLocaleMessage）
      const message = this.hooks.toLocaleMessage(item);
      // 重复 semanticId 取首次（generateIdsForStrings 已经保证同原文 → 同 key，
      // 不同原文 → 不同 key；这里的 first-wins 是冗余防御）
      // 用 hasOwnProperty 而非 `in`：`in` 走原型链，semanticId 为 'constructor' /
      // 'toString' 等原型成员名时会假命中，导致该 key 被静默丢弃，apply 阶段把源码改成
      // t('constructor') 却没有对应 locale 值（与 doctor checkMissingTargetKeys 同类修复）。
      if (!Object.prototype.hasOwnProperty.call(localeDelta, item.semanticId)) {
        localeDelta[item.semanticId] = message;
      }
    }

    const transformedSources = new Map<string, string>();
    const entries: GeneratePlanFileEntry[] = [];

    // uniqueFilePaths 与 results 同源等长，循环内逐个 results.find 是 O(n²)；预建索引后
    // 取用 O(1)，大目录 dry-run（成百上千文件）时收益明显。
    const resultByFile = new Map(results.map((r) => [r.file, r]));
    for (const filePath of uniqueFilePaths) {
      const result = resultByFile.get(filePath);
      // 不变量：uniqueFilePaths 与 results 同源于 transformToMemory，任一文件 transform
      // 失败已在该阶段抛错，故每个 filePath 必有对应 result。此处 fail-loud 而非静默
      // skip——静默会写出缺转换源码的指纹条目，损坏 plan。
      if (!result) {
        throw new Error(`内部错误：plan 写入时缺少文件「${filePath}」的 transform 结果`);
      }

      const relPosix = GeneratePlanWriter.toRelPosix(this.config.root, filePath);
      const transformedRef = `${GeneratePlanWriter.SOURCES_DIRNAME}/${relPosix}`;
      transformedSources.set(relPosix, result.code);

      // 复用 transformToMemory 阶段已读取的原文，与 sourceHash 共用同一份快照
      const sourceHash = GeneratePlanWriter.sha256(result.originalContent);

      const fileStrings = byFile.get(filePath) ?? [];
      const hits: GeneratePlanHit[] = fileStrings
        .filter((s) => Boolean(s.semanticId))
        .map((s) => ({
          semanticId: s.semanticId,
          original: s.original,
          processedMessage: s.processedMessage,
          context: s.context,
          templateContext: s.templateContext,
          componentType: s.componentType,
          line: s.line,
          column: s.column,
          isTemplateString: s.isTemplateString,
          templateVariables: s.templateVariables,
          attributeName: s.attributeName,
          module: keyBucketMap?.[s.semanticId],
        }));

      entries.push({
        file: relPosix,
        hits,
        transformedCodeRef: transformedRef,
        sourceHash,
        // 与 transformedSources 同一份内容算指纹：read() 据此校验 sources/ 未被外部改过。
        transformedHash: GeneratePlanWriter.sha256(result.code),
      });
    }

    const existingLocale = this.readCurrentSourceLocaleMap();
    // 只快照「delta 将覆盖的既有 key」的当前值，供 apply 侧做漂移比对（见 GeneratePlan.localeBaseline）。
    const localeBaseline: Record<string, string> = {};
    let newKeyCount = 0;
    for (const key of Object.keys(localeDelta)) {
      if (Object.prototype.hasOwnProperty.call(existingLocale, key)) {
        localeBaseline[key] = existingLocale[key]!;
      } else {
        newKeyCount++;
      }
    }
    const plan: GeneratePlan = {
      schemaVersion: 2,
      command: 'generate',
      finishedAt: new Date().toISOString(),
      root: this.config.root,
      isCustom: this.isCustom,
      framework: this.config.framework.type,
      toolVersion: this.hooks.getToolVersion(),
      // skipLLM 模式下记 'local'：与 LLMClient.generateSemanticIdsForFiles 的本地
      // 兜底路径对应，让 reviewer 知道本批 ID 没经过 LLM。
      llmModel: options.skipLLM ? 'local' : this.config.llm.idGeneration.model,
      summary: {
        files: entries.length,
        hits: entries.reduce((sum, e) => sum + e.hits.length, 0),
        newKeys: newKeyCount,
      },
      coverage: options.coverage,
      entries,
      localeDelta,
      localeBaseline,
      keyBucketMap,
      outputShape: {
        bucketsEnabled: Boolean(this.config.buckets),
        separator: this.config.keys.separator,
        source: this.config.locales.source,
      },
    };

    GeneratePlanWriter.write(planDir, plan, transformedSources);
    GeneratePlanWriter.logPlanReadyMessage(planDir);

    // dry-run 评审阶段先跑一遍健康度 lint，让 reviewer 在 plan/RunReport 里就能看到 lint 告警，
    // 而非等真正落盘后才暴露。
    // Why 必须在这里显式跑：dry-run 不进 commitToDisk，而 lint 挂在 commit 路径上。
    // 注意口径差异（非完全等价于 commit 路径）：
    //   - 此处只 lint localeDelta（本轮新增 key→value）；commit 路径 lint 的是
    //     finalMap = {...已有 localeMap, ...新增}（全量合并 map）。因此跨 key 类检查
    //     （findSemanticDuplicates / findHardcodedComparisons / findCrossModuleReuseCandidates）
    //     在 dry-run 看不到「新 key 与既有 key 冲突」这类发现——它们会在 apply/commit 阶段
    //     如实补报（apply 经 commitToDisk → updateLanguageFiles 会对全量 map 再跑一次 lint），
    //     不会被静默吞掉，只是 dry-run 预览不完整。
    //   - skippedComparisons 传入提取阶段已 drain 的快照（供 coverage 复用同一份）；
    //     嵌套中文不传给 linter：CoverageReporter.recordAndRender 已逐条渲染
    //     skippedNestedChinese，再传进来会让同一条产出两份 finding。
    const lintFindings = LocaleValueLinter.analyze(localeDelta, {
      separator: this.config.keys.separator,
      skippedComparisons: options.skippedComparisons,
    });
    LocaleValueLinter.emit(lintFindings, { console: true, report: this.report });
  }

  /**
   * apply-plan 入口：从已有 plan.json 直接回放，跳过 AST 解析与 LLM 调用。
   *
   * 流程：
   *   1. 读取 plan.json + sources/
   *   2. 校验源文件 sha256 与 plan.entries[].sourceHash 一致
   *   3. 调用 commitToDisk 落盘
   *
   * 关于 lint：apply 不重复解析 AST、不重跑 LLM，但确实会再跑一次 LocaleValueLinter——
   * 它经 commitToDisk → updateLanguageFiles 对全量合并 map 做 lint（与普通 commit 同路径）。
   * 这正好补齐 dry-run 阶段只 lint 增量 delta 看不到的跨 key 发现（见 writePlan 注释）。
   *
   * @param options.keepPlan apply 完成后是否保留 plan 目录。默认 false（清理）：plan 的
   *        生命周期是「生成 → review → apply」，apply 完即终结；保留只在事后追溯有少量
   *        价值，但单 plan 体积大（含 sources/）容易累积。CLI 通过 `--keep-plan` 显式保留。
   * @param options.interactive 是否允许在 locale 漂移时弹确认。非交互（CLI 的 apply-plan、
   *        CI）一律拒绝 apply，让用户重跑 dry-run 而不是靠一个看不见的提示决定要不要覆盖。
   * @returns 'applied' 已落盘；'cancelled' 用户在漂移确认里选了否（未做任何修改，plan 保留）
   */
  async apply(
    planPath: string,
    options: { keepPlan: boolean; interactive?: boolean },
  ): Promise<'applied' | 'cancelled'> {
    LoggerUtils.info(`📂 加载 Plan: ${planPath}`);
    const { plan, transformedSources } = GeneratePlanWriter.read(planPath, {
      expectedRoot: this.config.root,
    });

    if (plan.framework !== this.config.framework.type) {
      throw new Error(
        `Plan 框架 (${plan.framework}) 与当前配置 (${this.config.framework.type}) 不一致，拒绝 apply。`,
      );
    }
    if (plan.isCustom !== this.isCustom) {
      throw new Error(
        `Plan 目标目录 (${plan.isCustom ? 'custom' : 'main'}) 与当前 --custom 配置不一致，拒绝 apply。`,
      );
    }

    // 落盘形态配置漂移告警：指纹只覆盖源文件、不覆盖 buckets/separator/source。这些在
    // dry-run 与 apply 之间被改过时，apply 会用 plan 旧 keyBucketMap 配新配置写出与预览
    // 不一致的 locale 形态。低风险（源码仍逐字回放、指纹保护），故告警而非拒绝。
    if (plan.outputShape) {
      const current = {
        bucketsEnabled: Boolean(this.config.buckets),
        separator: this.config.keys.separator,
        source: this.config.locales.source,
      };
      const diffs: string[] = [];
      if (plan.outputShape.bucketsEnabled !== current.bucketsEnabled) {
        diffs.push(
          `buckets ${plan.outputShape.bucketsEnabled ? '开启' : '关闭'} → ${current.bucketsEnabled ? '开启' : '关闭'}`,
        );
      }
      if (plan.outputShape.separator !== current.separator) {
        diffs.push(`keys.separator '${plan.outputShape.separator}' → '${current.separator}'`);
      }
      if (plan.outputShape.source !== current.source) {
        diffs.push(`locales.source '${plan.outputShape.source}' → '${current.source}'`);
      }
      if (diffs.length > 0) {
        LoggerUtils.warn(
          '⚠️  Plan 生成后影响 locale 落盘形态的配置已变化，apply 产出可能与 dry-run 预览不一致：',
        );
        for (const d of diffs) LoggerUtils.warn(`   - ${d}`);
        LoggerUtils.warn('💡 如需与预览严格一致，请重新运行 `generate --dry-run` 后再 apply。');
      }
    }

    const { mismatched, contents } = GeneratePlanWriter.verifyFingerprint(plan);
    if (mismatched.length > 0) {
      LoggerUtils.error('❌ Plan 生成后以下源文件已被外部修改，拒绝 apply：');
      for (const f of mismatched) LoggerUtils.error(`   - ${f}`);
      LoggerUtils.warn('💡 请重新运行 `generate --dry-run` 生成新 plan，确认无误后再 apply');
      throw new Error('Plan 指纹校验失败');
    }

    // 把 plan 还原成 commitToDisk 期望的入参：
    //   - results: 文件绝对路径 + transform 后代码
    //   - extractedStrings: 仅需 semanticId + 用于 message 还原的字段
    const results: Array<{ file: string; code: string; originalContent?: string }> = [];
    for (const entry of plan.entries) {
      const abs = GeneratePlanWriter.fromRelPosix(plan.root, entry.file);
      // originalContent 取自 verifyFingerprint 已读取的同一份快照，作为 commitToDisk 的回滚
      // 基线，避免写盘前再次 readFileSync 引入「校验→读取」窗口（详见 verifyFingerprint 注释）。
      results.push({
        file: abs,
        code: transformedSources.get(entry.file)!,
        originalContent: contents.get(entry.file),
      });
    }

    // 把 localeDelta 直接展开成 ExtractedString 列表（仅保留下游需要的字段）。
    // plan.localeDelta 已是 writePlan 阶段 createMessageWithOptions + finalizeLocaleMessage
    // 跑完的最终 locale 值，因此这里把 message 原样放进 original/processedMessage，
    // 并通过 commitToDisk 的 preFinalizedLocale 标记让 updateLanguageFiles 跳过二次定稿。
    // Why（关键）：syntheticStrings 不带 isTemplateString/templateVariables，若不打这个标记，
    // updateLanguageFiles 会用空 placeholderMap 重新 finalize，把真实占位符 {x} 当字面量
    // 二次转义（单花括号库写成 {'{'}x{'}'}），使 apply 结果偏离 dry-run 预览且运行时插值失效。
    const syntheticStrings: ExtractedString[] = Object.entries(plan.localeDelta).map(
      ([semanticId, message]) => ({
        original: message,
        processedMessage: message,
        semanticId,
        filePath: '<plan>',
        line: 0,
        column: 0,
        context: 'js-code',
        componentType: 'other',
      }),
    );

    const localeBeforeApply = this.readCurrentSourceLocaleMap();
    if (!(await this.confirmNoLocaleDrift(plan, localeBeforeApply, options.interactive === true))) {
      LoggerUtils.warn('操作已取消');
      LoggerUtils.info(`📁 Plan 目录已保留：${path.dirname(planPath)}`);
      return 'cancelled';
    }

    const localeKeysBeforeApply = new Set(Object.keys(localeBeforeApply));
    await this.hooks.commitToDisk(results, syntheticStrings, plan.keyBucketMap, {
      preFinalizedLocale: true,
    });
    const localeKeysAfterApply = this.readCurrentSourceLocaleKeys();
    const appliedNewKeys = Object.keys(plan.localeDelta).filter(
      (key) => !localeKeysBeforeApply.has(key) && localeKeysAfterApply.has(key),
    ).length;
    LoggerUtils.success(
      `✅ Plan 回放完成：${plan.summary.files} 个文件、${appliedNewKeys} 个新 key`,
    );
    this.replayCoverage(plan);

    // 默认清理 plan 目录：commitToDisk 成功后 plan 已无价值，保留只会累积。
    // 用户通过 --keep-plan 显式保留（如希望事后审计 / 在 PR 中附带）。
    if (options.keepPlan) {
      LoggerUtils.info(`📁 已保留 Plan 目录（--keep-plan）：${path.dirname(planPath)}`);
    } else {
      const planDir = path.dirname(planPath);
      if (GeneratePlanWriter.cleanup(planDir)) {
        LoggerUtils.info(`🗑️  Plan 目录已清理：${planDir}（如需保留请使用 --keep-plan）`);
      }
    }

    return 'applied';
  }

  /**
   * 回放 plan 里的覆盖率账本：打同款面板，并把 metric 写回 report，使 CLI 的
   * `--coverage-threshold` / ci.coverageThreshold 在 apply 路径上同样生效
   * （apply 不重跑提取，覆盖率只能来自 dry-run 的快照）。
   *
   * 旧 plan 缺该字段时只打一条 info：升级工具后存量 plan 仍能 apply，代价是这一次没有门禁。
   */
  private replayCoverage(plan: GeneratePlan): void {
    if (!plan.coverage) {
      LoggerUtils.info(
        'ℹ️  旧版 plan 未记录覆盖率信息，本次跳过覆盖率面板与阈值判定；' +
          '如需在 apply 阶段卡覆盖率请重跑 `generate --dry-run`。',
      );
      return;
    }
    this.report.setCoverage(plan.coverage.metric);
    renderCoveragePanel(plan.coverage.metric, {
      newKeys: plan.coverage.newKeys,
      manualByCategory: plan.coverage.manualByCategory,
    });
  }

  /**
   * locale 漂移守卫：plan 记录的「将被覆盖的既有 key 当时的值」与当前磁盘值逐条比对。
   *
   * Why：指纹只盖源码文件。dry-run 之后有人改了这些 key 的文案（或 merge 了别人的分支），
   * apply 会把 plan 里的旧值静默写回去——一次看不见的回退。
   *
   * @returns true 可继续 apply；false 用户取消
   */
  private async confirmNoLocaleDrift(
    plan: GeneratePlan,
    current: Record<string, string>,
    interactive: boolean,
  ): Promise<boolean> {
    if (!plan.localeBaseline) {
      // 旧 plan 无该字段：跳过检查而非拒绝——否则升级工具后所有存量 plan 都作废。
      LoggerUtils.info(
        'ℹ️  Plan 未记录 locale 基线（由旧版本生成），跳过 locale 漂移检查；' +
          '如需该保护请重跑 `generate --dry-run`。',
      );
      return true;
    }

    const baseline = plan.localeBaseline;
    const drifted: Array<{ key: string; before: string | undefined }> = Object.entries(baseline)
      .filter(([key, before]) => current[key] !== before)
      .map(([key, before]) => ({ key, before }));
    // 基线只记「dry-run 当时已存在的 key」。dry-run 之后才被别人新建的同名 key 不在基线里，
    // 只比对基线会让 apply 把它静默覆盖成 plan 的值——与「覆盖既有文案」是同一类回退，
    // 故一并计入：当前 locale 已有该 key 且值与 plan 将写入的值不同即算漂移。
    for (const [key, planned] of Object.entries(plan.localeDelta)) {
      if (Object.prototype.hasOwnProperty.call(baseline, key)) continue;
      if (!Object.prototype.hasOwnProperty.call(current, key)) continue;
      if (current[key] === planned) continue;
      drifted.push({ key, before: undefined });
    }
    if (drifted.length === 0) return true;

    // 措辞按两个分支分开：非交互下这就是「已拒绝」的清单（下方直接抛错），
    // 交互下才是「将覆盖」的清单（用户确认后确实会覆盖）。合用一句「会用 plan 的值覆盖」
    // 会让非交互用户以为覆盖已经发生。
    LoggerUtils.warn(
      interactive
        ? `⚠️  以下 ${drifted.length} 个 key 的 ${this.config.locales.source} 值在 plan 生成后被改动，继续 apply 将用 plan 的值覆盖：`
        : `⚠️  已拒绝 apply：以下 ${drifted.length} 个 key 的 ${this.config.locales.source} 值在 plan 生成后被改动：`,
    );
    for (const { key, before } of drifted) {
      const now = Object.prototype.hasOwnProperty.call(current, key)
        ? `「${current[key]}」`
        : '(已删除)';
      const then = before === undefined ? '(尚不存在)' : `「${before}」`;
      LoggerUtils.warn(
        `   - ${key}: plan 生成时${then}→ plan 将写入「${plan.localeDelta[key] ?? ''}」→ 当前 ${now}`,
      );
    }

    if (!interactive) {
      throw new Error(
        `Plan 生成后 ${drifted.length} 个 locale key 的值已被改动，非交互模式下拒绝 apply（避免静默覆盖）。\n` +
          '👉 请重新运行 `generate --dry-run` 生成新 plan 后再 apply。',
      );
    }
    return InteractiveUtils.promptForGenericConfirmation('仍要用 plan 的值覆盖这些改动吗？');
  }

  /** 读取当前 source locale 全量 key→value（漂移比对与 key 差集统计共用同一份读取）。 */
  private readCurrentSourceLocaleMap(): Record<string, string> {
    const corruptSource = this.langFiles.findCorruptLocale(this.config.locales.source, {
      checkLegacy: true,
    });
    if (corruptSource) {
      throw new Error(
        `语言文件损坏，已中止 generate（无法可靠计算或回放 locale 差集）: ${FileUtils.getRelativePath(corruptSource)}`,
      );
    }
    const localeMap = this.config.buckets
      ? this.langFiles.readBucketedLocaleWithBucketMap().flat
      : this.langFiles.readLocaleFile();
    if (localeMap === null) {
      throw new Error('语言文件读取失败，已中止 generate（无法可靠计算或回放 locale 差集）');
    }
    return localeMap;
  }

  /** 读取 apply 后的 source locale key，用真实磁盘差集生成回放统计。 */
  private readCurrentSourceLocaleKeys(): Set<string> {
    return new Set(Object.keys(this.readCurrentSourceLocaleMap()));
  }
}
