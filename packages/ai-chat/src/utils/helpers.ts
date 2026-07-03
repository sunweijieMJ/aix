import type {
  AttachmentItem,
  ChatMessage,
  ContentBlock,
  MessageRole,
  MessageStatus,
  Quote,
  SourceItem,
  SuggestionItem,
  ThoughtChainItem,
} from '../types';

let blockUid = 0;
/** block 稳定唯一 id（单调递增，保证同一毫秒内也不重复） */
export const genBlockId = (): string => `blk-${Date.now()}-${blockUid++}`;

let msgUid = 0;
/** message 稳定唯一 id */
export const genMsgId = (): string => `msg-${Date.now()}-${msgUid++}`;

// 各工厂返回精确的窄类型（Extract 到对应 type），便于直接喂给只接受特定块类型的组件 prop
// （如 TextBlock 仅收 text/reasoning）。
/** 创建文本块 */
export const textBlock = (text: string): Extract<ContentBlock, { type: 'text' }> => ({
  id: genBlockId(),
  type: 'text',
  text,
});

/** 创建推理块（思考过程，通常折叠展示） */
export const reasoningBlock = (text: string): Extract<ContentBlock, { type: 'reasoning' }> => ({
  id: genBlockId(),
  type: 'reasoning',
  text,
});

/** 创建引用来源块 */
export const sourcesBlock = (items: SourceItem[]): Extract<ContentBlock, { type: 'sources' }> => ({
  id: genBlockId(),
  type: 'sources',
  items,
});

/** 创建思维链块（Agent 执行步骤时间线） */
export const thoughtChainBlock = (
  items: ThoughtChainItem[],
): Extract<ContentBlock, { type: 'thought-chain' }> => ({
  id: genBlockId(),
  type: 'thought-chain',
  items,
});

/** 创建附件块（用户消息携带的已上传附件） */
export const attachmentBlock = (
  items: AttachmentItem[],
): Extract<ContentBlock, { type: 'attachment' }> => ({
  id: genBlockId(),
  type: 'attachment',
  items,
});

/** 创建图表块（结构化路径，MVP 仅 echarts）。spec 为 ECharts option 对象；opts 补标题 / alt / 态 / 交互 */
export const chartBlock = (
  kind: Extract<ContentBlock, { type: 'chart' }>['kind'],
  spec: unknown,
  opts?: {
    title?: string;
    alt?: string;
    state?: 'loading' | 'ready' | 'error';
    interactive?: boolean;
  },
): Extract<ContentBlock, { type: 'chart' }> => ({
  id: genBlockId(),
  type: 'chart',
  engine: 'echarts',
  kind,
  spec,
  ...(opts?.title !== undefined ? { title: opts.title } : {}),
  ...(opts?.alt !== undefined ? { alt: opts.alt } : {}),
  ...(opts?.state !== undefined ? { state: opts.state } : {}),
  ...(opts?.interactive !== undefined ? { interactive: opts.interactive } : {}),
});

/** quote 块工厂：pendingQuotes → 一等 quote 块（发送时前置进 content） */
export const quoteBlock = (quotes: Quote[]): ContentBlock => ({
  id: genBlockId(),
  type: 'quote',
  quotes,
});

let quoteIdSeed = 0;
/** 引用 id：运行时全局唯一（模块级计数器）（chip v-for key / 删除定位） */
export const genQuoteId = (): string => `q-${++quoteIdSeed}`;

/** 构造单 text block 的消息（最常用，纯文本场景） */
export const textMessage = (role: MessageRole, text: string): ChatMessage => ({
  id: genMsgId(),
  role,
  content: [textBlock(text)],
});

/** 构造任意 blocks 的消息，支持可选 status / id / extra */
export const createMessage = (
  role: MessageRole,
  blocks: ContentBlock[],
  opts?: { id?: string; status?: MessageStatus; extra?: Record<string, unknown> },
): ChatMessage => ({
  id: opts?.id ?? genMsgId(),
  role,
  content: blocks,
  ...(opts?.status !== undefined ? { status: opts.status } : {}),
  ...(opts?.extra !== undefined ? { extra: opts.extra } : {}),
});

/** 提取消息可复制纯文本：仅拼接 text block（不含 reasoning/sources） */
export const messageText = (m: ChatMessage): string =>
  m.content
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');

/** 追问建议归一化：字符串条目 → { text }，对象透传（双通道共用） */
export const normalizeSuggestions = (
  input: Array<string | SuggestionItem>,
): SuggestionItem[] => input.map((s) => (typeof s === 'string' ? { text: s } : s));

/** 工具块对自动滚动跟随的贡献：argsText 长度 + output 存在性（避免对大结果反复 stringify） */
export function toolFollowLen(blocks: ContentBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type === 'tool_use') n += (b.argsText?.length ?? 0) + (b.output != null ? 1 : 0);
  }
  return n;
}
