import type { ChatMessage } from '../types';
import { messageText } from './helpers';

/** OpenAI 兼容的单条消息（请求体 messages 项） */
export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | (string & {});
  content: string;
}

/**
 * OpenAI 兼容 chat/completions 请求参数（常用子集，直接透传进请求体）。
 * 未显式列出的字段（tools / tool_choice / response_format / ...）可经索引签名补充。
 */
export interface OpenAIChatParams {
  /** 模型名，如 'gpt-4o' / 'deepseek-chat' / 'qwen-plus' */
  model: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  /** 流式开关，createOpenAIRequest 默认 true（不建议关闭，否则收不到增量） */
  stream?: boolean;
  /** 其余 OpenAI 兼容字段按需透传 */
  [key: string]: unknown;
}

export interface CreateOpenAIRequestOptions extends OpenAIChatParams {
  /**
   * 接口地址：可为基础地址（如 `https://api.openai.com/v1`，自动补 `/chat/completions`），
   * 或已含 `/chat/completions` 的完整地址（原样使用）。
   */
  baseURL: string;
  /**
   * API Key（写入 `Authorization: Bearer <key>`）。
   * ⚠️ 浏览器端直连会暴露密钥，仅适用于本地调试 / 受信内网；生产请走自有后端代理。
   */
  apiKey?: string;
  /** 追加 / 覆盖请求头（如自定义鉴权头、组织 id 等） */
  headers?: Record<string, string>;
  /**
   * 自定义把 ai-chat `ChatMessage[]` 映射为 OpenAI `messages` 的逻辑。
   * 默认：role 映射（ai→assistant，其余原样）+ `messageText`（仅拼接 text 块，
   * 不含 reasoning/sources/attachment；多模态等场景请自行实现此函数）。
   */
  transformMessages?: (messages: ChatMessage[]) => OpenAIChatMessage[];
}

/** ai-chat 角色 → OpenAI 角色（未命中则原样透传，兼容自定义角色） */
const ROLE_MAP: Record<string, OpenAIChatMessage['role']> = {
  ai: 'assistant',
  user: 'user',
  system: 'system',
};

const defaultTransformMessages = (messages: ChatMessage[]): OpenAIChatMessage[] =>
  messages.map((m) => ({ role: ROLE_MAP[m.role] ?? m.role, content: messageText(m) }));

/** 补全 chat/completions 路径：已含则原样，否则在去尾斜杠后拼接 */
const resolveUrl = (baseURL: string): string => {
  const trimmed = baseURL.replace(/\/+$/, '');
  return /\/chat\/completions$/.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
};

/**
 * 便利工厂：生成符合 `useChat` 的 `request` 签名的 OpenAI 兼容流式请求函数，
 * 消除「每次都要手写 fetch + Bearer + body」的接入成本。配合内置 `openaiParseChunk`
 * 与默认 `streamMode: 'sse'` 使用：
 *
 * ```ts
 * import { useChat, createOpenAIRequest, openaiParseChunk } from '@aix/ai-chat';
 * const chat = useChat({
 *   request: createOpenAIRequest({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o', apiKey }),
 *   parseChunk: openaiParseChunk,
 * });
 * ```
 *
 * 协议无关性不受影响：本工厂只是可选便利层，仍可不用它而自行实现 `request`。
 */
export function createOpenAIRequest(options: CreateOpenAIRequestOptions) {
  const {
    baseURL,
    apiKey,
    headers,
    transformMessages = defaultTransformMessages,
    ...params
  } = options;
  const url = resolveUrl(baseURL);
  return async ({
    messages,
    signal,
  }: {
    messages: ChatMessage[];
    signal: AbortSignal;
  }): Promise<Response> => {
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...headers,
      },
      // stream 先给默认 true，再被 params 覆盖（用户可显式关闭）；messages 置最后不可被覆盖
      body: JSON.stringify({ stream: true, ...params, messages: transformMessages(messages) }),
    });
    // 修复：非 2xx 时响应体是错误 JSON 而非 SSE 流，若直接返回会被 sseStream
    // 以「零事件正常结束」吞掉，useChat 误判为空内容 success（onError / 重试均失效）。
    // 这里显式抛错，让其进入 useChat 的错误与重试链路；text() 读取失败时降级为只含状态码。
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `[ai-chat] OpenAI 请求失败 (HTTP ${res.status})${detail ? `: ${detail.slice(0, 500)}` : ''}`,
      );
    }
    return res;
  };
}
