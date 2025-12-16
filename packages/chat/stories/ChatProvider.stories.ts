import type { ChatMessage } from '@aix/chat-sdk';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref, inject, defineComponent, h } from 'vue';
import ChatProvider from '../src/components/ChatProvider/index.vue';
import { CHAT_PROVIDER_KEY } from '../src/components/ChatProvider/types';
import type { ChatProviderContext } from '../src/components/ChatProvider/types';
import Sender from '../src/components/Sender';

const meta: Meta<typeof ChatProvider> = {
  title: 'Chat/ChatProvider',
  component: ChatProvider,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `ChatProvider 是一个上下文提供组件，用于管理多会话、消息状态和 UI 配置。
使用 Vue 的 Provide/Inject 机制实现跨组件通信，无需额外状态管理库。

主要功能：
- 多会话管理（创建、切换、删除）
- 消息操作（发送、停止、清空、重新生成）
- UI 配置（头像、时间戳、Markdown 等）
- 加载状态管理`,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// 模拟 AI 请求函数
const mockRequest = async (
  _params: { messages: ChatMessage[] },
  callbacks?: {
    onUpdate?: (content: string) => void;
    onSuccess?: (content: string) => void;
  },
) => {
  const response =
    '这是 AI 的模拟回复。ChatProvider 组件负责管理会话状态和消息流转。';

  if (callbacks?.onUpdate) {
    for (let i = 0; i <= response.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      callbacks.onUpdate(response.slice(0, i));
    }
    callbacks.onSuccess?.(response);
  }

  return response;
};

/**
 * 基础用法
 */
export const Basic: Story = {
  render: () => ({
    components: { ChatProvider, Sender },
    setup() {
      const ChatConsumer = defineComponent({
        setup() {
          const ctx = inject<ChatProviderContext>(CHAT_PROVIDER_KEY);
          if (!ctx) return () => h('div', 'ChatProvider 上下文未找到');

          const inputValue = ref('');

          const handleSubmit = async (value: string) => {
            if (!value.trim()) return;
            inputValue.value = '';
            await ctx.sendMessage(value);
          };

          return () =>
            h(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                },
              },
              [
                h(
                  'div',
                  {
                    style: {
                      minHeight: '200px',
                      maxHeight: '400px',
                      overflow: 'auto',
                      padding: '16px',
                      background: 'var(--colorBgLayout)',
                      borderRadius: '8px',
                    },
                  },
                  ctx.messages.value.length === 0
                    ? h(
                        'div',
                        {
                          style: {
                            color: 'var(--colorTextSecondary)',
                            textAlign: 'center',
                          },
                        },
                        '暂无消息，发送一条试试',
                      )
                    : ctx.messages.value.map((msg) =>
                        h(
                          'div',
                          {
                            key: msg.id,
                            style: {
                              padding: '8px 12px',
                              marginBottom: '8px',
                              background:
                                msg.role === 'user'
                                  ? 'var(--colorPrimaryBg)'
                                  : 'var(--colorBgContainer)',
                              borderRadius: '8px',
                            },
                          },
                          [
                            h(
                              'div',
                              {
                                style: {
                                  fontSize: '12px',
                                  color: 'var(--colorTextSecondary)',
                                  marginBottom: '4px',
                                },
                              },
                              msg.role === 'user' ? '用户' : 'AI',
                            ),
                            h(
                              'div',
                              typeof msg.content === 'string'
                                ? msg.content
                                : JSON.stringify(msg.content),
                            ),
                          ],
                        ),
                      ),
                ),
                ctx.isLoading.value &&
                  h(
                    'div',
                    {
                      style: {
                        textAlign: 'center',
                        color: 'var(--colorTextSecondary)',
                      },
                    },
                    'AI 正在回复...',
                  ),
                h(Sender, {
                  value: inputValue.value,
                  placeholder: '输入消息...',
                  loading: ctx.isLoading.value,
                  'onUpdate:value': (v: string) => (inputValue.value = v),
                  onSubmit: handleSubmit,
                }),
              ],
            );
        },
      });

      return () =>
        h(
          'div',
          { style: { maxWidth: '600px', padding: '20px' } },
          h(
            ChatProvider,
            {
              defaultRequest: mockRequest,
              initialSession: { id: 'demo-session', title: '演示会话' },
            },
            () => h(ChatConsumer),
          ),
        );
    },
  }),
};

/**
 * 多会话管理
 */
