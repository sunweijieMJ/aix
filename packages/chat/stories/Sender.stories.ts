import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { Sender } from '../src/components/Sender';

const meta: Meta<typeof Sender> = {
  title: 'Chat/Sender',
  component: Sender,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '消息输入发送组件，支持自动高度调整、字数限制和加载状态。',
      },
    },
  },
  argTypes: {
    value: {
      control: 'text',
      description: '输入值',
    },
    loading: {
      control: 'boolean',
      description: '加载状态',
    },
    placeholder: {
      control: 'text',
      description: '占位文本',
    },
    maxLength: {
      control: 'number',
      description: '最大长度',
    },
    autoSize: {
      control: 'boolean',
      description: '自动高度',
    },
    disabled: {
      control: 'boolean',
      description: '禁用状态',
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
    components: { Sender },
    setup() {
      const inputValue = ref('');

      const handleSubmit = (value: string) => {
        alert(`发送消息: ${value}`);
        inputValue.value = '';
      };

      return { inputValue, handleSubmit };
    },
    template: `
      <div style="max-width: 600px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
        <Sender
          v-model:value="inputValue"
          @submit="handleSubmit"
          placeholder="输入消息..."
        />
      </div>
    `,
  }),
};

/**
 * 加载状态
 */
export const Loading: Story = {
  render: () => ({
    components: { Sender },
    setup() {
      const inputValue = ref('');
      const loading = ref(false);

      const handleSubmit = (value: string) => {
        loading.value = true;
        setTimeout(() => {
          alert(`消息已发送: ${value}`);
          inputValue.value = '';
          loading.value = false;
        }, 2000);
      };

      return { inputValue, loading, handleSubmit };
    },
    template: `
      <div style="max-width: 600px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
        <Sender
          v-model:value="inputValue"
          :loading="loading"
          @submit="handleSubmit"
          placeholder="输入消息后回车发送..."
        />
        <div v-if="loading" style="margin-top: 12px; color: var(--colorTextSecondary); font-size: 14px;">
          正在发送消息...
        </div>
      </div>
    `,
  }),
};

/**
 * 模型选择器
 */
export const WithModelSelector: Story = {
  render: () => ({
    components: { Sender },
    setup() {
      const modelOptions = [
        { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', icon: '🚀', premium: true },
        { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', icon: '⚡' },
        { id: 'claude-3', label: 'Claude 3', icon: '🎭', premium: true },
      ];

      const input = ref('');
      const selectedModel = ref('gpt-3.5-turbo');

      const handleSubmit = (value: string) => {
        const model = modelOptions.find((m) => m.id === selectedModel.value);
        alert(`使用 ${model?.label} 发送消息:\n${value}`);
      };

      return { input, selectedModel, modelOptions, handleSubmit };
    },
    template: `
      <div style="max-width: 800px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 12px;">
        <h3 style="margin: 0 0 16px 0;">支持多模型切换</h3>
        <Sender
          v-model:value="input"
          v-model:selected-model="selectedModel"
          :models="modelOptions"
          :show-model-selector="true"
          placeholder="输入消息，上方可切换模型..."
          @submit="handleSubmit"
        />
      </div>
    `,
  }),
};

/**
 * 完整功能演示
 */
export const FullFeatures: Story = {
  render: () => ({
    components: { Sender },
    setup() {
      const modelOptions = [
        { id: 'gpt-4', label: 'GPT-4', icon: '🚀', premium: true },
        { id: 'gpt-3.5', label: 'GPT-3.5', icon: '⚡' },
        { id: 'claude', label: 'Claude', icon: '🎭', premium: true },
      ];

      const input = ref('');
      const selectedModel = ref('gpt-3.5');
      const loading = ref(false);

      const handleSubmit = (value: string) => {
        loading.value = true;
        setTimeout(() => {
          const model = modelOptions.find((m) => m.id === selectedModel.value);
          alert(`使用 ${model?.label} 发送消息!\n\n${value}`);
          input.value = '';
          loading.value = false;
        }, 1500);
      };

      return { input, selectedModel, modelOptions, loading, handleSubmit };
    },
    template: `
      <div style="max-width: 800px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 12px;">
        <h3 style="margin: 0 0 16px 0;">完整功能展示</h3>
        <Sender
          v-model:value="input"
          v-model:selected-model="selectedModel"
          :models="modelOptions"
          :allow-speech="true"
          :show-model-selector="true"
          :loading="loading"
          placeholder="输入消息或使用语音输入..."
          @submit="handleSubmit"
        />
        <div style="margin-top: 12px; font-size: 12px; color: var(--colorTextSecondary);">
          支持模型选择、语音输入、加载状态等完整功能
        </div>
      </div>
    `,
  }),
};
