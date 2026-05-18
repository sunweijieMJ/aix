import fs from 'fs';
import type { ResolvedConfig } from '../config';
import type { FrameworkAdapter } from '../adapters';
import { CommonASTUtils } from '../utils/common-ast-utils';
import { FileUtils } from '../utils/file-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { type LinterFinding, LocaleValueLinter } from '../utils/locale-value-linter';
import { LoggerUtils } from '../utils/logger';
import type { LocaleMap } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';

/**
 * Doctor 单条发现（聚合 LinterFinding + 自身新增的对账类发现）。
 *
 * 之所以另起一个类型而不是直接用 LinterFinding：
 *  - 对账类发现（orphan / missing / untranslated）没有 ManualCategory 对应，
 *    沿用 ManualCategory 会污染语义；
 *  - doctor 需要一个 severity 字段决定 CI 退出码（缺失 key = error，
 *    孤儿 key = warning，语义重复 = info）。
 */
export type DoctorSeverity = 'error' | 'warning' | 'info';

export type DoctorCategory =
  /** locale-value-linter 已有的所有 ManualCategory */
  | 'locale-lint'
  /** 源码 t() 引用了不存在的 key（运行时会显示 key 字符串） */
  | 'missing-key'
  /** locale 中有 key 但源码无引用 */
  | 'orphan-key'
  /** target locale 的 value 与 source 相同（疑似未翻译） */
  | 'untranslated';

export interface DoctorFinding {
  category: DoctorCategory;
  severity: DoctorSeverity;
  title: string;
  details: string[];
  /** locale key 或源码定位锚点 */
  key: string;
  file?: string;
  line?: number;
  column?: number;
}

/**
 * `i18n-tools --mode doctor` 命令的处理器。
 *
 * 设计原则：
 *  - 「只读默认」：doctor 永远不主动修改文件，避免一行 doctor 命令把语言文件改坏
 *  - 严格 CI 友好：所有发现按 severity 区分，--ci 模式下只有 error 才退出非零
 *  - 复用 LocaleValueLinter.analyze 拿结构化结果，doctor 自己只新增三类对账
 *
 * 三类对账（核心价值，linter 都不做）：
 *  - missing-key  : 源码 t() 引用了 locale 不存在的 key → error（运行时缺译）
 *  - orphan-key   : locale 有 key 但源码不引用 → warning（清理候选）
 *  - untranslated : target value 与 source value 完全相同 → warning（疑似漏译）
 */
export class DoctorProcessor extends BaseProcessor {
  /** 是否启用 CI 模式（有 error 退出非零）*/
  private ciMode: boolean;

  /**
   * 暂存 runLinter 一次性产出的原始 LinterFinding[]，供 recordToReport 写入 report。
   *
   * Why: LocaleValueLinter.analyze 内部会消费 CommonASTUtils.drainSkippedComparisonOperands，
   * 是「一次性」操作（见 locale-value-linter.ts 同名注释）。如果 recordToReport 再次调用
   * analyze 重建 findings，hardcoded-comparison（doctor 唯一的 error-tier lint 类别）会
   * 因为 drain 已空而漏入 report，CI 门禁失效。
   */
  private linterFindings: LinterFinding[] = [];

  constructor(
    config: ResolvedConfig,
    isCustom: boolean = false,
    adapter?: FrameworkAdapter,
    options: { ci?: boolean } = {},
  ) {
    super(config, isCustom, adapter);
    this.ciMode = Boolean(options.ci);
  }

  protected getOperationName(): string {
    return '语言文件健康检查';
  }

  async execute(): Promise<void> {
    return this.executeWithLifecycle(() => this._execute());
  }

