import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { AiChat, openaiParseChunk } from '../src';
import type { ChatMessage, ParsedChunk } from '../src';
import { messageText } from '../src/utils/helpers';

/**
 * 数据层能力演示（useChat / parseChunk / parser / 重试 / 真实协议接入）
 *
 * 这些 story 聚焦 AiChat 的**数据层**而非样式：
 * - `openaiParseChunk`：内置 OpenAI 兼容预设，直接对接 `choices[0].delta.content` 报文。
 * - `retryTimes`：请求失败自动重试。
 * - `parser`：解耦「后端原始消息」与「UI 渲染消息」（1→1，保留 id）。
 * - `DifyProtocol`：真实对接 Dify 应用，演示自定义 request + parseChunk 协议适配。
 * - `OpenAICompatible`：真实对接 DeepSeek（OpenAI 兼容），演示换后端只改 proxy target。
 */
const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/数据层能力',
  component: AiChat,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof AiChat>;

// ============ OpenAI 格式 SSE mock 后端 ============

/** 按 OpenAI SSE 协议（choices[0].delta.content）分块流式输出 */
function streamOpenAI(text: string, signal?: AbortSignal): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      let i = 0;
      const timer = setInterval(() => {
        if (signal?.aborted) {
          clearInterval(timer);
          try {
            c.close();
          } catch {
            /* ignore */
          }
          return;
        }
        if (i >= text.length) {
          c.enqueue(enc.encode('data: [DONE]\n'));
          clearInterval(timer);
          try {
            c.close();
          } catch {
            /* ignore */
          }
          return;
        }
        const slice = text.slice(i, i + 3);
        i += 3;
        c.enqueue(
          enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: slice } }] })}\n`),
        );
      }, 16);
    },
  });
}

const wrapperStyle =
  'height:520px;max-width:760px;margin:0 auto;border:1px solid var(--aix-colorBorderSecondary);border-radius:12px;overflow:hidden';

/**
 * OpenAI 预设接入：传 `:parse-chunk="openaiParseChunk"` 即可解析 OpenAI 格式流，
 * 无需手写 `choices[0].delta.content` 的遍历。
 */
export const OpenAIPreset: Story = {
  render: () => ({
    components: { AiChat },
    setup: () => ({
      openaiParseChunk,
      request: ({ signal }: { signal: AbortSignal }) =>
        Promise.resolve(
          streamOpenAI('这条回答来自 **OpenAI 格式** 的流：`choices[0].delta.content`。', signal),
        ),
    }),
    template: `<div style="${wrapperStyle}"><AiChat :request="request" :parse-chunk="openaiParseChunk" placeholder="试试发一条消息…" /></div>`,
  }),
  play: async ({ canvas }) => {
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.type(textarea, '你好');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(canvas.getByText(/OpenAI 格式/)).toBeTruthy(), { timeout: 4000 });
  },
};

/**
 * 失败自动重试：mock 后端前两次抛错、第三次成功；`:retry-times="2"` 自动重试至成功，
 * 用户无感知（重试前会清空已累积内容，避免半截内容叠加）。
 */
export const Retry: Story = {
  render: () => {
    let attempt = 0;
    return {
      components: { AiChat },
      setup: () => ({
        // 注意：模板里用到的 openaiParseChunk 必须随 setup 返回，否则静默传 undefined
        // → useChat 回落默认 flatParseChunk → OpenAI 报文解析不出 delta → 空内容 success
        openaiParseChunk,
        request: ({ signal }: { signal: AbortSignal }) => {
          attempt += 1;
          if (attempt < 3) return Promise.reject(new Error(`mock 第 ${attempt} 次失败`));
          return Promise.resolve(streamOpenAI(`重试 ${attempt - 1} 次后成功返回 ✅`, signal));
        },
      }),
      template: `<div style="${wrapperStyle}"><AiChat :request="request" :parse-chunk="openaiParseChunk" :retry-times="2" :retry-interval="150" placeholder="发一条消息触发重试…" /></div>`,
    };
  },
  play: async ({ canvas }) => {
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.type(textarea, '触发重试');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(canvas.getByText(/重试 .* 次后成功/)).toBeTruthy(), {
      timeout: 6000,
    });
  },
};

/**
 * parser 渲染转换：`parser` 把后端原始 AI 消息映射为渲染消息（此处给 AI 文本加 🤖 前缀），
 * 原始 `messages` 不受影响、仍保留干净文本与 id（编辑/重生成的 id 定位不受影响）。
 */
export const Parser: Story = {
  render: () => ({
    components: { AiChat },
    setup: () => ({
      openaiParseChunk,
      // 1→1 转换：保留 id，仅重塑展示文本
      parser: (m: ChatMessage): ChatMessage =>
        m.role === 'ai'
          ? {
              ...m,
              content: m.content.map((b) =>
                b.type === 'text' ? { ...b, text: `🤖 ${b.text}` } : b,
              ),
            }
          : m,
      request: ({ signal }: { signal: AbortSignal }) =>
        Promise.resolve(
          streamOpenAI('我的文本在渲染层被加上了机器人前缀，但源消息保持干净。', signal),
        ),
    }),
    template: `<div style="${wrapperStyle}"><AiChat :request="request" :parse-chunk="openaiParseChunk" :parser="parser" placeholder="发一条消息看 parser 效果…" /></div>`,
  }),
  play: async ({ canvas }) => {
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.type(textarea, '介绍一下 parser');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(canvas.getByText(/🤖/)).toBeTruthy(), { timeout: 4000 });
  },
};

// ============ 真实接口对接：Dify / DeepSeek（OpenAI 兼容） ============
//
// 这两个示例是**真实连接**：换后端只改 request + parseChunk，AiChat / useChat 其余逻辑
// （流式累积、打字机、中断、重试、多轮）完全不变。
// 密钥与跨域统一在 .storybook/main.ts 的 Vite proxy 处理：前端只 fetch 同源 /proxy-* 路径，
// proxy 注入 Authorization 头并转发到真实网关——**密钥不进前端 bundle，也绕过浏览器 CORS**。
// 配置来自仓库根 .env（DIFY_BASEURL / DIFY_API_KEY / DEEPSEEK_API_KEY，已被 .gitignore 忽略），
// 仅本地 storybook dev 生效；storybook:build 静态产物无 proxy。

/** 把消息列表转成 OpenAI / DeepSeek 的 messages 结构（role + 纯文本 content） */
const toOpenAIMessages = (messages: ChatMessage[]) =>
  messages
    .filter((m) => m.role === 'user' || m.role === 'ai')
    .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: messageText(m) }));

/**
 * Dify request（真实连接）：POST /proxy-dify/chat-messages（→ Dify `/chat-messages`，streaming）。
 * 直接返回 fetch 的 Response —— useChat 取 `.body` 流式读取，parseChunk 用 difyParseChunk。
 * Authorization 由 Vite proxy 注入，前端不持有密钥。
 */
const DIFY_USER = '20191677';
const DIFY_INPUTS: Record<string, unknown> = { user_id: DIFY_USER, thinkModel: 'qwen3' };

function difyRequest() {
  return ({ messages, signal }: { messages: ChatMessage[]; signal: AbortSignal }) => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return fetch('/proxy-dify/chat-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        query: lastUser ? messageText(lastUser) : '',
        user: DIFY_USER,
        response_mode: 'streaming',
        inputs: DIFY_INPUTS,
      }),
      signal,
    });
  };
}

/**
 * Dify parseChunk（兼容 ChatBot 与 Chatflow 两种 app）：
 * - `message` / `agent_message`：取 `answer` 作为增量（普通聊天应用的流式文本）
 * - `text_chunk`：取 `data.text` 作为增量（Chatflow 工作流节点的流式文本）
 * - `message_end` / `workflow_finished`：收流
 * - 其余（ping / workflow_started / node_started / node_finished …）忽略，不产出增量
 */
function difyParseChunk(raw: string): ParsedChunk {
  const line = raw.startsWith('data:') ? raw.slice(5).trim() : raw.trim();
  if (!line) return {};
  try {
    const obj = JSON.parse(line) as { event?: string; answer?: string; data?: { text?: string } };
    switch (obj.event) {
      case 'message':
      case 'agent_message':
        return { delta: obj.answer ?? '' };
      case 'text_chunk':
        return { delta: obj.data?.text ?? '' };
      case 'message_end':
      case 'workflow_finished':
        return { done: true };
      default:
        return {};
    }
  } catch {
    return {};
  }
}

/**
 * DeepSeek request（真实连接，OpenAI 兼容）：POST /proxy-deepseek/chat/completions（stream=true）。
 * 增量在嵌套路径 `choices[0].delta.content`、流末 `data: [DONE]`，用 openaiParseChunk 解析。
 * 同样走 proxy 注入 Authorization，适配一切 OpenAI 兼容网关（把 proxy target 换成自家网关即可）。
 */
function deepseekRequest() {
  return ({ messages, signal }: { messages: ChatMessage[]; signal: AbortSignal }) =>
    fetch('/proxy-deepseek/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        stream: true,
        messages: toOpenAIMessages(messages),
      }),
      signal,
    });
}

/**
 * DifyProtocol：对接 Dify（**真实连接**）。
 *
 * request 经 `/proxy-dify` 转发到 Dify `/chat-messages`（streaming），parseChunk 用
 * difyParseChunk 解析 `event:message` 的 `answer` 增量、`message_end` 收流。配置（base/密钥）
 * 在仓库根 `.env` + `.storybook/main.ts` 的 proxy，密钥不进前端。在 Storybook Canvas
 * **手动输入并发送**即可看到真实模型的流式回复（不再是 mock 假数据）。
 *
 * ⚠️ play 只校验界面渲染、**不自动发请求**，以免 CI / test:stories 依赖外网。
 * 验证真实链路请在 storybook dev 里手动发送。
 */
export const DifyProtocol: Story = {
  args: {
    request: difyRequest(),
    parseChunk: difyParseChunk,
    welcomeTitle: '对接 Dify（真实连接）',
    welcomeDescription: '经 Vite proxy 直连 Dify /chat-messages 流式接口，手动发送即可对话',
    prompts: [{ key: '1', label: '你好，介绍一下你能做什么' }],
  },
  parameters: { layout: 'fullscreen' },
  render: (args) => ({
    components: { AiChat },
    setup: () => ({ args }),
    template: `<div style="${wrapperStyle}"><AiChat v-bind="args" /></div>`,
  }),
  play: async ({ canvas }) => {
    // 仅校验渲染；真实请求留待在 Storybook 中手动触发（避免 CI 依赖外网）
    await expect(canvas.getByText('对接 Dify（真实连接）')).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: '你好，介绍一下你能做什么' }),
    ).toBeInTheDocument();
  },
};

/**
 * OpenAICompatible：对接 DeepSeek（**真实连接**，OpenAI 兼容接口示例 = 自定义接口）。
 *
 * DeepSeek / OpenAI Chat Completions（stream=true）的增量在嵌套路径 `choices[0].delta.content`、
 * 流末 `data: [DONE]`，正是「需自定义 parseChunk」场景。request 经 `/proxy-deepseek`
 * 转发到 `https://api.deepseek.com/chat/completions`，parseChunk 用 openaiParseChunk。
 * 换 vLLM / Ollama / 通义 等只需改 proxy target，组件侧零改动。
 *
 * ⚠️ 同 Dify：play 只校验渲染，真实对话在 storybook dev 手动发送。
 */
export const OpenAICompatible: Story = {
  args: {
    request: deepseekRequest(),
    parseChunk: openaiParseChunk,
    welcomeTitle: '对接 DeepSeek（真实连接 · OpenAI 兼容）',
    welcomeDescription:
      '经 Vite proxy 直连 DeepSeek，嵌套 choices[0].delta.content + [DONE]，手动发送即可对话',
    prompts: [{ key: '1', label: '用一句话介绍你自己' }],
  },
  parameters: { layout: 'fullscreen' },
  render: (args) => ({
    components: { AiChat },
    setup: () => ({ args }),
    template: `<div style="${wrapperStyle}"><AiChat v-bind="args" /></div>`,
  }),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('对接 DeepSeek（真实连接 · OpenAI 兼容）')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: '用一句话介绍你自己' })).toBeInTheDocument();
  },
};
