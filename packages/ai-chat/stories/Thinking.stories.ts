import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent } from 'storybook/test';
import { Thinking } from '../src';

const meta: Meta<typeof Thinking> = {
  title: 'AI Chat/Thinking',
  tags: ['autodocs'],
  component: Thinking,
  args: {
    content: '正在分析问题…先拆解用户意图，再检索相关知识，最后组织回答。',
    title: '',
    expanded: false,
  },
};
export default meta;
type Story = StoryObj<typeof Thinking>;

/** 折叠态（默认）：只显示 header，body 隐藏 */
export const Collapsed: Story = {
  args: { expanded: false },
  play: async ({ canvas }) => {
    // 默认折叠，body 不存在于 DOM 中
    const body = canvas.queryByText('正在分析问题…先拆解用户意图，再检索相关知识，最后组织回答。');
    await expect(body).toBeNull();
  },
};

/** 展开态：expanded=true，body 直接可见 */
export const Expanded: Story = {
  args: { expanded: true },
  play: async ({ canvas }) => {
    const body = canvas.getByText('正在分析问题…先拆解用户意图，再检索相关知识，最后组织回答。');
    await expect(body).toBeInTheDocument();
  },
};

/**
 * 点击展开：点击 header 后 body 出现
 */
export const ToggleOnClick: Story = {
  args: { expanded: false, content: '这段思考过程包含了多步推理和知识检索。' },
  play: async ({ canvas }) => {
    // 初始折叠
    await expect(canvas.queryByText('这段思考过程包含了多步推理和知识检索。')).toBeNull();
    // 点击 header 展开
    const header = canvas.getByRole('button');
    await userEvent.click(header);
    // body 应出现，包含 content 文本
    const body = canvas.getByText('这段思考过程包含了多步推理和知识检索。');
    await expect(body).toBeInTheDocument();
  },
};

/** 自定义标题 */
export const CustomTitle: Story = {
  args: { title: '深度推理中', expanded: true },
};
