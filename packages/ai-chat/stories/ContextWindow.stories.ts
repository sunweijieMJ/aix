import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { ref } from 'vue';
import { ContextWindow, Sender } from '../src';

/**
 * 上下文用量条（ContextWindow）
 * ============================
 *
 * 长会话里用户无法感知「上下文还剩多少」，直到模型开始遗忘前文才发现。本组件把用量
 * 显式呈现出来：触发器常驻显示 `已用/总量`，展开后给出进度条与百分比。
 *
 * 【纯受控，组件库不发请求】
 * `used` / `total` 全部由宿主经 props 注入，「压缩当前会话」只 `emit('compress')`，
 * 压缩请求与结果回写都由宿主负责。组件对协议与后端形态零假设。
 *
 * 【挂载方式】
 * 不需要改 `Sender`——它的 `toolbarItems` 已支持内置项与自定义组件混排，
 * 直接作为一个 `ToolbarItem` 注入即可（见下方 InSenderToolbar）。
 */

const meta: Meta<typeof ContextWindow> = {
  title: 'AI Chat/ContextWindow',
  component: ContextWindow,
  parameters: {
    docs: { description: { component: '上下文窗口用量展示（纯受控）' } },
  },
};
export default meta;

/** 基础：点击触发器展开面板 */
export const Basic: StoryObj = {
  render: () => ({
    components: { ContextWindow },
    template: `
      <div style="padding:80px 16px 16px">
        <ContextWindow :used="12000" :total="32000" />
      </div>
    `,
  }),
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLElement>('.aix-context-window__trigger');
    await waitFor(() => expect(trigger).toBeTruthy());
    await expect(trigger!.textContent).toContain('12k/32k');

    await userEvent.click(trigger!);
    await waitFor(() =>
      expect(canvasElement.querySelector('.aix-context-window__panel')).toBeTruthy(),
    );
    const bar = canvasElement.querySelector('[role="progressbar"]');
    await expect(bar!.getAttribute('aria-valuenow')).toBe('38');
  },
};

/** 接近上限：超过 warnRatio（默认 0.8）进入告警配色 */
export const NearLimit: StoryObj = {
  render: () => ({
    components: { ContextWindow },
    template: `
      <div style="padding:80px 16px 16px">
        <ContextWindow :used="29000" :total="32000" />
      </div>
    `,
  }),
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLElement>('.aix-context-window__trigger');
    await waitFor(() => expect(trigger).toBeTruthy());
    await expect(trigger!.classList.contains('is-warn')).toBe(true);
  },
};

/**
 * 带压缩入口：点击后宿主自行处理（这里模拟异步压缩并回写 used）。
 * 组件只负责发出意图与展示 compressing 态。
 */
export const Compressible: StoryObj = {
  render: () => ({
    components: { ContextWindow },
    setup() {
      const used = ref(29000);
      const compressing = ref(false);
      const onCompress = () => {
        compressing.value = true;
        // 宿主侧请求；此处用定时器模拟
        setTimeout(() => {
          used.value = 8000;
          compressing.value = false;
        }, 1200);
      };
      return { used, compressing, onCompress };
    },
    template: `
      <div style="padding:80px 16px 16px">
        <ContextWindow
          :used="used"
          :total="32000"
          compressible
          :compressing="compressing"
          @compress="onCompress"
        />
      </div>
    `,
  }),
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLElement>('.aix-context-window__trigger');
    await waitFor(() => expect(trigger).toBeTruthy());
    await userEvent.click(trigger!);

    const btn = canvasElement.querySelector<HTMLElement>('.aix-context-window__compress');
    await waitFor(() => expect(btn).toBeTruthy());
    await userEvent.click(btn!);

    // 压缩完成后用量下降、告警解除
    await waitFor(() => expect(trigger!.textContent).toContain('8k/32k'), { timeout: 4000 });
    await expect(trigger!.classList.contains('is-warn')).toBe(false);
  },
};

/**
 * 只知比例：后端只回百分比、不回 token 数时只传 `percent`。
 * `total` 为 0 视为窗口总量未知，摘要与用量文案一并退化为纯百分比，不显示无意义的 `0/0`。
 */
export const PercentOnly: StoryObj = {
  render: () => ({
    components: { ContextWindow },
    template: `
      <div style="padding:80px 16px 16px">
        <ContextWindow :percent="0.6" />
      </div>
    `,
  }),
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLElement>('.aix-context-window__trigger');
    await waitFor(() => expect(trigger).toBeTruthy());
    await expect(trigger!.textContent?.trim()).toBe('60%');

    await userEvent.click(trigger!);
    const usage = canvasElement.querySelector<HTMLElement>('.aix-context-window__usage');
    await waitFor(() => expect(usage).toBeTruthy());
    await expect(usage!.textContent).toContain('60%');
    await expect(usage!.textContent).not.toContain('0/0');
    const fill = canvasElement.querySelector<HTMLElement>('.aix-context-window__bar-fill');
    await expect(fill!.style.width).toBe('60%');
  },
};

/** total 未知（0）：占比按 0 处理，不产生 NaN */
export const UnknownTotal: StoryObj = {
  render: () => ({
    components: { ContextWindow },
    template: `
      <div style="padding:80px 16px 16px">
        <ContextWindow :used="1200" :total="0" />
      </div>
    `,
  }),
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLElement>('.aix-context-window__trigger');
    await waitFor(() => expect(trigger).toBeTruthy());
    await userEvent.click(trigger!);
    const fill = canvasElement.querySelector<HTMLElement>('.aix-context-window__bar-fill');
    await waitFor(() => expect(fill).toBeTruthy());
    await expect(fill!.style.width).toBe('0%');
  },
};

/** 集成到 Sender 工具栏：作为 toolbarItems 的自定义项混排，无需改 Sender */
export const InSenderToolbar: StoryObj = {
  render: () => ({
    components: { Sender },
    setup() {
      const text = ref('');
      const toolbarItems = [
        'attach',
        'voice',
        'spacer',
        {
          key: 'context',
          component: ContextWindow,
          props: { used: 12000, total: 32000, compressible: true },
        },
      ];
      return { text, toolbarItems };
    },
    template: `
      <div style="padding:16px;max-width:680px">
        <Sender v-model="text" :toolbar-items="toolbarItems" />
      </div>
    `,
  }),
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector('.aix-context-window__trigger')).toBeTruthy(),
    );
  },
};
