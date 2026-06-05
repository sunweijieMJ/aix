import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { AiChat, openaiParseChunk } from '../src';
import type { ChatMessage } from '../src';

/**
 * 数据层能力演示（useChat / parseChunk / parser / 重试）
 *
 * 这些 story 聚焦 AiChat 的**数据层**而非样式：
 * - `openaiParseChunk`：内置 OpenAI 兼容预设，直接对接 `choices[0].delta.content` 报文。
 * - `retryTimes`：请求失败自动重试。
 * - `parser`：解耦「后端原始消息」与「UI 渲染消息」（1→1，保留 id）。
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
