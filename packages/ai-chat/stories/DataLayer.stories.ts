import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { onUnmounted } from 'vue';
import { AiChat, openaiParseChunk, createOpenAIRequest } from '../src';
import type { ChatMessage, ParsedChunk } from '../src';
import { messageText } from '../src/utils/helpers';

/**
 * 数据层能力演示（useChat / parseChunk / parser / 重试 / 真实协议接入）
 *
 * 这些 story 聚焦 AiChat 的**数据层**而非样式：
 * - `openaiParseChunk`：内置 OpenAI 兼容预设，直接对接 `choices[0].delta.content` 报文。
 * - `retryTimes`：请求失败自动重试。
 * - `parser`：解耦「后端原始消息」与「UI 渲染消息」（1→1，保留 id）。
 * - `parser`（1→N）：一条消息拆成多个气泡（如思考 + 回答），回写经内部映射解析回父消息。
 * - `DifyProtocol`：真实对接 Dify 应用，演示自定义 request + parseChunk 协议适配。
 * - `OpenAICompatible`：真实对接 DeepSeek（OpenAI 兼容），演示换后端只改 proxy target。
 */
const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/数据层能力',
  tags: ['autodocs'],
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
          c.enqueue(enc.encode('data: [DONE]\n\n'));
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
          enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: slice } }] })}\n\n`),
        );
      }, 16);
    },
  });
}

/**
 * 按 OpenAI 推理模型协议先流式输出 `reasoning_content`（思考）、再输出 `content`（回答）。
 * 配合 openaiParseChunk → AI 消息内容为 `[reasoning 块, text 块]`，供 1→N 拆分演示。
 */
function streamReasoning(
  reasoning: string,
  answer: string,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      const phases = [
        { text: reasoning, key: 'reasoning_content' },
        { text: answer, key: 'content' },
      ];
      let p = 0;
      let i = 0;
      const close = () => {
        try {
          c.close();
        } catch {
          /* ignore */
        }
      };
      const timer = setInterval(() => {
        if (signal?.aborted) {
          clearInterval(timer);
          close();
          return;
        }
        // 跳过已输出完的阶段（reasoning → content）
        while (p < phases.length && i >= (phases[p]?.text.length ?? 0)) {
          p += 1;
          i = 0;
        }
        const cur = phases[p];
        if (!cur) {
          c.enqueue(enc.encode('data: [DONE]\n\n'));
          clearInterval(timer);
          close();
          return;
        }
        const slice = cur.text.slice(i, i + 4);
        i += 4;
        c.enqueue(
          enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { [cur.key]: slice } }] })}\n\n`),
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
 * `createOpenAIRequest` 便利工厂：传 `baseURL` / `model` / `apiKey` 即得到符合 `request` 签名的
 * 流式请求函数，内部自动拼 `/chat/completions`、注入 `Authorization: Bearer`、置 `stream:true`，
 * 并把 `ChatMessage[]` 映射为 OpenAI `messages`。配合内置 `openaiParseChunk` 即可对接 OpenAI/
 * DeepSeek/通义 等兼容后端，免去手写 fetch。
 *
 * 本 demo 用本地 `fetch` 桩拦截工厂发出的请求、回放 OpenAI 格式 mock 流（不联网）。
 */
export const OpenAIRequestFactory: Story = {
  render: () => ({
    components: { AiChat },
    setup: () => {
      const realFetch = globalThis.fetch;
      // 仅拦截本工厂指向 api.openai.com 的请求，其余透传真实 fetch：autodocs 文档页会把
      // 本文件全部 story 同时 inline 挂载，无条件拦截会劫持 Dify 等真实连接演示的请求
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes('api.openai.com')) return realFetch(input, init);
        return Promise.resolve(
          new Response(
            streamOpenAI(
              '这条回答由 `createOpenAIRequest` 便利工厂发起：自动拼 `/chat/completions`、注入鉴权头与 `stream:true`，配合 `openaiParseChunk` 解析。',
              init?.signal ?? undefined,
            ),
            { headers: { 'content-type': 'text/event-stream' } },
          ),
        );
      }) as typeof fetch;
      onUnmounted(() => {
        globalThis.fetch = realFetch;
      });
      return {
        openaiParseChunk,
        request: createOpenAIRequest({
          baseURL: 'https://api.openai.com/v1',
          model: 'gpt-4o',
          apiKey: 'sk-demo',
        }),
      };
    },
    template: `<div style="${wrapperStyle}"><AiChat :request="request" :parse-chunk="openaiParseChunk" placeholder="试试发一条消息…" /></div>`,
  }),
  play: async ({ canvas }) => {
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.type(textarea, '你好');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(canvas.getByText(/createOpenAIRequest/)).toBeTruthy(), {
      timeout: 4000,
    });
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

/**
 * parser 一对多（1→N）：把一条「同时含思考 + 回答」的 AI 消息**拆成两个气泡**
 * （思考气泡在上、回答气泡在下）。源 `messages` 仍是一条消息——拆分只发生在渲染层。
 *
 * 关键约束：
 * - parser **保留 block 的 id**（此处用 filter 分流、不重建块）：交互块回写、编辑/重生成
 *   经组件内部 `${父id}__${序号}` 映射自动解析回父消息，业务无感知。
 * - message-level id 由组件接管，parser 无需（也不应依赖）自定义气泡 id。
 * - 拆分子气泡的 status 继承父消息（loading/updating/success），思考气泡随之自动展开/折叠。
 */
export const ParserSplit: Story = {
  render: () => ({
    components: { AiChat },
    setup: () => ({
      openaiParseChunk,
      // 同时含 reasoning + text 的消息 → 拆「思考」「回答」两个气泡；其余消息保持 1→1
      parser: (m: ChatMessage): ChatMessage | ChatMessage[] => {
        if (m.role !== 'ai') return m;
        const reasoning = m.content.filter((b) => b.type === 'reasoning');
        const rest = m.content.filter((b) => b.type !== 'reasoning');
        return reasoning.length && rest.length
          ? [
              { ...m, content: reasoning },
              { ...m, content: rest },
            ]
          : m;
      },
      request: ({ signal }: { signal: AbortSignal }) =>
        Promise.resolve(
          streamReasoning(
            '先分析问题：用户想了解 1→N 拆分，我把推理与结论分成两段输出。',
            '**回答**：一条消息可被 parser 拆成「思考」与「回答」两个独立气泡。',
            signal,
          ),
        ),
    }),
    template: `<div style="${wrapperStyle}"><AiChat :request="request" :parse-chunk="openaiParseChunk" :parser="parser" placeholder="发一条消息看 1→N 拆分…" /></div>`,
  }),
  play: async ({ canvas, canvasElement }) => {
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.type(textarea, '演示 1→N');
    await userEvent.keyboard('{Enter}');
    // 回答气泡文本可见
    await waitFor(() => expect(canvas.getByText(/一条消息可被 parser 拆成/)).toBeTruthy(), {
      timeout: 5000,
    });
    // 一条 AI 消息被拆成「思考 + 回答」两个气泡 → 连同 user 气泡共 3 个
    await waitFor(() => expect(canvasElement.querySelectorAll('.aix-bubble').length).toBe(3), {
      timeout: 5000,
    });
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
    // difyParseChunk 走逐行字符串协议（自行剥 data: 前缀），用 line 模式
    streamMode: 'line',
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
