/**
 * @fileoverview Prompts 组件 Stories
 */

import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import Prompts from '../src/components/Prompts/index.vue';

const meta: Meta<typeof Prompts> = {
  title: 'Chat/Prompts',
  component: Prompts,
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
      description: '标题',
    },
    layout: {
      control: 'select',
      options: ['grid', 'list'],
      description: '布局方式',
    },
    columns: {
      control: { type: 'number', min: 1, max: 4 },
      description: '网格列数（仅在 grid 布局下生效）',
    },
    allowRefresh: {
      control: 'boolean',
      description: '是否允许刷新',
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          '提示词/建议问题组件，用于展示建议问题列表，帮助用户快速开始对话。',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Prompts>;

/**
 * 基础用法 - 列表布局
 */
export const Basic: Story = {
  args: {
    title: '您可以这样问：',
    items: [
      { key: '1', label: '介绍一下你自己' },
      { key: '2', label: '你能做什么？' },
      { key: '3', label: '如何使用这个组件？' },
    ],
  },
};

/**
 * 网格布局
 */
export const GridLayout: Story = {
  args: {
    title: '选择一个话题开始',
    layout: 'grid',
    columns: 2,
    items: [
      { key: '1', label: '介绍一下你自己', icon: '👋' },
      { key: '2', label: '你能做什么？', icon: '💡' },
      { key: '3', label: '如何使用这个组件？', icon: '📖' },
      { key: '4', label: '有哪些功能特性？', icon: '✨' },
    ],
  },
};

/**
 * 带刷新功能
 */
export const WithRefresh: Story = {
  render: () => ({
    components: { Prompts },
    setup() {
      const allPrompts = [
        [
          { key: '1', label: '推力、耗油率随高度、速度的变化规律?' },
          { key: '2', label: '启动系统的作用（辅助动力装置 APU 的应用）' },
          { key: '3', label: '根据性能数据判断发动机是否需要维护' },
        ],
        [
          { key: '4', label: '发动机的工作原理是什么？' },
          { key: '5', label: '如何进行发动机的日常检查？' },
          { key: '6', label: '发动机故障排除的基本步骤' },
        ],
      ];

      let currentIndex = 0;
      const items = ref(allPrompts[0]);
      const loading = ref(false);

      const handleRefresh = () => {
        loading.value = true;
        setTimeout(() => {
          currentIndex = (currentIndex + 1) % allPrompts.length;
          items.value = allPrompts[currentIndex];
          loading.value = false;
        }, 600);
      };

      return { items, loading, handleRefresh };
    },
    template: `
      <Prompts
        title="您可以这样问："
        :items="items"
        :allow-refresh="true"
        :loading="loading"
        @refresh="handleRefresh"
      />
    `,
  }),
};

/**
 * 带描述
 */
export const WithDescription: Story = {
  args: {
    title: '选择服务类型',
    layout: 'grid',
    columns: 2,
    items: [
      {
        key: '1',
        label: '文字助手',
        description: '帮助你撰写、改写和优化文本内容',
        icon: '✍️',
      },
      {
        key: '2',
        label: '代码助手',
        description: '解释代码、查找bug、生成代码',
        icon: '💻',
      },
      {
        key: '3',
        label: '学习助手',
        description: '解答问题、讲解知识、辅导学习',
        icon: '📚',
      },
      {
        key: '4',
        label: '创意助手',
        description: '头脑风暴、创意生成、方案规划',
        icon: '💡',
      },
    ],
  },
};
