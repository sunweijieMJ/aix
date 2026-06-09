import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor, fn } from 'storybook/test';
import { AiChat } from '../src';
import type {
  ChatMessage,
  ParsedChunk,
  RoleConfig,
  ThoughtChainItem,
  VoiceRecognizer,
} from '../src';
import { textBlock, createMessage, messageText, thoughtChainBlock } from '../src/utils/helpers';
import { fullReportMarkdown } from './fullReportMarkdown';

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
          c.enqueue(enc.encode('data: [DONE]\n\n'));
          clearInterval(timer);
          finish();
          return;
        }
        const slice = text.slice(i, i + chunkSize);
        i += chunkSize;
        c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: slice })}\n\n`));
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
  '试试问我：`帮我写一段快速排序`、`给我一份完整的示例报告` 或 `Composition API 和 Options API 有什么区别`。',
].join('\n');

/** 全要素长文（表格/公式/图片/代码块/mermaid 流程图等），与 MarkdownRenderer.StreamingLive 共用 */
const ANSWER_FULL = fullReportMarkdown;

/** 根据用户最后一句话的关键词，挑选一段拟真回答 */
function pickAnswer(question: string): string {
  const q = question.toLowerCase();
  if (/完整|示例|报告|全要素/.test(q)) return ANSWER_FULL;
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
    const answer = pickAnswer(q);
    // 全要素长文（1500+ 字符）按默认速度要流 12s+，提速传输——展示节奏由打字机控制
    const fast = answer === ANSWER_FULL ? { stepMs: 8, chunkSize: 8 } : {};
    // stepMs 取稍慢值，确保流式回复有足够时长供 play 在中途点「停止」
    return streamSSE(answer, signal, { stepMs: 24, chunkSize: 3, ...fast, ...opts });
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
 * 2. **多轮追问 → 全要素长文**：请求「完整的示例报告」，流式输出表格/公式/图片/代码块/
 *    mermaid 流程图等全要素 Markdown（与 MarkdownRenderer.StreamingLive 同一份内容）。
 * 3. **全要素就位终检**：等打字机播完长文，断言 KaTeX 公式与 mermaid 流程图均已渲染。
 *
 * 覆盖 Welcome 引导、流式打字机、abort 中断、多轮上下文、富文本全要素渲染；
 * 错误 → 手动点「重试」的链路拆到独立的 ErrorRetry story（避免与长文打字机同屏双输出）。
 */
export const FullInteractionFlow: Story = {
  args: {
    request: fullFlowRequest(),
    welcomeTitle: '完整交互演示',
    welcomeDescription: '本用例自动跑：发送 → 中断 → 追问全要素长文 → 渲染终检 的完整链路',
  },
  play: async ({ canvas, canvasElement, step }) => {
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

    // 2) 多轮追问 → 全要素长文（季度报告：表格/公式/图片/代码块/mermaid）
    await step('多轮追问 → 全要素长文', async () => {
      const ta = canvas.getByRole('textbox');
      await userEvent.type(ta, '给我一份完整的示例报告');
      await userEvent.keyboard('{Enter}');
      // 虚拟列表内容异步渲染：用 findByText 轮询，等待流式 + 打字机播出表格表头
      await canvas.findByText(/产品线/, undefined, { timeout: 15000 });
      // 关键：等本轮流式结束（isLoading=false，「停止」消失）再进入下一步，
      // 否则下一条消息会被 Sender 的 loading 守卫拦截而发不出去。
      // 注：打字机此时可能仍在播长文尾部，不影响发送（typing 与 isLoading 解耦）。
      await waitFor(
        () => expect(canvas.queryByRole('button', { name: '停止' })).not.toBeInTheDocument(),
        { timeout: 15000 },
      );
    });

    // 3) 全要素终检：等打字机播完长文，公式与流程图渲染就位
    await step('全要素就位终检', async () => {
      await waitFor(() => expect(canvasElement.querySelector('.katex')).toBeTruthy(), {
        timeout: 30000,
      });
      await waitFor(() => expect(canvasElement.querySelector('.aix-md-mermaid svg')).toBeTruthy(), {
        timeout: 30000,
      });
    });
  },
};

/**
 * ErrorRetry：请求失败 → 气泡出现「重试」按钮 → 点击后第二次请求放行成功。
 * 从 FullInteractionFlow 拆出的独立用例（避免与全要素长文的打字机同屏双输出）。
 */
export const ErrorRetry: Story = {
  args: {
    request: fullFlowRequest(),
    welcomeTitle: '错误重试演示',
    welcomeDescription: '发送含「报错」的问题：首次失败出现重试按钮，点击后第二次成功',
  },
  play: async ({ canvas }) => {
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
 * GeneratingProcess：生成中思考过程 → 文本答案（端到端）。
 * 发送后助手先输出一段「思考过程」时间线（thought-chain 块：emoji 徽标 + 耗时 badge +
 * 末步流光「生成中」），随后流式给出文本答案。演示 thought-chain 块在对话流中的端到端渲染。
 */
export const GeneratingProcess: Story = {
  args: {
    request: thinkingThenAnswerRequest(),
    // 该 mock 与自定义 thinkingParseChunk 走逐行协议，用 line 模式按 \n 切行
    streamMode: 'line',
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

/**
 * EditFeedbackAndSubmitType：编排层三能力集成（editable / actions(feedback) / submitType）。
 *
 * 一个 play 串联 AiChat 编排层对外的三组能力与事件，补齐 FullInteractionFlow（流式/中断/重试）
 * 未覆盖的「消息后处理」路径：
 * 1. **赞踩反馈**（`actions: ['copy','regenerate','feedback']`）：对历史 AI 回复点「赞同」，受控写回 `extra.feedback` 高亮，
 *    并对外 `emit('feedback', { id, value })`。
 * 2. **编辑重发**（`editable`）：编辑用户消息并保存 → 截断后续重新生成，对外 `emit('edit', { id, text })`。
 * 3. **提交方式**（`submitType='shiftEnter'`）：普通 Enter 仅换行不发送，Shift+Enter 才触发发送
 *    （对外 `emit('send', text)`）。
 *
 * 以 defaultMessages 预置一轮「用户提问 + AI 回答」作为反馈与编辑的目标，事件经 args 上的
 * fn() 间谍断言。与 FullInteractionFlow 形成「生成链路 + 后处理链路」互补。
 */
export const EditFeedbackAndSubmitType: Story = {
  args: {
    request: assistantRequest(),
    editable: true,
    actions: ['copy', 'regenerate', 'feedback'],
    submitType: 'shiftEnter',
    welcomeTitle: '编辑重发 · 赞踩反馈 · Shift+Enter 提交',
    welcomeDescription:
      '演示 AiChat 编排层 editable / actions(feedback) / submitType 三能力与对外事件',
    placeholder: '输入消息，Shift+Enter 发送，Enter 换行…',
    prompts: undefined,
    // 对外事件间谍（v-bind="args" 会把 onXxx 注册为监听器）
    onSend: fn(),
    onEdit: fn(),
    onFeedback: fn(),
    defaultMessages: [
      createMessage('user', [textBlock('帮我写一段快速排序')], { id: 'u1', status: 'local' }),
      createMessage('ai', [textBlock('这是上一轮的历史回答，可对它点赞 / 踩。')], {
        id: 'a1',
        status: 'success',
      }),
    ],
  },
  play: async ({ canvas, args, step }) => {
    // 1) actions 含 feedback：对历史 AI 回复点「赞同」→ 受控高亮 + emit('feedback')
    await step('赞踩反馈（actions feedback）', async () => {
      // 虚拟列表异步渲染：findBy 轮询；过渡期可能 pointer-events:none，关指针检查避免 flaky
      const like = await canvas.findByRole('button', { name: '赞同' }, { timeout: 8000 });
      await userEvent.click(like, { pointerEventsCheck: 0 });
      await expect(args.onFeedback).toHaveBeenCalledTimes(1);
      // setFeedback 就地写回 extra.feedback → aria-pressed 受控变 true
      await waitFor(() => expect(like).toHaveAttribute('aria-pressed', 'true'));
    });

    // 2) editable：编辑用户消息并保存 → 截断重发 + emit('edit')
    await step('编辑重发（editable）', async () => {
      const editBtn = await canvas.findByRole('button', { name: '编辑' }, { timeout: 8000 });
      await userEvent.click(editBtn, { pointerEventsCheck: 0 });
      // 编辑态 textarea 的 aria-label 为「编辑」，与底部 Sender 输入框区分
      const editArea = (await canvas.findByRole('textbox', {
        name: '编辑',
      })) as HTMLTextAreaElement;
      // 虚拟列表项过渡期可能 pointer-events:none：用 select() 全选原文 + skipClick 直接改写，
      // 绕过指针交互检查避免 flaky（typewriter 首键替换选中文本）
      editArea.focus();
      editArea.select();
      await userEvent.type(editArea, 'Composition API 和 Options API 有什么区别', {
        skipClick: true,
      });
      await userEvent.click(canvas.getByRole('button', { name: '保存' }), {
        pointerEventsCheck: 0,
      });
      await expect(args.onEdit).toHaveBeenCalledTimes(1);
      // 重发后渲染新答案（对比表格表头「维度」）
      await canvas.findByText(/维度/, undefined, { timeout: 12000 });
      // 等本轮流式结束（「停止」消失），避免下一步被 Sender loading 守卫拦截
      await waitFor(
        () => expect(canvas.queryByRole('button', { name: '停止' })).not.toBeInTheDocument(),
        { timeout: 12000 },
      );
    });

    // 3) submitType='shiftEnter'：Enter 仅换行不发送，Shift+Enter 才发送
    await step('提交方式（submitType=shiftEnter）', async () => {
      const sender = canvas.getByRole('textbox', { name: /输入消息/ });
      await userEvent.click(sender);
      await userEvent.type(sender, '介绍一下 Vue 3 的响应式');
      // 普通 Enter 在 shiftEnter 模式下仅换行、不触发 send
      await userEvent.keyboard('{Enter}');
      await expect(args.onSend).not.toHaveBeenCalled();
      // Shift+Enter 才发送 → emit('send')
      await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
      await waitFor(() => expect(args.onSend).toHaveBeenCalledTimes(1));
    });
  },
};

// ──────────────────────────────────────────────
// mock 上传实现（带进度，文件名含 'fail' 触发失败）
// ──────────────────────────────────────────────

const mockUpload = async (
  file: File,
  ctx: { onProgress: (p: number) => void; signal: AbortSignal },
) => {
  for (let p = 0; p <= 100; p += 20) {
    if (ctx.signal.aborted) throw new DOMException('aborted', 'AbortError');
    ctx.onProgress(p);
    await new Promise((r) => setTimeout(r, 120));
  }
  if (file.name.includes('fail')) throw new Error('mock 上传失败');
  return {
    name: file.name,
    size: file.size,
    mime: file.type,
    url: `https://example.com/f/${file.name}`,
  };
};

