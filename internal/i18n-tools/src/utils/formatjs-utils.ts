import type { ResolvedConfig } from '../config';
import { CommandUtils } from './command-utils';
import { LoggerUtils } from './logger';

/**
 * formatjs命令执行工具类
 *
 * 所有路径通过 ResolvedConfig 传入，不再使用硬编码的 PATHS / PROJECT_CONFIG
 */
export class FormatjsUtils {
  /**
   * 提取国际化消息
   * @param config - 已解析的配置
   * @param isCustom - 是否是定制目录
   * @throws {Error} 当提取失败时抛出错误
   */
  static extractMessages(config: ResolvedConfig, isCustom: boolean): void {
    const sourceDir = isCustom
      ? config.paths.customLocale
      : config.paths.locale;
    const outDir = isCustom ? config.paths.customLocale : config.paths.locale;
    const excludeDir = isCustom ? '' : config.paths.customLocale;

    try {
      if (!isCustom) {
        const ignoreClause = excludeDir
          ? ` --ignore "${excludeDir}/**/*.{js,jsx,ts,tsx}"`
          : '';
        CommandUtils.execCommand(
          `formatjs extract "${sourceDir}/**/!(*.d).{js,jsx,ts,tsx}"${ignoreClause} --out-file ${outDir}/extract/zh-CN.json`,
        );
        LoggerUtils.success('主目录国际化消息提取成功');
      } else {
        CommandUtils.execCommand(
          `formatjs extract "${sourceDir}/**/!(*.d).{js,jsx,ts,tsx}" --out-file ${outDir}/extract/zh-CN.json`,
        );
        LoggerUtils.success('定制目录国际化消息提取成功');
      }
    } catch (error) {
      LoggerUtils.error(
        `国际化消息提取失败 ${isCustom ? '(定制目录)' : '(主目录)'}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * 编译国际化消息
   * @param config - 已解析的配置
   * @param isCustom - 是否是定制目录
   * @throws {Error} 当编译失败时抛出错误
   */
  static compileMessages(config: ResolvedConfig, isCustom: boolean): void {
    try {
      const baseDir = isCustom
        ? config.paths.customLocale
        : config.paths.locale;
      const extractDir = `${baseDir}/extract`;
      const compileDir = `${baseDir}/compile`;

      CommandUtils.execCommand(
        `formatjs compile-folder ${extractDir} ${compileDir}`,
      );
      LoggerUtils.success(`${isCustom ? '定制' : '主'}目录国际化消息编译成功`);
    } catch (error) {
      LoggerUtils.error(
        `国际化消息编译失败 ${isCustom ? '(定制目录)' : '(主目录)'}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * 处理语言文件 (提取和编译)
   * @param config - 已解析的配置
   * @param isCustom - 是否是定制目录
   */
  static processLang(config: ResolvedConfig, isCustom: boolean): void {
    try {
      FormatjsUtils.extractMessages(config, isCustom);
      FormatjsUtils.compileMessages(config, isCustom);
      LoggerUtils.success(
        `语言处理完成 ${isCustom ? '(定制目录)' : '(主目录)'}`,
      );
    } catch (error) {
      LoggerUtils.error(
        `语言处理失败 ${isCustom ? '(定制目录)' : '(主目录)'}:`,
        error,
      );
    }
  }
}
