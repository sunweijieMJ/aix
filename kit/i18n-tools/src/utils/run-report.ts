import fs from 'fs';
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
 * 单次运行的失败 / 警告收集器。
 *
 * 设计原则：
 * 1. 出现失败或警告即写盘；都没有时返回 null，不产生空文件。
 * 2. 落盘位置：`<rootDir>/.i18n-tools/logs/`。
 *
 *    旧版用 `node_modules/.cache/i18n-tools/`，看似省事（自动 gitignore），但
 *    `.cache/` 语义是「可丢弃的增量缓存」（ESLint / Babel / webpack 都按这语义
 *    用），与「诊断报告应该在 rm -rf node_modules 后仍保留」相悖，且 CI 缓存
 *    策略通常会按 lockfile hash 失效掉 node_modules 缓存。
 *
 *    迁到 `.i18n-tools/logs/` 后，对齐 .next/ / .turbo/ / .vite/ 等工具的根目录
 *    自有命名空间约定：用户在项目根一眼能找到，grep / 分享 / CI artifact 上传
 *    都方便。首次落盘时自动写一份 `.i18n-tools/.gitignore`（内容 `*`）保持
 *    自包含——不侵入业务的根 `.gitignore`，也避免日志意外入库。
 *
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

  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  /**
   * 写入诊断报告到磁盘，返回绝对路径；无失败 + 无警告时返回 null（不落盘）。
   * 写入失败不向上抛错——日志体系不应放大主流程的错误面。
   */
  flush(): string | null {
    if (!this.hasFailures() && !this.hasWarnings()) return null;
    try {
      const baseDir = path.join(this.rootDir, '.i18n-tools');
      const logsDir = path.join(baseDir, 'logs');
      // 写 self-contained .gitignore，确保整个 .i18n-tools/ 不被业务侧无意中
      // 提交。幂等：已存在则跳过，避免每次跑都改 mtime 触发其他工具的 watcher。
      RunReport.ensureGitignore(baseDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(logsDir, `run-${timestamp}-${this.command}-${process.pid}.json`);
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

  /**
   * 在 `.i18n-tools/` 写一份 `.gitignore`（内容 `*`），让整个目录自动被忽略。
   *
   * 已存在时不覆盖：用户可能微调过（例如临时取消忽略某次报告），尊重既有内容；
   * 同时避免每次运行都改 mtime 触发 IDE / watcher 重渲染。
   */
  private static ensureGitignore(baseDir: string): void {
    try {
      fs.mkdirSync(baseDir, { recursive: true });
      const giPath = path.join(baseDir, '.gitignore');
      if (!fs.existsSync(giPath)) {
        fs.writeFileSync(giPath, '*\n', 'utf-8');
      }
    } catch {
      // gitignore 写失败不应阻断主流程；最坏情况是用户看到未提交的 logs/。
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
