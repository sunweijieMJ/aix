import { MessageInfo } from './types';

/**
 * 消息处理器工具类
 * 提供消息文本处理和变量替换功能
 */
export class MessageProcessor {
  /**
   * 获取消息文本
   * @param messageInfo - 消息信息
   * @param localeMap - 语言映射
   * @returns 处理后的消息文本
   */
  static getMessageText(
    messageInfo: MessageInfo,
    localeMap: Record<string, string>,
  ): string {
    if (!this.isValidMessage(messageInfo)) {
      return '';
    }

    // 优先从语言文件中获取
    if (messageInfo.id && localeMap[messageInfo.id]) {
      return this.processVariables(
        localeMap[messageInfo.id]!,
        messageInfo.values,
      );
    }

    // 使用默认消息
    if (messageInfo.defaultMessage !== undefined) {
      return this.processVariables(
        messageInfo.defaultMessage,
        messageInfo.values,
      );
    }

    return '';
  }

  /**
   * 检查消息信息是否有效
   * @param messageInfo - 消息信息
   * @returns 是否有效
   */
  static isValidMessage(messageInfo: MessageInfo): boolean {
    return (
      messageInfo.id !== undefined || messageInfo.defaultMessage !== undefined
    );
  }

  /**
   * 处理变量替换
   * @param text - 原始文本
   * @param values - 变量值
   * @returns 处理后的文本
   */
  private static processVariables(
    text: string,
    values?: Record<string, any>,
  ): string {
    if (!values) return text;

    let result = text;
    let hasExpressions = false;

    // 替换变量
    for (const [key, value] of Object.entries(values)) {
      const placeholder = `{${key}}`;
      const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g');

      if (
        typeof value === 'string' &&
        value.startsWith('{{') &&
        value.endsWith('}}')
      ) {
        // 这是一个表达式
        const expression = value.slice(2, -2);
        result = result.replace(regex, `\${${expression}}`);
        hasExpressions = true;
      } else {
        // 普通值
        result = result.replace(regex, String(value));
      }
    }

    return hasExpressions ? `\`${result}\`` : result;
  }
}
