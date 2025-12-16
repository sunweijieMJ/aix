import {
  Copy,
  Refresh,
  ThumbUp,
  ThumbDown,
  Edit,
  Delete,
  Flag,
} from '@aix/icons';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { Actions } from '../src/components/Actions';
import type { ActionItem } from '../src/components/Actions/types';

const meta: Meta<typeof Actions> = {
  title: 'Chat/Actions',
  component: Actions,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '操作按钮组，用于快速配置消息下方的操作按钮。',
      },
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
    components: { Actions },
    setup() {
      const items: ActionItem[] = [
        { key: 'copy', label: '复制', icon: Copy },
        { key: 'retry', label: '重试', icon: Refresh },
        { key: 'like', icon: ThumbUp },
        { key: 'dislike', icon: ThumbDown },
      ];

      const handleAction = (key: string, item: ActionItem) => {
        alert(`点击了: ${item.label || key}`);
      };

      return { items, handleAction };
    },
    template: `
      <div style="padding: 20px;">
        <Actions :items="items" @action="handleAction" />
      </div>
    `,
  }),
};

/**
 * 带子菜单
 */
export const WithChildren: Story = {
  render: () => ({
    components: { Actions },
    setup() {
      const items: ActionItem[] = [
        { key: 'copy', label: '复制', icon: Copy },
        { key: 'retry', label: '重试', icon: Refresh },
        {
          key: 'more',
          children: [
            { key: 'edit', label: '编辑', icon: Edit },
            { key: 'delete', label: '删除', icon: Delete, danger: true },
            { key: 'report', label: '举报', icon: Flag },
          ],
        },
      ];

      const handleAction = (key: string, item: ActionItem) => {
        alert(`执行操作: ${item.label || key}`);
      };

      return { items, handleAction };
    },
    template: `
      <div style="padding: 20px;">
        <Actions :items="items" @action="handleAction" />
      </div>
    `,
  }),
};

/**
 * 不同变体
 */
export const Variants: Story = {
  render: () => ({
    components: { Actions },
    setup() {
      const items: ActionItem[] = [
        { key: 'copy', label: '复制', icon: Copy },
        { key: 'retry', label: '重试', icon: Refresh },
        { key: 'like', icon: ThumbUp },
      ];

      return { items };
    },
    template: `
      <div style="padding: 20px; display: flex; flex-direction: column; gap: 24px;">
        <div>
          <h4>Text (默认)</h4>
          <Actions :items="items" variant="text" />
        </div>
        <div>
          <h4>Outlined</h4>
          <Actions :items="items" variant="outlined" />
        </div>
        <div>
          <h4>Filled</h4>
          <Actions :items="items" variant="filled" />
        </div>
      </div>
    `,
  }),
};

/**
 * 交互式示例
 */
export const Interactive: Story = {
  render: () => ({
    components: { Actions },
    setup() {
      const counts = ref({
        like: 0,
        dislike: 0,
      });

      const items = ref<ActionItem[]>([
        { key: 'copy', label: '复制', icon: Copy },
        { key: 'like', label: `${counts.value.like}`, icon: ThumbUp },
        { key: 'dislike', label: `${counts.value.dislike}`, icon: ThumbDown },
      ]);

      const handleAction = (key: string, _item: ActionItem) => {
        if (key === 'like') {
          counts.value.like++;
          const likeItem = items.value[1];
          if (likeItem) likeItem.label = `${counts.value.like}`;
        } else if (key === 'dislike') {
          counts.value.dislike++;
          const dislikeItem = items.value[2];
          if (dislikeItem) dislikeItem.label = `${counts.value.dislike}`;
        } else if (key === 'copy') {
          alert('已复制到剪贴板');
        }
      };

      return { items, handleAction };
    },
    template: `
      <div style="padding: 20px;">
        <div style="max-width: 600px; padding: 16px; background: #f7f7f8; border-radius: 12px;">
          <div style="margin-bottom: 12px;">
            这是一个交互式示例，点击点赞和踩会增加计数
          </div>
          <Actions :items="items" @action="handleAction" />
        </div>
      </div>
    `,
  }),
};