  private async _execute(): Promise<void> {
    const findings: DoctorFinding[] = [];

    // 1. locale value 结构性检查（复用 linter）
    const sourceMap =
      LanguageFileManager.readLocaleFile(this.config, this.isCustom, this.config.locales.source) ??
      {};

    findings.push(...this.runLinter(sourceMap));

    // 2. 三类对账：依赖源码扫描得到的 key 引用集合
    const sourceKeys = this.collectUsedKeysFromSources();
    findings.push(...this.checkMissingKeys(sourceKeys, sourceMap));
    findings.push(...this.checkOrphanKeys(sourceKeys, sourceMap));

    // 多 target untranslated 对账：每个 target 独立检查
    for (const target of this.config.locales.targets) {
      const targetMap =
        LanguageFileManager.readLocaleFile(this.config, this.isCustom, target) ?? {};
      findings.push(...this.checkUntranslated(sourceMap, targetMap, target));
    }

    this.renderConsole(findings);
    this.recordToReport(findings);

    if (this.ciMode) {
      const errors = findings.filter((f) => f.severity === 'error').length;
      if (errors > 0) {
        LoggerUtils.error(`❌ Doctor 发现 ${errors} 个 error 级问题，CI 模式以退出码 1 结束`);
        // executeWithLifecycle 会捕获并 flush report；这里抛错而非 process.exit，
        // 保持与其他 Processor 一致的错误处理路径。
        throw new Error(`Doctor CI check failed: ${errors} error(s)`);
      }
    }
  }

  /** LocaleValueLinter.analyze → DoctorFinding（严重级别全部归 info） */
  private runLinter(sourceMap: LocaleMap): DoctorFinding[] {
    const lintFindings = LocaleValueLinter.analyze(sourceMap, {
      separator: this.config.keys.separator,
    });
    // 暂存供 recordToReport 使用，避免再次调用 analyze 触发 drain 后丢失
    // hardcoded-comparison findings（见字段注释）
    this.linterFindings = lintFindings;
    return lintFindings.map((f: LinterFinding) => ({
      category: 'locale-lint',
      // hardcoded-comparison 是 error 候选（运行时切语言后业务逻辑会失效），
      // 其它 lint 发现都仅为 info——不阻塞业务。
      severity: f.category === 'hardcoded-comparison' ? 'warning' : 'info',
      title: `[${f.category}] ${f.title}`,
      details: f.details,
      key: f.key,
      file: f.file,
      line: f.line,
      column: f.column,
    }));
  }

