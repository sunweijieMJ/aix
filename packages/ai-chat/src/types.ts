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
  /** 追问建议（parseChunk 流内下发落库，随消息树持久化）；展示规则见 AiChat */
  suggestions?: SuggestionItem[];
  /** 任意业务附加信息；约定 feedback?: MessageFeedback | null 存赞/踩态，error 存原始错误 */
  extra?: Record<string, unknown>;
}

/**
 * parser 1→N 拆分时，包内部写入派生气泡 `extra.__sub` 的位置元信息。
 * 首个子气泡复用父消息 id，其余派生稳定 id（`${父id}__${index}`）；
 * 供操作条等按「仅末气泡显示」去重，业务读取时收敛为 `SubBubbleMeta | undefined`。
 */
export interface SubBubbleMeta {
  /** 派生气泡在拆分组中的序号（0 起） */
  index: number;
  /** 拆分组内气泡总数 */
  count: number;
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
  /** 该会话的对话树（分支持久化）。存在时优先于 messages；旧数据仅有 messages 时按线性树迁移。 */
  tree?: ExportedTree;
}

/** 会话列表项（仅元数据，不含 messages），供 Conversations 列表 UI 使用 */
export type ConversationItem = Omit<Conversation, 'messages'>;

/** 一个流事件翻译出的工具增量。parseChunk 保持纯翻译，跨事件累积由 useChat 侧完成 */
export interface ToolEventDelta {
  /** 关联键：provider 流内索引（Anthropic 内容块 index / OpenAI tool_calls index） */
  index: number;
  toolCallId?: string;
  toolName?: string;
  argsTextDelta?: string;
  input?: unknown;
  argsDone?: boolean;
  output?: unknown;
  errorText?: string;
}

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
  /** 工具调用增量 */
  tool?: ToolEventDelta;
  /**
   * 追问建议（通道②流内下发）：收到即整体覆盖该条消息的 suggestions（后到覆盖先到，
   * 含 resume 分段流）；字符串条目会被归一为 SuggestionItem
   */
  suggestions?: Array<string | SuggestionItem>;
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
  /** 工具渲染器注册表：toolName → 组件，透传给内置 ToolUseBlock 做按名路由 */
  toolRenderers?: BlockRenderers;
  /** 是否处于内联编辑态（受控，由外部驱动进入/退出——见 BubbleList.startEdit） */
  editing?: boolean;
  /** 编辑态下是否禁止保存（如全局请求进行中），true 时点击保存无效果、保留草稿与编辑态 */
  saveDisabled?: boolean;
}

/**
 * 块渲染器注册表：块类型 → 渲染组件。
 * 渲染器统一接收 props：`block`（当前内容块，必有）、`info`（气泡上下文）、`typing`（是否打字机态）。
 * 与内置注册表（text/reasoning）合并时用户优先，故可覆盖内置渲染。
 */
export type BlockRenderers = Record<string, Component>;

/**
 * 角色级可配的气泡字段（仅样式/渲染类：placement/variant/shape/avatar/contentRender/blockRenderers）。
 * 类型即文档地排除列表级收口的字段：content/role/status/loading/itemKey 由消息数据驱动，
 * typing/editing/saveDisabled/toolRenderers 由列表级策略收口（打字机只对本会话流式过的消息开启、
 * editing/saveDisabled 绑定编辑态与全局 loading 语义、toolRenderers 由列表级绑定）——
 * 这些键在 BubbleList 模板中被显式绑定覆盖，role 级传入会静默无效，故从类型上禁止。
 */
export type RoleBubbleConfig = Partial<
  Omit<
    BubbleProps,
    | 'content'
    | 'role'
    | 'status'
    | 'loading'
    | 'itemKey'
    | 'typing'
    | 'editing'
    | 'saveDisabled'
    | 'toolRenderers'
  >
>;

/** 角色 → 气泡样式映射，支持静态对象或按消息动态返回（BubbleList + AiChat 共享） */
export type RoleConfig = RoleBubbleConfig | ((item: ChatMessage) => RoleBubbleConfig);

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

// ==================== 引用 / 划词追问 ====================

/** 引用锚点：exact 为主（LLM 可见 + 回链文本搜索），偏移/选择器为冗余快路径 */
export interface QuoteAnchor {
  source: { messageId: string; blockId?: string; role?: MessageRole };
  /** 归一化选中文本（整条引用时为整条消息文本） */
  exact: string;
  /**
   * 选区原文（未折叠空白、保留换行）。exact 经 normalizeText 折叠仅作回链匹配口径，
   * 复制与 toPrompt 拼装优先使用本字段，避免代码块/多段落引用丢失换行与缩进
   */
  rawText?: string;
  /** 选中前 ~contextChars 字符（文本搜索消歧，抗漂移） */
  prefix?: string;
  /** 选中后 ~contextChars 字符 */
  suffix?: string;
  /** 块内字符偏移（含），纯文本块精确高亮快路径；整条引用无此字段 */
  start?: number;
  /** 块内字符偏移（不含） */
  end?: number;
}

