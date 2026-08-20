import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, waitFor } from 'storybook/test';
import { defineComponent, h, ref, onMounted, onUnmounted } from 'vue';
import { Bubble, textBlock } from '../src';
import type { ContentBlock } from '../src';

/**
 * 末尾静默呼吸（tailBreathing）
 * ============================
 *
 * 流式输出并非匀速：模型在调工具、思考、等上游时会出现明显停顿。此时气泡既没有新字，
 * 也还没收尾，用户无法区分「还在生成」与「已经说完」。开启 `tailBreathing` 后，
 * 内容静默超过阈值（默认 3000ms）时，末块文字做明暗呼吸，暗示「仍在进行」。
 *
 * 【判定为什么在气泡层而不在块内】
 * 一条消息是 `ContentBlock[]`，典型形态 `[text, tool_use, text]`。若让各块自行判断
 * 「我静默了吗」，那么工具开始流式后，**前面那个文本块**就不再增长，会被误判为静默而
 * 开始呼吸——呼吸出现在中间，真正在输出的末块反而没有。
 *
 * 所以判定放在 `Bubble` 层：它持有完整 `content`，指纹（块数 + 文本总长 + 工具贡献）
 * 覆盖全部块，任一维度增长都算「还在长」；末块则由 CSS 后代选择器命中，纯样式无 DOM 操作。
 * 下方「工具穿插」一栏就是这个场景的对照演示。
 *
 * 动画尊重系统的 `prefers-reduced-motion: reduce` 设置，开启后自动关闭。
 */

const meta: Meta<typeof Bubble> = {
  title: 'AI Chat/TailBreathing',
  component: Bubble,
  parameters: {
    docs: { description: { component: '流式输出停顿时的末尾呼吸提示' } },
  },
};
export default meta;

/** 工具块（模拟流式拼参） */
function toolBlock(argsText: string): ContentBlock {
  return {
    id: 'tool-1',
    type: 'tool_use',
    toolCallId: 'call_1',
    toolName: 'search',
    state: 'input-streaming',
    argsText,
  };
}

/**
 * 基础演示：先逐字输出，随后停止推送 → 约 1s 后末行进入呼吸。
 * 阈值调小到 1000ms 便于观察（默认 3000ms）。
 */
export const Basic: StoryObj = {
  render: () =>
    defineComponent({
      setup() {
        const content = ref<ContentBlock[]>([textBlock('正在为你检索资料')]);
        let timer: ReturnType<typeof setInterval> | null = null;

        onMounted(() => {
          const tail = '，请稍候……';
          let i = 0;
          timer = setInterval(() => {
            if (i >= tail.length) {
              // 推送结束但消息不收尾（status 仍为 updating）→ 进入静默呼吸
              if (timer) clearInterval(timer);
              return;
            }
            content.value = [textBlock(`正在为你检索资料${tail.slice(0, ++i)}`)];
          }, 120);
        });
        onUnmounted(() => timer && clearInterval(timer));

        return () =>
          h('div', { style: 'padding:16px;max-width:640px' }, [
            h(Bubble, {
              content: content.value,
              status: 'updating',
              tailBreathing: { idleMs: 1000 },
            }),
          ]);
      },
    }),
  play: async ({ canvasElement }) => {
    const bubble = canvasElement.querySelector('.aix-bubble__content');
    await waitFor(() => expect(bubble).toBeTruthy());
    // 推送期间不应呼吸
    await expect(bubble!.classList.contains('is-tail-idle')).toBe(false);
    // 推送停止后进入呼吸
    await waitFor(() => expect(bubble!.classList.contains('is-tail-idle')).toBe(true), {
      timeout: 5000,
    });
  },
};

/**
 * 工具穿插对照：文本块早已停止增长，但工具参数仍在流式拼接。
 * 整条消息仍在增长 → 不呼吸；工具也停下后才进入呼吸。
 * 这是「判定必须在气泡层」的核心场景。
 */
export const WithToolInterleaved: StoryObj = {
  render: () =>
    defineComponent({
      setup() {
        const content = ref<ContentBlock[]>([textBlock('我来查一下最新数据'), toolBlock('{"q":')]);
        let timer: ReturnType<typeof setInterval> | null = null;

        onMounted(() => {
          let i = 0;
          timer = setInterval(() => {
            if (i >= 12) {
              if (timer) clearInterval(timer);
              return;
            }
            i++;
            // 只有工具参数在长，文本块保持不变
            content.value = [
              textBlock('我来查一下最新数据'),
              toolBlock(`{"q":"${'季度营收'.repeat(Math.ceil(i / 4)).slice(0, i)}`),
            ];
          }, 300);
        });
        onUnmounted(() => timer && clearInterval(timer));

        return () =>
          h('div', { style: 'padding:16px;max-width:640px' }, [
            h(Bubble, {
              content: content.value,
              status: 'updating',
              tailBreathing: { idleMs: 1000 },
            }),
          ]);
      },
    }),
  play: async ({ canvasElement }) => {
    const bubble = canvasElement.querySelector('.aix-bubble__content');
    await waitFor(() => expect(bubble).toBeTruthy());
    // 工具拼参期间：文本块不动，但整条仍在增长 → 不呼吸
    await new Promise((r) => setTimeout(r, 1600));
    await expect(bubble!.classList.contains('is-tail-idle')).toBe(false);
    // 工具停下后 → 呼吸
    await waitFor(() => expect(bubble!.classList.contains('is-tail-idle')).toBe(true), {
      timeout: 6000,
    });
  },
};

/** 消息收尾（success）：不呼吸，避免已完成的消息一直闪 */
export const NotBreathingWhenDone: StoryObj = {
  render: () => ({
    components: { Bubble },
    template: `
      <div style="padding:16px;max-width:640px">
        <Bubble
          :content="content"
          status="success"
          :tail-breathing="{ idleMs: 500 }"
        />
      </div>
    `,
    setup: () => ({ content: [textBlock('这条已经生成完毕，不应呼吸。')] }),
  }),
  play: async ({ canvasElement }) => {
    const bubble = canvasElement.querySelector('.aix-bubble__content');
    await waitFor(() => expect(bubble).toBeTruthy());
    await new Promise((r) => setTimeout(r, 1200));
    await expect(bubble!.classList.contains('is-tail-idle')).toBe(false);
  },
};

/** 默认关闭：不传 tailBreathing 时行为完全不变 */
export const DisabledByDefault: StoryObj = {
  render: () => ({
    components: { Bubble },
    template: `
      <div style="padding:16px;max-width:640px">
        <Bubble :content="content" status="updating" />
      </div>
    `,
    setup: () => ({ content: [textBlock('未开启 tailBreathing，静默也不会呼吸。')] }),
  }),
  play: async ({ canvasElement }) => {
    const bubble = canvasElement.querySelector('.aix-bubble__content');
    await waitFor(() => expect(bubble).toBeTruthy());
    await new Promise((r) => setTimeout(r, 1200));
    await expect(bubble!.classList.contains('is-tail-idle')).toBe(false);
  },
};
