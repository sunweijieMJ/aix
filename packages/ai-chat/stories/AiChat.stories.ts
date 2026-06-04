import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { AiChat } from '../src';
import type { ChatMessage, ParsedChunk, RoleConfig, ThoughtChainItem } from '../src';
import {
  textBlock,
  createMessage,
  messageText,
  choiceBlock,
  thoughtChainBlock,
} from '../src/utils/helpers';

// ============ 头像（内联 SVG data URI，无需网络） ============

const avatar = (bg: string, text: string) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">` +
      `<rect width="72" height="72" rx="36" fill="${bg}"/>` +
      `<text x="36" y="47" font-size="28" fill="#fff" text-anchor="middle" ` +
      `font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="600">${text}</text>` +
      `</svg>`,
  );

const AI_AVATAR = avatar('#13c2c2', 'AI');
const USER_AVATAR = avatar('#8c8c8c', '我');

/** 角色样式：给 AI / 用户气泡各配一个头像 */
const ASSISTANT_ROLES: Record<string, RoleConfig> = {
  ai: { placement: 'start', variant: 'filled', avatar: AI_AVATAR },
  user: { placement: 'end', variant: 'filled', avatar: USER_AVATAR },
};

/**
 * AiChat 完整助手型示例
 *
 * 这些 story 把 AiChat 当作一个**可真实对话**的 AI 助手来演示：
 * 内置一个拟真的 mock 后端，会根据用户提问的关键词流式返回不同的 Markdown
 * 富文本回答（代码块 / 表格 / 列表 / 引用），并支持多轮上下文、错误重试与中断。
 * 直接在 Canvas 里输入或点击快捷问题即可体验完整链路。
 */

// ============ 拟真 mock 后端 ============

interface StreamOptions {
  /** 每次推送间隔（ms），越小越快 */
  stepMs?: number;
  /** 每次推送的字符数 */
  chunkSize?: number;
}

/** 把一段文本按 OpenAI SSE 协议分块流式输出，支持通过 signal 中断 */
function streamSSE(
  text: string,
  signal?: AbortSignal,
  opts: StreamOptions = {},
): ReadableStream<Uint8Array> {
  const { stepMs = 22, chunkSize = 2 } = opts;
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      let i = 0;
      const finish = () => {
        try {
          c.close();
        } catch {
          /* 已关闭则忽略 */
        }
      };
      const timer = setInterval(() => {
        if (signal?.aborted) {
          clearInterval(timer);
          finish();
          return;
        }
        if (i >= text.length) {
          c.enqueue(enc.encode('data: [DONE]\n'));
          clearInterval(timer);
          finish();
          return;
        }
        const slice = text.slice(i, i + chunkSize);
        i += chunkSize;
        c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: slice })}\n`));
      }, stepMs);
      signal?.addEventListener('abort', () => {
        clearInterval(timer);
        finish();
      });
    },
  });
}

// ============ 拟真回答库（按关键词匹配，返回 Markdown） ============

const ANSWER_CODE = [
  '没问题！下面是一个 **Python 快速排序** 实现：',
  '',
  '```python',
  'def quicksort(arr):',
  '    if len(arr) <= 1:',
  '        return arr',
  '    pivot = arr[len(arr) // 2]',
  '    left = [x for x in arr if x < pivot]',
  '    mid = [x for x in arr if x == pivot]',
  '    right = [x for x in arr if x > pivot]',
  '    return quicksort(left) + mid + quicksort(right)',
  '```',
  '',
  '平均时间复杂度 `O(n log n)`，最坏 `O(n²)`。数据量很大时建议改用迭代版本，避免递归栈溢出。',
].join('\n');

