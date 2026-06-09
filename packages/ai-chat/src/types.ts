import type { Component } from 'vue';

/** 消息状态机 */
export type MessageStatus =
  | 'local' // 本地刚创建（用户消息）
  | 'loading' // 已发出请求、等待首个 chunk
  | 'updating' // 流式接收中
  | 'success' // 完成
  | 'error' // 出错
  | 'abort'; // 被中断

/** 内置角色，同时允许任意自定义字符串 */
export type MessageRole = 'user' | 'ai' | 'system' | (string & {});

/** AI 回复的赞 / 踩反馈值（null 表示未反馈 / 取消） */
export type MessageFeedback = 'like' | 'dislike';

/** 一条对话消息 */
export interface ChatMessage {
  /** 消息稳定唯一 id（编辑 / 重新生成 / 块动作均按此定位） */
  id: string;
  /** 消息角色：user / ai / system 或业务自定义字符串 */
  role: MessageRole;
  /** 消息状态机当前态（loading/updating/success/error/abort/local） */
  status?: MessageStatus;
  /** 有序内容块（由 string 切换而来） */
  content: ContentBlock[];
  /** 任意业务附加信息；约定 feedback?: MessageFeedback | null 存赞/踩态，error 存原始错误 */
  extra?: Record<string, unknown>;
}

/** 单个会话（含元数据与该会话的消息列表） */
export interface Conversation {
  id: string;
  /** 会话标题 */
  label: string;
  /** 分组键（如「今天」「昨天」「更早」或业务自定义），供 Conversations 分组渲染 */
  group?: string;
  /** 排序 / 分组依据时间戳（ms） */
  timestamp?: number;
  /** 该会话的消息列表 */
  messages: ChatMessage[];
}

/** 会话列表项（仅元数据，不含 messages），供 Conversations 列表 UI 使用 */
export type ConversationItem = Omit<Conversation, 'messages'>;

/** 流 chunk 解析结果 */
export interface ParsedChunk {
  /** 本次增量文本 */
  delta?: string;
  /**
   * delta 归属的**流式文本块**类型，默认 text。
   * 仅 'text' / 'reasoning' 支持逐字累积（appendDelta）；其余块类型（sources/
   * thought-chain/attachment 及业务自定义块）是非流式整块，应通过 `block` 字段一次性追加。
   * 故此处刻意收窄而非用 ContentBlock['type'] 全集，避免诱导「给非文本块传 delta」的误用。
   */
  blockType?: 'text' | 'reasoning';
  /** 一次性追加的非流式块（如 sources） */
  block?: ContentBlock;
  /** 标记流结束 */
  done?: boolean;
}

/** 气泡所在位置：start 左侧 / end 右侧 */
export type BubblePlacement = 'start' | 'end';
/** 气泡样式变体：填充 / 描边 / 无边框 / 阴影 */
export type BubbleVariant = 'filled' | 'outlined' | 'borderless' | 'shadow';
/** 气泡圆角形状：圆角 / 贴角（靠头像一侧收尖角） */
export type BubbleShape = 'round' | 'corner';

/** 传给 contentRender / 作用域 slot 的气泡上下文信息 */
export interface BubbleContentInfo {
  /** 消息状态（供渲染器按 loading/updating/success 等分支） */
  status?: MessageStatus;
  /** 消息角色 */
  role: MessageRole;
  /** 所属消息 key（通常为消息 id），交互块回写动作时回传 */
  key: string | number;
}

/**
 * 打字机细粒度配置：Bubble / BubbleList 的 `typing` prop 除布尔外可传配置对象，
 * 透传给底层 useTypewriter 控制逐字节奏。
 */
export interface BubbleTypingConfig {
  /** 每帧追加字符数：number 固定步长 / `[min, max]` 区间内随机，默认 `[1, 3]` */
  step?: number | [number, number];
  /** 帧间隔 ms，默认 30 */
  interval?: number;
}

/**
 * 气泡 Props（跨组件共享：BubbleList 解析、RoleConfig、AiChat roles 均引用，故置于 types.ts）
 */
