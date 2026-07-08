import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor, fn } from 'storybook/test';
import { computed, defineComponent, markRaw, ref, type PropType } from 'vue';
import { AiChat } from '../src';
import type {
  BlockActionHandler,
  BlockActionPayload,
  ChatMessage,
  ContentBlock,
  ParsedChunk,
  SSEChunk,
  UseChatRequestCtx,
} from '../src';
import { createMessage, textBlock } from '../src/utils/helpers';

/**
 * 工具调用（tool_use）能力演示
 *
 * 五个 story 覆盖 tool_use 从「渲染」到「交互」的完整能力面：
 * - `Basic`：默认 ToolUseBlock 折叠卡片，展示工具从 input-available 到 output-available 的生命周期。
 * - `StreamingArgs`：参数以 argsTextDelta 分片流式拼接，卡片内原始 JSON 逐步补全。
 * - `CustomRenderer`：按 toolName 注册自定义渲染器（`toolRenderers`），把 output 渲染成业务卡片。
 * - `HITLResume`：人工确认（Human-in-the-loop）交互块 + `useChat.resume` 续流，确认后不新建消息节点。
 * - `ParallelCalls`：一条 AI 消息内并行携带两个 tool_use 块，各自独立渲染。
 */

// ──────────────────────────────────────────────
// 共用：JSON 帧 SSE mock（各 mock 后端统一用 ParsedChunk 形状的 JSON 作为 data 负载）
// ──────────────────────────────────────────────

/** 把一组「已序列化的 ParsedChunk JSON」按节奏流式推送，结束补发 [DONE]，支持 signal 中断 */
function sseFrom(frames: string[], signal?: AbortSignal, stepMs = 45): ReadableStream<Uint8Array> {
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
        if (i >= frames.length) {
          c.enqueue(enc.encode('data: [DONE]\n\n'));
          clearInterval(timer);
          finish();
          return;
        }
        c.enqueue(enc.encode(`data: ${frames[i]}\n\n`));
        i += 1;
      }, stepMs);
      signal?.addEventListener('abort', () => {
        clearInterval(timer);
        finish();
      });
    },
  });
}

/** 通用 parseChunk：data 直接是 ParsedChunk 的 JSON 序列化（可含 tool / delta 字段） */
const parseChunk = (chunk: SSEChunk): ParsedChunk => {
  if (chunk.data === '[DONE]') return { done: true };
  try {
    return JSON.parse(chunk.data ?? '{}') as ParsedChunk;
  } catch {
    return {};
  }
};

/** tool_use 块的窄类型别名，供 story 内构造 defaultMessages 时复用 */
type ToolUseContentBlock = Extract<ContentBlock, { type: 'tool_use' }>;

// ════════════════════════════════════════════════════════════
// Basic：默认 ToolUseBlock 折叠卡片，input-available → output-available
// ════════════════════════════════════════════════════════════

const BASIC_CALL_ID = 'call_weather_basic';

function basicRequest() {
  const frames = [
    JSON.stringify({
      tool: {
        index: 0,
        toolCallId: BASIC_CALL_ID,
        toolName: 'get_weather',
        input: { city: '北京' },
      },
    }),
    JSON.stringify({
      tool: { index: 0, toolCallId: BASIC_CALL_ID, output: { temp: 28, condition: '晴' } },
    }),
    JSON.stringify({ delta: '已为你查询到北京当前天气：28℃，晴。' }),
  ];
  return (ctx: UseChatRequestCtx) => Promise.resolve(sseFrom(frames, ctx.signal));
}

// ════════════════════════════════════════════════════════════
// StreamingArgs：参数以 argsTextDelta 分片流式拼接
// ════════════════════════════════════════════════════════════

const STREAMING_CALL_ID = 'call_flights_streaming';

function streamingArgsRequest() {
  const frames = [
    JSON.stringify({
      tool: { index: 0, toolCallId: STREAMING_CALL_ID, toolName: 'search_flights' },
    }),
    JSON.stringify({ tool: { index: 0, argsTextDelta: '{"from":' } }),
    JSON.stringify({ tool: { index: 0, argsTextDelta: '"SHA","to":' } }),
    JSON.stringify({ tool: { index: 0, argsTextDelta: '"PEK"}' } }),
    JSON.stringify({ tool: { index: 0, argsDone: true } }),
    JSON.stringify({ tool: { index: 0, output: { count: 3 } } }),
    JSON.stringify({ delta: '为你找到 3 个可选航班。' }),
  ];
  return (ctx: UseChatRequestCtx) => Promise.resolve(sseFrom(frames, ctx.signal, 60));
}

