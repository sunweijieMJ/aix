import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import type { FrameworkAdapter } from '../adapters';
import { FileUtils } from '../utils/file-utils';
import { InteractiveUtils } from '../utils/interactive-utils';
import { LoggerUtils } from '../utils/logger';
import {
  collectUsedKeys,
  createKeyNormalizer,
  findStaleTargetKeys,
  matchesDynamicAllowlist,
} from '../utils/source-key-scanner';
import type { LocaleMap, Translations } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';
import { loadJsonDictOrThrow, writeTranslationsFile } from '../utils/json-io';

export interface PruneOptions {
  /** 只预览不删 */
  dryRun: boolean;
  /** 跳过 y/N 确认 */
  ci: boolean;
  /**
   * 是否处于交互会话（CLI 由「未显式 --mode 且非 --ci」推导，见 cli.ts）。
   * 非交互且未 --ci 时 prune 直接报错退出，而不是弹确认——stdin 为常开管道
   * （agent / CI 编排常见）时 inquirer 会无限挂起等输入；stdin 关闭时虽会安全取消，
   * 但「挂起」与「静默取消」都不是非交互调用方想要的行为。默认 true 保持
   * 程序化调用的既有语义（弹确认）。
   */
  interactive?: boolean;
  /**
   * 一并清理「target 有、source 无」的残留 key（doctor 的 stale-target-key）。
   *
   * 默认关：孤儿清理由源码引用判定，证据充分；target-only 残留只说明源侧没有这条 key，
   * 可能是分支间的中间态（源 locale 还没 merge 过来），删掉就是丢译文。要显式 opt-in。
   */
  includeStaleTarget?: boolean;
}

/**
 * 清理孤儿 key：源码已不再引用的 locale key，从所有 locale 文件删除。
 * 与 doctor 的 orphan 判据同一口径（共享 source-key-scanner）。删 source 中文一起删，
 * 恢复靠 git。不动 translations.json/untranslated.json（下次 pick 自动重生）。
 *
 * `--include-stale-target` 额外清理 target-only 残留（判据同 doctor 的 stale-target-key），
 * 只删对应 target 文件、不碰 source 与中间字典。
 */
export class PruneProcessor extends BaseProcessor {
  private readonly options: PruneOptions;

  constructor(
    config: ResolvedConfig,
    isCustom: boolean = false,
    adapter?: FrameworkAdapter,
    options: PruneOptions = { dryRun: false, ci: false },
  ) {
    super(config, isCustom, adapter);
    this.options = options;
  }

  protected getOperationName(): string {
    return '清理孤儿 key';
  }

  async execute(): Promise<void> {
    return this.executeWithLifecycle(() => this.run());
  }

