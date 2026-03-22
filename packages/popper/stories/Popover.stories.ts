import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, screen, userEvent } from 'storybook/test';
import { ref } from 'vue';
import { Popover } from '../src';

const meta: Meta<typeof Popover> = {
  title: 'Components/Popper/Popover',
  component: Popover,
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
      description: '标题',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: '-' },
      },
    },
    trigger: {
      control: 'select',
      options: ['click', 'hover', 'focus', 'manual'],
      description: '触发方式',
      table: {
        type: { summary: "'click' | 'hover' | 'focus' | 'manual'" },
        defaultValue: { summary: 'click' },
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
    width: {
      control: 'text',
      description: '弹出层宽度',
      table: {
        type: { summary: 'number | string' },
        defaultValue: { summary: '-' },
      },
    },
    arrow: {
      control: 'boolean',
      description: '是否显示箭头',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
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
        component: '弹出框组件，支持标题和内容区域，可通过多种方式触发。',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础用法 - click 后验证 popover 出现
 */
export const Basic: Story = {
  render: () => ({
    components: { Popover },
    template: `
      <div style="padding: 120px; display: flex; justify-content: center;">
        <Popover title="标题" placement="top">
          <template #reference>
            <button style="padding: 8px 16px; cursor: pointer;">点击打开</button>
          </template>
          <p style="margin: 0;">这是一段 Popover 内容，支持任意 HTML。</p>
        </Popover>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: '点击打开' });
    await expect(trigger).toBeInTheDocument();
    await userEvent.click(trigger);
    // Popover 通过 Teleport 渲染到 body，需要用 screen 而非 canvas 查找
    const popoverTitle = await screen.findByText('标题');
    await expect(popoverTitle).toBeInTheDocument();
  },
};

export const Triggers: Story = {
  render: () => ({
    components: { Popover },
    template: `
      <div style="padding: 120px; display: flex; gap: 16px; justify-content: center;">
        <Popover title="Click 触发" trigger="click">
          <template #reference><button style="padding: 8px 16px;">Click</button></template>
          Click 触发的 Popover
        </Popover>
        <Popover title="Hover 触发" trigger="hover">
          <template #reference><button style="padding: 8px 16px;">Hover</button></template>
          Hover 触发的 Popover
        </Popover>
        <Popover title="Focus 触发" trigger="focus">
          <template #reference><input style="padding: 8px;" placeholder="Focus 触发" /></template>
          Focus 触发的 Popover
        </Popover>
      </div>
    `,
  }),
};

export const Controlled: Story = {
  render: () => ({
    components: { Popover },
    setup() {
      const open = ref(false);
      return { open };
    },
    template: `
      <div style="padding: 120px; display: flex; flex-direction: column; align-items: center; gap: 16px;">
        <label>
          <input type="checkbox" v-model="open" />
          受控模式：{{ open ? '显示' : '隐藏' }}
        </label>
        <Popover v-model:open="open" title="受控 Popover" trigger="manual">
          <template #reference>
            <button style="padding: 8px 16px;">目标元素</button>
          </template>
          通过 v-model:open 控制显示/隐藏
        </Popover>
      </div>
    `,
  }),
};

export const Disabled: Story = {
  render: () => ({
    components: { Popover },
    template: `
      <div style="padding: 120px; display: flex; gap: 16px; justify-content: center;">
        <Popover title="正常 Popover" placement="top">
          <template #reference>
            <button style="padding: 8px 16px;">正常</button>
          </template>
          正常可用的 Popover
        </Popover>
        <Popover title="禁用 Popover" placement="top" disabled>
          <template #reference>
            <button style="padding: 8px 16px;">禁用</button>
          </template>
          此 Popover 被禁用
        </Popover>
      </div>
    `,
  }),
};

export const CustomWidth: Story = {
  render: () => ({
    components: { Popover },
    template: `
      <div style="padding: 120px; display: flex; gap: 16px; justify-content: center;">
        <Popover title="默认宽度" placement="bottom">
          <template #reference><button style="padding: 8px 16px;">默认</button></template>
          内容区域
        </Popover>
        <Popover title="300px 宽度" placement="bottom" :width="300">
          <template #reference><button style="padding: 8px 16px;">300px</button></template>
          通过 width prop 设置弹出层宽度，适合放置较多内容。
        </Popover>
        <Popover title="无标题" placement="bottom" :arrow="false">
          <template #reference><button style="padding: 8px 16px;">无箭头</button></template>
          隐藏箭头的 Popover
        </Popover>
      </div>
    `,
  }),
};
