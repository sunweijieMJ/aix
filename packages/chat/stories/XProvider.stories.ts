import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { XProvider, Bubble, Sender } from '../src';
import type { XProviderConfig } from '../src/components/XProvider/types';

const meta: Meta<typeof XProvider> = {
  title: 'Chat/XProvider',
  component: XProvider,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '全局配置组件，用于提供 API 配置、主题、语言等全局设置。使用 Context Provide/Inject 机制。',
      },
    },
  },
  argTypes: {
    config: {
      control: 'object',
      description: '全局配置对象',
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
    components: { XProvider, Sender },
    setup() {
      const config: XProviderConfig = {
        apiKey: 'your-api-key',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4',
      };

      const inputValue = ref('');

      return { config, inputValue };
    },
    template: `
      <XProvider :config="config">
        <div style="max-width: 600px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
          <div style="margin-bottom: 16px; padding: 12px; background: var(--colorInfoBg); border-radius: 4px;">
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">配置信息：</div>
            <div style="font-size: 12px; line-height: 1.6; color: var(--colorTextSecondary);">
              • API Key: your-api-key<br>
              • Base URL: https://api.openai.com/v1<br>
              • Model: gpt-4
            </div>
          </div>
          <Sender v-model:value="inputValue" placeholder="在 XProvider 上下文中的输入框..." />
        </div>
      </XProvider>
    `,
  }),
};

/**
 * 完整应用示例（包含主题、语言、useXProvider Hook）
 */
export const FullApplication: Story = {
  render: () => ({
    components: { XProvider, Bubble, Sender },
    setup() {
      const config: XProviderConfig = {
        apiKey: import.meta.env.VITE_API_KEY || 'demo-key',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4',
        theme: 'light',
        locale: 'zh-CN',
      };

      const messages = ref([
        {
          id: '1',
          content: '你好！我是 AI 助手，有什么可以帮你的吗？',
          role: 'assistant',
          status: 'success',
          createdAt: Date.now(),
        },
      ]);

      const inputValue = ref('');

      const handleSubmit = (value: string) => {
        messages.value.push({
          id: String(Date.now()),
          content: value,
          role: 'user' as const,
          status: 'success' as const,
          createdAt: Date.now(),
        });

        setTimeout(() => {
          messages.value.push({
            id: String(Date.now()),
            content: `收到你的消息: "${value}"`,
            role: 'assistant' as const,
            status: 'success' as const,
            createdAt: Date.now(),
          });
        }, 500);
      };

      return { config, messages, inputValue, handleSubmit };
    },
    template: `
      <XProvider :config="config">
        <div style="max-width: 700px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px; display: flex; flex-direction: column; gap: 16px; height: 600px;">
          <div style="padding: 12px; background: var(--colorPrimaryBg); border-radius: 4px; border: 1px solid var(--colorPrimaryBorder);">
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">全局配置已应用</div>
            <div style="font-size: 12px; color: var(--colorTextSecondary);">
              Model: {{ config.model }} | Theme: {{ config.theme }} | Locale: {{ config.locale }}
            </div>
          </div>

          <div style="flex: 1; overflow-y: auto; border: 1px solid var(--colorBorder); border-radius: 8px; padding: 16px;">
            <Bubble.List :items="messages" />
          </div>

          <Sender
            v-model:value="inputValue"
            @submit="handleSubmit"
            placeholder="输入消息..."
          />
        </div>
      </XProvider>
    `,
  }),
};

/**
 * 嵌套提供者（配置覆盖）
 */
export const NestedProviders: Story = {
  render: () => ({
    components: { XProvider, Sender },
    setup() {
      const outerConfig: XProviderConfig = {
        apiKey: 'outer-key',
        model: 'gpt-3.5-turbo',
        theme: 'light',
      };

      const innerConfig: XProviderConfig = {
        model: 'gpt-4',
      };

      const inputValue1 = ref('');
      const inputValue2 = ref('');

      return { outerConfig, innerConfig, inputValue1, inputValue2 };
    },
    template: `
      <div style="max-width: 800px; padding: 20px;">
        <XProvider :config="outerConfig">
          <div style="padding: 16px; border: 2px solid blue; border-radius: 8px; margin-bottom: 16px;">
            <h4 style="margin: 0 0 8px 0; color: blue;">外层 Provider (model: gpt-3.5-turbo)</h4>
            <Sender v-model:value="inputValue1" placeholder="使用 gpt-3.5-turbo..." />
          </div>

          <XProvider :config="innerConfig">
            <div style="padding: 16px; border: 2px solid green; border-radius: 8px;">
              <h4 style="margin: 0 0 8px 0; color: green;">内层 Provider (model: gpt-4，覆盖外层)</h4>
              <Sender v-model:value="inputValue2" placeholder="使用 gpt-4..." />
            </div>
          </XProvider>
        </XProvider>

        <div style="margin-top: 16px; padding: 12px; background: var(--colorInfoBg); border-radius: 4px; font-size: 12px; line-height: 1.6;">
          💡 内层 Provider 的配置会覆盖外层的配置
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
    config: {
      apiKey: 'demo-api-key',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4',
      theme: 'light',
      locale: 'zh-CN',
    },
  },
  render: (args) => ({
    components: { XProvider, Sender },
    setup() {
      const inputValue = ref('');

      return { args, inputValue };
    },
    template: `
      <XProvider v-bind="args">
        <div style="max-width: 600px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
          <Sender v-model:value="inputValue" placeholder="尝试修改配置..." />
        </div>
      </XProvider>
    `,
  }),
};