export interface Quote {
  id: string;
  anchor: QuoteAnchor;
  /** explain / ask / translate / 业务自定义 */
  intent?: string;
}

/** 一等内容块：引用的唯一真源（非 text，onEdit 原位保留；请求期经 toPrompt 拍平） */
export interface QuoteBlock extends BlockBase {
  type: 'quote';
  quotes: Quote[];
}

/** 工具调用生命周期状态（awaiting-approval / executing 为 Layer 2 预留） */
export type ToolUseState =
  | 'input-streaming'
  | 'input-available'
  | 'awaiting-approval'
  | 'executing'
  | 'output-available'
  | 'output-error';

/** 图表渲染引擎（判别键）。MVP 仅 echarts；function-plot 为数学函数图像专用副库，分期接入 */
export type ChartEngine = 'echarts' | 'function-plot';

/** ECharts 统计图种类（仅 echarts 引擎有此维度：决定骨架占位形态 + 二次动态 import 哪个图表子模块） */
export type EChartsChartKind =
  | 'bar'
  | 'line'
  | 'pie'
  | 'scatter'
  | 'radar'
  | 'funnel'
  | 'gauge'
  | 'heatmap'
  | 'graph'
  | 'tree'
  | 'treemap';

/** 图片条目（image 块的单张图片） */
export interface ImageItem {
  /** 图片地址 */
  url: string;
  /** 无障碍替代文本，可选；缺失时渲染层降级为通用文案 */
  alt?: string;
  /** 缩略图地址（多图网格用），缺省直接用 url */
  thumbnail?: string;
}

/** 消息内容块（有序、可扩展）。预留扩展：业务自定义块只需新增联合成员 */
export type ContentBlock =
  | (BlockBase & { type: 'text'; text: string })
  | (BlockBase & {
      type: 'reasoning';
      text: string;
      /** 思考起点（epoch ms），由 useChat 在该 reasoning 块首次创建时打点 */
      startedAt?: number;
      /**
       * 思考终点（epoch ms），由 useChat 在思考被顶替（转正文/工具/其它块）或消息终态
       * 落定时打点；undefined 表示仍在思考，或该块并非由 useChat 计时产生（历史/业务自建数据）
       */
      endedAt?: number;
    })
  | (BlockBase & { type: 'sources'; items: SourceItem[] })
  | (BlockBase & { type: 'thought-chain'; items: ThoughtChainItem[] })
  | (BlockBase & { type: 'attachment'; items: AttachmentItem[] })
  | (BlockBase & {
      type: 'tool_use';
      /** 协议侧调用 id（toolu_xxx / call_xxx）：配对结果、并行去重、resume 关联 */
      toolCallId: string;
      /** 工具名：toolRenderers 按它路由 */
      toolName: string;
      /** 生命周期状态 */
      state: ToolUseState;
      /** 原始未完成 JSON（流式拼参时展示用，不怕 parse 失败） */
      argsText?: string;
      /** 参数对象（整体给时直接落 / 流式拼参齐全后解析出） */
      input?: unknown;
      /** 工具结果 */
      output?: unknown;
      /** 出错文案 */
      errorText?: string;
    })
  | (BlockBase & {
      type: 'chart';
      /** 渲染引擎（判别键）；MVP 仅 echarts，function-plot 分期扩展本联合 */
      engine: 'echarts';
      /** 统计图种类：决定骨架占位形态 + 二次动态 import 哪个图表子模块 */
      kind: EChartsChartKind;
      /**
       * ECharts option 对象。刻意用 unknown 不静态耦合 EChartsOption 类型
       * （echarts 是 optionalDependency，静态 import 其类型在未安装环境会 TS2307），
       * 与 MermaidLike/KatexLike 同 DI 策略；运行时校验后 setOption。
       */
      spec: unknown;
      /** 可选标题（无障碍标签 & 卡片头部展示） */
      title?: string;
      /** 无障碍文字替代：屏幕阅读器朗读的图表描述 / 数据摘要，作 role="img" 的 aria-label */
      alt?: string;
      /** 渲染态：loading 骨架 / ready 出图 / error 降级；流式拼 spec 期间为 loading */
      state?: 'loading' | 'ready' | 'error';
      /** 交互回写用（切换图型/取点等经 BlockAction 上抛）；无交互需求可不填 */
      interactive?: boolean;
    })
  | (BlockBase & {
      type: 'image';
      /** 图片列表，支持单图（长度 1）与多图 gallery（如生图工具一次产出多个变体） */
      images: ImageItem[];
      /** 渲染态：loading 骨架 / ready 出图 / error 降级；流式生图期间为 loading。缺省按 ready 处理 */
      state?: 'loading' | 'ready' | 'error';
      /** 出错文案 */
      errorText?: string;
    })
  | QuoteBlock;