  private async run(): Promise<void> {
    const usedKeys = collectUsedKeys(this.config, this.adapter);
    const sourceLocale = this.config.locales.source;
    // 损坏守卫：桶式与单文件口径不同。
    //   - 单文件：readLocaleFile 对「解析失败」返回 null（与「文件不存在 → {}」区分），下方据此中止。
    //   - 桶式：readLocaleFile 会把损坏桶经 safeLoadJsonFile 静默降级为 {}、永不返回 null，
    //     故 null 守卫对桶式失效。必须用 findCorruptBucketFile 单独探测（与 Pick/Merge 一致），
    //     否则会基于残缺 source 误判孤儿，并把损坏桶静默改名 .bak、源 key 从活跃 locale 消失。
    //
    //   守卫覆盖 source + 所有 target：pruneLocale 会对每个 locale 都删除并整体重写桶文件，
    //   target 桶损坏同样会被静默降级为 {}、命中孤儿后触发重写、损坏桶被改名 .bak 致 key 丢失。
    //   只守 source 会在 target 桶损坏时重蹈上述「静默改名 .bak、key 丢失」的问题。
    // 探测口径（桶式 / 遗留单文件 / 单文件）统一收口于 findCorruptLocale。
    this.langFiles.assertLocalesNotCorrupt([sourceLocale, ...this.config.locales.targets], {
      checkLegacy: true,
      buildMessage: (locale, file) =>
        `locale「${locale}」解析失败：${file}，已中止 prune 以防误判孤儿 / 误删 key。请先修复 JSON 格式。`,
    });
    // 迁移窗口守卫：桶式模式下若存在未迁移的遗留单文件，孤儿判定（readLocaleFile 含遗留
    // 兜底）与删除路径（pruneLocale 只重写桶文件）视图分裂——legacy-only 孤儿报得出来
    // 却删不掉，而下方字典文件清理会真删，落入半清理循环。宁可中止，提示先完成迁移。
    const unmigratedLegacy = this.langFiles.findUnmigratedLegacyLocale([
      sourceLocale,
      ...this.config.locales.targets,
    ]);
    if (unmigratedLegacy) {
      throw new Error(
        `检测到未迁移的遗留语言文件：${unmigratedLegacy}。` +
          `桶式模式下 prune 只重写桶文件、无法清理遗留单文件中的 key；` +
          `请先运行 pick / merge / export 任一命令完成分桶迁移后再执行 prune。`,
      );
    }

    // 守卫已确保 source 非损坏，readLocaleFile 不会返回 null（仅「不存在/空 → {}」或解析结果）。
    const sourceMap = this.langFiles.readLocaleFile(sourceLocale) ?? {};

    // 安全闸：源码扫描到 0 个 key 引用，几乎必然是误配（sourceDir 路径写错 / include 过严 /
    // 目录存在但不含框架文件）。此时所有 locale key 都会被判为孤儿，--ci 下更会跳过确认、
    // 静默清空全部 locale + translations/untranslated.json，恢复只能靠 git。
    // 宁可中止报错也不执行破坏性删除（与本流程「宁可中止不静默破坏」的一贯风格一致）。
    // 放在损坏守卫之后：locale 文件损坏是更确定的数据完整性错误，应优先于「源码扫描空」拦截。
    if (usedKeys.size === 0) {
      throw new Error(
        `源码未扫描到任何 i18n key 引用（sourceDir='${this.config.io.sourceDir}'），` +
          `可能是源目录配置错误或目录不含框架文件；已中止 prune 以防误删全部 locale。`,
      );
    }

    // locale 侧过同一归一（createKeyNormalizer）：i18next 系里源码写 `ns:key`、locale 存
    // 裸 key 是运行时约定，两侧不折算到同一口径会把在用 key 判成孤儿并从所有 locale 删除。
    const normalizeKey = createKeyNormalizer(this.config, this.adapter);
    const orphans = Object.keys(sourceMap).filter(
      (key) => !usedKeys.has(normalizeKey(key)) && !matchesDynamicAllowlist(this.config, key),
    );

    // namespace 闸：不按 namespace 归一的库上（冒号属于 key 自身），源码若写成 `ns:key`
    // 而 locale 存裸 key，两侧对不上 → 在用 key 落进孤儿名单。凡「剥掉引用里首个冒号前缀后
    // 恰好等于该 locale key」的一律保留：多留一个待清理 key 只是噪声，删错则不可逆。
    const nsStrippedRefs = new Set<string>();
    for (const used of usedKeys) {
      const colonIndex = used.indexOf(':');
      if (colonIndex !== -1) nsStrippedRefs.add(used.slice(colonIndex + 1));
    }
    const shielded = orphans.filter((key) => nsStrippedRefs.has(key));
    if (shielded.length > 0) {
      LoggerUtils.warn(
        `⚠️  ${shielded.length} 个 key 未被直接引用，但源码里存在 'ns:${shielded[0]}' 形式的引用，` +
          `已跳过删除；若确为命名空间用法，请在 framework.namespace 中声明后重跑。`,
      );
    }
    const shieldedSet = new Set(shielded);
    const prunable = orphans.filter((key) => !shieldedSet.has(key));

    // target-only 残留（--include-stale-target），判据与 doctor 的 stale-target-key 同源。
    // 两道保守过滤：源码仍在引用的 key（source locale 缺该 key 属于 doctor 的 missing-key，
    // 删掉译文只会让运行时更糟）、以及动态白名单命中的 key，一律保留。
    const staleByTarget = new Map<string, string[]>();
    if (this.options.includeStaleTarget) {
      for (const target of this.config.locales.targets) {
        const targetMap = this.langFiles.readLocaleFile(target) ?? {};
        const stale = findStaleTargetKeys(sourceMap, targetMap).filter(
          (key) => !usedKeys.has(normalizeKey(key)) && !matchesDynamicAllowlist(this.config, key),
        );
        if (stale.length > 0) staleByTarget.set(target, stale);
      }
    }
    const staleTotal = [...staleByTarget.values()].reduce((sum, list) => sum + list.length, 0);

    LoggerUtils.info(
      `🔍 源码引用 ${usedKeys.size} 个 key，source locale 共 ${Object.keys(sourceMap).length} 个`,
    );
    if (prunable.length === 0 && staleTotal === 0) {
      LoggerUtils.success('✅ 没有孤儿 key，无需清理');
      return;
    }
    if (prunable.length > 0) {
      LoggerUtils.info(`🗑️  将删除 ${prunable.length} 个孤儿 key：`);
      PruneProcessor.logKeySample(prunable);
    }
    for (const [target, stale] of staleByTarget) {
      LoggerUtils.info(`🗑️  ${target}: 将删除 ${stale.length} 个 target-only 残留 key：`);
      PruneProcessor.logKeySample(stale);
    }

    if (this.options.dryRun) {
      LoggerUtils.info('🧪 --dry-run：仅预览，未删除');
      return;
    }
    if (!this.options.ci) {
      // 非交互会话不弹确认：prune 是破坏性删除，缺 --ci 视为未获授权，fail-fast 给出
      // 明确指引（与 CLI 对「非交互 ⇒ 绝不碰 inquirer」的整体口径一致，见 cli.ts）。
      if (this.options.interactive === false) {
        throw new Error(
          '非交互模式下 prune 是破坏性删除，需显式传 --ci 确认执行；' +
            '或用 --dry-run 预览将删除的 key，或加 -i 进入交互确认。',
        );
      }
      const ok = await InteractiveUtils.promptForGenericConfirmation(
        staleTotal > 0
          ? `确认删除这 ${prunable.length} 个孤儿 key（所有 locale）与 ${staleTotal} 个 target-only 残留 key？`
          : `确认从所有 locale 删除这 ${prunable.length} 个孤儿 key？`,
      );
      if (!ok) {
        this.cancelled = true;
        LoggerUtils.warn('操作已取消');
        return;
      }
    }

    const orphanSet = new Set(prunable);
    const locales = [sourceLocale, ...this.config.locales.targets];
    for (const locale of locales) {
      // 残留 key 只在其所属 target 文件里删：它们按定义不存在于 source，
      // 也不进中间字典的清理集合。
      const stale = staleByTarget.get(locale);
      this.pruneLocale(locale, stale ? new Set([...orphanSet, ...stale]) : orphanSet);
    }

    // 中间字典文件（translations.json / untranslated.json）里的孤儿也一并删除，
    // 与 locale 保持一致，避免遗留半清理状态（不依赖事后再跑 pick 自愈）。
    this.pruneDictionaryFile(FileUtils.getTranslatedPath(this.config, this.isCustom), orphanSet);
    this.pruneDictionaryFile(FileUtils.getUntranslatedPath(this.config, this.isCustom), orphanSet);
  }

