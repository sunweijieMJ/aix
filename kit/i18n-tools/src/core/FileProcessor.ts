import type { ResolvedConfig } from '../config';
import { FileUtils } from '../utils/file-utils';
import { LoggerUtils } from '../utils/logger';
import { RunReport } from '../utils/run-report';

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
   * executeWithLifecycle 收尾会自动在出现失败时落盘到
   * `<rootDir>/node_modules/.cache/i18n-tools/`，并把绝对路径打到 stderr。
   */
  protected report: RunReport;

  constructor(config: ResolvedConfig, isCustom: boolean = false) {
    this.config = config;
    this.isCustom = isCustom;
    this.workingDir = FileUtils.getDirectoryPath(config, isCustom);
    this.report = new RunReport(this.getCommandName(), config.rootDir);
  }

  /**
   * 从类名推导出 kebab-case 命令名（如 GenerateProcessor → "generate"），
   * 用于失败报告文件名。子类无需关心；如有特殊命名可重写。
   */
  protected getCommandName(): string {
    return this.constructor.name.replace(/Processor$/, '').toLowerCase();
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
    FileUtils.ensureDirectoryExists(this.workingDir);
  }

  /**
   * 模板方法：包装子类逻辑，提供日志和错误处理
   */
  protected async executeWithLifecycle(fn: () => Promise<void> | void): Promise<void> {
    const operationName = this.getOperationName();
    this.logOperationStart(operationName);
    try {
      await fn();
      this.logOperationComplete(operationName);
    } catch (error) {
      this.logError(operationName, error);
      throw error;
    } finally {
      // 不论成功或失败都尝试 flush：RunReport.flush 内部判断 hasFailures，
      // 没有失败时不写盘，所以成功路径零产物。
      const reportPath = this.report.flush();
      if (reportPath) {
        LoggerUtils.warn(`📝 失败报告已写入: ${reportPath}`);
      }
    }
  }

  /**
   * 抽象方法：获取操作的名称，用于日志输出
   */
  protected abstract getOperationName(): string;
}