// ════════════════════════════════════════════════════════════
// CustomRenderer：generate_quiz → 自定义 QuizCard，直接消费 block.output
// ════════════════════════════════════════════════════════════

interface QuizOutput {
  question: string;
  options: string[];
  selected?: string;
}

const QuizCard = defineComponent({
  name: 'QuizCard',
  props: {
    block: { type: Object as PropType<ToolUseContentBlock>, required: true },
    onBlockAction: { type: Function as PropType<BlockActionHandler>, default: undefined },
  },
  setup(props) {
    const output = computed(
      () => (props.block.output ?? { question: '', options: [] }) as QuizOutput,
    );
    const select = (opt: string) => {
      props.onBlockAction?.({
        blockId: props.block.id,
        type: 'answer',
        patch: { output: { ...output.value, selected: opt } },
      });
    };
    return { output, select };
  },
  template: `
    <div style="padding:14px 16px;border-radius:var(--aix-borderRadiusLG);border:1px solid var(--aix-colorBorderSecondary);background:var(--aix-colorFillTertiary);">
      <div style="font-weight:var(--aix-fontWeightStrong);margin-bottom:8px;color:var(--aix-colorText);">{{ output.question }}</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <button
          v-for="opt in output.options"
          :key="opt"
          type="button"
          :disabled="!!output.selected"
          @click="select(opt)"
          :style="{
            padding: 'var(--aix-paddingXXS) var(--aix-paddingSM)',
            borderRadius: 'var(--aix-borderRadius)',
            border: '1px solid var(--aix-colorBorderSecondary)',
            background: output.selected === opt ? 'var(--aix-colorPrimary)' : 'var(--aix-colorBgContainer)',
            color: output.selected === opt ? 'var(--aix-colorWhite)' : 'var(--aix-colorText)',
            cursor: output.selected ? 'default' : 'pointer',
            textAlign: 'left',
          }"
        >{{ opt }}</button>
      </div>
      <div v-if="output.selected" style="margin-top:8px;font-size:var(--aix-fontSizeSM);color:var(--aix-colorTextSecondary);">
        已选择：{{ output.selected }}
      </div>
    </div>
  `,
});

const QUIZ_CALL_ID = 'call_generate_quiz';

function customRendererRequest() {
  const frames = [
    JSON.stringify({
      tool: {
        index: 0,
        toolCallId: QUIZ_CALL_ID,
        toolName: 'generate_quiz',
        input: { topic: '梵高《向日葵》' },
        output: {
          question: '梵高《向日葵》系列主要创作于哪个时期？',
          options: ['巴黎时期', '阿尔勒时期', '圣雷米时期'],
        },
      },
    }),
    JSON.stringify({ delta: '已为你生成一道单选题，点击选项作答 👆' }),
  ];
  return (ctx: UseChatRequestCtx) => Promise.resolve(sseFrom(frames, ctx.signal));
}

// ════════════════════════════════════════════════════════════
// HITLResume：确认交互块 + useChat.resume 续流
// ════════════════════════════════════════════════════════════

const HITL_CALL_ID = 'call_transfer_money';

interface TransferInput {
  amount: number;
  to: string;
}

