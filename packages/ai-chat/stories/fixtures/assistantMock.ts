import type { ChatMessage, ParsedChunk, RoleConfig, ThoughtChainItem } from '../../src';
import { thoughtChainBlock, messageText } from '../../src/utils/helpers';
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

export const AI_AVATAR = avatar('#13c2c2', 'AI');
export const USER_AVATAR = avatar('#8c8c8c', '我');

/** 角色样式：给 AI / 用户气泡各配一个头像 */
export const ASSISTANT_ROLES: Record<string, RoleConfig> = {
  ai: { placement: 'start', variant: 'filled', avatar: AI_AVATAR },
  user: { placement: 'end', variant: 'filled', avatar: USER_AVATAR },
};

// ============ 拟真 mock 后端 ============

export interface StreamOptions {
  /** 每次推送间隔（ms），越小越快 */
  stepMs?: number;
  /** 每次推送的字符数 */
  chunkSize?: number;
}

/** 把一段文本按 OpenAI SSE 协议分块流式输出，支持通过 signal 中断 */
export function streamSSE(
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
export function pickAnswer(question: string): string {
  const q = question.toLowerCase();
  if (/完整|示例|报告|全要素/.test(q)) return ANSWER_FULL;
  if (/代码|快速排序|算法|python|函数|写一段|写个/.test(q)) return ANSWER_CODE;
  if (/区别|对比|差异|\bvs\b|哪个好/.test(q)) return ANSWER_DIFF;
  if (/vue|composition|响应式|ref\b|组件/.test(q)) return ANSWER_VUE;
  if (/调试|报错|排查|bug|错误|崩溃/.test(q)) return ANSWER_DEBUG;
  return ANSWER_FALLBACK;
}

/** 智能助手 request：读取最后一条用户消息，流式返回匹配的 Markdown 回答 */
export function assistantRequest(opts: StreamOptions = {}) {
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
export function fullFlowRequest(opts: StreamOptions = {}) {
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
export function thinkingThenAnswerRequest(opts: StreamOptions = {}) {
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
export function thinkingParseChunk(raw: string): ParsedChunk {
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

export const PROMPTS = [
  { key: '1', label: '帮我写一段快速排序' },
  { key: '2', label: 'Composition API 和 Options API 有什么区别' },
  { key: '3', label: '介绍一下 Vue 3 的响应式' },
  { key: '4', label: '线上报错该怎么排查' },
];

// ============ 共用 meta.args 基座 ============

/**
 * AiChat.stories.ts / AiChatEditFeedback.stories.ts / AiChatFullFeatured.stories.ts
 * 三个场景文件共用的 meta.args 基座（欢迎语 / 占位符 / roles / request），保证视觉与交互一致。
 * 各调用方按需 `{ ...baseAssistantArgs(), prompts: PROMPTS, ... }` 追加/覆盖差异字段。
 */
export function baseAssistantArgs() {
  return {
    request: assistantRequest(),
    roles: ASSISTANT_ROLES as Record<string, RoleConfig>,
    welcomeTitle: '你好，我是 AIX 智能助手',
    welcomeDescription: '可以写代码、解释概念、做对比 —— 选个快捷问题，或直接输入',
    placeholder: '输入消息，按 Enter 发送，Shift+Enter 换行…',
  };
}

// ============ 共用外壳 render ============

/**
 * 助手应用外壳：居中卡片 + 顶部标题栏（头像 + 名称 + 在线状态），AiChat 占满主体。
 * 供 AiChat.stories.ts / AiChatEditFeedback.stories.ts / AiChatFullFeatured.stories.ts 三个
 * 场景文件的 `meta.render` 共用，保证视觉外壳一致。
 *
 * 只返回 `{ setup, template }`，不含 `components`——调用方（各 `meta.render`）
 * 自行提供 `components: { AiChat }`，即 `render: (args) => ({ components: { AiChat }, ...assistantShellRender(args) })`。
 * 这样本 fixture 文件不需要导入 `AiChat` 组件值，避免与各消费方重复打包组件引用。
 */
export function assistantShellRender(args: Record<string, unknown>) {
  return {
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
  };
}
