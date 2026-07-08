import { Highlight } from '@aix/icons';
import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent } from 'storybook/test';
import { markRaw, ref } from 'vue';
import { AiChat, Suggestions } from '../src';
import type { ParsedChunk, SSEChunk, SuggestionItem, UseChatOptions } from '../src';

/**
 * 追问建议（Follow-up Suggestions）
 *
 * `AiChat` 的 `suggestions` prop（opt-in）双通道：
 * - 通道②（持久化）：`parseChunk` 返回的 `suggestions` 字段随最后一帧下发，写入该条 AI 消息、
 *   随对话树持久化，刷新/切会话可还原；
 * - 通道①（临时）：`chatRef.setSuggestions([...])` 命令式立即展示，不持久化、发送即清、优先于通道②。
 *
 * 展示规则：仅取**最后一条 AI 消息**的建议；`isLoading` 期间抑制（流式中不展示，避免遮挡打字机）；
 * 发送后立即清空（含点击建议本身）。`fillOnly` 可将点击行为改为「仅回填输入框」而非直接发送。
 */
const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/追问建议',
  tags: ['autodocs'],
  component: AiChat,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof AiChat>;

const wrapperStyle =
  'display:flex;justify-content:center;box-sizing:border-box;min-height:100vh;padding:24px;background:var(--aix-colorBgLayout);';
const panelStyle = 'display:flex;flex-direction:column;gap:12px;width:100%;max-width:720px;';
const chatBoxStyle =
  'height:520px;overflow:hidden;border:1px solid var(--aix-colorBorderSecondary);border-radius:12px;background:var(--aix-colorBgContainer);';

// ──────────────────────────────────────────────
// 场景一：双通道——parseChunk 收尾帧下发 suggestions（通道②）+ setSuggestions（通道①）
// ──────────────────────────────────────────────

/**
 * mock SSE：data 直接是 ParsedChunk 形状的 JSON（{delta} 增量帧 / {suggestions,done} 收尾帧），
 * 与 useChat.suggestions.test.ts 的 passthroughParseChunk 思路一致——省去自定义协议字段映射，
 * 聚焦演示「收尾帧下发 suggestions」这一契约本身。
 */
function mockSuggestSSE(
  text: string,
  suggestions: string[],
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
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
          // 收尾帧：suggestions 随最后一帧下发（通道②契约），随消息落库持久化
          c.enqueue(enc.encode(`data: ${JSON.stringify({ suggestions, done: true })}\n\n`));
          clearInterval(timer);
          finish();
          return;
        }
        const slice = text.slice(i, i + 6);
        i += 6;
        c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: slice })}\n\n`));
      }, 30);
    },
  });
}

/** data 已是 ParsedChunk 形状，直接透传（无需字段映射） */
const passthroughParseChunk = (chunk: SSEChunk): ParsedChunk =>
  chunk.data ? (JSON.parse(chunk.data) as ParsedChunk) : {};

/**
 * DualChannel：发一条消息 → AI 回复收尾帧携带 suggestions（通道②，渲染为 chips）；
 * 另有一个按钮演示 `chatRef.setSuggestions([...])`（通道①，立即展示且优先于通道②）。
 * play：发送消息 → 断言通道②建议渲染 → 点击注入按钮 → 断言通道①建议覆盖展示。
 */
export const DualChannel: Story = {
  render: () => ({
    components: { AiChat },
    setup() {
      const chatRef = ref<InstanceType<typeof AiChat> | null>(null);
      const request: UseChatOptions['request'] = ({ signal }) =>
        Promise.resolve(
          mockSuggestSSE(
            '这是一条示例回答，收尾帧会携带 `suggestions` 字段（通道②，随消息持久化）。',
            ['这是什么原理？', '能给个示例吗？', '还有其他方案吗？'],
            signal,
          ),
        );
      const injectTemp = () => {
        chatRef.value?.setSuggestions(['临时建议 A（通道①）', '临时建议 B（通道①）']);
      };
      return { request, passthroughParseChunk, chatRef, injectTemp };
    },
    template: `
      <div style="${wrapperStyle}">
        <div style="${panelStyle}">
          <button type="button" style="align-self:flex-start;padding:6px 12px;border:1px solid var(--aix-colorBorderSecondary);border-radius:8px;background:var(--aix-colorBgContainer);cursor:pointer;" @click="injectTemp">
            注入临时建议（通道①，setSuggestions）
          </button>
          <div style="${chatBoxStyle}">
            <AiChat
              ref="chatRef"
              :request="request"
              :parse-chunk="passthroughParseChunk"
              suggestions
              welcome-title="追问建议 · 双通道演示"
              placeholder="发一条消息，看回复末尾的追问建议…"
            />
          </div>
        </div>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.type(textarea, '你好');
    await userEvent.keyboard('{Enter}');
    // 通道②：流结束后收尾帧的 suggestions 渲染为 chips
    await canvas.findByText('这是什么原理？', undefined, { timeout: 5000 });
    expect(canvas.getAllByRole('button', { name: /通道|原理|示例|方案/ }).length).toBeGreaterThan(
      0,
    );
    // 通道①：点击注入按钮，临时建议立即展示（覆盖通道②）
    await userEvent.click(
      canvas.getByRole('button', { name: '注入临时建议（通道①，setSuggestions）' }),
    );
    await canvas.findByText('临时建议 A（通道①）');
    expect(canvas.queryByText('这是什么原理？')).toBeNull();
  },
};

