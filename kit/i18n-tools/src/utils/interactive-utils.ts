import fs from 'fs';
import inquirer from 'inquirer';
import { MODE_DESCRIPTIONS } from './constants';
import { FileUtils } from './file-utils';
import { LoggerUtils } from './logger';
import { ModeName } from './types';

/**
 * 命令行交互工具类
 * 提供用户交互功能
 */
export class InteractiveUtils {
  /**
   * 提示用户选择顶层操作模式（自动或手动）
   * @returns 用户选择的模式 ('automatic' | 'manual')
   */
  static async promptForTopLevelMode(): Promise<'automatic' | 'manual'> {
    const { mode } = await inquirer.prompt({
      type: 'select',
      name: 'mode',
      message: '请选择运行模式:',
      choices: [
        { name: '自动模式 (一键完成所有流程)', value: 'automatic' },
        { name: '手动模式 (选择单个步骤执行)', value: 'manual' },
      ],
    });
    return mode;
  }

  /**
   * 提示用户选择操作模式
   * @param isCustom - 是否是定制目录
   * @param defaultMode - 默认模式
   * @returns 用户选择的模式
   */
  static async promptForMode(isCustom: boolean, defaultMode: ModeName): Promise<ModeName> {
    const { mode } = await inquirer.prompt({
      type: 'select',
      name: 'mode',
      message: isCustom ? '请选择定制目录操作模式:' : '请选择操作模式:',
      choices: [
        // 主流水线顺序：提取 → 拆分 →（AI 翻译 / CSV 人工翻译二选一）→ 合并 → 导出
        { name: '① 提取多语言组件', value: ModeName.GENERATE },
        { name: '② 生成待翻译文件', value: ModeName.PICK },
        { name: '③ 翻译待翻译文件（AI）', value: ModeName.TRANSLATE },
        { name: '③ 导出 CSV（发人翻译/审核）', value: ModeName.CSV_EXPORT },
        { name: '③ 导入 CSV（回流写回待翻译文件）', value: ModeName.CSV_IMPORT },
        { name: '④ 合并翻译文件', value: ModeName.MERGE },
        { name: '⑤ 导出语言文件', value: ModeName.EXPORT },
        // 辅助：调试 / 体检
        { name: '· 还原多语言组件（调试）', value: ModeName.RESTORE },
        { name: '· 健康检查（doctor）', value: ModeName.DOCTOR },
      ],
      default: defaultMode,
    });

    return mode;
  }

  /**
   * 提示用户确认操作
   * @param mode - 当前模式
   * @param isCustom - 是否为定制目录
   * @param hasCustomLocale - 是否启用了双目录（影响是否显示"操作目录"）
   * @returns 是否确认
   */
  static async promptForConfirmation(
    mode: ModeName,
    isCustom: boolean,
    hasCustomLocale: boolean = true,
  ): Promise<boolean> {
    const locationLine = hasCustomLocale
      ? `\n  - 操作目录: ${isCustom ? '定制目录' : '主目录'}`
      : '';
    const message = `
================================================
  确认操作
------------------------------------------------
  - 操作模式: ${mode} (${MODE_DESCRIPTIONS[mode]})${locationLine}
================================================
确定要执行此操作吗?
`;
    try {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message,
          default: true,
        },
      ]);
      return confirmed;
    } catch (error) {
      LoggerUtils.error('交互式确认失败', error);
      return false;
    }
  }

  /**
   * 提示用户进行通用确认
   * @param message - 提示信息
   * @returns 用户是否确认
   */
  static async promptForGenericConfirmation(message: string): Promise<boolean> {
    try {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message,
          default: true,
        },
      ]);
      return confirmed;
    } catch (error) {
      LoggerUtils.error('通用确认提示失败', error);
      return false;
    }
  }

  /**
   * 提示用户输入文件或目录路径
   *
   * @param mode - 操作类型（用于提示信息）
   * @param extensions - 框架支持的扩展名列表（来自 adapter.getSupportedExtensions()）
   * @param displayName - 框架展示名（用于错误提示，如 "Vue"）
   */
  static async promptForPath(
    mode: ModeName,
    extensions: string[],
    displayName: string,
  ): Promise<string> {
    let actionText: string;
    switch (mode) {
      case ModeName.GENERATE:
      case ModeName.AUTOMATIC:
        actionText = '提取国际化文本';
        break;
      case ModeName.RESTORE:
        actionText = '还原国际化文本';
        break;
      default:
        actionText = '处理';
    }

    try {
      const { targetPath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'targetPath',
          message: `请输入要${actionText}的文件或目录路径:`,
          validate: (input: string) => {
            if (!input.trim()) return '请输入路径';
            const validation = FileUtils.validateTargetPath(input, extensions, displayName);
            if (!validation.isValid) {
              return validation.error || '无效路径';
            }
            return true;
          },
        },
      ]);
      return targetPath;
    } catch (error) {
      LoggerUtils.error(`提示输入路径时发生错误 (模式: ${mode})`, error);
      throw error;
    }
  }

  /**
   * 提示用户输入要回流的 CSV 文件路径（csv-import 交互模式专用）。
   * 校验：非空、以 .csv 结尾、文件存在。
   */
  static async promptForCsvPath(): Promise<string> {
    const { csvPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'csvPath',
        message: '请输入要回流的 CSV 文件路径:',
        validate: (input: string) => {
          const p = input.trim();
          if (!p) return '请输入路径';
          if (!p.toLowerCase().endsWith('.csv')) return '请输入 .csv 文件路径';
          if (!fs.existsSync(p)) return `文件不存在: ${p}`;
          return true;
        },
      },
    ]);
    return csvPath.trim();
  }
}
