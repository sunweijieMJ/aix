import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import { AiChat, openaiParseChunk } from '../src';
import type { UseChatOptions } from '../src';
import { fullReportMarkdown } from './fullReportMarkdown';

/**
 * SSE 原文回放（调试工具型 story）
 *
 * 把测试接口抓到的标准 OpenAI 兼容 SSE 原文（`data: {...}` 格式，事件之间以空行分隔，
 * 以 `data: [DONE]` 结束）粘贴进左侧文本框，发送任意消息即可逐 chunk 回放，观察组件的流式渲染效果。
 *
 * 原理：AiChat 默认 `streamMode: 'sse'`，request 只需返回 `ReadableStream<Uint8Array>`；
 * 回放器把粘贴文本按空行切成事件、定时逐个 encode 吐出，协议解析（event/data 字段、注释行、
 * CRLF）全部由内部 `sseStream` 完成，与真实网络流走完全相同的链路；增量提取交给内置 `openaiParseChunk`。
 */
const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/SSE 原文回放',
  component: AiChat,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof AiChat>;

// ============ 回放器：粘贴的 SSE 原文 → 字节流 ============

/** 把 SSE 原文按「事件」（空行边界）切块，定时逐个回放成字节流，支持 signal 中断 */
function replaySSE(raw: string, signal?: AbortSignal, stepMs = 120): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const events = raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return new ReadableStream<Uint8Array>({
    start(c) {
      let i = 0;
      const finish = () => {
        clearInterval(timer);
        try {
          c.close();
        } catch {
          /* 已关闭则忽略 */
        }
      };
      const timer = setInterval(() => {
        if (signal?.aborted || i >= events.length) {
          finish();
          return;
        }
        // 补回事件边界空行：sseStream 以空行作为事件结束标志
        c.enqueue(enc.encode(events[i] + '\n\n'));
        i += 1;
      }, stepMs);
      signal?.addEventListener('abort', finish);
    },
  });
}

// ============ 示例数据：标准 OpenAI 兼容流式格式 ============

/** OpenAI chat.completions 流式 chunk：正文增量在 `choices[0].delta.content`，结束信号为 `data: [DONE]` */
const openaiEvent = (delta: Record<string, unknown>, finishReason: string | null = null) =>
  `data: ${JSON.stringify({
    id: 'chatcmpl-demo',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'gpt-4o',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}`;

/** 把长文按定长切片，模拟真实接口逐 token 推流（定长保证示例每次稳定，避免随机源） */
const sliceToChunks = (text: string, size = 8): string[] => {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
};

/** 思维链增量：OpenAI 兼容后端（如 DeepSeek-R1）放在 `delta.reasoning_content`，被解析为 reasoning 块 */
const REASONING =
  '用户要一份季度销量报告。先确定结构：核心数据表 → 增长归因 → 公式推导 → 流程图 → 风险与结论。' +
  '表格用 5 列覆盖同比/环比，公式用行内与块级各演示一次，再配 mermaid 展示决策流。';

/**
 * 全要素 OpenAI 流式示例：覆盖
 * 1) 首帧 role；2) 思维链（reasoning_content）→ 独立 reasoning 块；
 * 3) 正文正文增量（content）：复用全要素长文 —— 多级标题 / 粗斜体删除线 / 行内+块级公式(KaTeX) /
 *    5 列表格 / 图片 / 有序嵌套列表 / 引用 / 含 $$ 与 | 的代码块 / mermaid 流程图 / 分隔线 / 链接；
 * 4) 收尾帧 finish_reason + `data: [DONE]`。
 */
const SAMPLE_OPENAI_SSE = [
  openaiEvent({ role: 'assistant' }), // 首帧通常只带 role，无正文
  // —— 思维链：逐片推 reasoning_content（与 content 互斥时归 reasoning 块）——
  ...sliceToChunks(REASONING, 12).map((piece) => openaiEvent({ reasoning_content: piece })),
  // —— 正文：复用全要素长文，逐片推 content ——
  ...sliceToChunks(fullReportMarkdown, 8).map((piece) => openaiEvent({ content: piece })),
  openaiEvent({}, 'stop'), // 收尾帧：delta 为空 + finish_reason
  'data: [DONE]', // 结束信号，由 openaiParseChunk 识别
].join('\n\n');

// ============ Story ============

/**
 * 左侧粘贴标准 OpenAI 格式 SSE 原文（事件之间保留空行、以 `data: [DONE]` 结束），
 * 右侧发送任意消息触发回放。回放节奏可调（每个 chunk 的间隔 ms）；request 在每次发送时
 * 读取文本框内容，粘贴新数据后直接再发一条消息即可回放新内容，无需刷新。
 * 增量解析由内置 `openaiParseChunk` 完成，无需自写解析逻辑。
 */
export const OpenAIReplay: Story = {
  render: () => ({
    components: { AiChat },
    setup() {
      const raw = ref(SAMPLE_OPENAI_SSE);
      const stepMs = ref(150);
      const request: UseChatOptions['request'] = ({ signal }) =>
        Promise.resolve(replaySSE(raw.value, signal, stepMs.value));
      return { raw, stepMs, request, openaiParseChunk };
    },
    template: `
      <div style="display:flex;gap:16px;box-sizing:border-box;height:100vh;padding:16px;background:var(--aix-colorBgLayout);">
        <div style="display:flex;flex-direction:column;gap:8px;width:420px;flex:none;">
          <label style="font-size:13px;color:var(--aix-colorTextSecondary);">
            OpenAI SSE 原文（data: {…choices…} 格式，事件之间空行分隔，以 data: [DONE] 结束）
          </label>
          <textarea
            v-model="raw"
            spellcheck="false"
            style="flex:1;resize:none;padding:12px;font:12px/1.6 monospace;color:var(--aix-colorText);background:var(--aix-colorBgContainer);border:1px solid var(--aix-colorBorderSecondary);border-radius:8px;"
          />
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--aix-colorTextSecondary);">
            回放间隔 <input v-model.number="stepMs" type="number" min="0" step="50" style="width:80px;" /> ms/chunk
          </label>
        </div>
        <div style="flex:1;min-width:0;border:1px solid var(--aix-colorBorderSecondary);border-radius:12px;overflow:hidden;background:var(--aix-colorBgContainer);">
          <AiChat
            :request="request"
            :parse-chunk="openaiParseChunk"
            welcome-title="SSE 回放调试器（OpenAI）"
            welcome-description="发送任意消息，即按左侧粘贴的 OpenAI 兼容 SSE 原文逐 chunk 回放"
            placeholder="随便输入点什么，触发回放…"
          />
        </div>
      </div>
    `,
  }),
};
