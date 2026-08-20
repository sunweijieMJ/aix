import type { ChatMessage, ContentBlock, Quote, QuoteBlock } from '../types';

/** 内置 intent → 指令前缀（业务可经 quote.toPrompt 覆盖整个拼装器，含多语言场景） */
const INTENT_INSTRUCTION: Record<string, string> = {
  explain: '请解释以下引用内容：',
  ask: '请回答关于以下引用内容的问题：',
  translate: '请翻译以下引用内容：',
};

/**
 * 默认拼装器：每条引用 → Markdown blockquote，多条以空行分隔。
 * intent 命中内置指令时在 blockquote 前加一行指令说明；自定义 intent 或无 intent 维持纯 blockquote。
 */
export const defaultQuoteToPrompt = (quotes: Quote[]): string =>
  quotes
    .map((q) => {
      // 优先原文 rawText：划词产生的 exact 经 normalizeText 折叠（不含 \n），
      // 直接使用会丢失代码块换行与缩进；整条引用等未折叠场景回退 exact
      const blockquote = (q.anchor.rawText ?? q.anchor.exact)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      const instruction = q.intent ? INTENT_INSTRUCTION[q.intent] : undefined;
      return instruction ? `${instruction}\n${blockquote}` : blockquote;
    })
    .join('\n\n');

/** 遍历 content 取出全部结构化引用（业务在自定义 request 里自行拼装时用） */
export const getQuotes = (message: ChatMessage): Quote[] =>
  message.content.filter((b): b is QuoteBlock => b.type === 'quote').flatMap((b) => b.quotes);

/** 该块拍平后是否会贡献文本（text 原样保留，quote 将被拍平成 text） */
const contributesText = (b: ContentBlock): boolean => b.type === 'text' || b.type === 'quote';

/**
 * 请求期把 quote 块拍平成 text 块（LLM 可见），存储/渲染层保持结构化。
 * 必须纯函数：map 出新消息/新 content，绝不 mutate 入参——
 * ctx.messages 是 SSOT 对话树上的响应式代理，就地改会污染存储层并被 exportTree 持久化。
 *
 * 拍平结果后面若还有会贡献文本的块，须补一个空行分隔：AiChat 发送划词追问时构造的是
 * `[quote, (attachment,) text]` 相邻块，而下游取文本的 messageText 以 '' 拼接——不补分隔时
 * 用户的提问会直接粘在最后一行 blockquote 后面（`> 引文提问`），在 Markdown 语义下被吞进
 * 引文，模型看到的是「一段被引用的话」而不是「引文 + 问题」。仅在确有后续文本时补，
 * 纯引用发送（allowEmptySubmit）不拖多余空行。
 */
export const flattenQuoteBlocks = (
  messages: ChatMessage[],
  toPrompt: (quotes: Quote[]) => string = defaultQuoteToPrompt,
): ChatMessage[] =>
  messages.map((m) => {
    if (!m.content.some((b) => b.type === 'quote')) return m;
    const content: ContentBlock[] = m.content.map((b, i) => {
      if (b.type !== 'quote') return b;
      const sep = m.content.slice(i + 1).some(contributesText) ? '\n\n' : '';
      return { id: b.id, type: 'text', text: toPrompt(b.quotes) + sep };
    });
    return { ...m, content };
  });
