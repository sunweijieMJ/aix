import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor, fn } from 'storybook/test';
import { ref } from 'vue';
import { AiChat } from '../src';
import type {
  BlockIntentPayload,
  ChatMessage,
  ConfirmField,
  ContentBlock,
  ParsedChunk,
  SSEChunk,
  UseChatRequestCtx,
  UserConfirmState,
} from '../src';
import { createMessage, textBlock, userConfirmBlock } from '../src/utils/helpers';

/**
 * 用户确认卡（user_confirm）能力演示
 *
 * 组件库只负责「块类型 + 卡片 UI + 超时策略 + 答案回写」，**提交本身留在宿主**：
 * 点提交经 `BlockIntent` 上抛到 `@block-intent`，宿主自行发请求 / 续流，再把 `state`
 * 推进到 `submitting → submitted`。改答案则走 `BlockAction`，由组件库自动落地。
 *
 * - `Basic`：消息已 success（流已收尾）时卡片**仍可填写**——续流语义下这正是应填状态。
 * - `Timeout`：提示 → 按默认值自动填充 → 自动提交的完整时间线（story 内压缩到数秒）。
 * - `States`：awaiting / submitting / submitted / expired 四态渲染对照。
 * - `Superseded`：同一条消息内下发第二张卡时，前一张自动置 expired（useChat 内置规则）。
 */

// ──────────────────────────────────────────────
// 共用 mock
// ──────────────────────────────────────────────