/** 转账确认卡：awaiting-approval 时渲染确认/拒绝按钮，点击后仅上抛动作，不直接改状态 */
const ConfirmCard = defineComponent({
  name: 'ConfirmCard',
  props: {
    block: { type: Object as PropType<ToolUseContentBlock>, required: true },
    onBlockAction: { type: Function as PropType<BlockActionHandler>, default: undefined },
  },
  setup(props) {
    const input = computed(() => (props.block.input ?? { amount: 0, to: '' }) as TransferInput);
    const decide = (approved: boolean) => {
      props.onBlockAction?.({
        blockId: props.block.id,
        type: approved ? 'approve' : 'reject',
        // 就地置为 executing：驱动 UI 立即反馈「处理中」，实际结果由 resume 续流回写
        patch: { state: 'executing' },
      });
    };
    return { input, decide };
  },
  template: `
    <div style="padding:14px 16px;border-radius:var(--aix-borderRadiusLG);border:1px solid var(--aix-colorBorderSecondary);background:var(--aix-colorFillTertiary);">
      <div style="color:var(--aix-colorText);margin-bottom:8px;">
        请求向 <strong>{{ input.to }}</strong> 转账 <strong>¥{{ input.amount }}</strong>，是否确认？
      </div>
      <div v-if="block.state === 'awaiting-approval'" style="display:flex;gap:8px;">
        <button
          type="button"
          @click="decide(true)"
          style="padding:6px 14px;border-radius:var(--aix-borderRadius);border:none;background:var(--aix-colorPrimary);color:var(--aix-colorWhite);cursor:pointer;"
        >确认</button>
        <button
          type="button"
          @click="decide(false)"
          style="padding:6px 14px;border-radius:var(--aix-borderRadius);border:1px solid var(--aix-colorBorderSecondary);background:var(--aix-colorBgContainer);color:var(--aix-colorText);cursor:pointer;"
        >拒绝</button>
      </div>
      <div v-else-if="block.state === 'executing'" style="color:var(--aix-colorTextSecondary);font-size:var(--aix-fontSizeSM);">
        处理中…
      </div>
      <div v-else-if="block.state === 'output-available'" style="color:var(--aix-colorSuccess);font-size:var(--aix-fontSizeSM);">
        转账成功：{{ JSON.stringify(block.output) }}
      </div>
      <div v-else-if="block.state === 'output-error'" style="color:var(--aix-colorError);font-size:var(--aix-fontSizeSM);">
        {{ block.errorText }}
      </div>
    </div>
  `,
});

/** resume 时按业务 payload 分支返回不同流：approved → 成交结果，拒绝 → errorText */
function hitlRequest() {
  return (ctx: UseChatRequestCtx) => {
    const resumePayload = ctx.resume as { approved?: boolean } | undefined;
    if (resumePayload) {
      const frames = resumePayload.approved
        ? [
            JSON.stringify({
              tool: {
                index: 0,
                toolCallId: HITL_CALL_ID,
                output: { status: '已到账', orderId: 'TX20260701' },
              },
            }),
            JSON.stringify({ delta: '转账已完成，订单号 TX20260701。' }),
          ]
        : [
            JSON.stringify({
              tool: { index: 0, toolCallId: HITL_CALL_ID, errorText: '用户已拒绝该操作' },
            }),
            JSON.stringify({ delta: '好的，已取消本次转账。' }),
          ];
      return Promise.resolve(sseFrom(frames, ctx.signal));
    }
    // 兜底分支：该 demo 的初始状态由 defaultMessages 静态给出，正常不会走到这里
    return Promise.resolve(
      sseFrom([JSON.stringify({ delta: '请通过上方确认/拒绝按钮触发续流。' })], ctx.signal),
    );
  };
}

const hitlDefaultMessages: ChatMessage[] = [
  createMessage('user', [textBlock('帮我向张三转账 500 元')], { id: 'hitl-user', status: 'local' }),
  createMessage(
    'ai',
    [
      textBlock('好的，这笔转账需要你确认后才会执行：'),
      {
        id: 'hitl-blk',
        type: 'tool_use',
        toolCallId: HITL_CALL_ID,
        toolName: 'transfer_money',
        state: 'awaiting-approval',
        input: { amount: 500, to: '张三' },
      } as ToolUseContentBlock,
    ],
    { id: 'hitl-ai', status: 'success' },
  ),
];

// ════════════════════════════════════════════════════════════
// ParallelCalls：一条消息内并行两个 tool_use 块
// ════════════════════════════════════════════════════════════

