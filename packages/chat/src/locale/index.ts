/**
 * @fileoverview Chat 组件国际化统一导出
 * 参考 button 组件的 locale 设计模式
 */

import type { ComponentLocale } from '@aix/hooks';
import enUS from './en-US';
import zhCN from './zh-CN';

/**
 * Chat 组件国际化文案类型定义
 * 先定义类型接口，确保类型安全
 */
export interface ChatLocale extends Record<string, unknown> {
  // Sender 输入框
  /** 输入框占位文字 */
  placeholder: string;
  /** 发送按钮文字 */
  send: string;
  /** 发送中状态 */
  sending: string;
  /** Enter 发送提示 */
  enterToSend: string;
  /** Shift + Enter 换行提示 */
  shiftEnterNewLine: string;

  // Bubble 消息气泡
  /** 复制按钮 */
  copy: string;
  /** 已复制提示 */
  copied: string;
  /** 重试按钮 */
  retry: string;
  /** 重新生成按钮 */
  regenerate: string;
  /** 删除按钮 */
  delete: string;
  /** 用户角色 */
  user: string;
  /** 助手角色 */
  assistant: string;
  /** 系统角色 */
  system: string;

  // Prompts 提示词
  /** 选择提示词 */
  selectPrompt: string;
  /** 快速开始 */
  quickStart: string;

  // Conversations 会话
  /** 新建对话 */
  newChat: string;
  /** 对话列表 */
  conversations: string;
  /** 删除对话 */
  deleteConversation: string;
  /** 重命名对话 */
  renameConversation: string;
  /** 对话标题（含占位符） */
  conversationTitle: string;

  // 错误提示
  /** 网络错误 */
  networkError: string;
  /** API 错误 */
  apiError: string;
  /** 请求超时 */
  timeout: string;
  /** 未知错误 */
  unknownError: string;

  // 状态
  /** 思考中 */
  thinking: string;
  /** 输入中 */
  typing: string;
  /** 生成中 */
  generating: string;
  /** 已停止 */
  stopped: string;

  // 操作确认
  /** 确认删除消息 */
  confirmDelete: string;
  /** 确认清空消息 */
  confirmClear: string;
  /** 确认停止生成 */
  confirmStop: string;

  // 附件
  /** 上传文件 */
  uploadFile: string;
  /** 上传图片 */
  uploadImage: string;
  /** 文件已上传 */
  fileUploaded: string;
  /** 上传失败 */
  uploadFailed: string;
  /** 文件大小限制（含占位符） */
  fileSizeLimit: string;

  // 其他
  /** 清空对话 */
  clearAll: string;
  /** 导出对话 */
  exportChat: string;
  /** 设置 */
  settings: string;
  /** 模型 */
  model: string;
  /** 温度 */
  temperature: string;
  /** 最大长度 */
  maxTokens: string;

  // ErrorBoundary
  /** 错误标题 */
  errorTitle: string;
  /** 错误消息 */
  errorMessage: string;
  /** 错误详情 */
  errorDetails: string;
  /** 刷新页面 */
  reload: string;
}

export const chatLocale: ComponentLocale<ChatLocale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

export { zhCN, enUS };
