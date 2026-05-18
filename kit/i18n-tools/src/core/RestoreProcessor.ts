import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import type { FrameworkAdapter } from '../adapters';
import { formatWithPrettier } from '../utils/command-utils';
import { FileUtils } from '../utils/file-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import type { LocaleMap } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';

interface RestoreOptions {
  sourceDir: string;
  outputDir: string;
  overwrite: boolean;
}

/**
 * 还原处理器
 * 负责将国际化代码还原为原始文本
 */
export class RestoreProcessor extends BaseProcessor {
  /**
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @param adapter - 可选的框架适配器，未提供则按 config.framework 自动构建
   */
  constructor(config: ResolvedConfig, isCustom: boolean = false, adapter?: FrameworkAdapter) {
    super(config, isCustom, adapter);
  }

  protected getOperationName(): string {
    return '还原';
  }

  async execute(
    targets: string[] = [],
    outputDir?: string,
    overwrite: boolean = false,
  ): Promise<void> {
    return this.executeWithLifecycle(() => this._execute(targets, outputDir, overwrite));
  }

  private async _execute(
    targets: string[] = [],
    outputDir?: string,
    overwrite: boolean = false,
  ): Promise<void> {
    const options: RestoreOptions = {
      sourceDir: this.config.root,
      outputDir: outputDir || path.join(this.config.root, 'restored'),
      overwrite,
    };

    const targetFiles = targets.length > 0 ? await this.resolveTargetFiles(targets) : undefined;
    await this.restoreFiles(options, targetFiles);
  }

  private async resolveTargetFiles(targets: string[]): Promise<string[]> {
    const files: string[] = [];

    for (const target of targets) {
      try {
        const resolvedTarget = path.resolve(target);
        const stat = fs.statSync(resolvedTarget);

        if (stat.isFile()) {
          files.push(resolvedTarget);
        } else if (stat.isDirectory()) {
          files.push(
            ...FileUtils.getFrameworkFiles(
              resolvedTarget,
              this.adapter.getSupportedExtensions(),
              this.config.io.exclude,
              this.config.io.include,
              this.config.root,
            ),
          );
        }
      } catch (error) {
        LoggerUtils.error(`无法解析目标: ${target}`, error);
      }
    }

    return files;
  }

  private async restoreFiles(options: RestoreOptions, targetFiles?: string[]): Promise<void> {
    try {
      const localeMap = this.loadLocaleMap();
      if (Object.keys(localeMap).length === 0) {
        LoggerUtils.warn('语言文件为空或无法加载');
        return;
      }

      LoggerUtils.info(`📖 加载了 ${Object.keys(localeMap).length} 个语言条目`);

      let filesToProcess: string[];
      if (targetFiles && targetFiles.length > 0) {
        filesToProcess = targetFiles;
      } else {
        filesToProcess = FileUtils.getFrameworkFiles(
          options.sourceDir,
          this.adapter.getSupportedExtensions(),
          this.config.io.exclude,
          this.config.io.include,
          this.config.root,
        );
      }

      const frameworkName = this.adapter.getDisplayName();
      LoggerUtils.info(`📁 找到 ${filesToProcess.length} 个${frameworkName}文件待处理`);

      if (filesToProcess.length === 0) {
        LoggerUtils.info('✅ 没有找到需要处理的文件');
        return;
      }

      FileUtils.ensureDirectoryExists(options.outputDir);

      let processedCount = 0;
      let modifiedCount = 0;
      const failedFiles: string[] = [];

      for (const filePath of filesToProcess) {
        try {
          const outputPath = options.overwrite
            ? filePath
            : path.join(options.outputDir, path.relative(options.sourceDir, filePath));

          const wasModified = await this.processFile(filePath, localeMap, options, outputPath);
          processedCount++;
          if (wasModified) modifiedCount++;

          if (processedCount % 10 === 0) {
            LoggerUtils.info(`📈 进度: ${processedCount}/${filesToProcess.length} 文件已处理`);
          }
        } catch (error) {
          // processFile 内部会捕获异常并返回 false；外层 catch 仅兜底"AST/IO 异常逃逸"
          // 等罕见情况。两路径都纳入 failedFiles，最终统一以非零退出码上抛，避免 CI
          // 因 silent skip 把"几乎全部失败"误判为成功。
          failedFiles.push(filePath);
          LoggerUtils.error(`处理文件失败: ${FileUtils.getRelativePath(filePath)}`, error);
          this.report.addFailure({
            stage: 'restore',
            file: FileUtils.getRelativePath(filePath),
            error,
          });
        }
      }

      LoggerUtils.success(`\n✅ 处理完成！`);
      LoggerUtils.info(`📊 总计处理: ${processedCount} 个文件`);
      LoggerUtils.info(`📊 已修改: ${modifiedCount} 个文件`);
      if (failedFiles.length > 0) {
        LoggerUtils.error(`📊 处理失败: ${failedFiles.length} 个文件`);
      }

      if (!options.overwrite && modifiedCount > 0) {
        LoggerUtils.info(`📂 输出目录: ${options.outputDir}`);
      }

      if (failedFiles.length > 0) {
        throw new Error(`${failedFiles.length} 个文件还原失败，请检查上方日志`);
      }
    } catch (error) {
      LoggerUtils.error('还原过程中发生错误:', error);
      throw error;
    }
  }

  private loadLocaleMap(): LocaleMap {
    // 统一走 LanguageFileManager，自动处理单文件和模块化两种源格式
    const result = LanguageFileManager.readLocaleFile(this.config, this.isCustom);
    return result ?? {};
  }

  private async processFile(
    filePath: string,
    localeMap: LocaleMap,
    _options: RestoreOptions,
    outputPath?: string,
  ): Promise<boolean> {
    const actualOutputPath = outputPath || filePath;

    // 不再 try/catch 吞错：让异常向上传播到 restoreFiles 的循环处理器，
    // 由其计入 failedFiles 并最终非零退出。此前内部 return false 与上层
    // continue 双重静默会让 CI 把"全部失败"显示为成功。
    const restoreTransformer = this.adapter.getRestoreTransformer();
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const transformedCode = restoreTransformer.transform(filePath, localeMap);

    if (transformedCode === sourceText) {
      LoggerUtils.info(`⚪ 跳过: ${FileUtils.getRelativePath(filePath)} (无需修改)`);
      return false;
    }

    FileUtils.ensureDirectoryExists(path.dirname(actualOutputPath));
    fs.writeFileSync(actualOutputPath, transformedCode, 'utf-8');

    if (this.config.io.prettify) {
      try {
        // 格式化失败不算文件还原失败：源已写盘且语义正确，仅美观问题。
        await formatWithPrettier(actualOutputPath);
      } catch (error) {
        LoggerUtils.error(
          `格式化失败，但文件已保存: ${FileUtils.getRelativePath(actualOutputPath)}`,
          error,
        );
      }
    }

    LoggerUtils.success(`✅ 还原: ${FileUtils.getRelativePath(filePath)}`);
    return true;
  }
}