const parallelDefaultMessages: ChatMessage[] = [
  createMessage('user', [textBlock('帮我同时查一下上海天气和美元汇率')], {
    id: 'parallel-user',
    status: 'local',
  }),
  createMessage(
    'ai',
    [
      textBlock('好的，正在并行调用两个工具：'),
      {
        id: 'parallel-blk-1',
        type: 'tool_use',
        toolCallId: 'call_parallel_weather',
        toolName: 'get_weather',
        state: 'output-available',
        input: { city: '上海' },
        output: { temp: 26, condition: '多云' },
      } as ToolUseContentBlock,
      {
        id: 'parallel-blk-2',
        type: 'tool_use',
        toolCallId: 'call_parallel_fx',
        toolName: 'get_fx_rate',
        state: 'output-available',
        input: { from: 'USD', to: 'CNY' },
        output: { rate: 7.15 },
      } as ToolUseContentBlock,
    ],
    { id: 'parallel-ai', status: 'success' },
  ),
];

/** 静态展示 story 也需一个占位 request（不会被触发） */
const staticRequest = (ctx: UseChatRequestCtx) => Promise.resolve(sseFrom([], ctx.signal));

// ════════════════════════════════════════════════════════════
// Meta + Story 定义
// ════════════════════════════════════════════════════════════

const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/场景演示/工具调用（tool_use）',
  tags: ['autodocs'],
  component: AiChat,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '面向「后端跑 agentic 循环」部署形态的工具调用能力：默认可折叠 ToolUseBlock、' +
          '流式参数拼接、按 toolName 路由的自定义渲染器（toolRenderers）、' +
          '人工确认后用 useChat.resume 续流，以及并行工具调用渲染。',
      },
    },
  },
  render: (args) => ({
    components: { AiChat },
    setup: () => ({ args }),
    template: `
      <div style="display:flex;justify-content:center;box-sizing:border-box;min-height:100vh;padding:24px;background:var(--aix-colorBgLayout);">
        <div style="display:flex;flex-direction:column;width:100%;max-width:720px;height:600px;overflow:hidden;border:1px solid var(--aix-colorBorderSecondary);border-radius:14px;background:var(--aix-colorBgContainer);box-shadow:var(--aix-shadowMD);">
          <AiChat v-bind="args" />
        </div>
      </div>
    `,
  }),
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Basic：默认 ToolUseBlock 折叠卡片，工具从 input-available 流转到 output-available */
export const Basic: Story = {
  args: {
    request: basicRequest(),
    parseChunk,
    welcomeTitle: '工具调用演示',
    welcomeDescription:
      '默认 ToolUseBlock 折叠卡片：展示工具从 input-available 到 output-available 的完整生命周期',
    prompts: [{ key: '1', label: '查一下北京天气' }],
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: '查一下北京天气' }));
    // input-available：工具名先出现
    const header = await canvas.findByText('get_weather', undefined, { timeout: 5000 });
    // output-available：结果落地
    await canvas.findByText(/28/, undefined, { timeout: 5000 });
    // 折叠交互：点击卡片头部收起正文
    await userEvent.click(header, { pointerEventsCheck: 0 });
    await waitFor(() => expect(canvas.queryByText(/28/)).not.toBeVisible());
  },
};

/** StreamingArgs：参数以 argsTextDelta 分片流式拼接，原始 JSON 逐步补全后再解析为 input */
export const StreamingArgs: Story = {
  args: {
    request: streamingArgsRequest(),
    parseChunk,
    welcomeTitle: '流式参数拼接',
    welcomeDescription:
      '参数不是一次性给出，而是按 argsTextDelta 分片拼接，卡片内原始 JSON 逐步补全',
    prompts: [{ key: '1', label: '帮我查一下上海到北京的航班' }],
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: '帮我查一下上海到北京的航班' }));
    // 分片中：先看到未闭合的原始 JSON 片段
    await canvas.findByText(/"from":/, undefined, { timeout: 5000 });
    // 分片完成、argsDone 解析出完整 input 后，最终结果出现
    await canvas.findByText(/为你找到 3 个可选航班/, undefined, { timeout: 5000 });
  },
};