const ANSWER_VUE = [
  'Vue 3 的 **Composition API** 让你按「逻辑关注点」组织代码。一个最小计数器：',
  '',
  '```vue',
  '<script setup lang="ts">',
  "import { ref, computed } from 'vue';",
  'const count = ref(0);',
  'const double = computed(() => count.value * 2);',
  '</script>',
  '',
  '<template>',
  '  <button @click="count++">{{ count }} / {{ double }}</button>',
  '</template>',
  '```',
  '',
  '核心要点：',
  '',
  '1. `ref` / `reactive` 创建响应式状态',
  '2. `computed` 派生值，自动缓存',
  '3. `watch` / `watchEffect` 处理副作用',
].join('\n');

const ANSWER_DIFF = [
  '两者的主要区别如下：',
  '',
  '| 维度 | Composition API | Options API |',
  '| --- | --- | --- |',
  '| 逻辑组织 | 按功能聚合 | 按选项（data/methods）分散 |',
  '| 复用方式 | 组合式函数 `useXxx` | mixin（易命名冲突） |',
  '| 类型推导 | 对 TS 更友好 | 一般 |',
  '| 上手成本 | 略高 | 低 |',
  '',
  '> 经验法则：小型组件用 Options API 更省事，逻辑复杂或需大量复用时优先 Composition API。',
].join('\n');

const ANSWER_DEBUG = [
  '排查线上报错，建议按这个顺序来：',
  '',
  '1. **复现**：确认触发条件，能稳定复现是修复的前提',
  '2. **定位**：看堆栈 + 日志，缩小到具体文件/函数',
  '3. **假设**：提出最可能的原因，`console` 或断点验证',
  '4. **最小化**：剥离无关代码，做出最小可复现示例',
  '5. **修复并回归**：补一条测试用例，防止再次回归',
  '',
  '> 如果方便，把完整报错堆栈贴给我，我帮你进一步分析。',
].join('\n');

const ANSWER_FALLBACK = [
  '收到 👌 我是一个演示用的 AI 助手，可以：',
  '',
  '- 写代码、解释概念、做对比',
  '- 用 **Markdown** 输出富文本（代码块、表格、列表都支持）',
  '- 多轮对话、出错后重试、回复中途随时点「停止」中断',
  '',
  '试试问我：`帮我写一段快速排序` 或 `Composition API 和 Options API 有什么区别`。',
].join('\n');

/** 根据用户最后一句话的关键词，挑选一段拟真回答 */
function pickAnswer(question: string): string {
  const q = question.toLowerCase();
  if (/代码|快速排序|算法|python|函数|写一段|写个/.test(q)) return ANSWER_CODE;
  if (/区别|对比|差异|\bvs\b|哪个好/.test(q)) return ANSWER_DIFF;
  if (/vue|composition|响应式|ref\b|组件/.test(q)) return ANSWER_VUE;
  if (/调试|报错|排查|bug|错误|崩溃/.test(q)) return ANSWER_DEBUG;
  return ANSWER_FALLBACK;
}

/** 智能助手 request：读取最后一条用户消息，流式返回匹配的 Markdown 回答 */
function assistantRequest(opts: StreamOptions = {}) {
  return async ({ messages, signal }: { messages: ChatMessage[]; signal: AbortSignal }) => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return streamSSE(pickAnswer(lastUser ? messageText(lastUser) : ''), signal, opts);
  };
}

/**
 * 全流程 request：正常流式且可中断；对含「报错/错误」关键词的问题**首次失败、重试放行成功**
 * （按问题文本去重，重试用同一条 user 消息再请求 → 命中放行）。
 * 用于 FullInteractionFlow 串联中断、多轮、错误重试的完整交互测试。
 */
function fullFlowRequest(opts: StreamOptions = {}) {
  const failedOnce = new Set<string>();
  return async ({ messages, signal }: { messages: ChatMessage[]; signal: AbortSignal }) => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const q = lastUser ? messageText(lastUser) : '';
    if (/报错|错误|失败|崩溃|出错/.test(q) && !failedOnce.has(q)) {
      failedOnce.add(q);
      throw new Error('mock: 模拟网络错误');
    }
    // stepMs 取稍慢值，确保流式回复有足够时长供 play 在中途点「停止」
    return streamSSE(pickAnswer(q), signal, { stepMs: 24, chunkSize: 3, ...opts });
  };
}

