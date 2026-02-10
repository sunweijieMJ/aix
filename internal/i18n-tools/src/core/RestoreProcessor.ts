import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import { ReactAdapter, VueAdapter } from '../adapters';
import type { FrameworkAdapter } from '../adapters';
import { CommandUtils } from '../utils/command-utils';
import { FileUtils } from '../utils/file-utils';
import { LoggerUtils } from '../utils/logger';
import type { LocaleMap } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';

interface RestoreOptions {
  sourceDir: string;
  outputDir: string;
  localePath: string;
  overwrite: boolean;
}

/**
 * 还原处理器
 * 负责将国际化代码还原为原始文本
 */
export class RestoreProcessor extends BaseProcessor {
  private framework: 'react' | 'vue';
  private adapter: FrameworkAdapter;

  constructor(config: ResolvedConfig, isCustom: boolean = false) {
    super(config, isCustom);
    this.framework = config.framework;
    this.adapter =
      config.framework === 'vue' ? new VueAdapter() : new ReactAdapter();
  }

  protected getOperationName(): string {
    return '还原';
  }

  async _execute(
    targets: string[] = [],
    outputDir?: string,
    overwrite: boolean = false,
  ): Promise<void> {
    const options: RestoreOptions = {
      sourceDir: process.cwd(),
      outputDir: outputDir || path.join(process.cwd(), 'restored'),
      localePath: this.getLocaleFilePath(),
      overwrite,
    };

    const targetFiles =
      targets.length > 0 ? await this.resolveTargetFiles(targets) : undefined;
    await this.restoreFiles(options, targetFiles);
  }

  private getLocaleFilePath(): string {
    const localeDir = FileUtils.getDirectoryPath(this.config, this.isCustom);
    return path.join(localeDir, 'zh-CN.json');
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
            ...FileUtils.getFrameworkFiles(resolvedTarget, this.framework),
          );
        }
      } catch (error) {
        LoggerUtils.error(`无法解析目标: ${target}`, error);
      }
    }

    return files;
  }

  private async restoreFiles(
    options: RestoreOptions,
    targetFiles?: string[],
  ): Promise<void> {
    try {
      const localeMap = this.loadLocaleMap(options.localePath);
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
          this.framework,
        );
      }

      const frameworkName = this.framework === 'vue' ? 'Vue' : 'React';
      LoggerUtils.info(
        `📁 找到 ${filesToProcess.length} 个${frameworkName}文件待处理`,
      );

      if (filesToProcess.length === 0) {
        LoggerUtils.info('✅ 没有找到需要处理的文件');
        return;
      }

      FileUtils.ensureDirectoryExists(options.outputDir);

      let processedCount = 0;
      let modifiedCount = 0;

      for (const filePath of filesToProcess) {
        try {
          const outputPath = options.overwrite
            ? filePath
            : path.join(
                options.outputDir,
                path.relative(options.sourceDir, filePath),
              );

          const wasModified = await this.processFile(
            filePath,
            localeMap,
            options,
            outputPath,
          );
          processedCount++;
          if (wasModified) modifiedCount++;

          if (processedCount % 10 === 0) {
            LoggerUtils.info(
              `📈 进度: ${processedCount}/${filesToProcess.length} 文件已处理`,
            );
          }
        } catch (error) {
          LoggerUtils.error(
            `处理文件失败: ${FileUtils.getRelativePath(filePath)}`,
            error,
          );
        }
      }

      LoggerUtils.success(`\n✅ 处理完成！`);
      LoggerUtils.info(`📊 总计处理: ${processedCount} 个文件`);
      LoggerUtils.info(`📊 已修改: ${modifiedCount} 个文件`);

      if (!options.overwrite && modifiedCount > 0) {
        LoggerUtils.info(`📂 输出目录: ${options.outputDir}`);
      }
    } catch (error) {
      LoggerUtils.error('还原过程中发生错误:', error);
      throw error;
    }
  }

  private loadLocaleMap(localePath: string): LocaleMap {
    return FileUtils.safeLoadJsonFile<LocaleMap>(localePath, {
      errorMessage: '加载语言文件失败',
    });
  }

  private async processFile(
    filePath: string,
    localeMap: LocaleMap,
    _options: RestoreOptions,
    outputPath?: string,
  ): Promise<boolean> {
    const actualOutputPath = outputPath || filePath;

    try {
      const restoreTransformer = this.adapter.getRestoreTransformer();
      const sourceText = fs.readFileSync(filePath, 'utf-8');
      const transformedCode = restoreTransformer.transform(filePath, localeMap);

      if (transformedCode === sourceText) {
        LoggerUtils.info(
          `⚪ 跳过: ${FileUtils.getRelativePath(filePath)} (无需修改)`,
        );
        return false;
      }

      FileUtils.ensureDirectoryExists(path.dirname(actualOutputPath));
      fs.writeFileSync(actualOutputPath, transformedCode, 'utf-8');

      try {
        await CommandUtils.formatWithPrettier(actualOutputPath);
      } catch (error) {
        LoggerUtils.error(
          `格式化失败，但文件已保存: ${FileUtils.getRelativePath(actualOutputPath)}`,
          error,
        );
      }

      LoggerUtils.success(`✅ 还原: ${FileUtils.getRelativePath(filePath)}`);
      return true;
    } catch (error) {
      LoggerUtils.error(
        `处理文件失败 ${FileUtils.getRelativePath(filePath)}:`,
        error,
      );
      return false;
    }
  }
}
