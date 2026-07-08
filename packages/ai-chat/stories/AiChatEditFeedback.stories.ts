import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor, fn } from 'storybook/test';
import { AiChat } from '../src';
import { textBlock, createMessage } from '../src/utils/helpers';
import {
  assistantRequest,
  assistantShellRender,
  baseAssistantArgs,
} from './fixtures/assistantMock';

const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/场景演示/编辑与反馈',
  tags: ['autodocs'],
  component: AiChat,
  parameters: { layout: 'fullscreen' },
  render: (args) => ({
    components: { AiChat },
    // args 的推导类型（来自 Meta<typeof AiChat>）没有字符串索引签名，
    // 与 assistantShellRender 的 Record<string, unknown> 形参不兼容，此处按值透传即可
    ...assistantShellRender(args as unknown as Record<string, unknown>),
  }),
  args: baseAssistantArgs(),
};
export default meta;
type Story = StoryObj<typeof AiChat>;

/**
 * EditFeedbackAndSubmitType：编排层三能力集成（编辑重发（用户消息默认操作条内置）/ actions(feedback) / submitType）。
 *
 * 一个 play 串联 AiChat 编排层对外的三组能力与事件，补齐"基础交互"（流式/中断/重试）
 * 未覆盖的「消息后处理」路径：
 * 1. **赞踩反馈**（`actions: ['copy','regenerate','feedback']`）：对历史 AI 回复点「赞同」，受控写回 `extra.feedback` 高亮，
 *    并对外 `emit('feedback', { id, value })`。
 * 2. **编辑重发**（用户消息默认操作条内置 `edit`，无需 prop 开启）：编辑用户消息并保存 → 截断后续重新生成，对外 `emit('edit', { id, text })`。
 * 3. **提交方式**（`submitType='shiftEnter'`）：普通 Enter 仅换行不发送，Shift+Enter 才触发发送
 *    （对外 `emit('send', text)`）。
 *
 * 以 defaultMessages 预置一轮「用户提问 + AI 回答」作为反馈与编辑的目标，事件经 args 上的
 * fn() 间谍断言。与"基础交互"的 FullInteractionFlow 形成「生成链路 + 后处理链路」互补。
 */
export const EditFeedbackAndSubmitType: Story = {
  args: {
    request: assistantRequest(),
    actions: ['copy', 'regenerate', 'feedback'],
    submitType: 'shiftEnter',
    welcomeTitle: '编辑重发 · 赞踩反馈 · Shift+Enter 提交',
    welcomeDescription:
      '演示 AiChat 编排层内置编辑重发（用户消息默认操作条）/ actions(feedback) / submitType 三能力与对外事件',
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
  play: async ({ canvas, args, step, canvasElement }) => {
    // 先等 Markdown 引擎就绪（正文渲染为 <p>）再开始交互：冷启动 runner 里引擎在 play 中途
    // 就绪会触发气泡重渲染 + virtua 重挂，编辑态 Bubble 实例被销毁，已抓取的编辑框/保存按钮
    // 变成脱离 DOM 的僵尸节点（点击不产生 emit）——Quote PC Selection 同源问题
    await waitFor(() => expect(canvasElement.querySelector('.aix-bubble p')).toBeInTheDocument(), {
      timeout: 8000,
    });
    // 1) actions 含 feedback：对历史 AI 回复点「赞同」→ 受控高亮 + emit('feedback')
    await step('赞踩反馈（actions feedback）', async () => {
      // 虚拟列表异步渲染：findBy 轮询；过渡期可能 pointer-events:none，关指针检查避免 flaky
      const like = await canvas.findByRole('button', { name: '赞同' }, { timeout: 8000 });
      await userEvent.click(like, { pointerEventsCheck: 0 });
      await expect(args.onFeedback).toHaveBeenCalledTimes(1);
      // setFeedback 就地写回 extra.feedback → aria-pressed 受控变 true
      await waitFor(() => expect(like).toHaveAttribute('aria-pressed', 'true'));
    });

    // 2) 编辑用户消息并保存 → 截断重发 + emit('edit')（用户消息默认操作条内置 edit，无需 prop 开启）
    await step('编辑重发', async () => {
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
      await userEvent.click(canvas.getByRole('button', { name: '保存编辑' }), {
        pointerEventsCheck: 0,
      });
      // AiChat 的 onEditMessage 在 `await onEdit(...)` 之后才对外 emit('edit')——存在异步边界，
      // 点击后同步断言必 0 次，须 waitFor 轮询
      await waitFor(() => expect(args.onEdit).toHaveBeenCalledTimes(1), { timeout: 3000 });
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
      await waitFor(() => expect(args.onSend).toHaveBeenCalledTimes(1), { timeout: 5000 });
    });
  },
};
