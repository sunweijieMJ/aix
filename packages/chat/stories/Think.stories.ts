import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Think from '../src/components/Think';

const meta: Meta<typeof Think> = {
  title: 'Chat/Think',
  component: Think,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'AI 思考过程组件，用于展示 AI 的内部思考推理过程。支持折叠、打字动画、时间显示等功能。',
      },
    },
  },
  argTypes: {
    content: {
      control: 'text',
      description: '思考内容',
    },
    status: {
      control: 'select',
      options: ['thinking', 'done', 'error'],
      description: '思考状态',
    },
    title: {
      control: 'text',
      description: '标题',
    },
    collapsible: {
      control: 'boolean',
      description: '是否可折叠',
    },
    defaultExpanded: {
      control: 'boolean',
      description: '默认是否展开',
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
    components: { Think },
    setup() {
      const content = `用户询问的是 Vue 3 的 Composition API 用法。
让我分析一下关键点：
1. setup() 函数是入口点
2. ref 和 reactive 用于响应式数据
3. computed 用于派生数据
4. watch 和 watchEffect 用于副作用

我应该从基础用法开始，然后举一些实际例子。`;

      return { content };
    },
    template: `
      <div style="max-width: 700px; padding: 20px;">
        <Think :content="content" status="done" title="AI 思考过程" />
      </div>
    `,
  }),
};

/**
 * 可折叠
 */
export const Collapsible: Story = {
  render: () => ({
    components: { Think },
    setup() {
      const content = `这是一个复杂问题的详细分析：

第一步：理解问题背景
用户希望实现一个高性能的数据表格组件，需要支持虚拟滚动、排序、筛选等功能。

第二步：技术选型
- 虚拟滚动：可以使用 vue-virtual-scroller 或自己实现
- 排序：前端排序 vs 后端排序，取决于数据量
- 筛选：支持多条件筛选，需要考虑性能

第三步：实现方案
建议采用组合式 API 实现，将各功能模块化，便于维护和测试。`;

      return { content };
    },
    template: `
      <div style="max-width: 700px; padding: 20px;">
        <Think
          :content="content"
          status="done"
          title="详细分析"
          :collapsible="true"
          :default-expanded="true"
        />
        <div style="margin-top: 12px; font-size: 12px; color: var(--colorTextSecondary);">
          点击标题可以折叠/展开思考内容
        </div>
      </div>
    `,
  }),
};

/**
 * 在对话中使用
 */
export const InConversation: Story = {
  render: () => ({
    components: { Think },
    setup() {
      const thinkContent = `让我思考一下这个问题...

1. 用户想了解 React Hooks 的工作原理
2. 需要从基础概念讲起
3. 举一些实际例子会更好理解`;

      return { thinkContent };
    },
    template: `
      <div style="max-width: 700px; padding: 20px;">
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <!-- 用户消息 -->
          <div style="display: flex; justify-content: flex-end;">
            <div style="background: var(--colorPrimary); color: white; padding: 12px 16px; border-radius: 12px 12px 4px 12px; max-width: 70%;">
              React Hooks 是如何工作的？
            </div>
          </div>

          <!-- AI 思考过程 -->
          <div style="display: flex; gap: 12px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--colorPrimaryBg); display: flex; align-items: center; justify-content: center;">
              🤖
            </div>
            <div style="flex: 1;">
              <Think
                :content="thinkContent"
                status="done"
                title="思考过程"
                :collapsible="true"
                :default-expanded="false"
              />
              <div style="margin-top: 12px; background: var(--colorBgContainer); padding: 12px 16px; border-radius: 4px 12px 12px 12px; border: 1px solid var(--colorBorder);">
                React Hooks 是 React 16.8 引入的新特性，让你在函数组件中使用 state 和其他 React 特性...
              </div>
            </div>
          </div>
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
    content: '这是 AI 的思考内容，展示了推理过程。',
    status: 'done',
    title: 'AI 思考',
    collapsible: true,
    defaultExpanded: true,
  },
  render: (args) => ({
    components: { Think },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 700px; padding: 20px;">
        <Think v-bind="args" />
      </div>
    `,
  }),
};
