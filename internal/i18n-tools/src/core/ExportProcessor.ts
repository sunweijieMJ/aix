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

  protected async _execute(outputDir?: string): Promise<void> {
    LoggerUtils.info(`📂 基础目录: ${this.config.paths.locale}`);
    LoggerUtils.info(`📂 定制目录: ${this.config.paths.customLocale}`);
    LoggerUtils.info(
      `📂 输出目录: ${outputDir || this.config.paths.exportLocale}`,
    );

    await this.performExport(outputDir);
  }

  private async performExport(outputDir?: string): Promise<void> {
    try {
      const finalOutputDir = outputDir || this.config.paths.exportLocale;

      const baseZhCN = FileUtils.loadLanguageFile(
        path.join(this.config.paths.locale, 'zh-CN.json'),
        'zh-CN',
        '基础',
      );
      const baseEnUS = FileUtils.loadLanguageFile(
        path.join(this.config.paths.locale, 'en-US.json'),
        'en-US',
        '基础',
      );

      const customZhCN = FileUtils.loadLanguageFile(
        path.join(this.config.paths.customLocale, 'zh-CN.json'),
        'zh-CN',
        '自定义',
      );
      const customEnUS = FileUtils.loadLanguageFile(
        path.join(this.config.paths.customLocale, 'en-US.json'),
        'en-US',
        '自定义',
      );

      LoggerUtils.info('🔍 检查语言包冲突...');
      const zhConflicts = FileUtils.findConflictingKeys(baseZhCN, customZhCN);
      const enConflicts = FileUtils.findConflictingKeys(baseEnUS, customEnUS);

      if (zhConflicts.length > 0) {
        LoggerUtils.error('zh-CN 语言包冲突', zhConflicts);
      }
      if (enConflicts.length > 0) {
        LoggerUtils.error('en-US 语言包冲突', enConflicts);
      }

      LoggerUtils.success('✅ 未发现语言包冲突');

      const mergedZhCN: ILangMsg = { ...baseZhCN, ...customZhCN };
      const mergedEnUS: ILangMsg = { ...baseEnUS, ...customEnUS };

      FileUtils.ensureDirectoryExists(finalOutputDir);

      const baseZhCount = Object.keys(baseZhCN).length;
      const baseEnCount = Object.keys(baseEnUS).length;
      const customZhCount = Object.keys(customZhCN).length;
      const customEnCount = Object.keys(customEnUS).length;
      const mergedZhCount = Object.keys(mergedZhCN).length;
      const mergedEnCount = Object.keys(mergedEnUS).length;

      LoggerUtils.info('\n📊 语言包统计信息:');
      LoggerUtils.info(`📁 基础语言包 (${this.config.paths.locale}):`);
      LoggerUtils.info(`   zh-CN: ${baseZhCount} 个条目`);
      LoggerUtils.info(`   en-US: ${baseEnCount} 个条目`);
      LoggerUtils.info(`📁 自定义语言包 (${this.config.paths.customLocale}):`);
      LoggerUtils.info(`   zh-CN: ${customZhCount} 个条目`);
      LoggerUtils.info(`   en-US: ${customEnCount} 个条目`);
      LoggerUtils.info(`📦 合并后语言包:`);
      LoggerUtils.info(`   zh-CN: ${mergedZhCount} 个条目`);
      LoggerUtils.info(`   en-US: ${mergedEnCount} 个条目`);

      const outputZhPath = path.join(finalOutputDir, 'zh-CN.json');
      const outputEnPath = path.join(finalOutputDir, 'en-US.json');

      fs.writeFileSync(
        outputZhPath,
        JSON.stringify(mergedZhCN, null, 2) + '\n',
        'utf8',
      );
      fs.writeFileSync(
        outputEnPath,
        JSON.stringify(mergedEnUS, null, 2) + '\n',
        'utf8',
      );

      LoggerUtils.success('\n✅ 语言包导出成功!');
      LoggerUtils.info(`📄 输出文件:`);
      LoggerUtils.info(`   ${outputZhPath}`);
      LoggerUtils.info(`   ${outputEnPath}`);

      LoggerUtils.info('\n🔍 验证导出文件...');
      try {
        const exportedZh = JSON.parse(fs.readFileSync(outputZhPath, 'utf8'));
        const exportedEn = JSON.parse(fs.readFileSync(outputEnPath, 'utf8'));

        if (
          Object.keys(exportedZh).length === mergedZhCount &&
          Object.keys(exportedEn).length === mergedEnCount
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
