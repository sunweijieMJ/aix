/**
 * @fileoverview ErrorBoundary 组件 Stories
 */

import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, ref, h } from 'vue';
import ErrorBoundary from '../src/components/ErrorBoundary/index.vue';

const meta: Meta<typeof ErrorBoundary> = {
  title: 'Chat/ErrorBoundary',
  component: ErrorBoundary,
  tags: ['autodocs'],
  argTypes: {
    showRetry: {
      control: 'boolean',
      description: '是否显示重试按钮',
    },
    showReload: {
      control: 'boolean',
      description: '是否显示刷新页面按钮',
    },
    showDetails: {
      control: 'boolean',
      description: '是否显示错误详情',
    },
    errorMessage: {
      control: 'text',
      description: '自定义错误消息',
    },
  },
  parameters: {
    docs: {
      description: {
        component: '错误边界组件，捕获子组件的运行时错误，防止整个应用崩溃。',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

const ErrorComponent = defineComponent({
  name: 'ErrorComponent',
  props: {
    shouldError: { type: Boolean, default: false },
  },
  setup(props) {
    if (props.shouldError) {
      throw new Error('这是一个模拟的组件错误');
    }
    return () =>
      h(
        'div',
        {
          style: {
            padding: '40px',
            textAlign: 'center',
            background: '#f0f9ff',
            border: '2px solid #1677ff',
            borderRadius: '8px',
          },
        },
        '组件正常运行',
      );
  },
});

/**
 * 基础用法
 */
export const Basic: Story = {
  render: () => ({
    components: { ErrorBoundary, ErrorComponent },
    setup() {
      const shouldError = ref(false);
      const triggerError = () => {
        shouldError.value = true;
      };
      return { shouldError, triggerError };
    },
    template: `
      <div>
        <div style="margin-bottom: 20px; text-align: center;">
          <button
            @click="triggerError"
            style="padding: 10px 20px; background: #ff4d4f; color: white; border: none; border-radius: 6px; cursor: pointer;"
          >
            触发错误
          </button>
        </div>
        <ErrorBoundary>
          <ErrorComponent :should-error="shouldError" />
        </ErrorBoundary>
      </div>
    `,
  }),
};

/**
 * 自定义 Fallback
 */
export const CustomFallback: Story = {
  render: () => ({
    components: { ErrorBoundary, ErrorComponent },
    template: `
      <ErrorBoundary>
        <template #fallback="{ error, reset }">
          <div style="padding: 60px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; color: white;">
            <div style="font-size: 64px; margin-bottom: 20px;">😵</div>
            <h2 style="margin: 0 0 12px; font-size: 24px;">哎呀！出错了</h2>
            <p style="margin: 0 0 24px; font-size: 14px; opacity: 0.9;">{{ error?.message }}</p>
            <button
              @click="reset"
              style="padding: 12px 32px; background: white; color: #667eea; border: none; border-radius: 24px; font-size: 16px; font-weight: 600; cursor: pointer;"
            >
              重新尝试
            </button>
          </div>
        </template>
        <ErrorComponent :should-error="true" />
      </ErrorBoundary>
    `,
  }),
};

/**
 * 实际应用场景
 */
export const RealWorldExample: Story = {
  render: () => {
    const ChatMessage = defineComponent({
      name: 'ChatMessage',
      props: { shouldError: Boolean },
      setup(props) {
        if (props.shouldError) {
          throw new Error('消息渲染失败');
        }
        return () =>
          h(
            'div',
            {
              style: {
                padding: '16px',
                background: '#f0f9ff',
                borderRadius: '8px',
                marginBottom: '12px',
              },
            },
            [
              h(
                'div',
                { style: { fontWeight: '600', marginBottom: '8px' } },
                'AI Assistant',
              ),
              h('div', { style: { color: '#595959' } }, '这是一条正常的消息'),
            ],
          );
      },
    });

    return {
      components: { ErrorBoundary, ChatMessage },
      template: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="margin-bottom: 20px;">
            <h3 style="margin: 0 0 8px;">聊天消息列表</h3>
            <p style="margin: 0; font-size: 13px; color: #8c8c8c;">
              每条消息都被错误边界包裹，单条消息出错不会影响其他消息
            </p>
          </div>

          <ErrorBoundary>
            <ChatMessage :should-error="false" />
          </ErrorBoundary>

          <ErrorBoundary
            error-message="这条消息加载失败"
            :show-details="false"
            :show-reload="false"
          >
            <ChatMessage :should-error="true" />
          </ErrorBoundary>

          <ErrorBoundary>
            <ChatMessage :should-error="false" />
          </ErrorBoundary>
        </div>
      `,
    };
  },
};
