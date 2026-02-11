import type { Meta, StoryObj } from '@storybook/vue3';
import Button from '../src/Button.vue';
import type { ButtonProps } from '../src/types';

const meta: Meta<typeof Button> = {
  title: 'Button',
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
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 默认按钮
 */
export const Default: Story = {
  args: {
    type: 'default',
  },
  render: (args: ButtonProps) => ({
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
  render: (args: ButtonProps) => ({
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
  render: (args: ButtonProps) => ({
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
  render: (args: ButtonProps) => ({
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
  render: (args: ButtonProps) => ({
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
 * 主题切换示例
 * 点击右上角的主题切换按钮（太阳/月亮图标），查看按钮在不同主题下的效果
 */
export const ThemeDemo: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <div style="padding: 16px; background: var(--aix-colorBgContainer); border: 1px solid var(--aix-colorBorder); border-radius: 8px;">
          <h3 style="margin: 0 0 16px 0; font-size: 16px; color: var(--aix-colorText);">
            🎨 主题切换演示
          </h3>
          <p style="margin: 0 0 16px 0; font-size: 14px; color: var(--aix-colorTextSecondary);">
            点击右上角工具栏的 <strong>主题按钮</strong>（太阳☀️/月亮🌙 图标），切换亮色/暗色主题
          </p>
          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <Button type="primary">Primary</Button>
            <Button type="default">Default</Button>
            <Button type="dashed">Dashed</Button>
            <Button type="text">Text</Button>
            <Button type="link">Link</Button>
          </div>
        </div>

        <div style="padding: 16px; background: var(--aix-colorBgContainer); border: 1px solid var(--aix-colorBorder); border-radius: 8px;">
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: var(--aix-colorText);">
            ✨ 主题系统特性
          </h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: var(--aix-colorTextSecondary); line-height: 1.8;">
            <li>✅ 支持亮色/暗色主题切换</li>
            <li>✅ 使用 CSS 变量，无需重新渲染组件</li>
            <li>✅ 自动保存主题偏好到 localStorage</li>
            <li>✅ 平滑过渡动画（200ms）</li>
            <li>✅ SSR/SSG 友好（支持 Nuxt/Next.js）</li>
          </ul>
        </div>

        <div style="padding: 16px; background: var(--aix-colorPrimaryBg); border: 1px solid var(--aix-colorPrimaryBorder); border-radius: 8px;">
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: var(--aix-colorPrimaryText);">
            💡 开发提示
          </h4>
          <div style="font-size: 13px; color: var(--aix-colorText); line-height: 1.8;">
            <p style="margin: 0 0 8px 0;">所有组件都使用主题变量，无需特殊配置即可支持主题切换：</p>
            <pre style="margin: 0; padding: 12px; background: var(--aix-colorBgElevated); border-radius: 4px; overflow-x: auto; font-size: 12px;"><code>// 在组件中使用主题变量
color: var(--aix-colorPrimary);
background: var(--aix-colorBgContainer);
border: 1px solid var(--aix-colorBorder);</code></pre>
          </div>
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
  render: (args: ButtonProps) => ({
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