  /** 清单打印：最多列前 20 条，其余折叠成一行计数（孤儿与 target-only 残留同款）。 */
  private static logKeySample(keys: string[]): void {
    keys.slice(0, 20).forEach((k) => LoggerUtils.info(`   - ${k}`));
    if (keys.length > 20) LoggerUtils.info(`   … 其余 ${keys.length - 20} 个`);
  }

  /**
   * 从一个 key→value 映射中删除孤儿 key，返回实际删除数。
   * 用 hasOwnProperty.call 而非 `in`：`in` 走原型链，孤儿 key 恰为 'constructor'/
   * 'toString' 等 Object.prototype 同名成员时会假命中，虚增计数并触发无谓重写。
   * 与 Doctor/GenerateProcessor.writePlan 的口径一致。可选 secondary 用于桶式布局里
   * 同步删除 keyBucketMap（仅当主表命中时才删，保持计数以主表为准）。
   */
  private static deleteOwnKeys(
    primary: Record<string, unknown>,
    orphanSet: Set<string>,
    secondary?: Record<string, unknown>,
  ): number {
    let removed = 0;
    for (const k of orphanSet) {
      if (Object.prototype.hasOwnProperty.call(primary, k)) {
        delete primary[k];
        if (secondary) delete secondary[k];
        removed++;
      }
    }
    return removed;
  }

  /** 从 translations.json / untranslated.json（{key: {locale: value}} 字典）删除孤儿 key。 */
  private pruneDictionaryFile(filePath: string, orphanSet: Set<string>): void {
    if (!fs.existsSync(filePath)) return;
    // 严格读取：silent 降级会把损坏字典当 {}，此后 removed===0 直接 return，prune 报「无需清理」
    // 以 exit 0 收尾——损坏的在途译文文件被无声放过，与 csv-import / pick 的 strict 口径不一致。
    const data = loadJsonDictOrThrow<Translations>(
      filePath,
      (p) =>
        `字典文件解析失败（JSON 格式损坏）: ${p}\n` +
        '👉 为防止把损坏字典误判为「无孤儿可清理」而伪报成功，已中止 prune。请先修复该文件的 JSON 格式后重试。',
    );
    const removed = PruneProcessor.deleteOwnKeys(data, orphanSet);
    if (removed === 0) return;
    writeTranslationsFile(filePath, data, this.config.io.indent);
    LoggerUtils.success(`✅ ${path.basename(filePath)}: 删除 ${removed} 个 key`);
  }

  /** 从单个 locale 删除孤儿 key 并写回（桶式复用既有桶写 + 孤儿桶清理）。 */
  private pruneLocale(locale: string, orphanSet: Set<string>): void {
    if (this.config.buckets) {
      const { flat, keyBucketMap } = this.langFiles.readBucketedLocaleWithBucketMap(locale);
      const removed = PruneProcessor.deleteOwnKeys(flat, orphanSet, keyBucketMap);
      if (removed === 0) return;
      this.langFiles.writeLocaleFile(flat, locale, keyBucketMap);
      LoggerUtils.success(`✅ ${locale}: 删除 ${removed} 个 key`);
      return;
    }

    const map: LocaleMap = this.langFiles.readLocaleFile(locale) ?? {};
    const removed = PruneProcessor.deleteOwnKeys(map, orphanSet);
    if (removed === 0) return;
    this.langFiles.writeLocaleFile(map, locale);
    LoggerUtils.success(`✅ ${locale}: 删除 ${removed} 个 key`);
  }
}
