import type { Meta, StoryObj } from '@storybook/vue3';
import { fn, expect, userEvent, waitFor } from 'storybook/test';
import { Sender, useAttachments } from '../src';
import { mockUpload, mockRecognizer } from './fixtures/senderMocks';

const meta: Meta<typeof Sender> = {
  title: 'AI Chat/组件/Sender',
  tags: ['autodocs'],
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
 * WithAttachments：启用附件上传能力（面板式交互）。
 * 点击回形针按钮展开附件面板；面板内点击 placeholder 选文件即可体验上传进度与卡片预览；
 * 文件名含 `fail` 可演示失败重试。文件选择对话框无法在 play 中自动化，上传流程留浏览器手动验证；
 * play 断言：点击回形针 → 面板展开（placeholder 可见）。
 */
export const WithAttachments: Story = {
  args: {
    attachments: { upload: mockUpload, accept: 'image/*,.pdf', maxCount: 5 },
  },
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
    // 回形针按钮（启用附件后出现）
    const attachBtn = await canvas.findByRole('button', { name: '添加附件' });
    await expect(attachBtn).toBeInTheDocument();
    // 点击回形针 → 面板展开，placeholder 文案可见
    await userEvent.click(attachBtn);
    await canvas.findByText('上传文件');
  },
};

/**
 * WithVoice：启用语音输入能力（mock 识别器定时吐字，约 1.8s 后自停）。
 * play 自动：点击麦克风按钮 → 等待 placeholder 变「正在聆听…」→
 * 等待输入框出现最终定稿「帮我总结这份报告」。
 */
export const WithVoice: Story = {
  args: {
    voice: { recognizer: mockRecognizer },
  },
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
    // 点击麦克风按钮启动识别
    const micBtn = await canvas.findByRole('button', { name: '语音输入' });
    await userEvent.click(micBtn);
    // placeholder / aria-label 变为「正在聆听…」表示进入监听态
    await waitFor(
      () => expect(canvas.getByRole('textbox', { name: '正在聆听…' })).toBeInTheDocument(),
      { timeout: 3000 },
    );
    // mock 识别器约 1.8s 后定稿，等待最终文本写入输入框
    await waitFor(() => expect(canvas.getByRole('textbox')).toHaveValue('帮我总结这份报告'), {
      timeout: 5000,
    });
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

/**
 * CustomAttachmentsPanel：用 `#attachments-panel` 作用域插槽整块替换内置附件面板 UI。
 *
 * 关键点是**共用 Sender 内部的 useAttachments 实例**——自绘 UI 只管画界面，发送时的
 * `drain()`、上传中禁发守卫、条目清空后自动收起、根级拖放 / 粘贴入列全部保留。
 * 作用域里的动作句柄也已内建 disabled 守卫，不必自己重做。
 *
 * play 自动：点回形针展开面板 → 断言自定义面板取代了内置面板 → 点自定义按钮触发文件选择。
 */
export const CustomAttachmentsPanel: Story = {
  args: {
    attachments: { upload: mockUpload, accept: 'image/*,.pdf', maxCount: 5 },
  },
  render: (args) => ({
    components: { Sender },
    setup: () => ({ args }),
    template: `
      <Sender v-bind="args" @submit="args.onSubmit" @cancel="args.onCancel">
        <template #attachments-panel="{ items, pick, remove, isUploading, close }">
          <div class="demo-panel">
            <div class="demo-panel__bar">
              <strong>我的上传区</strong>
              <span v-if="isUploading">上传中…</span>
              <button type="button" @click="close()">收起</button>
            </div>
            <button type="button" class="demo-panel__pick" @click="pick()">
              ＋ 选择文件（自定义 UI）
            </button>
            <ul class="demo-panel__list">
              <li v-for="f in items" :key="f.id">
                {{ f.name }} · {{ f.status }}
                <button type="button" @click="remove(f.id)">×</button>
              </li>
            </ul>
          </div>
        </template>
      </Sender>
    `,
  }),
  play: async ({ canvas }) => {
    const attachBtn = await canvas.findByRole('button', { name: '添加附件' });
    await userEvent.click(attachBtn);
    // 自定义面板出现，内置面板文案不再出现
    await canvas.findByText('我的上传区');
    await expect(canvas.queryByText('上传文件')).not.toBeInTheDocument();
    await expect(
      await canvas.findByRole('button', { name: '＋ 选择文件（自定义 UI）' }),
    ).toBeInTheDocument();
  },
};

/**
 * ExternalAttachmentsInstance：`attachments` 直接传**已创建的 useAttachments 实例**，
 * 把附件 UI 放到 Sender 之外（这里是上方的独立工具条）。
 *
 * 宿主与 Sender 共用同一份 items，发送时 Sender 走这份实例 `drain()`，
 * 不会各持一份而分叉；`accept` 亦经实例回显喂给原生文件选择器。
 */
export const ExternalAttachmentsInstance: Story = {
  render: () => ({
    components: { Sender },
    setup: () => {
      const attachments = useAttachments({ upload: mockUpload, accept: 'image/*,.pdf' });
      return { attachments, onSubmit: fn() };
    },
    template: `
      <div>
        <div class="demo-outside">
          <strong>Sender 之外的上传区</strong>
          <span>待发 {{ attachments.items.value.length }} 个</span>
          <button type="button" @click="attachments.clear()">清空</button>
        </div>
        <Sender :attachments="attachments" placeholder="附件面板在上方" @submit="onSubmit" />
      </div>
    `,
  }),
};
