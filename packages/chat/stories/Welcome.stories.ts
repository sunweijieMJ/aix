import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Welcome } from '../src/components/Welcome';

const meta: Meta<typeof Welcome> = {
  title: 'Chat/Welcome',
  component: Welcome,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '欢迎组件，用于展示欢迎信息和功能引导。支持网格和列表布局。',
      },
    },
  },
  argTypes: {
    title: {
      control: 'text',
      description: '欢迎标题',
    },
    description: {
      control: 'text',
      description: '欢迎描述',
    },
    layout: {
      control: 'select',
      options: ['grid', 'list'],
      description: '布局方式',
    },
    columns: {
      control: 'number',
      description: '网格列数（仅 grid 布局有效）',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础用法 - 网格布局
 */
export const Basic: Story = {
  render: () => ({
    components: { Welcome },
    setup() {
      const features = [
        {
          key: '1',
          icon: '💻',
          title: '代码解释',
          description: '解释代码功能和工作原理',
        },
        {
          key: '2',
          icon: '✍️',
          title: '写作助手',
          description: '改进文章内容和表达',
        },
        {
          key: '3',
          icon: '📄',
          title: '文档分析',
          description: '快速分析和总结文档',
        },
        {
          key: '4',
          icon: '🤔',
          title: '知识问答',
          description: '回答各类专业问题',
        },
      ];

      const handleFeatureClick = (feature: any) => {
        alert(`点击功能: ${feature.title}`);
      };

      return { features, handleFeatureClick };
    },
    template: `
      <div style="max-width: 900px; padding: 20px; background: var(--colorBgLayout); border-radius: 8px;">
        <Welcome
          title="AI 智能助手"
          description="我可以帮你完成以下任务，点击开始使用"
          :features="features"
          @feature-click="handleFeatureClick"
        />
      </div>
    `,
  }),
};

/**
 * 列表布局
 */
export const ListLayout: Story = {
  render: () => ({
    components: { Welcome },
    setup() {
      const features = [
        {
          key: '1',
          icon: '💻',
          title: '代码解释与生成',
          description:
            '支持多种编程语言，可以解释代码功能、生成代码片段、优化代码质量',
        },
        {
          key: '2',
          icon: '✍️',
          title: '写作与编辑',
          description:
            '帮助改进文章结构、优化表达方式、纠正语法错误、提供写作建议',
        },
        {
          key: '3',
          icon: '📄',
          title: '文档处理',
          description:
            '快速分析长文档、提取关键信息、生成摘要、回答文档相关问题',
        },
      ];

      return { features };
    },
    template: `
      <div style="max-width: 900px; padding: 20px; background: var(--colorBgLayout); border-radius: 8px;">
        <Welcome
          title="功能详细介绍"
          :features="features"
          layout="list"
        />
      </div>
    `,
  }),
};

/**
 * 自定义插槽
 */
export const CustomSlots: Story = {
  render: () => ({
    components: { Welcome },
    setup() {
      const features = [
        {
          key: '1',
          icon: '💻',
          title: '代码解释',
          description: '解释代码功能',
        },
        {
          key: '2',
          icon: '✍️',
          title: '写作助手',
          description: '改进文章内容',
        },
      ];

      return { features };
    },
    template: `
      <div style="max-width: 900px; padding: 20px; background: var(--colorBgLayout); border-radius: 8px;">
        <Welcome :features="features">
          <template #title>
            <div style="font-size: 36px; font-weight: bold; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
              🎉 欢迎使用 AI 助手
            </div>
          </template>
          <template #description>
            <div style="font-size: 18px; color: var(--colorTextSecondary); margin-top: 12px;">
              强大的 AI 能力，让工作更高效 ✨
            </div>
          </template>
        </Welcome>
      </div>
    `,
  }),
};

/**
 * 交互式 Playground
 */
export const Playground: Story = {
  args: {
    title: 'AI 智能助手',
    description: '我可以帮你完成以下任务',
    layout: 'grid',
    columns: 2,
  },
  render: (args) => ({
    components: { Welcome },
    setup() {
      const features = [
        {
          key: '1',
          icon: '💻',
          title: '代码解释',
          description: '解释代码功能',
        },
        {
          key: '2',
          icon: '✍️',
          title: '写作助手',
          description: '改进文章内容',
        },
        {
          key: '3',
          icon: '📄',
          title: '文档分析',
          description: '分析文档内容',
        },
        {
          key: '4',
          icon: '🤔',
          title: '知识问答',
          description: '回答各类问题',
        },
      ];

      const handleFeatureClick = (feature: any) => {
        console.log('点击功能:', feature);
      };

      return { args, features, handleFeatureClick };
    },
    template: `
      <div style="max-width: 900px; padding: 20px; background: var(--colorBgLayout); border-radius: 8px;">
        <Welcome
          v-bind="args"
          :features="features"
          @feature-click="handleFeatureClick"
        />
      </div>
    `,
  }),
};