// ──────────────────────────────────────────────
// mock 语音识别器（定时吐字，约 1.8s 后自停）
// ──────────────────────────────────────────────

const mockRecognizer: VoiceRecognizer = (ctx) => {
  const words = ['帮我', '帮我总结', '帮我总结这份报告'];
  let i = 0;
  const timer = setInterval(() => {
    const w = words[i];
    if (w == null) {
      clearInterval(timer);
      ctx.onResult(words[words.length - 1]!, true);
      ctx.onEnd();
      return;
    }
    ctx.onResult(w, false);
    i++;
  }, 600);
  return {
    stop: () => {
      clearInterval(timer);
      ctx.onEnd();
    },
  };
};

/**
 * FullFeatured：能力全开演示（附件 + 语音 + 操作条 + 快捷问题 + 流式回复）。
 *
 * 一次性开启以下全部能力：
 * - **attachments**：回形针按钮 + 附件面板，支持多文件上传（mock 进度 + 可控失败）
 * - **voice**：麦克风按钮 + mock 语音识别，约 1.8s 自动定稿填入输入框
 * - **actions**：`['copy','regenerate','feedback']`，AI 气泡下方渲染赞踩 / 复制 / 重新生成操作条
 * - **prompts**：欢迎页快捷问题按钮
 * - **mock request**：流式返回 Markdown 富文本回答
 *
 * play 自动串联以下断言：
 * 1. 回形针按钮（附件）、麦克风按钮（语音）、欢迎页 prompts 同屏存在
 * 2. 点击回形针 → 附件面板展开（placeholder 文案可见）
 * 3. 发送一条消息 → AI 回复出现 → 操作条渲染（赞同按钮可见）
 */