export const MultiSession: Story = {
  render: () => ({
    components: { ChatProvider },
    setup() {
      const ChatConsumer = defineComponent({
        setup() {
          const ctx = inject<ChatProviderContext>(CHAT_PROVIDER_KEY);
          if (!ctx) return () => null;

          const sessions = ref(['session-1', 'session-2']);

          const createNewSession = () => {
            const id = `session-${Date.now()}`;
            ctx.createSession({
              id,
              title: `会话 ${sessions.value.length + 1}`,
            });
            sessions.value.push(id);
          };

          return () =>
            h('div', { style: { padding: '16px' } }, [
              h('h4', { style: { margin: '0 0 12px 0' } }, '多会话管理'),
              h(
                'div',
                { style: { marginBottom: '12px' } },
                `当前会话: ${ctx.currentSessionId.value}`,
              ),
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                    marginBottom: '12px',
                  },
                },
                [
                  ...sessions.value.map((id) =>
                    h(
                      'button',
                      {
                        key: id,
                        style: {
                          padding: '6px 12px',
                          border: '1px solid var(--colorBorder)',
                          borderRadius: '4px',
                          background:
                            ctx.currentSessionId.value === id
                              ? 'var(--colorPrimary)'
                              : 'var(--colorBgContainer)',
                          color:
                            ctx.currentSessionId.value === id
                              ? 'white'
                              : 'inherit',
                          cursor: 'pointer',
                        },
                        onClick: () => ctx.switchSession(id),
                      },
                      id,
                    ),
                  ),
                  h(
                    'button',
                    {
                      style: {
                        padding: '6px 12px',
                        border: '1px dashed var(--colorBorder)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      },
                      onClick: createNewSession,
                    },
                    '+ 新建会话',
                  ),
                ],
              ),
              h(
                'div',
                {
                  style: {
                    fontSize: '12px',
                    color: 'var(--colorTextSecondary)',
                  },
                },
                '点击会话按钮切换，每个会话有独立的消息历史',
              ),
            ]);
        },
      });

      return () =>
        h(
          'div',
          { style: { maxWidth: '600px', padding: '20px' } },
          h(
            ChatProvider,
            {
              initialSession: { id: 'session-1', title: '会话 1' },
            },
            () => h(ChatConsumer),
          ),
        );
    },
  }),
};

/**
 * 消息操作
 */
