import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { AiChat } from '../src';
import {
  PROMPTS,
  assistantRequest,
  assistantShellRender,
  baseAssistantArgs,
} from './fixtures/assistantMock';
import { mockUpload, mockRecognizer } from './fixtures/senderMocks';

const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/场景演示/全功能集成',
  tags: ['autodocs'],
  component: AiChat,
  parameters: { layout: 'fullscreen' },
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
      await canvas.findByText('上传文件', undefined, { timeout: 5000 });
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
