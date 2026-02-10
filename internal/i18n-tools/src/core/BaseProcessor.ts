import type { ResolvedConfig } from '../config';
import { FileUtils } from '../utils/file-utils';
import { LoggerUtils } from '../utils/logger';

/**
 * i18n处理器基础类
 * 提供所有i18n脚本的通用功能和配置
 *
 * 构造函数注入 ResolvedConfig，不再使用硬编码路径
 */
export abstract class BaseProcessor {
  /** 已解析的配置 */
  protected config: ResolvedConfig;
  /** 是否为定制目录 */
  protected isCustom: boolean;
  /** 工作目录路径 */
  protected workingDir: string;
  /** 编译目录路径 */
  protected compileDir: string;

  /**
   * 构造函数
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   */
  constructor(config: ResolvedConfig, isCustom: boolean = false) {
    this.config = config;
    this.isCustom = isCustom;
    this.workingDir = FileUtils.getDirectoryPath(config, isCustom);
    this.compileDir = FileUtils.getCompileDir(config, isCustom);
  }

  /**
   * 获取目录类型描述
   * @returns 目录类型描述
   */
  protected getDirectoryDescription(): string {
    return this.isCustom ? '定制目录' : '主目录';
  }

  /**
   * 记录操作开始
   * @param operation - 操作名称
   */
  protected logOperationStart(operation: string): void {
    LoggerUtils.info(`🚀 开始${operation} (${this.getDirectoryDescription()})`);
    LoggerUtils.info(`📂 工作目录: ${this.workingDir}`);
  }

  /**
   * 记录操作完成
   * @param operation - 操作名称
   */
  protected logOperationComplete(operation: string): void {
    LoggerUtils.success(
      `✅ ${operation}完成 (${this.getDirectoryDescription()})`,
    );
  }

  /**
   * 记录错误信息
   * @param operation - 操作名称
   * @param error - 错误信息
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
    FileUtils.ensureDirectoryExists(this.compileDir);
  }

  /**
   * 模板方法：执行处理器的主要逻辑，包含日志和错误处理
   */
  public async execute(...args: any[]): Promise<void> {
    const operationName = this.getOperationName();
    this.logOperationStart(operationName);
    try {
      await this._execute(...args);
      this.logOperationComplete(operationName);
    } catch (error) {
      this.logError(operationName, error);
      throw error;
    }
  }

  /**
   * 抽象方法：获取操作的名称，用于日志输出
   */
  protected abstract getOperationName(): string;

  /**
   * 抽象方法：执行具体的处理逻辑
   */
  protected abstract _execute(...args: any[]): Promise<void> | void;
}