export const MessageOperations: Story = {
  render: () => ({
    components: { ChatProvider },
    setup() {
      const ChatConsumer = defineComponent({
        setup() {
          const ctx = inject<ChatProviderContext>(CHAT_PROVIDER_KEY);
          if (!ctx) return () => null;

          const addUserMessage = () => {
            // 使用 addMessage API 而不是直接操作数组
            ctx.addMessage({
              role: 'user',
              content: '这是一条用户消息 ' + new Date().toLocaleTimeString(),
              status: 'success',
            });
          };

          const addAIMessage = () => {
            // 使用 addMessage API 而不是直接操作数组
            ctx.addMessage({
              role: 'assistant',
              content: 'AI 回复内容 ' + new Date().toLocaleTimeString(),
              status: 'success',
            });
          };

          return () =>
            h('div', { style: { padding: '16px' } }, [
              h('h4', { style: { margin: '0 0 12px 0' } }, '消息操作'),
              h(
                'div',
                {
                  style: { display: 'flex', gap: '8px', marginBottom: '16px' },
                },
                [
                  h(
                    'button',
                    {
                      style: {
                        padding: '6px 12px',
                        border: '1px solid var(--colorBorder)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      },
                      onClick: addUserMessage,
                    },
                    '添加用户消息',
                  ),
                  h(
                    'button',
                    {
                      style: {
                        padding: '6px 12px',
                        border: '1px solid var(--colorBorder)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      },
                      onClick: addAIMessage,
                    },
                    '添加 AI 消息',
                  ),
                  h(
                    'button',
                    {
                      style: {
                        padding: '6px 12px',
                        border: '1px solid var(--colorError)',
                        borderRadius: '4px',
                        color: 'var(--colorError)',
                        cursor: 'pointer',
                      },
                      onClick: () => ctx.clearMessages(),
                    },
                    '清空消息',
                  ),
                ],
              ),
              h(
                'div',
                {
                  style: {
                    minHeight: '150px',
                    maxHeight: '300px',
                    overflow: 'auto',
                    padding: '12px',
                    background: 'var(--colorBgLayout)',
                    borderRadius: '8px',
                  },
                },
                ctx.messages.value.length === 0
                  ? h(
                      'div',
                      {
                        style: {
                          color: 'var(--colorTextSecondary)',
                          textAlign: 'center',
                        },
                      },
                      '暂无消息',
                    )
                  : ctx.messages.value.map((msg) =>
                      h(
                        'div',
                        {
                          key: msg.id,
                          style: {
                            padding: '8px',
                            marginBottom: '8px',
                            background:
                              msg.role === 'user'
                                ? 'var(--colorPrimaryBg)'
                                : 'var(--colorBgContainer)',
                            borderRadius: '4px',
                          },
                        },
                        `[${msg.role}] ${msg.content}`,
                      ),
                    ),
              ),
              h(
                'div',
                {
                  style: {
                    marginTop: '8px',
                    fontSize: '12px',
                    color: 'var(--colorTextSecondary)',
                  },
                },
                `消息总数: ${ctx.messages.value.length}`,
              ),
            ]);
        },
      });

      return () =>
        h(
          'div',
          { style: { maxWidth: '600px', padding: '20px' } },
          h(
            ChatProvider,
            { initialSession: { id: 'ops-demo', title: '操作演示' } },
            () => h(ChatConsumer),
          ),
        );
    },
  }),
};

/**
 * API 说明
 */
export const APIReference: Story = {
  render: () => ({
    setup() {
      const apiMethods = [
        { name: 'sendMessage(content)', desc: '发送消息并获取 AI 回复' },
        { name: 'stopGeneration()', desc: '停止当前正在生成的回复' },
        { name: 'clearMessages()', desc: '清空当前会话的所有消息' },
        { name: 'regenerate()', desc: '重新生成最后一条 AI 回复' },
        { name: 'deleteMessage(id)', desc: '删除指定消息' },
        { name: 'createSession(config)', desc: '创建新会话' },
        { name: 'switchSession(id)', desc: '切换到指定会话' },
        { name: 'deleteSession(id)', desc: '删除指定会话' },
        { name: 'updateUIConfig(config)', desc: '更新 UI 配置' },
      ];

      const contextProperties = [
        { name: 'currentSessionId', type: 'Ref<string>', desc: '当前会话 ID' },
        {
          name: 'messages',
          type: 'Ref<ChatMessage[]>',
          desc: '当前会话的消息列表',
        },
        { name: 'isLoading', type: 'Ref<boolean>', desc: '是否正在加载' },
        { name: 'uiConfig', type: 'Ref<UIConfig>', desc: 'UI 配置' },
      ];

      return () =>
        h('div', { style: { maxWidth: '700px', padding: '20px' } }, [
          h('h3', { style: { margin: '0 0 16px 0' } }, 'ChatProvider API 参考'),
          h('h4', { style: { margin: '16px 0 8px 0' } }, '上下文属性'),
          h(
            'table',
            {
              style: {
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px',
              },
            },
            [
              h(
                'thead',
                h('tr', { style: { background: 'var(--colorBgLayout)' } }, [
                  h(
                    'th',
                    {
                      style: {
                        padding: '8px',
                        textAlign: 'left',
                        border: '1px solid var(--colorBorder)',
                      },
                    },
                    '属性',
                  ),
                  h(
                    'th',
                    {
                      style: {
                        padding: '8px',
                        textAlign: 'left',
                        border: '1px solid var(--colorBorder)',
                      },
                    },
                    '类型',
                  ),
                  h(
                    'th',
                    {
                      style: {
                        padding: '8px',
                        textAlign: 'left',
                        border: '1px solid var(--colorBorder)',
                      },
                    },
                    '说明',
                  ),
                ]),
              ),
              h(
                'tbody',
                contextProperties.map((prop) =>
                  h('tr', { key: prop.name }, [
                    h(
                      'td',
                      {
                        style: {
                          padding: '8px',
                          border: '1px solid var(--colorBorder)',
                          fontFamily: 'monospace',
                        },
                      },
                      prop.name,
                    ),
                    h(
                      'td',
                      {
                        style: {
                          padding: '8px',
                          border: '1px solid var(--colorBorder)',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                        },
                      },
                      prop.type,
                    ),
                    h(
                      'td',
                      {
                        style: {
                          padding: '8px',
                          border: '1px solid var(--colorBorder)',
                        },
                      },
                      prop.desc,
                    ),
                  ]),
                ),
              ),
            ],
          ),
          h('h4', { style: { margin: '24px 0 8px 0' } }, '方法'),
          h(
            'table',
            {
              style: {
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px',
              },
            },
            [
              h(
                'thead',
                h('tr', { style: { background: 'var(--colorBgLayout)' } }, [
                  h(
                    'th',
                    {
                      style: {
                        padding: '8px',
                        textAlign: 'left',
                        border: '1px solid var(--colorBorder)',
                      },
                    },
                    '方法',
                  ),
                  h(
                    'th',
                    {
                      style: {
                        padding: '8px',
                        textAlign: 'left',
                        border: '1px solid var(--colorBorder)',
                      },
                    },
                    '说明',
                  ),
                ]),
              ),
              h(
                'tbody',
                apiMethods.map((method) =>
                  h('tr', { key: method.name }, [
                    h(
                      'td',
                      {
                        style: {
                          padding: '8px',
                          border: '1px solid var(--colorBorder)',
                          fontFamily: 'monospace',
                        },
                      },
                      method.name,
                    ),
                    h(
                      'td',
                      {
                        style: {
                          padding: '8px',
                          border: '1px solid var(--colorBorder)',
                        },
                      },
                      method.desc,
                    ),
                  ]),
                ),
              ),
            ],
          ),
          h('h4', { style: { margin: '24px 0 8px 0' } }, '使用方式'),
          h(
            'pre',
            {
              style: {
                background: 'var(--colorBgContainer)',
                padding: '16px',
                borderRadius: '8px',
                fontSize: '13px',
                overflow: 'auto',
              },
            },
            `import { inject } from 'vue';
import { CHAT_PROVIDER_KEY } from '@aix/chat';

// 在子组件中获取上下文
const ctx = inject(CHAT_PROVIDER_KEY);

// 发送消息
await ctx.sendMessage('Hello');

// 访问响应式状态
console.log(ctx.messages.value);
console.log(ctx.isLoading.value);`,
          ),
        ]);
    },
  }),
};
