import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import { FileUtils } from '../utils/file-utils';
import { LoggerUtils } from '../utils/logger';
import type { ILangMsg } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';

/**
 * 导出处理器
 * 负责合并基础语言包和自定义语言包，生成最终的语言包文件
 *
 * 使用 ResolvedConfig 中的路径替代硬编码的 PROJECT_CONFIG
 */
export class ExportProcessor extends BaseProcessor {
  constructor(config: ResolvedConfig) {
    super(config, false);
  }

  protected getOperationName(): string {
    return '导出语言包';
  }

  protected getDirectoryDescription(): string {
    return '全局';
  }

  async execute(outputDir?: string): Promise<void> {
    return this.executeWithLifecycle(() => this._execute(outputDir));
  }

  private async _execute(outputDir?: string): Promise<void> {
    LoggerUtils.info(`📂 基础目录: ${this.config.paths.locale}`);
    LoggerUtils.info(`📂 定制目录: ${this.config.paths.customLocale}`);
    LoggerUtils.info(`📂 输出目录: ${outputDir || this.config.paths.exportLocale}`);

    await this.performExport(outputDir);
  }

  private async performExport(outputDir?: string): Promise<void> {
    try {
      const finalOutputDir = outputDir || this.config.paths.exportLocale;
      const sourceLocale = this.config.locale.source;
      const targetLocale = this.config.locale.target;

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

      const customSource = FileUtils.loadLanguageFile(
        path.join(this.config.paths.customLocale, `${sourceLocale}.json`),
        sourceLocale,
        '自定义',
      );
      const customTarget = FileUtils.loadLanguageFile(
        path.join(this.config.paths.customLocale, `${targetLocale}.json`),
        targetLocale,
        '自定义',
      );

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
        throw new Error('语言包存在冲突，请先解决冲突后再导出。定制包中的 key 不应与基础包重复。');
      }

      LoggerUtils.success('✅ 未发现语言包冲突');

      const mergedSource: ILangMsg = { ...baseSource, ...customSource };
      const mergedTarget: ILangMsg = { ...baseTarget, ...customTarget };

      FileUtils.ensureDirectoryExists(finalOutputDir);

      const baseSourceCount = Object.keys(baseSource).length;
      const baseTargetCount = Object.keys(baseTarget).length;
      const customSourceCount = Object.keys(customSource).length;
      const customTargetCount = Object.keys(customTarget).length;
      const mergedSourceCount = Object.keys(mergedSource).length;
      const mergedTargetCount = Object.keys(mergedTarget).length;

      LoggerUtils.info('\n📊 语言包统计信息:');
      LoggerUtils.info(`📁 基础语言包 (${this.config.paths.locale}):`);
      LoggerUtils.info(`   ${sourceLocale}: ${baseSourceCount} 个条目`);
      LoggerUtils.info(`   ${targetLocale}: ${baseTargetCount} 个条目`);
      LoggerUtils.info(`📁 自定义语言包 (${this.config.paths.customLocale}):`);
      LoggerUtils.info(`   ${sourceLocale}: ${customSourceCount} 个条目`);
      LoggerUtils.info(`   ${targetLocale}: ${customTargetCount} 个条目`);
      LoggerUtils.info(`📦 合并后语言包:`);
      LoggerUtils.info(`   ${sourceLocale}: ${mergedSourceCount} 个条目`);
      LoggerUtils.info(`   ${targetLocale}: ${mergedTargetCount} 个条目`);

      const outputSourcePath = path.join(finalOutputDir, `${sourceLocale}.json`);
      const outputTargetPath = path.join(finalOutputDir, `${targetLocale}.json`);

      fs.writeFileSync(outputSourcePath, JSON.stringify(mergedSource, null, 2) + '\n', 'utf8');
      fs.writeFileSync(outputTargetPath, JSON.stringify(mergedTarget, null, 2) + '\n', 'utf8');

      LoggerUtils.success('\n✅ 语言包导出成功!');
      LoggerUtils.info(`📄 输出文件:`);
      LoggerUtils.info(`   ${outputSourcePath}`);
      LoggerUtils.info(`   ${outputTargetPath}`);

      LoggerUtils.info('\n🔍 验证导出文件...');
      try {
        const exportedSource = JSON.parse(fs.readFileSync(outputSourcePath, 'utf8'));
        const exportedTarget = JSON.parse(fs.readFileSync(outputTargetPath, 'utf8'));

        if (
          Object.keys(exportedSource).length === mergedSourceCount &&
          Object.keys(exportedTarget).length === mergedTargetCount
        ) {
          LoggerUtils.success('✅ 导出文件验证通过');
        } else {
          LoggerUtils.warn('导出文件条目数量不匹配');
        }
      } catch (error) {
        LoggerUtils.warn(`导出文件验证失败: ${error}`);
      }
    } catch (error) {
      LoggerUtils.error('语言包导出失败', error);
      throw error;
    }
  }
}
