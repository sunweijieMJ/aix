import type { ResolvedConfig } from '../config';
import { FileUtils } from '../utils/file-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import { RunReport, type CoverageMetric } from '../utils/run-report';
import { ensureDirectoryExists } from '../utils/json-io';

/**
 * 不依赖框架适配器的处理器基类
 *
 * 提供 config / 工作目录 / 日志 / 生命周期等通用能力。仅做 locale 文件读写、
 * 翻译流程编排等纯 IO 操作的处理器（Export / Merge / Pick / Translate / Automatic）
 * 应继承本类，避免被强制构造完整的 AST 策略链。
 *
 * 需要 AST 解析能力的处理器（Generate / Restore）请改继承 BaseProcessor。
 */
export abstract class FileProcessor {
  /** 已解析的配置 */
  protected config: ResolvedConfig;
  /** 是否为定制目录 */
  protected isCustom: boolean;
  /** 工作目录路径 */
  protected workingDir: string;
  /**
   * 运行期失败收集器。
   *
   * 各 Processor 在失败分支调 `this.report.addFailure(...)` 即可；
   * executeWithLifecycle 收尾会自动在出现失败 / 告警 / 人工待办时落盘到
   * `<rootDir>/.i18n-tools/logs/`，并把绝对路径打到控制台。
   */
  protected report: RunReport;
  /**
   * 绑定到本 processor 的 (config, isCustom) 的语言文件读写入口。
   *
   * 与 workingDir 同源：`(config, isCustom)` 唯一决定读写哪个目录，这里一次绑定，
   * 各 processor 不再逐调用透传 isCustom（传错会静默读写到另一个目录）。
   * 需要同时操作基础目录与定制目录的场景（ExportProcessor 的 base/custom 合并）
   * 应显式 `new LanguageFileManager(config, true/false)`，不要复用本字段。
   */
  protected langFiles: LanguageFileManager;

  constructor(config: ResolvedConfig, isCustom: boolean = false) {
    this.config = config;
    this.isCustom = isCustom;
    this.workingDir = FileUtils.getDirectoryPath(config, isCustom);
    this.report = new RunReport(this.getCommandName(), config.root);
    this.langFiles = new LanguageFileManager(config, isCustom);
  }

  /**
   * 从类名推导出 kebab-case 命令名（GenerateProcessor → "generate"，
   * CsvExportProcessor → "csv-export"），用于运行报告文件名。
   * 子类无需关心；如有特殊命名可重写。
   *
   * 必须断驼峰（而非只 toLowerCase）：报告文件名是用户排障时唯一的定位线索，须与他
   * 看到的 CLI mode 名（`--mode csv-export`）逐字一致；连写形态与任何 mode 名都对不上。
   */
  protected getCommandName(): string {
    return this.constructor.name
      .replace(/Processor$/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase();
  }

  /**
   * 对外只读暴露本次运行的覆盖率指标（仅 generate / automatic 流程会填充）。
   * CLI 拿到后可与 --coverage-threshold 比较，决定退出码。
   *
   * 这里把 protected report 通过显式 getter 暴露 metric，而不是把整个 report
   * 改成 public——避免外部直接 addFailure/addWarning 破坏报告语义。
   */
  getCoverage(): CoverageMetric | undefined {
    return this.report.getCoverage();
  }

  /**
   * 翻译字典条目的形态守卫：loadJsonDictOrThrow 只保证整体 JSON 合法，不保证每条 entry
   * 是对象。手工把某条改成 null / 字符串后，`entry[locale]` 会抛不带文件与 key 上下文的
   * TypeError。非对象即带 key 名告警并返回 false（调用方跳过），与 csv-export / csv-import
   * 的「非对象条目告警跳过」同口径。
   */
  protected static isEntryObject(key: string, entry: unknown): boolean {
    if (entry !== null && typeof entry === 'object') return true;
    LoggerUtils.warn(`⚠️  跳过形态非法的条目（值不是对象）: ${key}`);
    return false;
  }

  /**
   * 获取目录类型描述
   */
  protected getDirectoryDescription(): string {
    return this.isCustom ? '定制目录' : '主目录';
  }

  /**
   * 记录操作开始
   */
  protected logOperationStart(operation: string): void {
    LoggerUtils.info(`🚀 开始${operation} (${this.getDirectoryDescription()})`);
    LoggerUtils.info(`📂 工作目录: ${this.workingDir}`);
  }

  /**
   * 记录操作完成
   */
  protected logOperationComplete(operation: string): void {
    LoggerUtils.success(`✅ ${operation}完成 (${this.getDirectoryDescription()})`);
  }

  /**
   * 记录错误信息
   */
  protected logError(operation: string, error: unknown): void {
    const context = `${operation}失败 (${this.getDirectoryDescription()})`;
    LoggerUtils.error(context, error);
  }

  /**
   * 确保工作目录存在
   */
  protected ensureWorkingDirectory(): void {
    ensureDirectoryExists(this.workingDir);
  }

  /**
   * 用户在交互确认中选择了取消。子类在取消分支置位后 return，收尾改打「已取消」——
   * 否则 executeWithLifecycle 照常打「✅ …完成」，取消的破坏性操作被 SUCCESS 收尾
   * 会误导人与 CI 判读（看日志以为删除已执行）。退出码保持 0：取消是用户选择，不是失败。
   */
  protected cancelled = false;

  /**
   * 本次运行有失败、但不足以中止（如 translate 部分批次失败，其余已落盘、可重跑续做）。
   * 与 cancelled 同款契约：置位后收尾改打告警而非「✅ …完成」，退出码仍为 0——
   * 否则 grep SUCCESS 的 CI 会把「翻了一半、剩下全挂」判成绿。
   */
  protected partiallyFailed = false;

  /**
   * 本次运行是否「部分失败」。供编排型 processor（AutomaticProcessor）在子步骤跑完后
   * 聚合置位：子步骤各自持有独立实例与 report，不读回这个状态，整条工作流会以
   * 「✅ 完成」收尾，掩盖掉某一步只做了一半的事实。
   */
  isPartiallyFailed(): boolean {
    return this.partiallyFailed;
  }

  /**
   * 模板方法：包装子类逻辑，提供日志和错误处理
   */
  protected async executeWithLifecycle(fn: () => Promise<void> | void): Promise<void> {
    const operationName = this.getOperationName();
    this.logOperationStart(operationName);
    try {
      await fn();
      if (this.cancelled) {
        LoggerUtils.warn(`⚠️ ${operationName}已取消，未做任何修改`);
      } else if (this.partiallyFailed) {
        LoggerUtils.warn(`⚠️ ${operationName}部分失败（详见上方汇总），可重新运行续做`);
      } else {
        this.logOperationComplete(operationName);
      }
    } catch (error) {
      this.logError(operationName, error);
      throw error;
    } finally {
      // 不论成功或失败都尝试 flush：RunReport.flush 内部判断有无 failure/warning/人工待办，
      // 三者皆无时不写盘，所以真正干净的成功路径零产物。
      const reportPath = this.report.flush();
      if (reportPath) {
        // flush 的落盘条件比「有失败」宽（warning / 人工待办也写），文案必须跟着分档：
        // 一次只有告警的成功运行打「失败报告已写入」会让人误判本次跑挂了。
        if (this.report.hasFailures()) {
          LoggerUtils.warn(`📝 失败报告已写入: ${reportPath}`);
        } else {
          LoggerUtils.info(`📝 运行报告已写入: ${reportPath}`);
        }
      }
    }
  }

  /**
   * 抽象方法：获取操作的名称，用于日志输出
   */
  protected abstract getOperationName(): string;
}
