import path from 'path';
import type { ResolvedConfig } from '../config';
import { FileUtils } from '../utils/file-utils';
import { LanguageFileManager } from '../utils/language-file-manager';
import { LoggerUtils } from '../utils/logger';
import type { ILangMsg, LocaleMap } from '../utils/types';
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
      if (this.config.modules) {
        await this.performModularExport(finalOutputDir);
      } else {
        await this.performFlatExport(finalOutputDir);
      }
    } catch (error) {
      LoggerUtils.error('语言包导出失败', error);
      throw error;
    }
  }

  private async performFlatExport(outputDir: string): Promise<void> {
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
        throw new Error('语言包存在冲突，请先解决冲突后再导出。定制包中的 key 不应与基础包重复。');
      }
      LoggerUtils.success('✅ 未发现语言包冲突');
    }

    const mergedSource: ILangMsg = { ...baseSource, ...customSource };
    const mergedTarget: ILangMsg = { ...baseTarget, ...customTarget };

    FileUtils.ensureDirectoryExists(outputDir);

    LoggerUtils.info('\n📊 语言包统计信息:');
    LoggerUtils.info(`📁 基础语言包 (${this.config.paths.locale}):`);
    LoggerUtils.info(`   ${sourceLocale}: ${Object.keys(baseSource).length} 个条目`);
    LoggerUtils.info(`   ${targetLocale}: ${Object.keys(baseTarget).length} 个条目`);
    if (customLocaleDir) {
      LoggerUtils.info(`📁 自定义语言包 (${customLocaleDir}):`);
      LoggerUtils.info(`   ${sourceLocale}: ${Object.keys(customSource).length} 个条目`);
      LoggerUtils.info(`   ${targetLocale}: ${Object.keys(customTarget).length} 个条目`);
    }
    LoggerUtils.info(`📦 合并后语言包:`);
    LoggerUtils.info(`   ${sourceLocale}: ${Object.keys(mergedSource).length} 个条目`);
    LoggerUtils.info(`   ${targetLocale}: ${Object.keys(mergedTarget).length} 个条目`);

    const outputSourcePath = path.join(outputDir, `${sourceLocale}.json`);
    const outputTargetPath = path.join(outputDir, `${targetLocale}.json`);
    const { format } = this.config.output;
    const separator = this.config.idPrefix.separator;
    const toOutput = (data: Record<string, any>) =>
      format === 'nested' ? FileUtils.unflattenObject(data, separator) : data;
    FileUtils.writeJsonFile(outputSourcePath, toOutput(mergedSource));
    FileUtils.writeJsonFile(outputTargetPath, toOutput(mergedTarget));

    LoggerUtils.success('\n✅ 语言包导出成功!');
    LoggerUtils.info(`📄 输出文件:\n   ${outputSourcePath}\n   ${outputTargetPath}`);

    // 嵌套模式下顶层 key 数量少于 flat key 数量，需 flatten 后再比较
    const exportedSource = FileUtils.safeLoadJsonFile<Record<string, any>>(outputSourcePath, {
      silent: true,
    });
    const exportedTarget = FileUtils.safeLoadJsonFile<Record<string, any>>(outputTargetPath, {
      silent: true,
    });
    const flatExportedSource = FileUtils.flattenObject(exportedSource, '', separator);
    const flatExportedTarget = FileUtils.flattenObject(exportedTarget, '', separator);
    const ok =
      Object.keys(flatExportedSource).length === Object.keys(mergedSource).length &&
      Object.keys(flatExportedTarget).length === Object.keys(mergedTarget).length;
    if (ok) {
      LoggerUtils.success('✅ 导出文件验证通过');
    } else {
      LoggerUtils.warn('导出文件条目数量不匹配');
    }
  }

  /**
   * 模块化导出：按模块分桶写入，并在 manifest 配置下生成 manifest.json。
   *
   * 读取策略：用 getMessages 兼容单文件和模块化源文件（首次会触发迁移），
   * 然后用 ModuleResolver 重新给每个 key 分配模块——支持 matchKey 规则，
   * 以及从 key 前缀反推虚拟文件路径后匹配 glob 规则。
   */
  private async performModularExport(outputDir: string): Promise<void> {
    const { modules } = this.config;
    if (!modules) return;

    const sourceLocale = this.config.locale.source;
    const targetLocale = this.config.locale.target;

    // getMessages 兼容单文件/模块化两种源格式（modules 配置下首次会触发迁移）。
    // 内部已调用 flattenObject，值均为 string，断言为 LocaleMap 类型安全。
    const messages = LanguageFileManager.getMessages(this.config, false);
    const sourceFlat = (messages[sourceLocale] ?? {}) as LocaleMap;
    const targetFlat = (messages[targetLocale] ?? {}) as LocaleMap;

    // 用 ModuleResolver 为每个 key 分配模块（buildKeyModuleMap 内部也做 key 前缀 → 虚拟路径）
    const keyModuleMap = LanguageFileManager.buildKeyModuleMap(this.config, sourceFlat);

    const moduleCount = new Set(Object.values(keyModuleMap)).size;
    LoggerUtils.info('\n📊 模块化语言包统计:');
    LoggerUtils.info(`   ${sourceLocale}: ${Object.keys(sourceFlat).length} 个条目`);
    LoggerUtils.info(`   ${targetLocale}: ${Object.keys(targetFlat).length} 个条目`);
    LoggerUtils.info(`   模块数: ${moduleCount}`);

    const exportConfig = { ...this.config, paths: { ...this.config.paths, locale: outputDir } };
    const isNested = this.config.output.format === 'nested';
    LanguageFileManager.writeLocaleFile(
      exportConfig,
      false,
      sourceFlat,
      sourceLocale,
      keyModuleMap,
      isNested,
    );
    LanguageFileManager.writeLocaleFile(
      exportConfig,
      false,
      targetFlat,
      targetLocale,
      keyModuleMap,
      isNested,
    );

    const moduleNames = [...new Set(Object.values(keyModuleMap))].sort();
    const locales = [sourceLocale, targetLocale];

    // 每个语言目录生成 index.json，便于消费方按需懒加载时先读模块清单
    this.writeLocaleIndexFiles(outputDir, locales, moduleNames, modules.layout);

    if (modules.manifest) {
      this.writeManifest(outputDir, keyModuleMap, locales, modules.layout, modules.defaultModule);
    }

    LoggerUtils.success('\n✅ 模块化语言包导出成功!');
    LoggerUtils.info(`📁 输出目录: ${outputDir}`);
  }

  /** 在每个语言目录写 index.json，列出该目录下的模块清单 */
  private writeLocaleIndexFiles(
    outputDir: string,
    locales: string[],
    moduleNames: string[],
    layout: 'by-locale' | 'by-module',
  ): void {
    if (layout !== 'by-locale') return;
    for (const locale of locales) {
      FileUtils.writeJsonFile(path.join(outputDir, locale, 'index.json'), {
        modules: moduleNames,
      });
    }
  }

  private writeManifest(
    outputDir: string,
    keyModuleMap: Record<string, string>,
    locales: string[],
    layout: 'by-locale' | 'by-module',
    defaultModule: string,
  ): void {
    const modules = [...new Set(Object.values(keyModuleMap))].sort();
    const files: Record<string, Record<string, string>> = {};

    if (layout === 'by-module') {
      for (const mod of modules) {
        files[mod] = {};
        for (const locale of locales) {
          files[mod][locale] = `${mod}/${locale}.json`;
        }
      }
    } else {
      for (const locale of locales) {
        files[locale] = {};
        for (const mod of modules) {
          files[locale][mod] = `${locale}/${mod}.json`;
        }
      }
    }

    const manifest = {
      modules,
      locales: [...locales].sort(),
      layout,
      defaultModule,
      generatedAt: new Date().toISOString(),
      files,
    };
    FileUtils.writeJsonFile(path.join(outputDir, 'manifest.json'), manifest);
    LoggerUtils.info(`📄 已生成 manifest.json，包含 ${modules.length} 个模块`);
  }
}
