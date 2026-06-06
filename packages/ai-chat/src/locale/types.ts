export interface AiChatLocale {
  /** 输入框占位提示 */
  senderPlaceholder: string;
  /** 发送按钮无障碍标签 */
  sendButton: string;
  /** 停止按钮无障碍标签 */
  stopButton: string;
  /** 重试按钮文案 */
  retryButton: string;
  /** 思考中提示文案 */
  thinking: string;
  /** 思考完成后折叠面板标题 */
  thoughtTitle: string;
  /** 复制消息按钮 */
  copyButton: string;
  /** 复制成功反馈文案 */
  copiedButton: string;
  /** 重新生成回复按钮 */
  regenerateButton: string;
  /** 赞按钮（AI 回复反馈） */
  likeButton: string;
  /** 踩按钮（AI 回复反馈） */
  dislikeButton: string;
  /** 编辑按钮（结果卡片） */
  editButton: string;
  /** 退出编辑 */
  exitEdit: string;
  /** 保存 */
  saveButton: string;
  /** 新增选项 */
  addOption: string;
  /** 题型标签：单项选择题 */
  singleChoiceType: string;
  /** 题型标签：多项选择题 */
  multiChoiceType: string;
  /** 题干 label */
  stemLabel: string;
  /** 选项 label */
  optionsLabel: string;
  /** 答案解析 label */
  analysisLabel: string;
  /** 标准答案前缀 */
  standardAnswer: string;
  /** 必须设置一项答案提示 */
  mustSetAnswer: string;
  /** 题干输入占位 */
  stemPlaceholder: string;
  /** 选项输入占位 */
  optionPlaceholder: string;
  /** 解析输入占位 */
  analysisPlaceholder: string;
  /** 插入视频 */
  insertVideo: string;
  /** 删除 */
  deleteButton: string;
  /** 上移选项 */
  moveUp: string;
  /** 下移选项 */
  moveDown: string;
  /** 历史消息加载中提示文案 */
  loadingMessages: string;
  /** 回到底部按钮的无障碍标签 */
  backToBottom: string;
  /** 请求出错时气泡内展示的错误文案 */
  errorMessage: string;
  /** 引用来源块标题（sources 块） */
  sourcesTitle: string;
  /** 新建会话按钮 */
  newConversation: string;
  /** 重命名会话 */
  renameConversation: string;
  /** 删除会话 */
  deleteConversation: string;
  /** 会话列表空态 */
  noConversations: string;
  /** 附件：添加附件按钮 */
  attachButton: string;
  /** 附件：上传中提示（发送按钮 title） */
  attachmentUploading: string;
  /** 附件：重试上传按钮 */
  attachmentRetry: string;
  /** 附件：删除按钮 */
  attachmentRemove: string;
  /** 语音：开始语音输入按钮 */
  voiceButton: string;
  /** 语音：停止语音输入按钮 */
  voiceStopButton: string;
  /** 语音：聆听中占位文案 */
  voiceListening: string;
  /** 附件面板：标题 */
  attachmentsTitle: string;
  /** 附件面板：拖放区主提示文案（placeholder title） */
  attachmentPlaceholder: string;
  /** 附件面板：拖放区副提示文案（placeholder description，对齐 adx 三段式） */
  attachmentPlaceholderHint: string;
  /** 附件面板：收起按钮 */
  attachmentsCollapse: string;
}
