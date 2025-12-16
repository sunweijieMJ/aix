/**
 * @fileoverview 类型守卫函数
 */

import type { ChatMessage, ContentType, TextContent } from './message';

/**
 * 检查消息内容是否为字符串类型
 */
export function isStringContent(
  content: string | ContentType[],
): content is string {
  return typeof content === 'string';
}

/**
 * 检查消息内容是否为多模态数组
 */
export function isMultiModalContent(
  content: string | ContentType[],
): content is ContentType[] {
  return Array.isArray(content);
}

/**
 * 检查内容项是否为文本类型
 */
export function isTextContent(item: ContentType): item is TextContent {
  return item.type === 'text';
}

/**
 * 安全获取消息的字符串内容
 * @param message 聊天消息
 * @returns 字符串内容，如果是多模态则返回空字符串
 */
export function getMessageContent(message: ChatMessage): string {
  if (isStringContent(message.content)) {
    return message.content;
  }

  // 多模态内容暂不支持，返回提示
  return '[多模态内容]';
}

/**
 * 安全转换消息内容为字符串
 * @param content 消息内容
 * @returns 字符串内容
 */
export function toStringContent(content: string | ContentType[]): string {
  if (isStringContent(content)) {
    return content;
  }

  // 多模态内容：提取所有文本并合并
  const textParts = content.filter(isTextContent).map((item) => item.text);

  return textParts.length > 0 ? textParts.join('\n') : '[多模态内容]';
}
