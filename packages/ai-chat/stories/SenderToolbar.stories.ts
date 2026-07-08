import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { computed, ref } from 'vue';
import { Sender, ModelSelector } from '../src';
import { mockRecognizer, MODEL_OPTIONS } from './fixtures/senderMocks';

const meta: Meta<typeof Sender> = {
  title: 'AI Chat/组件/Sender 工具栏',
  tags: ['autodocs'],
  component: Sender,
};
export default meta;
type Story = StoryObj<typeof Sender>;

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

    // 下拉菜单可能通过 teleport 渲染到 document.body，用 body 范围查询。
    // waitFor 本身就是轮询等待出现，等待与点击之间无其他操作，单次查询后直接点击即可
    const body = canvasElement.ownerDocument.body;
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

/**
 * ToolbarScopedActions：toolbar 作用域插槽回传 `{ send, cancel, clear, loading, disabled, value }`，
 * 业务可在官方发送键旁加自定义按钮并复用受控逻辑——此例放一个「联网」开关 + 自定义发送/清空按钮。
 * play：输入文本 → 点自定义发送按钮 → 断言触发 submit。
 */
export const ToolbarScopedActions: Story = {
  render: () => ({
    components: { Sender },
    setup: () => {
      const web = ref(false);
      const sent = ref('');
      return { web, sent };
    },
    template: `
      <div style="padding:16px">
        <div style="margin-bottom:8px;font-size:13px;color:var(--aix-colorTextSecondary)">
          联网：{{ web ? '开' : '关' }} / 最近发送：{{ sent || '—' }}
        </div>
        <Sender placeholder="输入后点工具栏的「发送」…" @submit="(t) => (sent = t)">
          <template #toolbar="{ send, clear, loading, value }">
            <button type="button" :data-on="web" @click="web = !web">🌐 联网</button>
            <span style="flex:1"></span>
            <button type="button" class="scoped-clear" :disabled="!value" @click="clear">清空</button>
            <button type="button" class="scoped-send" :disabled="loading || !value" @click="send">
              发送
            </button>
          </template>
        </Sender>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.type(textarea, '你好');
    await userEvent.click(canvas.getByText('发送'));
    await waitFor(() => expect(canvas.getByText(/最近发送：你好/)).toBeTruthy(), { timeout: 5000 });
  },
};

/**
 * ToolbarItemsMixed：toolbarItems 内置 'voice'/'attach' 与自定义组件（真实的 ModelSelector 下拉选择器）混排，
 * 顺序即渲染顺序；ModelSelector 的 v-model 通过 item.props 的 modelValue + 'onUpdate:modelValue' 手动接线
 * （toolbarItems 整体是 computed，selectedModel 变化会重新生成带最新 modelValue 的数组）。
 * 发送键固定在工具栏行最右（与工具项同行），未显式插入 'spacer' 时自动补在发送键前。
 * play：展开下拉 → 选择另一模型 → 断言当前模型值更新；并断言发送键始终是该行最后一个子节点。
 */
export const ToolbarItemsMixed: Story = {
  render: () => ({
    components: { Sender, ModelSelector },
    setup: () => {
      const selectedModel = ref('Qwen3-Max');
      const toolbarItems = computed(() => [
        'voice',
        {
          key: 'model',
          component: ModelSelector,
          props: {
            options: MODEL_OPTIONS,
            modelValue: selectedModel.value,
            'onUpdate:modelValue': (v: string) => (selectedModel.value = v),
            placement: 'bottom',
          },
        },
        'attach',
      ]);
      return {
        toolbarItems,
        attachments: { upload: async (f: File) => ({ name: f.name, url: `/f/${f.name}` }) },
        voice: { recognizer: mockRecognizer },
      };
    },
    template: `
      <Sender
        placeholder="输入消息…"
        :toolbar-items="toolbarItems"
        :attachments="attachments"
        :voice="voice"
      />
    `,
  }),
  play: async ({ canvasElement, canvas }) => {
    const toolbar = canvasElement.querySelector('.aix-sender__toolbar') as HTMLElement;
    await waitFor(() => expect(toolbar.children.length).toBeGreaterThan(0), { timeout: 3000 });
    expect((toolbar.children[1] as HTMLElement).classList.contains('aix-model-selector')).toBe(
      true,
    );
    expect(
      toolbar.children[toolbar.children.length - 1]!.classList.contains('aix-sender__send'),
    ).toBe(true);

    // 展开下拉、选另一个模型，证明自定义工具项能真的响应交互（而不是静态展示）
    await canvas.findByText('Qwen3-Max');
    await userEvent.click(canvas.getByText('Qwen3-Max'));
    const body = canvasElement.ownerDocument.body;
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
    await canvas.findByText('DeepSeek-V3', undefined, { timeout: 3000 });
  },
};

/**
 * ToolbarItemsSpacer：显式插入内置 'spacer' 占位符，把工具栏行切分成左右两组——
 * spacer 之前的项靠左，之后的项（含发送键）被推到最右。
 * play：断言语音按钮在左侧分组、ModelSelector 与发送键在右侧分组（均在 spacer 之后）。
 */
export const ToolbarItemsSpacer: Story = {
  render: () => ({
    components: { Sender, ModelSelector },
    setup: () => {
      const selectedModel = ref('Qwen3-Max');
      const toolbarItems = computed(() => [
        'voice',
        'spacer',
        {
          key: 'model',
          component: ModelSelector,
          props: {
            options: MODEL_OPTIONS,
            modelValue: selectedModel.value,
            'onUpdate:modelValue': (v: string) => (selectedModel.value = v),
            placement: 'bottom',
          },
        },
      ]);
      return { toolbarItems, voice: { recognizer: mockRecognizer } };
    },
    template: `
      <Sender placeholder="输入消息…" :toolbar-items="toolbarItems" :voice="voice" />
    `,
  }),
  play: async ({ canvasElement }) => {
    const toolbar = canvasElement.querySelector('.aix-sender__toolbar') as HTMLElement;
    await waitFor(() => expect(toolbar.children.length).toBe(4), { timeout: 3000 });
    // 顺序：voice(左) → spacer(切分点) → ModelSelector(右) → send(右)
    expect((toolbar.children[0] as HTMLElement).getAttribute('aria-label')).toBe('语音输入');
    expect(
      (toolbar.children[1] as HTMLElement).classList.contains('aix-sender__toolbar-spacer'),
    ).toBe(true);
    expect((toolbar.children[2] as HTMLElement).classList.contains('aix-model-selector')).toBe(
      true,
    );
    expect((toolbar.children[3] as HTMLElement).classList.contains('aix-sender__send')).toBe(true);
  },
};
