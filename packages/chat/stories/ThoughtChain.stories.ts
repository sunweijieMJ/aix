import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ThoughtChain } from '../src/components/ThoughtChain';
import type { ThoughtStep } from '../src/components/ThoughtChain/types';

const meta: Meta<typeof ThoughtChain> = {
  title: 'Chat/ThoughtChain',
  component: ThoughtChain,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'AI 思维链组件，用于可视化展示 AI 的推理过程。支持三种步骤类型：思考(thought)、执行(action)、观察(observation)。',
      },
    },
  },
  argTypes: {
    loading: {
      control: 'boolean',
      description: '加载状态',
    },
    collapsible: {
      control: 'boolean',
      description: '是否可折叠',
    },
    defaultExpanded: {
      control: 'boolean',
      description: '默认展开状态',
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
    components: { ThoughtChain },
    setup() {
      const steps: ThoughtStep[] = [
        {
          type: 'thought',
          content: '用户想要了解 Vue 3 的新特性，我需要提供准确和全面的信息',
        },
        {
          type: 'action',
          content: '搜索 Vue 3 新特性',
          tool: 'search',
          params: { query: 'Vue 3 new features' },
        },
        {
          type: 'observation',
          content: '找到了 Vue 3 的官方文档和相关技术博客',
        },
        {
          type: 'thought',
          content: '基于搜索结果，我可以总结出 Vue 3 的主要新特性',
        },
      ];

      return { steps };
    },
    template: `
      <div style="max-width: 700px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
        <h3 style="margin: 0 0 16px 0; font-size: 16px;">AI 思考过程</h3>
        <ThoughtChain :steps="steps" />
      </div>
    `,
  }),
};

/**
 * 加载状态
 */
export const Loading: Story = {
  render: () => ({
    components: { ThoughtChain },
    setup() {
      const steps: ThoughtStep[] = [
        {
          type: 'thought',
          content: '分析用户的问题...',
        },
        {
          type: 'action',
          content: '搜索相关信息',
          tool: 'search',
          params: { query: 'relevant information' },
        },
      ];

      return { steps };
    },
    template: `
      <div style="max-width: 700px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
        <h3 style="margin: 0 0 16px 0; font-size: 16px;">正在思考...</h3>
        <ThoughtChain :steps="steps" :loading="true" />
      </div>
    `,
  }),
};

/**
 * 复杂推理流程
 */
export const ComplexReasoning: Story = {
  render: () => ({
    components: { ThoughtChain },
    setup() {
      const steps: ThoughtStep[] = [
        {
          type: 'thought',
          content: '用户询问关于机器学习的问题，需要分步骤解答',
        },
        {
          type: 'action',
          content: '查询知识库',
          tool: 'knowledge_base',
          params: { topic: 'machine learning basics' },
        },
        {
          type: 'observation',
          content: '检索到监督学习、非监督学习、强化学习三大类别的相关信息',
        },
        {
          type: 'thought',
          content: '需要先解释基础概念，然后举例说明',
        },
        {
          type: 'action',
          content: '生成示例',
          tool: 'example_generator',
          params: { category: 'supervised_learning' },
        },
        {
          type: 'observation',
          content: '生成了图像分类、情感分析等常见例子',
        },
        {
          type: 'thought',
          content: '现在可以组织答案，结合理论和实例',
        },
      ];

      return { steps };
    },
    template: `
      <div style="max-width: 700px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
        <h3 style="margin: 0 0 16px 0; font-size: 16px;">复杂推理过程</h3>
        <ThoughtChain :steps="steps" :collapsible="true" :default-expanded="true" />
      </div>
    `,
  }),
};

/**
 * 交互式 Playground
 */
export const Playground: Story = {
  args: {
    loading: false,
    collapsible: true,
    defaultExpanded: true,
  },
  render: (args) => ({
    components: { ThoughtChain },
    setup() {
      const steps: ThoughtStep[] = [
        {
          type: 'thought',
          content: '理解用户的问题',
        },
        {
          type: 'action',
          content: '搜索示例',
          tool: 'search',
          params: { query: 'example' },
        },
        {
          type: 'observation',
          content: '找到相关信息',
        },
        {
          type: 'thought',
          content: '组织答案',
        },
      ];

      return { args, steps };
    },
    template: `
      <div style="max-width: 700px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
        <ThoughtChain v-bind="args" :steps="steps" />
      </div>
    `,
  }),
};