export interface BubbleProps {
  /** 内容块列表（有序），由各 block 渲染器分发渲染 */
  content?: ContentBlock[];
  /** 角色：决定默认头像 / 位置 / 样式（user/ai/system 或自定义），默认 'ai' */
  role?: MessageRole;
  /** 消息状态：loading 显示加载点、error 显示重试入口等，影响渲染分支 */
  status?: MessageStatus;
  /** 气泡位置：'start' 左 / 'end' 右，默认 'start' */
  placement?: BubblePlacement;
  /** 气泡样式变体：filled / outlined / borderless / shadow，默认 'filled' */
  variant?: BubbleVariant;
  /** 气泡圆角形状：round / corner，默认 'round' */
  shape?: BubbleShape;
  /** 头像图片地址（URL / data-URI），不传则不渲染头像 */
  avatar?: string;
  /** 是否加载态：显示加载点而非内容，默认 false */
  loading?: boolean;
  /** 自定义整条内容区渲染（优先级低于 content slot） */
  contentRender?: (blocks: ContentBlock[], info: BubbleContentInfo) => unknown;
  /** 虚拟列表 / block-action 回传所用的消息 key（通常为消息 id） */
  itemKey?: string | number;
  /**
   * 打字机效果：`true` 用默认节奏逐字显示；传配置对象 `{ step, interval }` 细化节奏；
   * 默认 `false`（不逐字）。适合流式回复中的 AI 气泡。
   */
  typing?: boolean | BubbleTypingConfig;
  /** block 渲染器注册表：块类型 → 组件，用于扩展新块类型或覆盖内置 text/reasoning 渲染 */
  blockRenderers?: BlockRenderers;
  /** 是否允许内联编辑（仅对 role==='user' 的气泡生效），默认 false */
  editable?: boolean;
}

/**
 * 块渲染器注册表：块类型 → 渲染组件。
 * 渲染器统一接收 props：`block`（当前内容块，必有）、`info`（气泡上下文）、`typing`（是否打字机态）。
 * 与内置注册表（text/reasoning）合并时用户优先，故可覆盖内置渲染。
 */
export type BlockRenderers = Record<string, Component>;

/** 角色 → 气泡样式映射，支持静态对象或按消息动态返回（BubbleList + AiChat 共享） */
export type RoleConfig = Partial<BubbleProps> | ((item: ChatMessage) => Partial<BubbleProps>);

/** 块交互动作信封：交互型渲染器经 onBlockAction 上抛，逐层转发到 useChat.updateBlock */
export interface BlockAction {
  /** 目标块 id */
  blockId: string;
  /** 动作类型，由块自定义（如 'select' | 'edit' | 'insert-video' | 'delete'） */
  type: string;
  /** 要就地合并进该块的字段补丁 */
  patch: Record<string, unknown>;
}

/** 块动作回调（渲染器统一可选 prop） */
export type BlockActionHandler = (action: BlockAction) => void;

/** Bubble 向上转发的块动作载荷（携带所属消息 key） */
export interface BlockActionPayload {
  /** 动作所属消息的 key（通常为消息 id），供 useChat.updateBlock 定位 */
  messageKey: string | number;
  /** 块动作内容（目标块 id / 类型 / 补丁） */
  action: BlockAction;
}

/** 模型选项（ModelSelector 用） */
export interface ModelOption {
  /** 模型唯一值（选中态与 v-model 绑定它） */
  value: string;
  /** 展示名，缺省回退 value */
  label?: string;
}

/** 快捷问题项（Prompts + AiChat 共享） */
export interface PromptItem {
  /** 唯一 key（列表渲染与点击事件标识） */
  key: string | number;
  /** 主文案/标题 */
  label: string;
  /** 可选图标（emoji 或图片地址），渲染为卡片左上角图标 */
  icon?: string;
  /** 可选描述（副文案），提供后渲染为「标题 + 描述」富卡片 */
  description?: string;
}

/** 附件条目（上传完成后的稳定形态，进入消息块、随消息持久化） */
export interface AttachmentItem {
  /** 稳定唯一 id */
  id: string;
  /** 文件名（展示用） */
  name: string;
  /** 访问地址（upload 返回；图片类用于缩略图） */
  url?: string;
  /** 字节数（展示时格式化为 KB/MB） */
  size?: number;
  /** MIME 类型（决定卡片图标 / 是否缩略图） */
  mime?: string;
  /** 业务扩展字段（如文件服务 fileId），随消息进入 request 的 ctx.messages */
  extra?: Record<string, unknown>;
}

/** 引用来源项 */
export interface SourceItem {
  /** 来源标题 */
  title: string;
  /** 来源链接，提供后渲染为可点击（新窗口打开） */
  url?: string;
  /** 摘要片段，展开时展示 */
  snippet?: string;
  /** 来源图标（favicon / emoji） */
  icon?: string;
}

/** 思维链单步状态：pending 未开始 / active 进行中（标题流光渐变）/ done 已完成 */
export type ThoughtChainStatus = 'pending' | 'active' | 'done';

/** 检索结果卡的单个 chip（深度检索类步骤的结果项） */
export interface ThoughtChainResultChip {
  /** chip 文本（结果标题） */
  text: string;
  /** 可选缩略图 url（优先于 icon 渲染） */
  thumbnail?: string;
  /** 可选图标（emoji 或短文本），无 thumbnail 时渲染 */
  icon?: string;
  /** 可选跳转链接，提供后 chip 渲染为可点击链接（新窗口打开） */
  url?: string;
}