/** 内置消息操作预设 key */
export type ActionKey =
  | 'copy'
  | 'copySource'
  | 'regenerate'
  | 'feedback'
  | 'speak'
  | 'quote'
  | 'edit'
  | 'delete';

/** 自定义消息操作项 */
export interface ActionItem {
  /** 唯一 key；不要与内置预设 key（copy/copySource/regenerate/feedback/speak/quote/edit/delete）同名，否则 v-for key 冲突 */
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

/** 划词浮层内置动作 key（与 BubbleActions 的 ActionKey 是两套并存注册表，勿混淆） */
export type QuoteActionKey = 'explain' | 'ask' | 'translate' | 'copy';

/** 划词动作执行上下文：三条出口以「是否写 textarea」区分——insertQuote 仅加 chip、
 *  ask 加 chip + 可选注入 textarea、copy 仅复制 */
export interface QuoteActionContext {
  quote: Quote;
  /** 按 source.messageId 从渲染视图 parsedMessages 解析（可能是派生气泡 id） */
  message?: ChatMessage;
  insertQuote: (q?: Quote) => void;
  ask: (q?: Quote, prompt?: string) => void;
  copy: (text?: string) => void;
  close: () => void;
}

export interface QuoteActionItem {
  /** 勿与内置 key（explain/ask/translate/copy）撞名 */
  key: string;
  /** 按钮文案 / aria-label（a11y 必填） */
  label: string;
  icon?: Component;
  disabled?: boolean;
  onClick: (ctx: QuoteActionContext) => void;
}

export type QuoteActionsItems = (QuoteActionKey | QuoteActionItem)[];

/** L2 解析后的统一渲染形态：皮肤按此渲染按钮，不关心 key 是内置还是自定义 */
export interface ResolvedQuoteAction {
  key: string;
  label: string;
  icon?: Component;
  disabled?: boolean;
}

/** 统一定制入口 AiChatConfig.quote / AiChat prop quote */
export interface QuoteConfig {
  /** 总开关；未配置 quote 时默认 false，传入 QuoteConfig 对象时默认 true */
  enable?: boolean;
  /** 划词浮层动作，默认 ['explain','ask','translate','copy'] */
  actions?: QuoteActionsItems;
  /** 是否往 BubbleActions 自动注入内置 'quote'（PC 引整条），默认 true */
  pcQuoteAction?: boolean;
  /** 移动精选实现（P2 预留，首版不接线） */
  mobileSelection?: 'custom' | 'native';
  /** 长按出菜单延时 ms，默认 500 */
  longPressDelay?: number;
  /** 精选初选粒度（P2 预留，首版不接线） */
  granularity?: 'word' | 'sentence';
  /** 键盘选区唤出，默认 true */
  keyboard?: boolean;
  /** 启用角色，默认 ['ai'] */
  roles?: MessageRole[];
  /** 追加排除选择器（内置已排除 a/button/input 等交互元素） */
  excludeSelector?: string;
  /** quote 块 → LLM 可见文本 的拼装器，默认 blockquote */
  toPrompt?: (quotes: Quote[]) => string;
  /** 深度换肤：替换 PC 工具条组件（props/emits 与 QuoteToolbar 一致） */
  toolbar?: Component;
  /** 深度换肤：替换移动 sheet 组件（props/emits 与 QuoteSheet 一致） */
  sheet?: Component;
  /** 引用 chip 折叠阈值：超过该数量收起为「+N」，默认 3；设 Infinity 关闭折叠 */
  maxVisibleChips?: number;
}

// ============ 触发菜单（@提及 / 斜杠命令） ============

/** 触发菜单选中回调上下文 */
export interface TriggerSelectCtx {
  item: TriggerItem;
  /** 触发字符 */
  trigger: string;
  /** 选中时的检索词（触发字符之后到光标） */
  query: string;
  /** 清空输入框 */
  clear: () => void;
  /** 命令式改写输入框内容 */
  setValue: (text: string) => void;
}

/** 触发菜单候选项 */
export interface TriggerItem {
  value: string;
  label: string;
  icon?: Component;
  description?: string;
  /**
   * 选中后回填文本，**不含触发字符**（前缀由 keepTrigger 统一控制，避免双写歧义）。
   * 缺省：触发字符为 '@' 时为 `${label} `；其余为 ''（即仅清除已键入的触发段）
   */
  insertText?: string;
  /** 命令式行为（如 /清空会话）；与 insertText 可并存 */
  onSelect?: (ctx: TriggerSelectCtx) => void;
  /** 插入时是否保留触发字符前缀（最终插入 = keepTrigger ? char+insertText : insertText）。默认 '@'→true，其余→false */
  keepTrigger?: boolean;
}

/** 单个触发字符的配置（Sender props.triggers 条目） */
export interface TriggerConfig {
  /** 触发字符，单字符（'@' | '/' | 自定义）；重复 char 后者覆盖前者并 dev warn */
  char: string;
  /** 触发位置：'anywhere' 任意位置（前一字符须空白/行首）/ 'start' 仅行首。默认 '@'→anywhere，其余→start */
  position?: 'anywhere' | 'start';
  /** 候选：静态数组（按 label/value 含 query 过滤，忽略大小写）或（异步）函数 */
  items: TriggerItem[] | ((query: string) => TriggerItem[] | Promise<TriggerItem[]>);
}

/** 提交时随 submit/send meta 上抛的 mention 实体 */
export interface MentionEntity {
  value: string;
  label: string;
  /** 来源触发字符 */
  trigger: string;
}

/** Sender submit / AiChat send 第三/四参的扩展元信息 */
export interface SubmitMeta {
  mentions?: MentionEntity[];
}

// ============ 追问建议（Follow-up Suggestions） ============

export interface SuggestionItem {
  /** 点击后发送/回填的文本 */
  text: string;
  /** 展示文案，缺省取 text */
  label?: string;
  icon?: Component;
}

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

// ──────────────────────────────────────────────
// 语音播报类型（useSpeech 使用）
// ──────────────────────────────────────────────

/** 自定义合成器收到的上下文（参数 + 生命周期回调） */
export interface SpeechSynthesizerCtx {
  /** 朗读语言（透传 SpeechConfig.lang） */
  lang?: string;
  /** 语速 */
  rate?: number;
  /** 音调 */
  pitch?: number;
  /** 音量 */
  volume?: number;
  /** 音色标识（云端 voice id / 浏览器 voiceURI 或 name） */
  voice?: string;
  /** 首段真正发声时触发（用于 UI 起播态） */
  onStart: () => void;
  /** 队列耗尽且已 finish（自然播完）时触发 */
  onEnd: () => void;
  /** 合成 / 播放出错 */
  onError: (error: unknown) => void;
}

/** 一次朗读会话句柄 */
export interface SpeechSession {
  /** 追加一段待朗读文本（增量分句后多次调用 / 整段一次调用） */
  enqueue: (text: string) => void;
  /** 标记没有更多文本（流结束）；队列放空后触发 ctx.onEnd */
  finish: () => void;
  /** 立即停止并清空队列 */
  stop: () => void;
}

/** 自定义合成器工厂：启动一次会话并返回句柄（对接讯飞/阿里云等云端 TTS） */
export type SpeechSynthesizer = (ctx: SpeechSynthesizerCtx) => SpeechSession;

export interface SpeechConfig {
  /** 自定义合成器；缺省用浏览器 speechSynthesis */
  synthesizer?: SpeechSynthesizer;
  /** 朗读语言，默认取 navigator.language */
  lang?: string;
  /** 语速 */
  rate?: number;
  /** 音调 */
  pitch?: number;
  /** 音量 */
  volume?: number;
  /** 音色标识 */
  voice?: string;
  /**
   * 自定义要朗读的文本（默认：stripMarkdownForSpeech(messageText(m))）。
   * 返回空串则该消息不显示朗读按钮。
   */
  getText?: (m: ChatMessage) => string;
  /** 是否自动朗读流式 AI 回复，默认 false */
  autoPlay?: boolean;
  /** 合成 / 播放失败回调；状态仍自动复位，toast 等提示由业务做 */
  onError?: (error: unknown) => void;
}

// ──────────────────────────────────────────────
// 对话树 / 分支（messageTree 使用）
// ──────────────────────────────────────────────

/** 对话树节点：扁平存储，parentId 互链；node.id === message.id，ROOT 节点 message 为 null */
export interface MessageNode {
  id: string;
  parentId: string;
  message: ChatMessage | null;
  /** 子分支 id（有序）；同一 parent 下多个 child = 兄弟版本 */
  childIds: string[];
}

/** 分支元信息（供切换器渲染）：当前序号与兄弟总数 */
export interface BranchMeta {
  index: number;
  count: number;
}

/** 树的可持久化形态：扁平节点表 + 当前激活叶子 id */
export interface ExportedTree {
  nodes: { id: string; parentId: string; message: ChatMessage }[];
  headId: string;
}
