import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { Conversations } from '../src/components/Conversations';
import type { ConversationItem } from '../src/components/Conversations/types';

const meta: Meta<typeof Conversations> = {
  title: 'Chat/Conversations',
  component: Conversations,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '会话列表组件，用于管理多个聊天会话。支持会话切换、删除、置顶等功能。',
      },
    },
  },
  argTypes: {
    activeId: {
      control: 'text',
      description: '当前激活的会话 ID',
    },
    showNew: {
      control: 'boolean',
      description: '是否显示新建按钮',
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
    components: { Conversations },
    setup() {
      const conversations = ref<ConversationItem[]>([
        {
          id: '1',
          title: '关于 Vue 3 的讨论',
          lastMessage: 'Composition API 与 Options API 的区别是什么？',
          lastMessageTime: Date.now() - 1000 * 60 * 5,
          messageCount: 15,
        },
        {
          id: '2',
          title: 'TypeScript 类型系统',
          lastMessage: '如何定义泛型约束？',
          lastMessageTime: Date.now() - 1000 * 60 * 30,
          messageCount: 8,
        },
        {
          id: '3',
          title: 'React vs Vue',
          lastMessage: '两者在状态管理上的差异',
          lastMessageTime: Date.now() - 1000 * 60 * 60 * 2,
          messageCount: 23,
        },
      ]);

      const activeId = ref('1');

      const handleSelect = (item: ConversationItem) => {
        activeId.value = item.id;
      };

      const handleDelete = (id: string) => {
        conversations.value = conversations.value.filter((c) => c.id !== id);
        if (activeId.value === id) {
          activeId.value = conversations.value[0]?.id || '';
        }
      };

      const handleNew = () => {
        const newId = String(Date.now());
        conversations.value.unshift({
          id: newId,
          title: '新对话',
          lastMessage: '',
          lastMessageTime: Date.now(),
          messageCount: 0,
        });
        activeId.value = newId;
      };

      return { conversations, activeId, handleSelect, handleDelete, handleNew };
    },
    template: `
      <div style="width: 320px; height: 600px; border: 1px solid var(--colorBorder); border-radius: 8px; overflow: hidden;">
        <Conversations
          :items="conversations"
          :active-id="activeId"
          :show-new="true"
          @select="handleSelect"
          @delete="handleDelete"
          @new="handleNew"
        />
      </div>
    `,
  }),
};

/**
 * 置顶会话
 */
export const WithPinnedItems: Story = {
  render: () => ({
    components: { Conversations },
    setup() {
      const conversations = ref<ConversationItem[]>([
        {
          id: '1',
          title: '重要：项目需求讨论',
          lastMessage: '下周一之前完成功能开发',
          lastMessageTime: Date.now() - 1000 * 60 * 60 * 24,
          messageCount: 45,
          pinned: true,
        },
        {
          id: '2',
          title: 'AI 技术交流',
          lastMessage: 'ChatGPT 的原理是什么？',
          lastMessageTime: Date.now() - 1000 * 60 * 10,
          messageCount: 12,
          pinned: true,
        },
        {
          id: '3',
          title: '学习计划',
          lastMessage: '今天学习了什么内容？',
          lastMessageTime: Date.now() - 1000 * 60 * 30,
          messageCount: 8,
        },
      ]);

      const activeId = ref('2');

      const handleSelect = (item: ConversationItem) => {
        activeId.value = item.id;
      };

      return { conversations, activeId, handleSelect };
    },
    template: `
      <div style="width: 320px; height: 600px; border: 1px solid var(--colorBorder); border-radius: 8px; overflow: hidden;">
        <Conversations
          :items="conversations"
          :active-id="activeId"
          :show-new="true"
          @select="handleSelect"
        />
      </div>
    `,
  }),
};

/**
 * 交互式 Playground
 */
export const Playground: Story = {
  args: {
    showNew: true,
  },
  render: (args) => ({
    components: { Conversations },
    setup() {
      const conversations = ref<ConversationItem[]>([
        {
          id: '1',
          title: '会话 1',
          lastMessage: '这是最后一条消息',
          lastMessageTime: Date.now() - 1000 * 60 * 5,
          messageCount: 10,
        },
        {
          id: '2',
          title: '会话 2',
          lastMessage: '另一条消息',
          lastMessageTime: Date.now() - 1000 * 60 * 30,
          messageCount: 5,
        },
      ]);

      const activeId = ref('1');

      const handleSelect = (item: ConversationItem) => {
        activeId.value = item.id;
      };

      const handleDelete = (id: string) => {
        conversations.value = conversations.value.filter((c) => c.id !== id);
      };

      const handleNew = () => {
        const newId = String(Date.now());
        conversations.value.unshift({
          id: newId,
          title: '新对话',
          lastMessage: '',
          lastMessageTime: Date.now(),
          messageCount: 0,
        });
        activeId.value = newId;
      };

      return {
        args,
        conversations,
        activeId,
        handleSelect,
        handleDelete,
        handleNew,
      };
    },
    template: `
      <div style="width: 320px; height: 600px; border: 1px solid var(--colorBorder); border-radius: 8px; overflow: hidden;">
        <Conversations
          v-bind="args"
          :items="conversations"
          :active-id="activeId"
          @select="handleSelect"
          @delete="handleDelete"
          @new="handleNew"
        />
      </div>
    `,
  }),
};
