/**
 * @fileoverview AgentActions 组件 Stories
 * AI 智能体操作按钮组
 */

import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AgentActions from '../src/components/AgentActions/index.vue';

const meta: Meta<typeof AgentActions> = {
  title: 'Chat/AgentActions',
  component: AgentActions,
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
      description: '标题',
    },
    actions: {
      control: 'object',
      description: 'AI 智能体操作列表',
    },
    showDivider: {
      control: 'boolean',
      description: '是否显示分隔符',
    },
    onClick: {
      action: 'click',
      description: '点击操作时触发',
    },
  },
  parameters: {
    docs: {
      description: {
        component: `AgentActions - AI 智能体操作按钮组

用于展示 AI 智能体的各种功能入口，如：AI指令、知识点讲解、视频解读、AI陪练等。

特性：
- 支持多种操作类型
- 玻璃态边框效果
- 流畅的交互动画
- 响应式设计
- 支持激活状态、徽标显示、禁用状态`,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof AgentActions>;

/**
 * 基础用法
 */
export const Basic: Story = {
  args: {
    actions: [
      { key: 'ai-command', label: 'AI指令', icon: '✨' },
      { key: 'knowledge', label: '知识点讲解', icon: '⚛️' },
      { key: 'video', label: '视频解读', icon: '▶️' },
      { key: 'practice', label: 'AI陪练', icon: '💬' },
      { key: 'agent', label: 'AI智能体', icon: '🤖' },
    ],
  },
};

/**
 * 状态和徽标（激活、徽标、禁用）
 */
export const StatesAndBadges: Story = {
  args: {
    title: 'AI 功能',
    actions: [
      { key: 'ai-command', label: 'AI指令', icon: '✨', badge: 'NEW' },
      { key: 'knowledge', label: '知识点讲解', icon: '⚛️', active: true },
      { key: 'video', label: '视频解读', icon: '▶️', badge: '3' },
      { key: 'practice', label: 'AI陪练', icon: '💬', disabled: true },
      { key: 'agent', label: 'AI智能体', icon: '🤖', badge: '🔥' },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: '展示激活状态、徽标显示和禁用状态的组合效果',
      },
    },
  },
};

/**
 * 场景示例（教育场景和工作场景）
 */
export const Scenarios: Story = {
  render: () => ({
    components: { AgentActions },
    setup() {
      const educationActions = [
        { key: 'lecture', label: '课程讲解', icon: '📚', active: true },
        { key: 'quiz', label: '随堂测试', icon: '📝', badge: '3' },
        { key: 'homework', label: '作业辅导', icon: '✍️' },
        { key: 'qa', label: '答疑解惑', icon: '💬' },
        { key: 'review', label: '知识回顾', icon: '🔄' },
      ];

      const workActions = [
        { key: 'write', label: '文案撰写', icon: '✍️' },
        { key: 'translate', label: '文档翻译', icon: '🌐', badge: 'PRO' },
        { key: 'analyze', label: '数据分析', icon: '📊' },
        { key: 'code', label: '代码助手', icon: '💻', active: true },
        { key: 'meeting', label: '会议纪要', icon: '📝' },
      ];

      return { educationActions, workActions };
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 32px; max-width: 600px;">
        <div>
          <h4 style="margin: 0 0 12px 0; color: #666;">教育场景</h4>
          <AgentActions title="AI 助教功能" :actions="educationActions" />
        </div>
        <div>
          <h4 style="margin: 0 0 12px 0; color: #666;">工作场景</h4>
          <AgentActions title="AI 助手" :actions="workActions" />
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: '展示在教育场景和工作场景中的不同配置',
      },
    },
  },
};

/**
 * 交互式 Playground
 */
export const Playground: Story = {
  args: {
    title: 'AI 智能体',
    showDivider: false,
    actions: [
      { key: 'ai-command', label: 'AI指令', icon: '✨' },
      { key: 'knowledge', label: '知识点讲解', icon: '⚛️' },
      { key: 'video', label: '视频解读', icon: '▶️' },
      { key: 'practice', label: 'AI陪练', icon: '💬' },
      { key: 'agent', label: 'AI智能体', icon: '🤖' },
    ],
  },
};
