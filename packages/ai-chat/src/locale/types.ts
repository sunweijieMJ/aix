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
  /** 思考耗时后缀模板，{s} 替换为秒数，拼接在 thoughtTitle 之后，如"（用时34秒）" */
  thoughtDurationSuffix: string;
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
  /** 内联编辑框的取消按钮 */
  cancelButton: string;
  /** 内联编辑框的确认按钮无障碍标签：按钮文案复用 sendButton（显示"发送"），
   * 但两者在同一气泡内可能同时可见（编辑中的消息 + 底部 Sender），aria-label 需区分，避免 role+name 撞车导致无法定位 */
  editSaveButton: string;
  /** 删除消息按钮 */
  deleteButton: string;
  /** 回到底部按钮的无障碍标签 */
  backToBottom: string;
  /** 请求出错时气泡内展示的错误文案 */
  errorMessage: string;
  /** markdown 内联图片加载失败时的占位文案（无 alt/src 时兜底） */
  imageLoadError: string;
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
  /** 会话搜索框 placeholder / 无障碍标签 */
  conversationsSearchPlaceholder: string;
  /** 会话搜索无匹配结果时的空态文案 */
  conversationsSearchEmpty: string;
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
  /** 语音播报：朗读消息按钮 */
  speakButton: string;
  /** 语音播报：停止朗读按钮 */
  speakStopButton: string;
  /** 附件面板：标题 */
  attachmentsTitle: string;
  /** 附件面板：拖放区主提示文案（placeholder title） */
  attachmentPlaceholder: string;
  /** 附件面板：拖放区副提示文案（placeholder description，对齐 adx 三段式） */
  attachmentPlaceholderHint: string;
  /** 附件面板：收起按钮 */
  attachmentsCollapse: string;
  /** 上一个版本切换按钮的无障碍标签 */
  prevBranch: string;
  /** 下一个版本切换按钮的无障碍标签 */
  nextBranch: string;
  /** 工具调用块：输入参数区标题 */
  toolInput: string;
  /** 工具调用块：输出结果区标题 */
  toolOutput: string;
  /** 工具调用块：错误信息区标题 */
  toolError: string;
  /** 图表块：无障碍默认标签（无 title/alt 时） */
  chartLabel: string;
  /** 图表块：无法渲染时的降级文案 */
  chartError: string;
  /** 消息操作栏：整条引用按钮 */
  quoteButton: string;
  /** 划词菜单：解释 */
  quoteExplain: string;
  /** 划词菜单：追问 */
  quoteAsk: string;
  /** 划词菜单：翻译 */
  quoteTranslate: string;
  /** 划词工具条的无障碍标签 */
  quoteToolbarLabel: string;
  /** 引用预览 chip：移除按钮 */
  quoteRemove: string;
  /** 用户消息内引用块的标题 */
  quoteBlockTitle: string;
  /** 引用 chip 折叠：展开其余引用按钮的无障碍标签/title */
  quoteChipsExpand: string;
  /** 引用 chip 折叠：收起按钮文案 */
  quoteChipsCollapse: string;
  /** 触发菜单：菜单标题无障碍标签 */
  triggerMenuLabel: string;
  /** 触发菜单：无匹配结果空态文案 */
  triggerMenuEmpty: string;
  /** 触发菜单：加载中占位文案 */
  triggerMenuLoading: string;
  /** 追问建议：面板标题 */
  suggestionsLabel: string;
  /** HTML Sandbox：预览标签页 */
  htmlSandboxPreview: string;
  /** HTML Sandbox：代码标签页 */
  htmlSandboxCode: string;
  /** HTML Sandbox：新窗口打开按钮 */
  htmlSandboxOpenNewWindow: string;
}
