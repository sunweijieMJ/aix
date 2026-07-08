import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { AiChat } from '../src';
import { textBlock, createMessage } from '../src/utils/helpers';
import {
  PROMPTS,
  fullFlowRequest,
  thinkingThenAnswerRequest,
  thinkingParseChunk,
  assistantShellRender,
  baseAssistantArgs,
} from './fixtures/assistantMock';

/**
 * AiChat 基础交互演示
 *
 * 这些 story 把 AiChat 当作一个**可真实对话**的 AI 助手来演示：
 * 内置一个拟真的 mock 后端，会根据用户提问的关键词流式返回不同的 Markdown
 * 富文本回答（代码块 / 表格 / 列表 / 引用），并支持多轮上下文、错误重试与中断。
 * 直接在 Canvas 里输入或点击快捷问题即可体验完整链路。
 */

const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/场景演示/基础交互',
  tags: ['autodocs'],
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
  render: (args) => ({
    components: { AiChat },
    // args 的推导类型（来自 Meta<typeof AiChat>）没有字符串索引签名，
    // 与 assistantShellRender 的 Record<string, unknown> 形参不兼容，此处按值透传即可
    ...assistantShellRender(args as unknown as Record<string, unknown>),
  }),
  args: {
    ...baseAssistantArgs(),
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