/** 把一组「已序列化的 ParsedChunk JSON」按节奏推送，结束补发 [DONE] */
function sseFrom(frames: string[], signal?: AbortSignal, stepMs = 400): ReadableStream<Uint8Array> {
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
        if (signal?.aborted || i >= frames.length) {
          if (!signal?.aborted) c.enqueue(enc.encode('data: [DONE]\n\n'));
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

const parseChunk = (chunk: SSEChunk): ParsedChunk => {
  if (chunk.data === '[DONE]') return { done: true };
  try {
    return JSON.parse(chunk.data ?? '{}') as ParsedChunk;
  } catch {
    return {};
  }
};

const staticRequest = (ctx: UseChatRequestCtx) => Promise.resolve(sseFrom([], ctx.signal));

const TRIP_FIELDS: ConfirmField[] = [
  {
    name: 'budget',
    question: '预算区间',
    type: 'radio',
    options: ['3000 以内', '3000-6000', '6000 以上'],
    defaultValue: '3000-6000',
    required: true,
  },
  {
    name: 'interests',
    question: '偏好（可多选）',
    type: 'checkbox',
    options: ['自然风光', '人文古迹', '美食'],
    defaultValue: ['自然风光'],
  },
  { name: 'note', question: '其它要求', type: 'text' },
];

/** 造一条「已收尾但带待填确认卡」的 AI 消息：这正是 success + awaiting 的典型形态 */
function confirmMessage(opts: {
  id: string;
  state?: UserConfirmState;
  fields?: ConfirmField[];
  createdAt?: number;
  timeout?: Extract<ContentBlock, { type: 'user_confirm' }>['timeout'];
  lead?: string;
}): ChatMessage {
  return createMessage(
    'ai',
    [
      textBlock(opts.lead ?? '在开始规划前，想先跟你确认几件事：'),
      userConfirmBlock('trip-form', opts.fields ?? TRIP_FIELDS, {
        title: '出行偏好确认',
        state: opts.state,
        createdAt: opts.createdAt,
        timeout: opts.timeout,
      }),
    ],
    { id: opts.id, status: 'success' },
  );
}

// ════════════════════════════════════════════════════════════
// Meta
// ════════════════════════════════════════════════════════════

const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/场景演示/用户确认卡（user_confirm）',
  tags: ['autodocs'],
  component: AiChat,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '待用户填写并提交的表单卡片：可交互性只看卡片自身 state 与超时时间线（不看消息 status），' +
          '改答案走 BlockAction 自动落地，点提交走 BlockIntent 交宿主处置。',
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

/**
 * Basic：消息已是 success（流早已收尾）时卡片仍可填写与提交。
 * 宿主在 `@block-intent` 里把 state 推进到 submitting → submitted，并可在此调 `resume` 续流。
 */
export const Basic: Story = {
  render: (args) => ({
    components: { AiChat },
    setup() {
      const chatRef = ref<InstanceType<typeof AiChat> | null>(null);
      // 宿主处置意图：组件库不动数据，state 全由这里推进
      const onBlockIntent = (payload: BlockIntentPayload) => {
        if (payload.intent.type !== 'submit') return;
        const id = String(payload.messageKey);
        const blockId = payload.intent.blockId;
        chatRef.value?.updateBlock(id, blockId, { state: 'submitting' });
        // 真实场景在这里发请求 / 带 Last-Event-ID 续流（chatRef.value.resume(id, payload.intent.payload)）
        setTimeout(() => chatRef.value?.updateBlock(id, blockId, { state: 'submitted' }), 800);
      };
      return { args, chatRef, onBlockIntent };
    },
    template: `
      <div style="display:flex;justify-content:center;box-sizing:border-box;min-height:100vh;padding:24px;background:var(--aix-colorBgLayout);">
        <div style="display:flex;flex-direction:column;width:100%;max-width:720px;height:600px;overflow:hidden;border:1px solid var(--aix-colorBorderSecondary);border-radius:14px;background:var(--aix-colorBgContainer);box-shadow:var(--aix-shadowMD);">
          <AiChat ref="chatRef" v-bind="args" @block-intent="onBlockIntent" />
        </div>
      </div>
    `,
  }),
  args: {
    request: staticRequest,
    parseChunk,
    defaultMessages: [
      createMessage('user', [textBlock('帮我规划一次周末旅行')], { status: 'success' }),
      confirmMessage({ id: 'm-basic' }),
    ],
  },
  play: async ({ canvas }) => {
    // 必填未答 → 阻止提交并提示
    await userEvent.click(await canvas.findByRole('button', { name: '提交' }), {
      pointerEventsCheck: 0,
    });
    await canvas.findByText('请先完成必填项');

    // 作答后提交：卡片冻结 → 宿主置 submitted
    await userEvent.click(canvas.getByRole('radio', { name: '3000-6000' }), {
      pointerEventsCheck: 0,
    });
    await userEvent.click(canvas.getByRole('button', { name: '提交' }), { pointerEventsCheck: 0 });
    await waitFor(() => expect(canvas.getByText('已提交')).toBeInTheDocument(), { timeout: 5000 });
  },
};

/**
 * Timeout：hintAt → autoFillAt → autoSubmitAt 三段时间线（这里压缩到 2/4/6 秒便于观察）。
 * 时间线全部按 createdAt 的绝对时刻计算，切到后台再回来也会按已流逝时间补发，不会漂移。
 * 任何手动作答都会撤销整条时间线。
 */
export const Timeout: Story = {
  args: {
    request: staticRequest,
    parseChunk,
    defaultMessages: [
      createMessage('user', [textBlock('随便帮我定一个吧')], { status: 'success' }),
      confirmMessage({
        id: 'm-timeout',
        lead: '两秒后会出现提示，四秒自动按默认值填写，六秒自动提交：',
        createdAt: Date.now(),
        timeout: { hintAt: 2000, autoFillAt: 4000, autoSubmitAt: 6000 },
      }),
    ],
    'onBlock-intent': fn(),
  },
  play: async ({ canvas, args }) => {
    await canvas.findByText('需要帮您选一个吗？', undefined, { timeout: 8000 });
    await canvas.findByText('已按默认选项自动填写', undefined, { timeout: 8000 });
    await waitFor(() => expect(args['onBlock-intent']).toHaveBeenCalledTimes(1), { timeout: 8000 });
  },
};

/** States：四种生命周期状态的渲染对照（submitting 冻结、submitted/expired 只读回显） */
export const States: Story = {
  args: {
    request: staticRequest,
    parseChunk,
    defaultMessages: (
      [
        ['awaiting', '待填：可交互'],
        ['submitting', '提交中：冻结，等宿主请求返回'],
        ['submitted', '已提交：只读回显答案'],
        ['expired', '已失效：超时或被后续确认卡顶替'],
      ] as const
    ).map(([state, lead], i) =>
      confirmMessage({
        id: `m-state-${i}`,
        state,
        lead,
        fields:
          state === 'awaiting'
            ? TRIP_FIELDS
            : TRIP_FIELDS.map((f) =>
                f.name === 'budget' ? { ...f, answer: '3000-6000' } : { ...f },
              ),
      }),
    ),
  },
};

/**
 * Superseded：流内下发第二张确认卡时，同一条消息里更早的 awaiting 卡由 useChat 自动置 expired。
 * 规则内置在组件库（幂等，照 sealReasoning 的形状），避免宿主漏做时出现多张卡同时可提交。
 */
export const Superseded: Story = {
  args: {
    parseChunk,
    request: (ctx: UseChatRequestCtx) =>
      Promise.resolve(
        sseFrom(
          [
            JSON.stringify({ delta: '先确认预算：' }),
            JSON.stringify({
              block: {
                id: 'confirm-1',
                type: 'user_confirm',
                formId: 'trip-form-1',
                title: '出行偏好确认（第一版）',
                fields: [TRIP_FIELDS[0]],
                state: 'awaiting',
              },
            }),
            JSON.stringify({ delta: '\n\n补充了新信息，改用这张：' }),
            JSON.stringify({
              block: {
                id: 'confirm-2',
                type: 'user_confirm',
                formId: 'trip-form-2',
                title: '出行偏好确认（第二版）',
                fields: TRIP_FIELDS,
                state: 'awaiting',
              },
            }),
          ],
          ctx.signal,
          700,
        ),
      ),
    welcomeTitle: '确认卡顶替演示',
    welcomeDescription: '同一条消息内下发第二张确认卡时，第一张自动置为「已失效」',
    prompts: [{ key: '1', label: '帮我规划一次周末旅行' }],
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: '帮我规划一次周末旅行' }));
    await canvas.findByText('出行偏好确认（第二版）', undefined, { timeout: 8000 });
    await waitFor(() => expect(canvas.getByText('该确认已失效')).toBeInTheDocument(), {
      timeout: 8000,
    });
  },
};
