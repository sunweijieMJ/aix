import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, screen, userEvent } from 'storybook/test';
import { ref } from 'vue';
import { Tooltip } from '../src';

const meta: Meta<typeof Tooltip> = {
  title: 'Components/Popper/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  argTypes: {
    content: {
      control: 'text',
      description: '提示内容',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: '-' },
      },
    },
    placement: {
      control: 'select',
      options: [
        'top',
        'top-start',
        'top-end',
        'bottom',
        'bottom-start',
        'bottom-end',
        'left',
        'left-start',
        'left-end',
        'right',
        'right-start',
        'right-end',
      ],
      description: '弹出位置',
      table: {
        type: { summary: 'Placement' },
        defaultValue: { summary: 'top' },
      },
    },
    showDelay: {
      control: 'number',
      description: '显示延迟 (ms)',
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '100' },
      },
    },
    hideDelay: {
      control: 'number',
      description: '隐藏延迟 (ms)',
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '100' },
      },
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
  },
  parameters: {
    docs: {
      description: {
        component: '文字提示组件，hover 时显示简短的提示信息。',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础用法 - hover 后验证 tooltip 出现
 */
export const Basic: Story = {
  args: {
    content: '这是一段提示文字',
    placement: 'top',
  },
  render: (args) => ({
    components: { Tooltip },
    setup: () => ({ args }),
    template: `
      <div style="padding: 80px; display: flex; justify-content: center;">
        <Tooltip v-bind="args">
          <button style="padding: 8px 16px; cursor: pointer;">悬停查看提示</button>
        </Tooltip>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: '悬停查看提示' });
    await expect(trigger).toBeInTheDocument();
    await userEvent.hover(trigger);
    // Tooltip 通过 Teleport 渲染到 body，需要用 screen 而非 canvas 查找
    const tooltip = await screen.findByText('这是一段提示文字');
    await expect(tooltip).toBeInTheDocument();
  },
};

export const Placements: Story = {
  render: () => ({
    components: { Tooltip },
    template: `
      <div style="padding: 60px 120px;">
        <div style="display: flex; justify-content: center; gap: 8px; margin-bottom: 16px;">
          <Tooltip content="top-start" placement="top-start">
            <button style="padding: 6px 12px; width: 100px;">top-start</button>
          </Tooltip>
          <Tooltip content="top" placement="top">
            <button style="padding: 6px 12px; width: 100px;">top</button>
          </Tooltip>
          <Tooltip content="top-end" placement="top-end">
            <button style="padding: 6px 12px; width: 100px;">top-end</button>
          </Tooltip>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <Tooltip content="left-start" placement="left-start">
              <button style="padding: 6px 12px; width: 100px;">left-start</button>
            </Tooltip>
            <Tooltip content="left" placement="left">
              <button style="padding: 6px 12px; width: 100px;">left</button>
            </Tooltip>
            <Tooltip content="left-end" placement="left-end">
              <button style="padding: 6px 12px; width: 100px;">left-end</button>
            </Tooltip>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <Tooltip content="right-start" placement="right-start">
              <button style="padding: 6px 12px; width: 100px;">right-start</button>
            </Tooltip>
            <Tooltip content="right" placement="right">
              <button style="padding: 6px 12px; width: 100px;">right</button>
            </Tooltip>
            <Tooltip content="right-end" placement="right-end">
              <button style="padding: 6px 12px; width: 100px;">right-end</button>
            </Tooltip>
          </div>
        </div>
        <div style="display: flex; justify-content: center; gap: 8px; margin-top: 16px;">
          <Tooltip content="bottom-start" placement="bottom-start">
            <button style="padding: 6px 12px; width: 100px;">bottom-start</button>
          </Tooltip>
          <Tooltip content="bottom" placement="bottom">
            <button style="padding: 6px 12px; width: 100px;">bottom</button>
          </Tooltip>
          <Tooltip content="bottom-end" placement="bottom-end">
            <button style="padding: 6px 12px; width: 100px;">bottom-end</button>
          </Tooltip>
        </div>
      </div>
    `,
  }),
};

export const ContentSlot: Story = {
  render: () => ({
    components: { Tooltip },
    template: `
      <div style="padding: 80px; display: flex; justify-content: center;">
        <Tooltip placement="top">
          <button style="padding: 8px 16px; cursor: pointer;">富文本提示</button>
          <template #content>
            <div>
              <strong>标题</strong>
              <p style="margin: 4px 0 0;">支持任意 HTML 内容</p>
            </div>
          </template>
        </Tooltip>
      </div>
    `,
  }),
};

export const Disabled: Story = {
  render: () => ({
    components: { Tooltip },
    template: `
      <div style="padding: 80px; display: flex; gap: 16px; justify-content: center;">
        <Tooltip content="正常可用" placement="top">
          <button style="padding: 8px 16px;">正常</button>
        </Tooltip>
        <Tooltip content="此提示被禁用" placement="top" disabled>
          <button style="padding: 8px 16px;">禁用</button>
        </Tooltip>
      </div>
    `,
  }),
};

export const Controlled: Story = {
  render: () => ({
    components: { Tooltip },
    setup() {
      const open = ref(false);
      return { open };
    },
    template: `
      <div style="padding: 80px; display: flex; flex-direction: column; align-items: center; gap: 16px;">
        <label>
          <input type="checkbox" v-model="open" />
          受控模式：{{ open ? '显示' : '隐藏' }}
        </label>
        <Tooltip content="受控的 Tooltip" placement="top" v-model:open="open">
          <button style="padding: 8px 16px;">目标元素</button>
        </Tooltip>
      </div>
    `,
  }),
};
