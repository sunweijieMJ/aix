import path from 'path';
import { FileUtils } from './file-utils';

/**
 * 失败发生的阶段（与三个 Processor 内已有的失败分支一一对应）：
 * - transform：Generate 的 AST 转换失败
 * - write：    Generate 的源码写盘失败
 * - translate：Translate 的批次翻译失败
 * - restore：  Restore 的单文件还原失败
 */
export type FailureStage = 'transform' | 'write' | 'translate' | 'restore';

/**
 * 落盘的失败记录条目。
 *
 * 错误字段只保留 `name + message`，与 LoggerUtils.error 的安全策略一致：
 * OpenAI / Axios 等 SDK 抛出的对象可能在序列化时带出 URL token / Authorization
 * header，不能整对象写盘。`stack` 同样不落盘——一旦后续需要保留 stack 可单独
 * 加一个 `--debug` 开关，但首版不引入这条风险面。
 */
export interface FailureRecord {
  stage: FailureStage;
  file?: string;
  batchIndex?: number;
  keys?: string[];
  error: {
    name: string;
    message: string;
  };
}

/**
 * 单次运行的失败收集器。
 *
 * 设计原则：
 * 1. 只在出现失败时写盘（hasFailures() === false 直接返回，不产生空文件）。
 * 2. 默认落到 `<rootDir>/node_modules/.cache/i18n-tools/`，沿用 npm 生态对工具
 *    cache 的约定位置；该目录天然在 `.gitignore` 范围内，无需工具侵入业务侧。
 * 3. 错误字段统一走 safe-extract，避免泄露凭据。
 * 4. 文件名带时间戳 + command + pid，避免并发运行互相覆盖。
 */
export class RunReport {
  private failures: FailureRecord[] = [];
  private warnings: string[] = [];

  constructor(
    private readonly command: string,
    private readonly rootDir: string,
  ) {}

  addFailure(record: Omit<FailureRecord, 'error'> & { error: unknown }): void {
    this.failures.push({
      ...record,
      error: RunReport.safeExtractError(record.error),
    });
  }

  addWarning(message: string): void {
    this.warnings.push(message);
  }

  hasFailures(): boolean {
    return this.failures.length > 0;
  }

  /**
   * 写入失败报告到磁盘，返回绝对路径；没有失败时返回 null（不落盘）。
   * 写入失败不向上抛错——日志体系不应放大主流程的错误面。
   */
  flush(): string | null {
    if (!this.hasFailures()) return null;
    try {
      const dir = path.join(this.rootDir, 'node_modules', '.cache', 'i18n-tools');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(dir, `run-${timestamp}-${this.command}-${process.pid}.json`);
      const payload = {
        command: this.command,
        finishedAt: new Date().toISOString(),
        rootDir: this.rootDir,
        summary: {
          failed: this.failures.length,
          warnings: this.warnings.length,
        },
        failures: this.failures,
        warnings: this.warnings,
      };
      FileUtils.writeJsonFile(filePath, payload);
      return filePath;
    } catch {
      // 写报告本身失败不应破坏主流程；调用方已经通过 console 看到原始错误，
      // 这里再吞掉即可。
      return null;
    }
  }

  private static safeExtractError(error: unknown): FailureRecord['error'] {
    if (error instanceof Error) {
      return { name: error.name, message: error.message };
    }
    if (typeof error === 'string') {
      return { name: 'StringError', message: error };
    }
    return { name: 'NonError', message: Object.prototype.toString.call(error) };
  }
}
