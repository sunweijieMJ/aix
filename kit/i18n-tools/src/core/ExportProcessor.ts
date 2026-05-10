import path from 'path';
import type { ResolvedConfig } from '../config';
import { FileUtils } from '../utils/file-utils';
import { LoggerUtils } from '../utils/logger';
import type { ILangMsg } from '../utils/types';
import { FileProcessor } from './FileProcessor';

/**
 * 导出处理器
 * 负责合并基础语言包和自定义语言包，生成最终的语言包文件
 *
 * 使用 ResolvedConfig 中的路径替代硬编码的 PROJECT_CONFIG
 */
export class ExportProcessor extends FileProcessor {
  constructor(config: ResolvedConfig) {
    super(config, false);
  }

  protected getOperationName(): string {
    return '导出语言包';
  }

  // 全局导出，不区分主/定制目录
  protected getDirectoryDescription(): string {
    return '全局';
  }

  async execute(outputDir?: string): Promise<void> {
    return this.executeWithLifecycle(() => this._execute(outputDir));
  }

  private async _execute(outputDir?: string): Promise<void> {
    LoggerUtils.info(`📂 基础目录: ${this.config.paths.locale}`);
    if (this.config.paths.customLocale) {
      LoggerUtils.info(`📂 定制目录: ${this.config.paths.customLocale}`);
    }
    LoggerUtils.info(`📂 输出目录: ${outputDir || this.config.paths.exportLocale}`);

    await this.performExport(outputDir);
  }

  private async performExport(outputDir?: string): Promise<void> {
    try {
      const finalOutputDir = outputDir || this.config.paths.exportLocale;
      const sourceLocale = this.config.locale.source;
      const targetLocale = this.config.locale.target;
      const customLocaleDir = this.config.paths.customLocale;

      const baseSource = FileUtils.loadLanguageFile(
        path.join(this.config.paths.locale, `${sourceLocale}.json`),
        sourceLocale,
        '基础',
      );
      const baseTarget = FileUtils.loadLanguageFile(
        path.join(this.config.paths.locale, `${targetLocale}.json`),
        targetLocale,
        '基础',
      );

      // 仅当用户显式配置了 customLocale 时才加载定制语言包，
      // 否则保持空对象，避免对不存在目录产生 [WARN] 误导。
      const customSource: ILangMsg = customLocaleDir
        ? FileUtils.loadLanguageFile(
            path.join(customLocaleDir, `${sourceLocale}.json`),
            sourceLocale,
            '自定义',
          )
        : {};
      const customTarget: ILangMsg = customLocaleDir
        ? FileUtils.loadLanguageFile(
            path.join(customLocaleDir, `${targetLocale}.json`),
            targetLocale,
            '自定义',
          )
        : {};

      if (customLocaleDir) {
        LoggerUtils.info('🔍 检查语言包冲突...');
        const sourceConflicts = FileUtils.findConflictingKeys(baseSource, customSource);
        const targetConflicts = FileUtils.findConflictingKeys(baseTarget, customTarget);

        if (sourceConflicts.length > 0 || targetConflicts.length > 0) {
          if (sourceConflicts.length > 0) {
            LoggerUtils.error(
              `${sourceLocale} 语言包存在 ${sourceConflicts.length} 个冲突键: ${sourceConflicts.join(', ')}`,
            );
          }
          if (targetConflicts.length > 0) {
            LoggerUtils.error(
              `${targetLocale} 语言包存在 ${targetConflicts.length} 个冲突键: ${targetConflicts.join(', ')}`,
            );
          }
          throw new Error(
            '语言包存在冲突，请先解决冲突后再导出。定制包中的 key 不应与基础包重复。',
          );
        }

        LoggerUtils.success('✅ 未发现语言包冲突');
      }

      const mergedSource: ILangMsg = { ...baseSource, ...customSource };
      const mergedTarget: ILangMsg = { ...baseTarget, ...customTarget };

      FileUtils.ensureDirectoryExists(finalOutputDir);

      const baseSourceCount = Object.keys(baseSource).length;
      const baseTargetCount = Object.keys(baseTarget).length;
      const mergedSourceCount = Object.keys(mergedSource).length;
      const mergedTargetCount = Object.keys(mergedTarget).length;

      LoggerUtils.info('\n📊 语言包统计信息:');
      LoggerUtils.info(`📁 基础语言包 (${this.config.paths.locale}):`);
      LoggerUtils.info(`   ${sourceLocale}: ${baseSourceCount} 个条目`);
      LoggerUtils.info(`   ${targetLocale}: ${baseTargetCount} 个条目`);
      if (customLocaleDir) {
        LoggerUtils.info(`📁 自定义语言包 (${customLocaleDir}):`);
        LoggerUtils.info(`   ${sourceLocale}: ${Object.keys(customSource).length} 个条目`);
        LoggerUtils.info(`   ${targetLocale}: ${Object.keys(customTarget).length} 个条目`);
      }
      LoggerUtils.info(`📦 合并后语言包:`);
      LoggerUtils.info(`   ${sourceLocale}: ${mergedSourceCount} 个条目`);
      LoggerUtils.info(`   ${targetLocale}: ${mergedTargetCount} 个条目`);

      const outputSourcePath = path.join(finalOutputDir, `${sourceLocale}.json`);
      const outputTargetPath = path.join(finalOutputDir, `${targetLocale}.json`);

      FileUtils.writeJsonFile(outputSourcePath, mergedSource);
      FileUtils.writeJsonFile(outputTargetPath, mergedTarget);

      LoggerUtils.success('\n✅ 语言包导出成功!');
      LoggerUtils.info(`📄 输出文件:`);
      LoggerUtils.info(`   ${outputSourcePath}`);
      LoggerUtils.info(`   ${outputTargetPath}`);

      LoggerUtils.info('\n🔍 验证导出文件...');
      const exportedSource = FileUtils.safeLoadJsonFile<ILangMsg>(outputSourcePath, {
        silent: true,
      });
      const exportedTarget = FileUtils.safeLoadJsonFile<ILangMsg>(outputTargetPath, {
        silent: true,
      });

      if (
        Object.keys(exportedSource).length === mergedSourceCount &&
        Object.keys(exportedTarget).length === mergedTargetCount
      ) {
        LoggerUtils.success('✅ 导出文件验证通过');
      } else {
        LoggerUtils.warn('导出文件条目数量不匹配');
      }
    } catch (error) {
      LoggerUtils.error('语言包导出失败', error);
      throw error;
    }
  }
}