/** CustomRenderer：注册 toolRenderers['generate_quiz']，把 output 渲染成业务卡片并回写选择 */
export const CustomRenderer: Story = {
  args: {
    request: customRendererRequest(),
    parseChunk,
    toolRenderers: { generate_quiz: markRaw(QuizCard) },
    welcomeTitle: '自定义工具渲染器',
    welcomeDescription:
      '按 toolName 注册 toolRenderers，把 tool_use 的 output 渲染成业务卡片（此处为选择题）',
    prompts: [{ key: '1', label: '出一道梵高《向日葵》的题' }],
    // 事件名 'block-action' 非驼峰，v-bind="args" 推导出的监听器 prop key 是 'onBlock-action'
    'onBlock-action': fn(),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: '出一道梵高《向日葵》的题' }));
    await canvas.findByText(/梵高《向日葵》系列主要创作于哪个时期/, undefined, { timeout: 5000 });
    const option = await canvas.findByRole('button', { name: '阿尔勒时期' });
    // virtua 虚拟列表项过渡期可能 pointer-events:none：关指针检查避免 flaky（与 Basic 折叠点击一致）
    await userEvent.click(option, { pointerEventsCheck: 0 });
    await expect(args['onBlock-action']).toHaveBeenCalledTimes(1);
    await canvas.findByText('已选择：阿尔勒时期');
  },
};

/**
 * HITLResume：人工确认（Human-in-the-loop）交互块 + useChat.resume 续流。
 * 消息以 defaultMessages 静态给出 awaiting-approval 态的 tool_use 块；
 * 点击「确认/拒绝」经 onBlockAction 上抛，业务在 @block-action 里调用 AiChat 暴露的
 * `resume(messageKey, payload)` 向同一条 AI 消息续写，不新建消息节点。
 */
export const HITLResume: Story = {
  render: (args) => ({
    components: { AiChat },
    setup() {
      const chatRef = ref<InstanceType<typeof AiChat> | null>(null);
      // 业务持久化入口：写回命中后才会收到该事件（AiChat 内部先 updateBlock 再透出）
      const onBlockAction = async (payload: BlockActionPayload) => {
        const approved = payload.action.type === 'approve';
        await chatRef.value?.resume(String(payload.messageKey), { approved });
      };
      return { args, chatRef, onBlockAction };
    },
    template: `
      <div style="display:flex;justify-content:center;box-sizing:border-box;min-height:100vh;padding:24px;background:var(--aix-colorBgLayout);">
        <div style="display:flex;flex-direction:column;width:100%;max-width:720px;height:600px;overflow:hidden;border:1px solid var(--aix-colorBorderSecondary);border-radius:14px;background:var(--aix-colorBgContainer);box-shadow:var(--aix-shadowMD);">
          <AiChat ref="chatRef" v-bind="args" @block-action="onBlockAction" />
        </div>
      </div>
    `,
  }),
  args: {
    request: hitlRequest(),
    parseChunk,
    toolRenderers: { transfer_money: markRaw(ConfirmCard) },
    defaultMessages: hitlDefaultMessages,
    welcomeTitle: '人工确认续流（HITL resume）',
  },
  play: async ({ canvas }) => {
    // ConfirmCard 渲染出确认按钮即代表 awaiting-approval 卡片已就位
    // （卡片文案被 <strong> 拆成多个文本节点，故不用跨节点正则，直接等按钮）
    const confirm = await canvas.findByRole('button', { name: '确认' }, { timeout: 5000 });
    // virtua 虚拟列表项过渡期可能 pointer-events:none：关指针检查避免 flaky
    await userEvent.click(confirm, { pointerEventsCheck: 0 });
    // resume 续流：不新建消息节点，同一张卡片内更新为成功结果
    await canvas.findByText(/转账成功/, undefined, { timeout: 5000 });
    await canvas.findByText(/转账已完成，订单号 TX20260701/, undefined, { timeout: 5000 });
  },
};

/** ParallelCalls：一条 AI 消息内并行携带两个 tool_use 块，各自独立渲染折叠卡片 */
export const ParallelCalls: Story = {
  args: {
    request: staticRequest,
    parseChunk,
    defaultMessages: parallelDefaultMessages,
    welcomeTitle: '并行工具调用',
  },
  play: async ({ canvas }) => {
    await canvas.findByText('get_weather', undefined, { timeout: 5000 });
    await canvas.findByText('get_fx_rate', undefined, { timeout: 5000 });
    await canvas.findByText(/多云/, undefined, { timeout: 5000 });
    await canvas.findByText(/7.15/, undefined, { timeout: 5000 });
  },
};
