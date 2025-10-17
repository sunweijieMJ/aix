import type { Meta, StoryObj } from '@storybook/vue3';
import Button from '../src/Button.vue';

const meta = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'AIX Button 组件支持多种类型、尺寸和状态，完全支持主题定制。',
      },
    },
  },
  argTypes: {
    type: {
      control: 'select',
      options: ['primary', 'default', 'dashed', 'text', 'link'],
      description: '按钮类型',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'default' },
      },
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
      description: '按钮尺寸',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'medium' },
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
    loading: {
      control: 'boolean',
      description: '是否加载中',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    onClick: {
      action: 'clicked',
      description: '点击事件',
      table: {
        type: { summary: '(event: MouseEvent) => void' },
      },
    },
  },
  args: {
    default: 'Button',
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 默认按钮
 */
export const Default: Story = {
  args: {
    type: 'default',
  },
  render: (args: any) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Default Button</Button>',
  }),
};

/**
 * 主要按钮
 */
export const Primary: Story = {
  args: {
    type: 'primary',
  },
  render: (args: any) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Primary Button</Button>',
  }),
};

/**
 * 虚线按钮
 */
export const Dashed: Story = {
  args: {
    type: 'dashed',
  },
  render: (args: any) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Dashed Button</Button>',
  }),
};

/**
 * 文本按钮
 */
export const Text: Story = {
  args: {
    type: 'text',
  },
  render: (args: any) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Text Button</Button>',
  }),
};

/**
 * 链接按钮
 */
export const Link: Story = {
  args: {
    type: 'link',
  },
  render: (args: any) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Link Button</Button>',
  }),
};

/**
 * 不同尺寸
 */
export const Sizes: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 12px; align-items: center;">
        <Button type="primary" size="small">Small</Button>
        <Button type="primary" size="medium">Medium</Button>
        <Button type="primary" size="large">Large</Button>
      </div>
    `,
  }),
};

/**
 * 禁用状态
 */
export const Disabled: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 12px;">
        <Button type="primary" disabled>Primary</Button>
        <Button type="default" disabled>Default</Button>
        <Button type="dashed" disabled>Dashed</Button>
        <Button type="text" disabled>Text</Button>
        <Button type="link" disabled>Link</Button>
      </div>
    `,
  }),
};

/**
 * 加载状态
 */
export const Loading: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 12px;">
        <Button type="primary" loading>Loading</Button>
        <Button type="default" loading>Loading</Button>
        <Button type="dashed" loading>Loading</Button>
      </div>
    `,
  }),
};

/**
 * 所有类型展示
 */
export const AllTypes: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; gap: 12px;">
          <Button type="primary">Primary</Button>
          <Button type="default">Default</Button>
          <Button type="dashed">Dashed</Button>
          <Button type="text">Text</Button>
          <Button type="link">Link</Button>
        </div>
        <div style="display: flex; gap: 12px;">
          <Button type="primary" disabled>Primary</Button>
          <Button type="default" disabled>Default</Button>
          <Button type="dashed" disabled>Dashed</Button>
          <Button type="text" disabled>Text</Button>
          <Button type="link" disabled>Link</Button>
        </div>
        <div style="display: flex; gap: 12px;">
          <Button type="primary" loading>Primary</Button>
          <Button type="default" loading>Default</Button>
          <Button type="dashed" loading>Dashed</Button>
        </div>
      </div>
    `,
  }),
};

/**
 * 交互式 Playground
 * 在 Controls 面板中调整参数查看效果
 */
export const Playground: Story = {
  args: {
    type: 'primary',
    size: 'medium',
    disabled: false,
    loading: false,
  },
  render: (args: any) => ({
    components: { Button },
    setup() {
      const handleClick = () => {
        alert('按钮被点击了！');
      };
      return { args, handleClick };
    },
    template: '<Button v-bind="args" @click="handleClick">点击我试试</Button>',
  }),
};
