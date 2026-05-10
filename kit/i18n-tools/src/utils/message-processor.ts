import type { MessageInfo } from './types';

/**
 * 消息信息相关的轻量 helper。
 *
 * 此前文件中还包含 `getMessageText` / `processVariables` 两个反向占位符替换函数，
 * 但代码全量检索发现仅 `isValidMessage` 被使用；那两处与 `CommonASTUtils.createMessageWithOptions`
 * 的"正向占位符提取"并非互为反向，且无人调用，已删除以减少误用面。
 */
export class MessageProcessor {
  /**
   * 检查消息信息是否携带可用于翻译查找的最小字段（id 或 defaultMessage）。
   */
  static isValidMessage(messageInfo: MessageInfo): boolean {
    return messageInfo.id !== undefined || messageInfo.defaultMessage !== undefined;
  }
}
