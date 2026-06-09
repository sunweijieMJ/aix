import type {
  AttachmentItem,
  ChatMessage,
  ContentBlock,
  MessageRole,
  MessageStatus,
  SourceItem,
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
