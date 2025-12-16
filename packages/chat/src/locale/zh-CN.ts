/**
 * @fileoverview Chat 组件中文语言包
 */

import type { ChatLocale } from './index';

export default {
  // Sender 输入框
  placeholder: '请输入消息...',
  send: '发送',
  sending: '发送中...',
  enterToSend: 'Enter 发送',
  shiftEnterNewLine: 'Shift + Enter 换行',

  // Bubble 消息气泡
  copy: '复制',
  copied: '已复制',
  retry: '重试',
  regenerate: '重新生成',
  delete: '删除',
  user: '我',
  assistant: '助手',
  system: '系统',

  // Prompts 提示词
  selectPrompt: '选择一个开始',
  quickStart: '快速开始',

  // Conversations 会话
  newChat: '新建对话',
  conversations: '对话列表',
  deleteConversation: '删除对话',
  renameConversation: '重命名',
  conversationTitle: '对话 {count}',

  // 错误提示
  networkError: '网络错误，请稍后重试',
  apiError: 'API 调用失败',
  timeout: '请求超时',
  unknownError: '未知错误',

  // 状态
  thinking: '思考中...',
  typing: '输入中...',
  generating: '生成中...',
  stopped: '已停止',

  // 操作确认
  confirmDelete: '确定删除此消息吗？',
  confirmClear: '确定清空所有消息吗？',
  confirmStop: '确定停止生成吗？',

  // 附件
  uploadFile: '上传文件',
  uploadImage: '上传图片',
  fileUploaded: '文件已上传',
  uploadFailed: '上传失败',
  fileSizeLimit: '文件大小不能超过 {size}',

  // 其他
  clearAll: '清空对话',
  exportChat: '导出对话',
  settings: '设置',
  model: '模型',
  temperature: '温度',
  maxTokens: '最大长度',

  // ErrorBoundary
  errorTitle: '哎呀，出错了',
  errorMessage: '发生了一个错误',
  errorDetails: '查看错误详情',
  reload: '刷新页面',
} as const satisfies ChatLocale;