  /**
   * 扫描 source 目录下所有源文件，抽出所有 t() / $t() 调用使用的字面量 key。
   *
   * 与 IdReuseResolver.scanExistingCallsInSources 共用同一套正则，但意图不同：
   *  - 那里收集 existingIds 用于避免新 key 与硬编码冲突
   *  - 这里收集已使用 key 集合用于做 missing / orphan 对账
   *
   * 重复抽出一份逻辑（而非提取共用工具）的原因：本方法返回 Set<string>，
   * 与 IdReuseResolver 内部累积 Set + counter 状态不兼容，强行复用会让接口
   * 多一个无意义的 reset 方法。重复 ~10 行简单正则匹配是合理代价。
   */
  private collectUsedKeysFromSources(): Set<string> {
    const used = new Set<string>();
    const files = FileUtils.getFrameworkFiles(
      this.config.io.sourceDir,
      this.adapter.getSupportedExtensions(),
      this.config.io.exclude,
      this.config.io.include,
      this.config.root,
    );
    const i18nKeyPattern = /(?:\$t|(?<!\w)t)\s*\(\s*['"]([^'"]+)['"]/g;
    for (const filePath of files) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        // 剥除注释，避免被注释掉的示例代码（如 // text: t('foo.bar')）被当成
        // 真实引用统计，进而误报 missing-key。stripComments 保留字符串字面量
        // 内容，正则仍可正确捕获 t('key') 中的 key。
        const content = CommonASTUtils.stripComments(raw);
        let match: RegExpExecArray | null;
        while ((match = i18nKeyPattern.exec(content)) !== null) {
          if (match[1]) used.add(match[1]);
        }
      } catch {
        /* 读取失败的文件跳过，不影响其他文件的扫描结果 */
      }
    }
    return used;
  }

  /**
   * missing-key：源码 t('xxx') 引用了 locale 不存在的 key。
   *
   * 这是最严重的问题（运行时会显示 'xxx' 字符串而非翻译），归 error 级。
   * 业务上等价于"代码已经发布、但翻译还没准备好"——CI 应该卡住直到补全。
   */
  private checkMissingKeys(sourceKeys: Set<string>, sourceMap: LocaleMap): DoctorFinding[] {
    const findings: DoctorFinding[] = [];
    for (const key of sourceKeys) {
      if (this.matchesDynamicAllowlist(key)) continue;
      // 动态 key 场景：源码可能是 t(prefix + variable)，工具看到的字面量是 prefix
      // 之类的不完整 key。这里只对"完全等于 locale key"的字面量做严格匹配，
      // 否则会对所有动态 t() 调用噪声报警。
      if (!(key in sourceMap)) {
        findings.push({
          category: 'missing-key',
          severity: 'error',
          title: `源码调用 t('${key}') 但 locale 不存在该 key`,
          details: [
            `语言: ${this.config.locales.source}`,
            '运行时会显示 key 字符串而非翻译，建议补全或修正 key 名',
          ],
          key,
        });
      }
    }
    return findings;
  }

  /**
   * 判定一个 key 是否匹配 keys.dynamicKeyAllowlist。
   * 命中后跳过 missing-key / orphan-key 判定（用户已声明此前缀来自动态拼接）。
   */
  private matchesDynamicAllowlist(key: string): boolean {
    const list = this.config.keys.dynamicKeyAllowlist;
    if (list.length === 0) return false;
    for (const pattern of list) {
      if (typeof pattern === 'string') {
        if (key.startsWith(pattern)) return true;
      } else {
        if (pattern.test(key)) return true;
      }
    }
    return false;
  }

  /**
   * orphan-key：locale 中有 key 但源码不引用。归 warning 级（清理候选）。
   *
   * 同样受动态 key 限制：源码用 t(prefix + variable) 时静态扫描看不到对应
   * 字面量，可能误报。所以默认只列出来不自动删，--fix 流程在后续版本提供。
   */
  private checkOrphanKeys(sourceKeys: Set<string>, sourceMap: LocaleMap): DoctorFinding[] {
    const findings: DoctorFinding[] = [];
    for (const key of Object.keys(sourceMap)) {
      if (this.matchesDynamicAllowlist(key)) continue;
      if (!sourceKeys.has(key)) {
        findings.push({
          category: 'orphan-key',
          severity: 'warning',
          title: `${key} (源码无 t()/$t() 引用)`,
          details: [
            `value: ${this.preview(sourceMap[key]!)}`,
            '可能由动态 key 引用（如 t(prefix + name)），删除前请人工确认',
          ],
          key,
        });
      }
    }
    return findings;
  }

  /**
   * untranslated：target locale 的 value 与 source 完全相同（疑似漏译）。
   *
   * 三种情况会"故意"让 target = source（不应报警）：
   *  1. 中英文混合的纯标识符（如 "TCP/IP"、"API"），合理的策略就是不翻译
   *  2. 数字、符号、占位符（纯模板 "{count}"）
   *  3. 用户已显式标记"无需翻译"——目前无机制，未来可加 noTranslate 配置
   *
   * 当前实现：value 含中文字符 + target = source → 视为漏译候选。能过滤掉
   * 大部分纯英文/纯符号场景。
   */
  private checkUntranslated(
    sourceMap: LocaleMap,
    targetMap: LocaleMap,
    target: string,
  ): DoctorFinding[] {
    const chineseRegex = /[一-鿿]/;
    const findings: DoctorFinding[] = [];
    const skipPredicate = this.config.keys.skip;
    for (const [key, sourceValue] of Object.entries(sourceMap)) {
      const targetValue = targetMap[key];
      if (targetValue === undefined) continue; // 缺译归 missing 类，不重复报
      if (typeof sourceValue !== 'string' || typeof targetValue !== 'string') continue;
      if (!chineseRegex.test(sourceValue)) continue; // 源 value 无中文 → 不参与判定
      if (skipPredicate && skipPredicate(key, sourceValue)) continue;
      if (sourceValue === targetValue) {
        findings.push({
          category: 'untranslated',
          severity: 'warning',
          title: `${key} (${target} 与 ${this.config.locales.source} 完全相同)`,
          details: [
            `source: ${this.preview(sourceValue)}`,
            `target [${target}]: ${this.preview(targetValue)}`,
            '疑似 translate 阶段漏处理；运行 `--mode translate` 重跑或人工补译',
          ],
          key,
        });
      }
    }
    return findings;
  }

  /** 控制台分组渲染：按 severity 倒序展开，CI 友好 */
  private renderConsole(findings: DoctorFinding[]): void {
    if (findings.length === 0) {
      LoggerUtils.success('✅ Doctor 检查通过，未发现问题');
      return;
    }

    const counts = {
      error: findings.filter((f) => f.severity === 'error').length,
      warning: findings.filter((f) => f.severity === 'warning').length,
      info: findings.filter((f) => f.severity === 'info').length,
    };

    LoggerUtils.info('');
    LoggerUtils.info('🩺 Doctor 检查结果');
    LoggerUtils.info('────────────────────────────────────');
    LoggerUtils.info(`  错误      ${counts.error}`);
    LoggerUtils.info(`  警告      ${counts.warning}`);
    LoggerUtils.info(`  提示      ${counts.info}`);
    LoggerUtils.info('────────────────────────────────────');

    const byCategory = new Map<DoctorCategory, DoctorFinding[]>();
    for (const f of findings) {
      if (!byCategory.has(f.category)) byCategory.set(f.category, []);
      byCategory.get(f.category)!.push(f);
    }

    for (const [category, list] of byCategory) {
      const icon =
        list[0]!.severity === 'error' ? '🚨' : list[0]!.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
      LoggerUtils.info('');
      LoggerUtils.info(`${icon} [${category}] 共 ${list.length} 条`);
      for (const f of list) {
        LoggerUtils.info(`   • ${f.title}`);
        for (const line of f.details) LoggerUtils.info(`     ${line}`);
      }
    }
    LoggerUtils.info('');
  }

  /**
   * 把发现写入 RunReport.needsManual。doctor 自身的对账类发现不属于
   * ManualCategory 的范畴，统一映射成一个 reason 字符串放进去——优先级低于
   * generate 流程产生的 ManualEntry（generate 的更具体）。
   *
   * 注意：locale-lint 类发现已经由 LocaleValueLinter.emit 接管时统一调用
   * report.addManualEntry，这里只处理 doctor 自己产生的三类对账，避免重复。
   */
  private recordToReport(findings: DoctorFinding[]): void {
    // 直接复用 runLinter 暂存的原始 LinterFinding[]，不要二次 analyze ——
    // analyze 内部 drain 的 skippedComparisonOperands 已被首次调用清空，
    // 重跑会丢失 hardcoded-comparison（doctor 唯一 error-tier lint 类别）。
    if (this.linterFindings.length > 0) {
      LocaleValueLinter.emit(this.linterFindings, { console: false, report: this.report });
    }

    // 对账类发现：直接写为 warnings（不是 ManualCategory，避免污染）
    const accountingMap: Record<Exclude<DoctorCategory, 'locale-lint'>, string> = {
      'missing-key': '源码引用的 key 在 locale 中缺失',
      'orphan-key': 'locale 中的 key 源码未引用',
      untranslated: '疑似未翻译（target = source）',
    };
    for (const f of findings) {
      if (f.category === 'locale-lint') continue;
      const reason = accountingMap[f.category];
      this.report.addWarning(`[${f.category}] ${f.key}: ${reason}`);
    }
  }

  private preview(value: string): string {
    const single = value.replace(/\s+/g, ' ').trim();
    return single.length > 80 ? `${single.slice(0, 80)}…` : single;
  }
}