/** 检索结果卡（深度检索类步骤的富内容）：标题 + 结果 chip 列表 */
export interface ThoughtChainResult {
  /** 检索标题，如「搜索 梵高《向日葵》单选题」 */
  title?: string;
  /** 结果项 chip 列表 */
  chips: ThoughtChainResultChip[];
}

/** 思维链（Agent 执行步骤）单步 */
export interface ThoughtChainItem {
  /** 步骤唯一 key（列表渲染标识） */
  key: string | number;
  /** 步骤图标，emoji 或短文本（如 🤔 / 🔍） */
  icon?: string;
  /** 步骤标题 */
  title: string;
  /** 步骤状态，active 时标题显示流光渐变，默认 done */
  status?: ThoughtChainStatus;
  /** 耗时徽章文案，如 "12.59秒" */
  duration?: string;
  /**
   * 检索结果卡（数据驱动，无需 slot）。提供后在折叠正文区渲染「标题 + 结果 chip 列表」，
   * 适用于「深度检索」类步骤。与 content 可共存（result 在上、content 在下）。
   */
  result?: ThoughtChainResult;
  /**
   * 折叠正文（Markdown 渲染）。需要富内容（如检索卡片）时改用 `<ThoughtChain>` 的
   * `item-content` 作用域 slot——注意该 slot 仅在**直接使用 `<ThoughtChain>`** 时可用；
   * 走 Bubble 块渲染管线（thought-chain 块经 ThoughtChainBlock 包装）时注册表只透传 props
   * 不透传 slot，富内容需通过自定义 blockRenderers 替换整个 thought-chain 渲染器实现。
   */
  content?: string;
  /** 初始是否展开，默认 true（执行过程默认展开内容） */
  defaultExpanded?: boolean;
}

/** 所有 block 的公共基底：稳定唯一 id 用作流式/打字机/v-for 的 key */
export interface BlockBase {
  id: string;
}

/** 消息内容块（有序、可扩展）。预留扩展：tool_use / image / 业务自定义块只需新增联合成员 */
export type ContentBlock =
  | (BlockBase & { type: 'text'; text: string })
  | (BlockBase & { type: 'reasoning'; text: string })
  | (BlockBase & { type: 'sources'; items: SourceItem[] })
  | (BlockBase & { type: 'thought-chain'; items: ThoughtChainItem[] })
  | (BlockBase & { type: 'attachment'; items: AttachmentItem[] });

/** 内置消息操作预设 key */
export type ActionKey = 'copy' | 'regenerate' | 'feedback';

/** 自定义消息操作项 */
export interface ActionItem {
  /** 唯一 key；不要与内置预设 key（copy/regenerate/feedback）同名，否则 v-for key 冲突 */
  key: string;
  /** 按钮文案（tooltip + aria-label），a11y 必填 */
  label: string;
  /** 图标组件（@aix/icons 或业务自有）；建议传入前用 `markRaw()` 包裹，避免组件对象进入响应式系统的告警 */
  icon?: Component;
  disabled?: boolean;
  /** 点击回调；ctx.message 为所属消息（BubbleActions 独立使用且未传 message prop 时为 undefined） */
  onClick?: (ctx: { message?: ChatMessage }) => void;
}

/** 操作条配置：字符串 = 内置预设，对象 = 自定义项，顺序即渲染顺序 */
export type ActionsItems = (ActionKey | ActionItem)[];

// ──────────────────────────────────────────────
// 语音识别类型（useVoiceInput 使用）
// ──────────────────────────────────────────────

/** 自定义语音识别器收到的回调集 */
export interface VoiceRecognizerCtx {
  /** isFinal=false：中间结果（实时预览，可被覆盖）；isFinal=true：一段定稿（不再变化） */
  onResult: (text: string, isFinal: boolean) => void;
  /** 识别出错（无权限/网络等），调用方复位 idle */
  onError: (error: unknown) => void;
  /** 识别会话结束（用户停止或识别器自停） */
  onEnd: () => void;
  /** 期望识别语言（透传 VoiceConfig.lang） */
  lang?: string;
}

/** 自定义识别器工厂：启动识别并返回停止句柄（对接讯飞/阿里云等 ASR SDK） */
export type VoiceRecognizer = (ctx: VoiceRecognizerCtx) => { stop: () => void };

export interface VoiceConfig {
  /** 自定义识别器；缺省用浏览器 Web Speech API */
  recognizer?: VoiceRecognizer;
  /** 识别语言，默认取 navigator.language */
  lang?: string;
  /** 识别失败（权限拒绝/网络/启动失败等）回调；状态仍自动复位，toast 等提示由业务做 */
  onError?: (error: unknown) => void;
}
