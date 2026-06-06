import type { Meta, StoryObj } from '@storybook/vue3';
import { fn, expect, userEvent, waitFor } from 'storybook/test';
import { ref } from 'vue';
import { Sender, ModelSelector } from '../src';
import type { VoiceRecognizer } from '../src';

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

// ──────────────────────────────────────────────
// WithAttachments mock 上传实现（带进度 + 可控失败）
// ──────────────────────────────────────────────

const mockUpload = async (
  file: File,
  ctx: { onProgress: (p: number) => void; signal: AbortSignal },
) => {
  for (let p = 0; p <= 100; p += 20) {
    if (ctx.signal.aborted) throw new DOMException('aborted', 'AbortError');
    ctx.onProgress(p);
    await new Promise((r) => setTimeout(r, 120));
  }
  if (file.name.includes('fail')) throw new Error('mock 上传失败');
  return {
    name: file.name,
    size: file.size,
    mime: file.type,
    url: `https://example.com/f/${file.name}`,
  };
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
    await canvas.findByText('点击或拖拽文件到此区域上传');
  },
};

// ──────────────────────────────────────────────
// WithVoice mock 识别器（定时吐字，浏览器/测试两态皆可跑）
// ──────────────────────────────────────────────

const mockRecognizer: VoiceRecognizer = (ctx) => {
  const words = ['帮我', '帮我总结', '帮我总结这份报告'];
  let i = 0;
  const timer = setInterval(() => {
    const w = words[i];
    if (w == null) {
      clearInterval(timer);
      ctx.onResult(words[words.length - 1]!, true);
      ctx.onEnd();
      return;
    }
    ctx.onResult(w, false);
    i++;
  }, 600);
  return {
    stop: () => {
      clearInterval(timer);
      ctx.onEnd();
    },
  };
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

// ──────────────────────────────────────────────
// ModelSelector story（组合演示，嵌入 Sender toolbar slot）
// ──────────────────────────────────────────────

const MODEL_OPTIONS = [{ value: 'Qwen3-Max' }, { value: 'DeepSeek-V3' }, { value: 'GPT-4o' }];

/**
 * WithModelSelector：Sender toolbar slot 挂 ModelSelector，v-model 双向绑定模型值。
 * play：展开下拉 → 选择另一模型 → 断言顶部显示的当前模型值已更新。
 */
export const WithModelSelector: Story = {
  render: () => ({
    components: { Sender, ModelSelector },
    setup: () => {
      const selectedModel = ref('Qwen3-Max');
      return {
        selectedModel,
        options: MODEL_OPTIONS,
      };
    },
    template: `
      <div style="padding:16px">
        <div style="margin-bottom:8px;font-size:13px;color:var(--aix-colorTextSecondary)">
          当前模型：{{ selectedModel }}
        </div>
        <Sender placeholder="输入消息…">
          <template #toolbar>
            <ModelSelector
              :options="options"
              v-model="selectedModel"
              placement="bottom"
            />
          </template>
        </Sender>
      </div>
    `,
  }),
  play: async ({ canvas, canvasElement }) => {
    // 初始态：toolbar 中显示当前模型名
    await canvas.findByText('Qwen3-Max');

    // 点击 ModelSelector 展开下拉
    const trigger = canvas.getByText('Qwen3-Max');
    await userEvent.click(trigger);

    // 下拉菜单可能通过 teleport 渲染到 document.body，用 body 范围查询
    const body = canvasElement.ownerDocument.body;
    await waitFor(
      () => {
        const opt = Array.from(body.querySelectorAll('*')).find(
          (el) =>
            el.textContent?.trim() === 'DeepSeek-V3' && (el as HTMLElement).offsetParent !== null,
        );
        if (!opt) throw new Error('DeepSeek-V3 选项未出现');
        return opt as HTMLElement;
      },
      { timeout: 3000 },
    );

    // 重新查询后点击（虚拟列表 / teleport 教训：click 前重新 find）
    const opt = await waitFor(
      () => {
        const el = Array.from(body.querySelectorAll('*')).find(
          (e) =>
            e.textContent?.trim() === 'DeepSeek-V3' && (e as HTMLElement).offsetParent !== null,
        ) as HTMLElement | undefined;
        if (!el) throw new Error('DeepSeek-V3 选项未出现');
        return el;
      },
      { timeout: 3000 },
    );
    await userEvent.click(opt, { pointerEventsCheck: 0 });

    // 断言：当前值显示区域更新为 DeepSeek-V3
    await canvas.findByText('DeepSeek-V3', undefined, { timeout: 3000 });
  },
};
