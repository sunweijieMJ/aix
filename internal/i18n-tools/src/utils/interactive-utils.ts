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
  static async promptForMode(
    isCustom: boolean,
    defaultMode: ModeName,
  ): Promise<ModeName> {
    const { mode } = await inquirer.prompt({
      type: 'select',
      name: 'mode',
      message: isCustom ? '请选择定制目录操作模式:' : '请选择操作模式:',
      choices: [
        { name: '提取多语言组件', value: ModeName.GENERATE },
        { name: '生成待翻译文件', value: ModeName.PICK },
        { name: '翻译待翻译文件', value: ModeName.TRANSLATE },
        { name: '合并翻译文件', value: ModeName.MERGE },
        { name: '还原多语言组件', value: ModeName.RESTORE },
        { name: '导出语言文件', value: ModeName.EXPORT },
      ],
      default: defaultMode,
    });

    return mode;
  }

  /**
   * 提示用户确认操作
   * @param mode - 当前模式
   * @param isCustom - 是否为定制目录
   * @returns 是否确认
   */
  static async promptForConfirmation(
    mode: ModeName,
    isCustom: boolean,
  ): Promise<boolean> {
    const location = isCustom ? '定制目录' : '主目录';
    const message = `
================================================
  确认操作
------------------------------------------------
  - 操作模式: ${mode} (${MODE_DESCRIPTIONS[mode]})
  - 操作目录: ${location}
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
   * @param mode - 操作类型（用于提示信息）
   * @param framework - 框架类型 ('react' | 'vue')
   * @returns 用户输入的路径
   */
  static async promptForPath(
    mode: ModeName,
    framework: 'react' | 'vue' = 'react',
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
            const validation = FileUtils.validateTargetPath(input, framework);
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
}
