import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AIChatWidget from '../src/components/AIChatWidget/index.vue';
import type { AgentRequestParams, AgentStreamCallbacks } from '../src/types';

const meta: Meta<typeof AIChatWidget> = {
  title: 'Chat/AIChatWidget',
  component: AIChatWidget,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `AIChatWidget 是一个完整的 AI 对话组件，集成了会话管理、消息列表、输入框等功能。

主要特性：
- 开箱即用：只需提供 API 请求函数即可使用
- 多会话支持：内置侧边栏会话列表
- 流式响应：支持 SSE 流式输出
- 欢迎屏：无消息时显示欢迎界面
- 建议提示：可配置快捷提示词
- 本地存储：自动持久化会话数据`,
      },
    },
    layout: 'fullscreen',
  },
  argTypes: {
    showSidebar: {
      control: 'boolean',
      description: '是否显示侧边栏',
    },
    showHeader: {
      control: 'boolean',
      description: '是否显示顶部工具栏',
    },
    showWelcome: {
      control: 'boolean',
      description: '是否显示欢迎屏',
    },
    showSuggestions: {
      control: 'boolean',
      description: '是否显示建议提示',
    },
    placeholder: {
      control: 'text',
      description: '输入框占位符',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// 模拟 AI 请求函数
const createMockRequest = (delay = 30) => {
  return async (
    params: AgentRequestParams,
    callbacks?: AgentStreamCallbacks,
  ): Promise<string | void> => {
    const rawContent = params.messages[params.messages.length - 1]?.content;
    const userMessage =
      typeof rawContent === 'string'
        ? rawContent
        : rawContent
          ? JSON.stringify(rawContent)
          : '';

    let response = '';
    if (userMessage.includes('你好') || userMessage.includes('hello')) {
      response = '你好！我是 AI 助手，很高兴为你服务。有什么我可以帮助你的吗？';
    } else if (userMessage.includes('Vue')) {
      response = `Vue 3 是一个现代化的前端框架，主要特性包括：

1. **Composition API** - 更灵活的代码组织方式
2. **更好的 TypeScript 支持** - 完整的类型推导
3. **性能优化** - 更快的虚拟 DOM 和编译优化

需要我详细介绍其中某个特性吗？`;
    } else if (userMessage.includes('代码') || userMessage.includes('code')) {
      response = `当然，这是一个简单的 Vue 3 组件示例：

\`\`\`vue
<script setup lang="ts">
import { ref, computed } from 'vue'

const count = ref(0)
const doubled = computed(() => count.value * 2)
</script>

<template>
  <div>
    <p>Count: {{ count }}</p>
    <button @click="count++">+1</button>
  </div>
</template>
\`\`\``;
    } else {
      response = `我收到了你的消息："${userMessage}"

作为 AI 助手，我可以帮助你：
- 回答技术问题
- 编写和解释代码
- 提供最佳实践建议`;
    }

    if (callbacks?.onUpdate) {
      for (let i = 0; i <= response.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        callbacks.onUpdate(response.slice(0, i));
      }
      callbacks.onSuccess?.(response);
    }

    return response;
  };
};

/**
 * 基础用法
 */
export const Basic: Story = {
  render: () => ({
    components: { AIChatWidget },
    setup() {
      const apiRequest = createMockRequest();

      return { apiRequest };
    },
    template: `
      <div style="height: 600px;">
        <AIChatWidget
          :api-request="apiRequest"
          placeholder="输入消息，试试问 'Vue 3 有什么新特性？'"
          :storage-key="false"
        />
      </div>
    `,
  }),
};

/**
 * 完整功能（侧边栏、欢迎屏、建议提示）
 */
export const FullFeatures: Story = {
  render: () => ({
    components: { AIChatWidget },
    setup() {
      const apiRequest = createMockRequest();

      const welcomeConfig = {
        title: '欢迎使用 AI 助手',
        description:
          '我是基于大语言模型的智能助手，可以帮助你解答问题、编写代码、提供建议。',
        features: [
          { icon: '💬', title: '智能对话', description: '自然流畅的对话体验' },
          {
            icon: '💻',
            title: '代码助手',
            description: '编写、解释、优化代码',
          },
          { icon: '📚', title: '知识问答', description: '回答各类技术问题' },
          { icon: '🎯', title: '任务协助', description: '帮助完成各种任务' },
        ],
      };

      const suggestions = [
        { key: '1', label: 'Vue 3 有什么新特性？' },
        { key: '2', label: '帮我写一段代码' },
        { key: '3', label: '解释 Composition API' },
        { key: '4', label: '最佳实践建议' },
      ];

      return { apiRequest, welcomeConfig, suggestions };
    },
    template: `
      <div style="height: 700px;">
        <AIChatWidget
          :api-request="apiRequest"
          :show-sidebar="true"
          :show-header="true"
          :show-welcome="true"
          :show-suggestions="true"
          :welcome-config="welcomeConfig"
          :suggestions="suggestions"
          placeholder="有什么可以帮助你的？"
          :storage-key="false"
        />
      </div>
    `,
  }),
};

/**
 * 嵌入式使用（在文档页面中嵌入）
 */
export const Embedded: Story = {
  render: () => ({
    components: { AIChatWidget },
    setup() {
      const apiRequest = createMockRequest(20);

      return { apiRequest };
    },
    template: `
      <div style="padding: 40px; background: var(--colorBgLayout);">
        <div style="max-width: 1200px; margin: 0 auto;">
          <h2 style="margin: 0 0 8px 0;">产品文档</h2>
          <p style="color: var(--colorTextSecondary); margin: 0 0 24px 0;">
            在文档页面中嵌入 AI 助手，帮助用户快速找到答案
          </p>

          <div style="display: grid; grid-template-columns: 1fr 400px; gap: 24px;">
            <!-- 文档内容 -->
            <div style="background: var(--colorBgContainer); padding: 24px; border-radius: 8px;">
              <h3 style="margin: 0 0 16px 0;">快速开始</h3>
              <p>欢迎使用我们的组件库。本文档将帮助你快速上手。</p>

              <h4 style="margin: 24px 0 12px 0;">安装</h4>
              <pre style="background: var(--colorBgLayout); padding: 12px; border-radius: 4px; overflow: auto;">npm install @aix/chat</pre>

              <h4 style="margin: 24px 0 12px 0;">基本使用</h4>
              <pre style="background: var(--colorBgLayout); padding: 12px; border-radius: 4px; overflow: auto;">import { AIChatWidget } from '@aix/chat'</pre>

              <p style="margin-top: 24px; color: var(--colorTextSecondary);">
                更多内容请查看详细文档...
              </p>
            </div>

            <!-- AI 助手 -->
            <div style="height: 500px; border: 1px solid var(--colorBorder); border-radius: 8px; overflow: hidden;">
              <AIChatWidget
                :api-request="apiRequest"
                :show-sidebar="false"
                :show-header="false"
                :show-welcome="false"
                placeholder="有问题？问问 AI 助手"
                :storage-key="false"
              />
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
    showSidebar: true,
    showHeader: true,
    showWelcome: true,
    showSuggestions: true,
    placeholder: '输入消息...',
  },
  render: (args) => ({
    components: { AIChatWidget },
    setup() {
      const apiRequest = createMockRequest();

      const welcomeConfig = {
        title: 'AI 助手',
        description: '有什么可以帮助你的？',
        features: [
          { icon: '💬', title: '对话', description: '自然语言交流' },
          { icon: '💻', title: '代码', description: '编程问题解答' },
        ],
      };

      const suggestions = [
        { key: '1', label: '你好' },
        { key: '2', label: 'Vue 3 介绍' },
        { key: '3', label: '写一段代码' },
      ];

      return { args, apiRequest, welcomeConfig, suggestions };
    },
    template: `
      <div style="height: 650px;">
        <AIChatWidget
          v-bind="args"
          :api-request="apiRequest"
          :welcome-config="welcomeConfig"
          :suggestions="suggestions"
          :storage-key="false"
        />
      </div>
    `,
  }),
};