/**
 * 生成中演示 request：先推送一个「思考过程」帧（thought-chain 块，末步 active=生成中），
 * 隔一会再流式推送文本答案。配合下方自定义 parseChunk 把思考帧解析为 thought-chain 块。
 */
function thinkingThenAnswerRequest(opts: StreamOptions = {}) {
  const steps: ThoughtChainItem[] = [
    { key: '1', icon: '🤔', title: '理解题目要求', status: 'done', duration: '00.80秒' },
    {
      key: '2',
      icon: '🔍',
      title: '检索梵高相关知识',
      status: 'done',
      duration: '12.59秒',
      content: '《向日葵》系列主要创作于阿尔勒时期，大量使用铬黄颜料。',
    },
    { key: '3', icon: '📝', title: '生成题目与解析', status: 'active' },
  ];
  const answer = [
    '已为你生成一道单选题 👇',
    '',
    '**题干**：关于梵高《向日葵》下列说法正确的是？',
    '',
    'A. 创作于巴黎时期　B. 阿尔勒时期　C. 点彩画派　D. 未署名',
    '',
    '**答案**：B　**解析**：《向日葵》系列主要创作于阿尔勒时期。',
  ].join('\n');

  return async ({ signal }: { messages: ChatMessage[]; signal: AbortSignal }) => {
    const { stepMs = 22, chunkSize = 2 } = opts;
    const enc = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(c) {
        const finish = () => {
          try {
            c.close();
          } catch {
            /* 已关闭则忽略 */
          }
        };
        // 先推思考过程帧
        c.enqueue(enc.encode(`data: ${JSON.stringify({ thinking: steps })}\n`));
        // 再逐块推文本答案
        let i = 0;
        const timer = setInterval(() => {
          if (signal?.aborted) {
            clearInterval(timer);
            finish();
            return;
          }
          if (i >= answer.length) {
            c.enqueue(enc.encode('data: [DONE]\n'));
            clearInterval(timer);
            finish();
            return;
          }
          c.enqueue(
            enc.encode(`data: ${JSON.stringify({ delta: answer.slice(i, i + chunkSize) })}\n`),
          );
          i += chunkSize;
        }, stepMs);
        signal?.addEventListener('abort', () => {
          clearInterval(timer);
          finish();
        });
      },
    });
  };
}

/** 解析「思考帧」为 thought-chain 块，其余按默认扁平 delta 处理 */
function thinkingParseChunk(raw: string): ParsedChunk {
  const line = raw.startsWith('data:') ? raw.slice(5).trim() : raw.trim();
  if (!line) return {};
  if (line === '[DONE]') return { done: true };
  try {
    const obj = JSON.parse(line) as { thinking?: ThoughtChainItem[]; delta?: string };
    if (obj.thinking) return { block: thoughtChainBlock(obj.thinking) };
    return { delta: obj.delta ?? '' };
  } catch {
    return { delta: line };
  }
}

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
// Dify 终端用户标识 + app 所需的 inputs 变量（按参考请求；不同 app 的 inputs schema 可能不同，
// 换 app 时改这里。这些不是密钥，留在前端无妨）。
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

/** OpenAI 兼容 parseChunk：读取嵌套 `choices[0].delta.content` 作为增量；`[DONE]` 收流 */
function openaiParseChunk(raw: string): ParsedChunk {
  const line = raw.startsWith('data:') ? raw.slice(5).trim() : raw.trim();
  if (!line) return {};
  if (line === '[DONE]') return { done: true };
  try {
    const obj = JSON.parse(line) as { choices?: { delta?: { content?: string } }[] };
    return { delta: obj.choices?.[0]?.delta?.content ?? '' };
  } catch {
    return {};
  }
}

