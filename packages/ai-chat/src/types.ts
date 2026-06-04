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
  id: string;
  role: MessageRole;
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
   * thought-chain/choice）是非流式整块，应通过 `block` 字段一次性追加。
   * 故此处刻意收窄而非用 ContentBlock['type'] 全集，避免诱导「给非文本块传 delta」的误用。
   */
  blockType?: 'text' | 'reasoning';
  /** 一次性追加的非流式块（如 sources） */
  block?: ContentBlock;
  /** 标记流结束 */
  done?: boolean;
}

/** 气泡所在位置 */
export type BubblePlacement = 'start' | 'end';
export type BubbleVariant = 'filled' | 'outlined' | 'borderless' | 'shadow';
export type BubbleShape = 'round' | 'corner';

/** 传给 contentRender / 作用域 slot 的信息 */
export interface BubbleContentInfo {
  status?: MessageStatus;
  role: MessageRole;
  key: string | number;
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
  /** 打字机效果：开启后内容逐字显示（适合流式回复中的 AI 气泡），默认 false */
  typing?: boolean;
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
  messageKey: string | number;
  action: BlockAction;
}

/** 选择题选项（单选 / 多选共用） */
export interface ChoiceOption {
  /** 选项稳定 id（answer / selected 引用它） */
  id: string;
  /** 选项序号标签，如 A/B/C/D */
  label: string;
  /** 选项内容文本 */
  content: string;
}

/** 模型选项（ModelSelector 用） */
export interface ModelOption {
  value: string;
  /** 展示名，缺省回退 value */
  label?: string;
}

/** 快捷问题项（Prompts + AiChat 共享） */
export interface PromptItem {
  key: string | number;
  /** 主文案/标题 */
  label: string;
  /** 可选图标（emoji 或图片地址），渲染为卡片左上角图标 */
  icon?: string;
  /** 可选描述（副文案），提供后渲染为「标题 + 描述」富卡片 */
  description?: string;
}

/** 引用来源项 */
export interface SourceItem {
  title: string;
  url?: string;
  snippet?: string;
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
  key: string | number;
  /** 步骤图标，emoji 或短文本（如 🤔 / 🔍） */
  icon?: string;
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

/**
 * 选择题块字段（单选 / 多选统一）：被 `type:'choice'` 块复用。
 * 单选与多选的差异仅由 `multiple` 标记 + `answer/selected` 是否为数组体现，
 * 同一套数据结构、同一个渲染器覆盖两种题型。
 */
export interface ChoiceBlockFields {
  /** 题干 */
  stem: string;
  /** 选项列表 */
  options: ChoiceOption[];
  /** 是否多选；默认 false（单选）。多选时 answer / selected 为选项 id 数组 */
  multiple?: boolean;
  /** 展示模式：'review' 只读结果卡（默认，直出标准答案 / 解析）/ 'answer' 可点击作答 */
  mode?: 'review' | 'answer';
  /** 标准答案：单选为选项 id，多选为选项 id 数组 */
  answer?: string | string[];
  /** 用户作答：单选为选项 id，多选为选项 id 数组（作答时运行时回写） */
  selected?: string | string[];
  /** 详细解析 */
  analysis?: string;
  /** 是否允许点击编辑题目本身，默认 false */
  editable?: boolean;
}

/** 消息内容块（有序、可扩展）。预留扩展：tool_use / image 等只需新增联合成员 */
export type ContentBlock =
  | (BlockBase & { type: 'text'; text: string })
  | (BlockBase & { type: 'reasoning'; text: string })
  | (BlockBase & { type: 'sources'; items: SourceItem[] })
  | (BlockBase & { type: 'thought-chain'; items: ThoughtChainItem[] })
  | (BlockBase & { type: 'choice' } & ChoiceBlockFields);