// ──────────────────────────────────────────────
// 场景二：fillOnly——点击仅回填输入框，不直接发送
// ──────────────────────────────────────────────

/**
 * FillOnly：`suggestions: { fillOnly: true }` 下，点击建议只把文本回填进输入框（供用户编辑后再发），
 * 不会直接触发发送。本 story 以 `defaultMessages` 静态给出已带 suggestions 的 AI 消息，
 * 不涉及真实请求（request 永不 resolve，仅满足类型签名，点击建议不会触发它）。
 * play：点击建议 chip → 断言输入框回填文本 → 断言未发出新消息。
 */
export const FillOnly: Story = {
  args: {
    // fillOnly 分支不会调用 onSend，因此本 story 无需真实可用的 request 实现
    request: () => new Promise(() => {}),
    suggestions: { fillOnly: true },
    welcomeTitle: '追问建议 · fillOnly',
    defaultMessages: [
      {
        id: 'ai-1',
        role: 'ai',
        status: 'success',
        content: [{ id: 'b-1', type: 'text', text: '已经回答完毕，你还可以继续追问：' }],
        suggestions: [{ text: '能再展开讲讲吗？' }, { text: '有没有相关文档？' }],
      },
    ],
  },
  render: (args) => ({
    components: { AiChat },
    setup: () => ({ args }),
    template: `
      <div style="${wrapperStyle}">
        <div style="${chatBoxStyle};max-width:720px;width:100%;margin:0 auto;">
          <AiChat v-bind="args" />
        </div>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByText('能再展开讲讲吗？'));
    await expect(canvas.getByRole('textbox')).toHaveValue('能再展开讲讲吗？');
    // fillOnly：仅回填，不发送——消息列表仍只有初始的 1 条 AI 消息。
    // 消息正文经 Markdown 引擎动态加载后才渲染（真实浏览器冷启动较慢），必须异步等待，
    // 同步 getAllByText 会在引擎就绪前查询而确定性失败
    const answers = await canvas.findAllByText(/已经回答完毕/, undefined, { timeout: 3000 });
    expect(answers.length).toBe(1);
  },
};

// ──────────────────────────────────────────────
// 场景三：独立使用 Suggestions 组件（自定义 items + 自定义插槽）
// ──────────────────────────────────────────────

const CUSTOM_ITEMS: SuggestionItem[] = [
  { text: '帮我总结这篇文档', icon: markRaw(Highlight) },
  { text: 'rate-limit-explain', label: '这个接口有限流吗？', icon: markRaw(Highlight) },
  { text: '换一种更简单的说法' },
];

/**
 * StandaloneWithSlot：脱离 `AiChat` 单独使用 `Suggestions`，自带 items（含 icon）与自定义默认插槽
 * （覆盖 chip 的默认文案渲染，加前缀符号）。适合非 AiChat 场景（如自定义会话界面）复用建议 chips 样式。
 */
export const StandaloneWithSlot: Story = {
  render: () => ({
    components: { Suggestions },
    setup() {
      const picked = ref('');
      return {
        items: CUSTOM_ITEMS,
        picked,
        onSelect: (item: SuggestionItem) => (picked.value = item.text),
      };
    },
    template: `
      <div style="padding:16px">
        <div style="margin-bottom:8px;font-size:13px;color:var(--aix-colorTextSecondary)">
          最近选择：{{ picked || '—' }}
        </div>
        <Suggestions :items="items" @select="onSelect">
          <template #default="{ item }">💡 {{ item.label ?? item.text }}</template>
        </Suggestions>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    // 自定义插槽给文案加了「💡 」前缀，testing-library 默认 exact 全等匹配会失败，须部分匹配
    await userEvent.click(canvas.getByText('这个接口有限流吗？', { exact: false }));
    await canvas.findByText(/最近选择：rate-limit-explain/);
  },
};

// ──────────────────────────────────────────────
// 场景四：Suggestions 加载态（独立使用）
// ──────────────────────────────────────────────

/**
 * Loading：脱离 AiChat 单独演示 Suggestions 的加载态骨架——追问建议异步生成期间，
 * `loading=true` 时忽略 `items`，渲染 3 个占位胶囊代替空白。
 */
export const Loading: Story = {
  render: () => ({
    components: { Suggestions },
    template: `
      <div style="padding:16px">
        <Suggestions :items="[]" loading />
      </div>
    `,
  }),
};