// ============ 共用快捷问题 ============

const PROMPTS = [
  { key: '1', label: '帮我写一段快速排序' },
  { key: '2', label: 'Composition API 和 Options API 有什么区别' },
  { key: '3', label: '介绍一下 Vue 3 的响应式' },
  { key: '4', label: '线上报错该怎么排查' },
];

const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/AiChat',
  component: AiChat,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '开箱即用的整套 AI 对话界面（Welcome + BubbleList + Sender + useChat 编排）。' +
          '这些 story 把 AiChat 装进一个带标题栏的「助手应用」外壳里，并通过 roles 给气泡配头像，' +
          '内置拟真 mock 后端，可直接在 Canvas 中真实对话、查看流式 Markdown 回复、错误重试与中断。',
      },
    },
  },
  // 助手应用外壳：居中卡片 + 顶部标题栏（头像 + 名称 + 在线状态），AiChat 占满主体
  render: (args) => ({
    components: { AiChat },
    setup: () => ({ args, AI_AVATAR }),
    template: `
      <div style="display:flex;justify-content:center;box-sizing:border-box;min-height:100vh;padding:24px;background:var(--aix-colorBgLayout);">
        <div style="display:flex;flex-direction:column;width:100%;max-width:760px;height:640px;overflow:hidden;border:1px solid var(--aix-colorBorderSecondary);border-radius:16px;background:var(--aix-colorBgContainer);box-shadow:var(--aix-shadowMD);">
          <header style="display:flex;flex:none;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--aix-colorBorderSecondary);">
            <img :src="AI_AVATAR" alt="" style="width:38px;height:38px;border-radius:50%;" />
            <div style="display:flex;flex-direction:column;gap:2px;line-height:1.3;">
              <strong style="font-size:15px;color:var(--aix-colorText);">AIX 智能助手</strong>
              <span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--aix-colorTextTertiary);">
                <i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--aix-colorSuccess);"></i>在线，随时为你服务
              </span>
            </div>
          </header>
          <div style="flex:1;min-height:0;">
            <AiChat v-bind="args" />
          </div>
        </div>
      </div>
    `,
  }),
  args: {
    request: assistantRequest(),
    roles: ASSISTANT_ROLES,
    welcomeTitle: '你好，我是 AIX 智能助手',
    welcomeDescription: '可以写代码、解释概念、做对比 —— 选个快捷问题，或直接输入',
    placeholder: '输入消息，按 Enter 发送，Shift+Enter 换行…',
    prompts: PROMPTS,
  },
};
export default meta;
type Story = StoryObj<typeof AiChat>;

/**
 * FullInteractionFlow：端到端交互流程串联（最完整的演示 + 交互测试用例）。
 *
 * 一个 play 自动跑完整条链路，逐段断言：
 * 1. **快捷问题 → 流式中断**：点快捷问题触发流式回复，回复进行中点「停止」中断（abort）。
 * 2. **多轮追问 → 完整回复**：在已有上下文上继续提问，等待流式 Markdown 表格回答渲染完成。
 * 3. **错误 → 重试成功**：发送触发错误的问题，气泡出现「重试」，点击后第二次请求成功并渲染。
 *
 * 覆盖 Welcome 引导、流式打字机、abort 中断、多轮上下文、错误重试全部交互路径，
 * 可作为 AiChat 能力的一站式回归用例。
 */
