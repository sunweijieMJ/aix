import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Sources } from '../src/components/Sources';
import type { SourceItem as SourceItemType } from '../src/components/Sources/types';

const meta: Meta<typeof Sources> = {
  title: 'Chat/Sources',
  component: Sources,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '引用来源组件，用于展示 AI 回答的参考来源。支持折叠、序号显示、点击跳转等功能。',
      },
    },
  },
  argTypes: {
    title: {
      control: 'text',
      description: '标题',
    },
    collapsible: {
      control: 'boolean',
      description: '是否可折叠',
    },
    defaultCollapsed: {
      control: 'boolean',
      description: '默认是否折叠',
    },
    showIndex: {
      control: 'boolean',
      description: '是否显示序号',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础用法
 */
export const Basic: Story = {
  render: () => ({
    components: { Sources },
    setup() {
      const items: SourceItemType[] = [
        {
          key: '1',
          title: 'Vue 3 官方文档',
          url: 'https://vuejs.org/guide/introduction.html',
          description: 'Vue 3 入门指南和核心概念介绍',
        },
        {
          key: '2',
          title: 'TypeScript 手册',
          url: 'https://www.typescriptlang.org/docs/',
          description: 'TypeScript 官方文档',
        },
        {
          key: '3',
          title: 'Vite 官方文档',
          url: 'https://vitejs.dev/guide/',
          description: '下一代前端构建工具',
        },
      ];

      return { items };
    },
    template: `
      <div style="max-width: 600px; padding: 20px;">
        <Sources :items="items" title="参考来源" :show-index="true" />
      </div>
    `,
  }),
};

/**
 * 可折叠
 */
export const Collapsible: Story = {
  render: () => ({
    components: { Sources },
    setup() {
      const items: SourceItemType[] = [
        {
          key: '1',
          title: 'React 官方文档',
          url: 'https://react.dev/',
          description: 'React 18 新特性和最佳实践',
        },
        {
          key: '2',
          title: 'Next.js 文档',
          url: 'https://nextjs.org/docs',
          description: 'React 全栈框架',
        },
        {
          key: '3',
          title: 'Tailwind CSS',
          url: 'https://tailwindcss.com/docs',
          description: 'Utility-First CSS 框架',
        },
        {
          key: '4',
          title: 'Prisma ORM',
          url: 'https://www.prisma.io/docs',
          description: '现代 Node.js ORM',
        },
      ];

      return { items };
    },
    template: `
      <div style="max-width: 600px; padding: 20px;">
        <Sources
          :items="items"
          title="技术文档"
          :collapsible="true"
          :default-collapsed="false"
          :show-index="true"
        />
      </div>
    `,
  }),
};

/**
 * 在聊天消息中使用
 */
export const InChatMessage: Story = {
  render: () => ({
    components: { Sources },
    setup() {
      const items: SourceItemType[] = [
        { key: '1', title: 'Vue.js', url: 'https://vuejs.org/', icon: '💚' },
        { key: '2', title: 'React', url: 'https://react.dev/', icon: '💙' },
        { key: '3', title: 'Angular', url: 'https://angular.dev/', icon: '❤️' },
      ];

      return { items };
    },
    template: `
      <div style="max-width: 700px; padding: 20px;">
        <div style="padding: 16px; background: #f7f7f8; border-radius: 12px;">
          <div style="margin-bottom: 16px; line-height: 1.6;">
            根据我的分析，以下是三大前端框架的主要特点和适用场景。每个框架都有其独特的优势...
          </div>
          <Sources
            :items="items"
            title="参考来源"
            :show-index="true"
            :collapsible="true"
            :default-collapsed="true"
          />
        </div>
      </div>
    `,
  }),
};

/**
 * 交互式 Playground
 */
export const Playground: Story = {
  args: {
    title: '参考来源',
    collapsible: true,
    defaultCollapsed: false,
    showIndex: true,
  },
  render: (args) => ({
    components: { Sources },
    setup() {
      const items: SourceItemType[] = [
        {
          key: '1',
          title: 'Vue 3 文档',
          url: 'https://vuejs.org/',
          description: 'Vue 官方文档',
        },
        {
          key: '2',
          title: 'TypeScript',
          url: 'https://www.typescriptlang.org/',
          description: 'TS 官方文档',
        },
        {
          key: '3',
          title: 'Vite',
          url: 'https://vitejs.dev/',
          description: '前端构建工具',
        },
      ];

      return { args, items };
    },
    template: `
      <div style="max-width: 600px; padding: 20px;">
        <Sources v-bind="args" :items="items" />
      </div>
    `,
  }),
};
