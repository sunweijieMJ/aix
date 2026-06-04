import type { Meta, StoryObj } from '@storybook/vue3';
import { fn, expect, userEvent } from 'storybook/test';
import { Sender } from '../src';

const meta: Meta<typeof Sender> = {
  title: 'AI Chat/Sender',
  component: Sender,
  args: {
    modelValue: '',
    placeholder: '输入消息…',
    loading: false,
    disabled: false,
    submitType: 'enter',
    onSubmit: fn(),
    onCancel: fn(),
  },
  argTypes: {
    submitType: {
      control: 'inline-radio',
      options: ['enter', 'shiftEnter'],
    },
  },
};
export default meta;
type Story = StoryObj<typeof Sender>;

/** 默认态：普通输入框 + 发送按钮 */
export const Default: Story = {
  render: (args) => ({
    components: { Sender },
    setup: () => ({ args }),
    template: `
      <Sender
        v-bind="args"
        @submit="args.onSubmit"
        @cancel="args.onCancel"
        @update:modelValue="args['onUpdate:modelValue']"
      />
    `,
  }),
};

/** 加载态：显示停止按钮 */
export const Loading: Story = {
  args: { loading: true },
  render: (args) => ({
    components: { Sender },
    setup: () => ({ args }),
    template: `
      <Sender
        v-bind="args"
        @submit="args.onSubmit"
        @cancel="args.onCancel"
        @update:modelValue="args['onUpdate:modelValue']"
      />
    `,
  }),
  play: async ({ canvas }) => {
    // loading 态下按钮 aria-label 应为"停止"
    const stopBtn = canvas.getByRole('button', { name: '停止' });
    await expect(stopBtn).toBeInTheDocument();
  },
};

/** 禁用态 */
export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => ({
    components: { Sender },
    setup: () => ({ args }),
    template: `
      <Sender
        v-bind="args"
        @submit="args.onSubmit"
        @cancel="args.onCancel"
        @update:modelValue="args['onUpdate:modelValue']"
      />
    `,
  }),
  play: async ({ canvas }) => {
    const textarea = canvas.getByRole('textbox');
    await expect(textarea).toBeDisabled();
  },
};

/**
 * Enter 提交测试：输入文本后按 Enter 触发 submit，textarea 被清空
 */
export const SubmitOnEnter: Story = {
  args: { onSubmit: fn(), submitType: 'enter' },
  render: (args) => ({
    components: { Sender },
    setup: () => ({ args }),
    template: `
      <Sender
        v-bind="args"
        @submit="args.onSubmit"
        @cancel="args.onCancel"
        @update:modelValue="args['onUpdate:modelValue']"
      />
    `,
  }),
  play: async ({ canvas, args }) => {
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.type(textarea, '你好，请帮我写段代码');
    await userEvent.keyboard('{Enter}');
    await expect(args.onSubmit).toHaveBeenCalledWith('你好，请帮我写段代码');
    // 提交后 textarea 应清空
    await expect(textarea).toHaveValue('');
  },
};

/**
 * enter 模式（默认）下，Shift+Enter 仅换行、不触发 submit。
 */
export const ShiftEnterNoSubmit: Story = {
  args: { onSubmit: fn(), submitType: 'enter' },
  render: (args) => ({
    components: { Sender },
    setup: () => ({ args }),
    template: `
      <Sender
        v-bind="args"
        @submit="args.onSubmit"
        @cancel="args.onCancel"
        @update:modelValue="args['onUpdate:modelValue']"
      />
    `,
  }),
  play: async ({ canvas, args }) => {
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.type(textarea, '这是一段测试文字');
    // Shift+Enter 在 enter 模式下不应触发 submit
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/**
 * shiftEnter 模式：普通 Enter 仅换行不提交，Shift+Enter 才提交。
 */
export const ShiftEnterMode: Story = {
  args: { onSubmit: fn(), submitType: 'shiftEnter' },
  render: (args) => ({
    components: { Sender },
    setup: () => ({ args }),
    template: `
      <Sender
        v-bind="args"
        @submit="args.onSubmit"
        @cancel="args.onCancel"
        @update:modelValue="args['onUpdate:modelValue']"
      />
    `,
  }),
  play: async ({ canvas, args }) => {
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.type(textarea, '草稿内容');
    // 普通 Enter 在 shiftEnter 模式下仅换行，不提交
    await userEvent.keyboard('{Enter}');
    await expect(args.onSubmit).not.toHaveBeenCalled();
    // Shift+Enter 才触发提交
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await expect(args.onSubmit).toHaveBeenCalledWith('草稿内容');
  },
};

/**
 * 顶部 / 底部扩展区：通过 `#header` slot 放附件预览 / 引用上下文，`#footer` slot 放字数统计 / 提示语。
 * 两个 slot 均为按需渲染（未提供则不占位），输入行的焦点环、自适应高度等行为不受影响。
 */
export const WithHeaderFooter: Story = {
  render: (args) => ({
    components: { Sender },
    setup: () => ({ args }),
    template: `
      <Sender
        v-bind="args"
        @submit="args.onSubmit"
        @cancel="args.onCancel"
        @update:modelValue="args['onUpdate:modelValue']"
      >
        <template #header>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span style="padding:4px 10px;border-radius:8px;background:var(--aix-colorFillTertiary);font-size:13px">📎 设计稿.pdf</span>
            <span style="padding:4px 10px;border-radius:8px;background:var(--aix-colorFillTertiary);font-size:13px">🖼️ 截图.png</span>
          </div>
        </template>
        <template #footer>
          <span style="color:var(--aix-colorTextTertiary);font-size:12px">支持 Markdown · 0/2000</span>
        </template>
      </Sender>
    `,
  }),
  play: async ({ canvas }) => {
    await canvas.findByText(/设计稿\.pdf/);
    await canvas.findByText(/0\/2000/);
  },
};