export const FullInteractionFlow: Story = {
  args: {
    request: fullFlowRequest(),
    welcomeTitle: '完整交互演示',
    welcomeDescription: '本用例自动跑：发送 → 中断 → 追问 → 报错 → 重试 的完整链路',
  },
  play: async ({ canvas, step }) => {
    // 1) 快捷问题触发流式 → 回复进行中点「停止」中断
    await step('快捷问题 → 流式中断', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '帮我写一段快速排序' }));
      // loading 态下发送按钮变为「停止」（首个 chunk 之前即出现）
      const stop = await canvas.findByRole('button', { name: '停止' });
      await userEvent.click(stop);
      // 中断后 isLoading=false，按钮恢复为「发送」，「停止」消失
      await waitFor(
        () => expect(canvas.queryByRole('button', { name: '停止' })).not.toBeInTheDocument(),
        { timeout: 4000 },
      );
    });

    // 2) 多轮追问 → 拿到完整 Markdown 回答（对比表格里的「维度」表头）
    await step('多轮追问 → 完整回复', async () => {
      const ta = canvas.getByRole('textbox');
      await userEvent.type(ta, 'Composition API 和 Options API 有什么区别');
      await userEvent.keyboard('{Enter}');
      // 虚拟列表内容异步渲染：用 findByText 轮询，等待流式 + 打字机播出表头
      await canvas.findByText(/维度/, undefined, { timeout: 12000 });
      // 关键：等本轮流式结束（isLoading=false，「停止」消失）再进入下一步，
      // 否则下一条消息会被 Sender 的 loading 守卫拦截而发不出去。
      await waitFor(
        () => expect(canvas.queryByRole('button', { name: '停止' })).not.toBeInTheDocument(),
        { timeout: 12000 },
      );
    });

    // 3) 触发错误 → 点「重试」恢复成功
    await step('错误 → 重试成功', async () => {
      const ta = canvas.getByRole('textbox');
      await userEvent.type(ta, '线上报错该怎么排查');
      await userEvent.keyboard('{Enter}');
      // 首次失败 → 重试按钮出现；virtua 重挂载会使引用 detached，故在 waitFor 内重查再点
      await waitFor(
        async () => {
          const retry = await canvas.findByRole('button', { name: '重试' });
          await userEvent.click(retry);
        },
        { timeout: 5000 },
      );
      // 重试成功 → 渲染排查步骤（ANSWER_DEBUG 含「复现」）
      await canvas.findByText(/复现/, undefined, { timeout: 12000 });
    });
  },
};

/**
 * WithHistory：带历史会话进入。
 * 传入 `defaultMessages` 后会跳过 Welcome 直接渲染消息列表，可在已有上下文上继续追问。
 */
export const WithHistory: Story = {
  args: {
    defaultMessages: [
      createMessage('user', [textBlock('帮我用一句话解释什么是闭包')], {
        id: 'h1',
        status: 'local',
      }),
      createMessage(
        'ai',
        [
          textBlock(
            '闭包就是**函数**和它定义时所在的**词法作用域**的组合——函数即使在别处被调用，依然能访问当初那个作用域里的变量。',
          ),
        ],
        { id: 'h2', status: 'success' },
      ),
      createMessage('user', [textBlock('能给个 JS 例子吗？')], { id: 'h3', status: 'local' }),
      createMessage(
        'ai',
        [
          textBlock(
            [
              '当然：',
              '',
              '```js',
              'function makeCounter() {',
              '  let n = 0;',
              '  return () => ++n; // 始终能访问外层的 n',
              '}',
              'const next = makeCounter();',
              'next(); // 1',
              'next(); // 2',
              '```',
            ].join('\n'),
          ),
        ],
        { id: 'h4', status: 'success' },
      ),
    ],
  },
};

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
  play: async ({ canvas }) => {
    // 仅校验渲染；真实请求留待在 Storybook 中手动触发（避免 CI 依赖外网）
    await expect(canvas.getByText('对接 Dify（真实连接）')).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: '你好，介绍一下你能做什么' }),
    ).toBeInTheDocument();
  },
};

