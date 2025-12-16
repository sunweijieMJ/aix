import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Suggestion } from '../src/components/Suggestion';
import type { SuggestionItem } from '../src/components/Suggestion/types';

const meta: Meta<typeof Suggestion> = {
  title: 'Chat/Suggestion',
  component: Suggestion,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '智能建议组件，用于展示推荐的操作或问题。支持水平和垂直布局。',
      },
    },
  },
  argTypes: {
    title: {
      control: 'text',
      description: '建议标题',
    },
    layout: {
      control: 'select',
      options: ['horizontal', 'vertical'],
      description: '布局方式',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础用法 - 水平布局
 */
export const Basic: Story = {
  render: () => ({
    components: { Suggestion },
    setup() {
      const items: SuggestionItem[] = [
        { key: '1', label: '继续上次对话', icon: '💬' },
        { key: '2', label: '查看历史记录', icon: '📜' },
        { key: '3', label: '新建对话', icon: '✨' },
      ];

      const handleSelect = (item: SuggestionItem) => {
        alert(`选择了: ${item.label}`);
      };

      return { items, handleSelect };
    },
    template: `
      <div style="max-width: 600px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
        <Suggestion
          title="推荐操作"
          :items="items"
          @select="handleSelect"
        />
      </div>
    `,
  }),
};

/**
 * 垂直布局 - 带描述
 */
export const VerticalLayout: Story = {
  render: () => ({
    components: { Suggestion },
    setup() {
      const items: SuggestionItem[] = [
        {
          key: '1',
          label: '代码审查',
          description: '检查代码质量和最佳实践',
          icon: '🔍',
        },
        {
          key: '2',
          label: '性能分析',
          description: '分析应用性能瓶颈',
          icon: '📊',
        },
        {
          key: '3',
          label: '安全检查',
          description: '检测潜在的安全问题',
          icon: '🔒',
        },
      ];

      const handleSelect = (item: SuggestionItem) => {
        console.log('选择:', item.label);
      };

      return { items, handleSelect };
    },
    template: `
      <div style="max-width: 600px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
        <Suggestion
          title="代码工具"
          :items="items"
          layout="vertical"
          @select="handleSelect"
        />
      </div>
    `,
  }),
};

/**
 * 聊天场景
 */
export const ChatScenario: Story = {
  render: () => ({
    components: { Suggestion },
    setup() {
      const items: SuggestionItem[] = [
        { key: '1', label: '继续这个话题', icon: '💬' },
        { key: '2', label: '换个话题', icon: '🔄' },
        { key: '3', label: '更详细的解释', icon: '📖' },
        { key: '4', label: '给我一个例子', icon: '💡' },
      ];

      const handleSelect = (item: SuggestionItem) => {
        alert(`AI: 好的，让我${item.label}...`);
      };

      return { items, handleSelect };
    },
    template: `
      <div style="max-width: 700px; padding: 20px; background: var(--colorBgLayout); border-radius: 8px;">
        <div style="margin-bottom: 16px; padding: 16px; background: var(--colorBgContainer); border-radius: 8px;">
          <div style="font-size: 14px; color: var(--colorTextSecondary); margin-bottom: 8px;">AI 助手</div>
          <div style="font-size: 16px; line-height: 1.6;">
            这就是 Vue 3 Composition API 的基本概念。你还想了解什么？
          </div>
        </div>

        <Suggestion
          title="接下来你可以"
          :items="items"
          layout="horizontal"
          @select="handleSelect"
        />
      </div>
    `,
  }),
};

/**
 * 交互式 Playground
 */
export const Playground: Story = {
  args: {
    title: '推荐操作',
    layout: 'horizontal',
  },
  render: (args) => ({
    components: { Suggestion },
    setup() {
      const items: SuggestionItem[] = [
        { key: '1', label: '选项 1', icon: '💡' },
        { key: '2', label: '选项 2', icon: '🎯' },
        { key: '3', label: '选项 3', icon: '⚡' },
      ];

      const handleSelect = (item: SuggestionItem) => {
        console.log('选择:', item);
      };

      return { args, items, handleSelect };
    },
    template: `
      <div style="max-width: 700px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
        <Suggestion
          v-bind="args"
          :items="items"
          @select="handleSelect"
        />
      </div>
    `,
  }),
};