export const FullFeatured: Story = {
  args: {
    request: assistantRequest(),
    attachments: { upload: mockUpload, accept: 'image/*,.pdf', maxCount: 5 },
    voice: { recognizer: mockRecognizer },
    actions: ['copy', 'regenerate', 'feedback'],
    prompts: PROMPTS,
    welcomeTitle: '能力全开演示',
    welcomeDescription:
      '回形针（附件）+ 麦克风（语音）+ 操作条（赞踩 / 复制 / 重新生成）+ 快捷问题一次全开；文件名含 "fail" 可演示上传失败重试',
    placeholder: '输入消息，按 Enter 发送，Shift+Enter 换行…',
  },
  play: async ({ canvas, step }) => {
    // 1) 同屏存在：回形针、麦克风、欢迎页 prompts
    await step('同屏存在：回形针 + 麦克风 + prompts', async () => {
      const attachBtn = await canvas.findByRole('button', { name: '添加附件' }, { timeout: 5000 });
      await expect(attachBtn).toBeInTheDocument();
      const micBtn = await canvas.findByRole('button', { name: '语音输入' }, { timeout: 5000 });
      await expect(micBtn).toBeInTheDocument();
      // 欢迎页 prompts：取第一条快捷问题按钮
      await canvas.findByRole('button', { name: '帮我写一段快速排序' }, { timeout: 5000 });
    });

    // 2) 点击回形针 → 附件面板展开
    await step('点击回形针 → 面板展开', async () => {
      // 点击前重查（虚拟列表 / teleport 教训：click 前重新 find）
      const attachBtn = await canvas.findByRole('button', { name: '添加附件' });
      await userEvent.click(attachBtn);
      await canvas.findByText('点击或拖拽文件到此区域上传', undefined, { timeout: 5000 });
      // 再次点击收起面板，避免遮挡后续交互
      const attachBtn2 = await canvas.findByRole('button', { name: '添加附件' });
      await userEvent.click(attachBtn2);
    });

    // 3) 发送消息 → AI 回复 → 操作条出现
    await step('发送消息 → AI 回复 → 操作条渲染', async () => {
      const ta = canvas.getByRole('textbox');
      await userEvent.type(ta, '帮我写一段快速排序');
      await userEvent.keyboard('{Enter}');
      // 等待 AI 回复关键词出现（流式输出）
      await canvas.findByText(/快速排序/, undefined, { timeout: 15000 });
      // 等流式结束（「停止」消失）
      await waitFor(
        () => expect(canvas.queryByRole('button', { name: '停止' })).not.toBeInTheDocument(),
        { timeout: 15000 },
      );
      // 操作条：赞同按钮（findBy 轮询，虚拟列表异步渲染）
      const likeBtn = await canvas.findByRole('button', { name: '赞同' }, { timeout: 8000 });
      await expect(likeBtn).toBeInTheDocument();
    });
  },
};