/**
 * OpenAICompatible：对接 DeepSeek（**真实连接**，OpenAI 兼容接口示例 = 你说的「自定义接口」）。
 *
 * DeepSeek / OpenAI Chat Completions（stream=true）的增量在嵌套路径 `choices[0].delta.content`、
 * 流末 `data: [DONE]`，正是 README 说的「需自定义 parseChunk」场景。request 经 `/proxy-deepseek`
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
  play: async ({ canvas }) => {
    await expect(canvas.getByText('对接 DeepSeek（真实连接 · OpenAI 兼容）')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: '用一句话介绍你自己' })).toBeInTheDocument();
  },
};

/**
 * SingleChoiceInteractive：对话流中输出可交互单选题卡片（端到端）。
 * 以 defaultMessages 注入一道 editable 单选题（AI 输出），可直接点选项作答
 * （经 block-action → useChat.updateBlock 写回，高亮受控），或点右上角编辑题目。
 */
export const SingleChoiceInteractive: Story = {
  args: {
    request: assistantRequest(),
    welcomeTitle: '试题助手',
    welcomeDescription: '对话中可输出可交互的单选题卡片',
    prompts: undefined,
    defaultMessages: [
      createMessage('user', [textBlock('生成一道关于梵高《向日葵》的单选题')], {
        id: 'q1',
        status: 'local',
      }),
      createMessage(
        'ai',
        [
          choiceBlock({
            stem: '关于梵高《向日葵》下列说法正确的是（ ）',
            options: [
              { id: 'o1', label: 'A', content: '创作于巴黎时期' },
              { id: 'o2', label: 'B', content: '现藏于阿尔勒美术馆' },
              { id: 'o3', label: 'C', content: '属于点彩画派代表作' },
              { id: 'o4', label: 'D', content: '使用大量铬黄颜料' },
            ],
            multiple: false,
            mode: 'answer',
            answer: 'o4',
            analysis: '梵高《向日葵》系列大量使用铬黄，创作于阿尔勒时期。',
            editable: true,
          }),
        ],
        { id: 'a1', status: 'success' },
      ),
    ],
  },
  play: async ({ canvas, canvasElement }) => {
    // 虚拟列表异步渲染：先等选项出现再点击（findBy 轮询）
    const optText = await canvas.findByText('使用大量铬黄颜料', undefined, { timeout: 8000 });
    // 点击选项 li（事件绑定在 li 上）；虚拟列表项过渡期 span 可能 pointer-events:none，
    // 故定位到 option 容器并关闭指针事件可见性检查，避免 flaky
    const optionLi = optText.closest('.aix-choice__option') as HTMLElement;
    await userEvent.click(optionLi, { pointerEventsCheck: 0 });
    // 点击后经 block-action → useChat 写回，断言受控高亮（轮询等待重渲染）
    await waitFor(() =>
      expect(canvasElement.querySelector('.aix-choice__option.is-selected')).toBeTruthy(),
    );
  },
};

/**
 * GeneratingProcess：生成中思考过程 → 文本答案（端到端）。
 * 发送后助手先输出一段「思考过程」时间线（thought-chain 块：emoji 徽标 + 耗时 badge +
 * 末步流光「生成中」），随后流式给出文本答案。演示 thought-chain 块在对话流中的端到端渲染。
 */
export const GeneratingProcess: Story = {
  args: {
    request: thinkingThenAnswerRequest(),
    parseChunk: thinkingParseChunk,
    welcomeTitle: '试题助手（生成中演示）',
    welcomeDescription: '发送任意消息，观察「思考过程时间线 → 文本答案」的完整生成过程',
    prompts: [{ key: '1', label: '生成一道梵高《向日葵》单选题' }],
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: '生成一道梵高《向日葵》单选题' }));
    // 思考过程时间线出现（某步骤标题）
    await canvas.findByText('检索梵高相关知识', undefined, { timeout: 8000 });
    // 随后文本答案流式渲染（含答案文案）
    await canvas.findByText(/已为你生成一道单选题/, undefined, { timeout: 12000 });
  },
};
