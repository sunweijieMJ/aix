import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { ref } from 'vue';
import type { ChatMessage, OutlineEntry } from '../src';
import { MessageOutline, AiChat } from '../src';
import { textBlock } from '../src';

/**
 * 对话大纲导航（MessageOutline）
 * ============================
 *
 * 长会话滚动久了就失去方位感——想回到「第三个问题」只能凭记忆手动翻。大纲把每次提问
 * 抽成右侧一条刻度，常态只露短横线不遮正文，hover / 聚焦时在侧边浮层展示摘要，点击即定位。
 *
 * 【三层职责分离】
 * - `useMessageOutline`：纯派生。从消息列表筛出提问、生成摘要、按活跃项做滑动窗口裁剪。
 *   长会话下刻度恒定十几条而非全量，避免刻度条本身变成一堵墙。
 * - `useVisibleMessage`：DOM 观测。用 IntersectionObserver 取「视口内最靠下」的消息作为
 *   活跃项；虚拟列表回收行时观察自动失效，无需手动摘除。
 * - `MessageOutline`：纯受控展示。不碰滚动容器、不做观测，点击只 `emit('select')`。
 *
 * 滚动定位由宿主调 `BubbleList.scrollToBubble` 完成。定位期间有 `isNavigating` 闸门
 * 屏蔽观测回写，否则滚动会依次穿过途经消息，高亮先乱跳再落定。
 */

const meta: Meta<typeof MessageOutline> = {
  title: 'AI Chat/MessageOutline',
  component: MessageOutline,
  parameters: {
    docs: { description: { component: '对话大纲导航（提问刻度 + 点击定位）' } },
  },
};
export default meta;

const entries: OutlineEntry[] = [
  { messageId: 'u1', label: 'Vue 3 的组合式 API 有什么优势', ordinal: 1 },
  { messageId: 'u2', label: 'setup 函数和 data 选项的区别', ordinal: 2 },
  { messageId: 'u3', label: '', ordinal: 3 },
  { messageId: 'u4', label: '如何在组合式 API 里做状态共享', ordinal: 4 },
];

/** 受控展示：hover 弹出摘要浮层，点击 emit select */
export const Standalone: StoryObj = {
  render: () => ({
    components: { MessageOutline },
    setup() {
      const activeId = ref('u2');
      const picked = ref<string>('');
      const onSelect = (e: OutlineEntry) => {
        activeId.value = e.messageId;
        picked.value = e.messageId;
      };
      return { entries, activeId, picked, onSelect };
    },
    template: `
      <div style="display:flex;gap:24px;align-items:center;padding:24px">
        <MessageOutline :entries="entries" :active-id="activeId" @select="onSelect" />
        <span style="color:#888;font-size:13px">已选：{{ picked || '（未点击）' }}</span>
      </div>
    `,
  }),
  play: async ({ canvasElement }) => {
    const ticks = canvasElement.querySelectorAll<HTMLElement>('.aix-message-outline__tick');
    await waitFor(() => expect(ticks.length).toBe(4));
    // 第二条为当前活跃
    await expect(ticks[1]!.classList.contains('is-active')).toBe(true);
    // 无文字内容的提问回退到兜底文案。摘要不再内联在轨道里（改由 hover 浮层承载），
    // 故这里改测刻度的无障碍名；浮层本身 Teleport 到 body，要从 document 上取。
    await expect(ticks[2]!.getAttribute('aria-label')).toContain('无文字内容');

    await userEvent.hover(ticks[2]!);
    await waitFor(() =>
      expect(document.querySelector('.aix-message-outline__tip')!.textContent).toContain(
        '无文字内容',
      ),
    );
    await userEvent.unhover(ticks[2]!);
    await waitFor(() => expect(document.querySelector('.aix-message-outline__tip')).toBeNull());

    await userEvent.click(ticks[3]!);
    await waitFor(() => expect(ticks[3]!.classList.contains('is-active')).toBe(true));
  },
};

/** 接入 AiChat：outline 开关一开即用，定位全自动 */
export const InAiChat: StoryObj = {
  render: () => ({
    components: { AiChat },
    setup() {
      const messages: ChatMessage[] = [];
      for (let i = 1; i <= 8; i++) {
        messages.push({
          id: `u${i}`,
          role: 'user',
          status: 'success',
          content: [textBlock(`第 ${i} 个问题：组合式 API 的第 ${i} 个知识点是什么？`)],
        });
        messages.push({
          id: `a${i}`,
          role: 'ai',
          status: 'success',
          content: [textBlock(`这是第 ${i} 个回答。\n\n`.repeat(6))],
        });
      }
      const request = async () => new ReadableStream<Uint8Array>();
      return { messages, request };
    },
    template: `
      <div style="height:520px;border:1px solid #eee;border-radius:8px;overflow:hidden">
        <AiChat :request="request" :messages="messages" outline />
      </div>
    `,
  }),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.aix-message-outline')).toBeTruthy());
    const ticks = canvasElement.querySelectorAll<HTMLElement>('.aix-message-outline__tick');
    await expect(ticks.length).toBe(8);

    // 点击某条刻度后该条成为活跃项（定位闸门保证不被滚动过程抢走）
    await userEvent.click(ticks[5]!);
    await waitFor(() => expect(ticks[5]!.classList.contains('is-active')).toBe(true), {
      timeout: 3000,
    });
  },
};

/** 长会话 + 窗口裁剪：30 轮提问，窗口半径 3 → 只显示 7 条刻度 */
export const WindowedLongChat: StoryObj = {
  render: () => ({
    components: { AiChat },
    setup() {
      const messages: ChatMessage[] = [];
      for (let i = 1; i <= 30; i++) {
        messages.push({
          id: `u${i}`,
          role: 'user',
          status: 'success',
          content: [textBlock(`问题 ${i}`)],
        });
        messages.push({
          id: `a${i}`,
          role: 'ai',
          status: 'success',
          content: [textBlock(`回答 ${i}\n\n`.repeat(4))],
        });
      }
      const request = async () => new ReadableStream<Uint8Array>();
      return { messages, request };
    },
    template: `
      <div style="height:520px;border:1px solid #eee;border-radius:8px;overflow:hidden">
        <AiChat :request="request" :messages="messages" :outline="{ window: 3 }" />
      </div>
    `,
  }),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.aix-message-outline')).toBeTruthy());
    // 半径 3 → 窗口固定 7 条，而非全部 30 条
    const ticks = canvasElement.querySelectorAll('.aix-message-outline__tick');
    await expect(ticks.length).toBe(7);
  },
};

/** 自定义入选规则与摘要：把 AI 回答也纳入大纲 */
export const CustomFilter: StoryObj = {
  render: () => ({
    components: { AiChat },
    setup() {
      const messages: ChatMessage[] = [
        { id: 'u1', role: 'user', status: 'success', content: [textBlock('提问一')] },
        { id: 'a1', role: 'ai', status: 'success', content: [textBlock('回答一')] },
        { id: 'u2', role: 'user', status: 'success', content: [textBlock('提问二')] },
      ];
      const request = async () => new ReadableStream<Uint8Array>();
      const outline = {
        filter: (m: ChatMessage) => m.role === 'user' || m.role === 'ai',
        toLabel: (m: ChatMessage) =>
          `${m.role === 'user' ? '问' : '答'}：${m.content.map((b) => ('text' in b ? b.text : '')).join('')}`,
      };
      return { messages, request, outline };
    },
    template: `
      <div style="height:360px;border:1px solid #eee;border-radius:8px;overflow:hidden">
        <AiChat :request="request" :messages="messages" :outline="outline" />
      </div>
    `,
  }),
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelectorAll('.aix-message-outline__tick').length).toBe(3),
    );
    // 摘要不再内联在轨道里（改由 hover 浮层承载），无障碍名仍带摘要，可据此断言
    const first = canvasElement.querySelector('.aix-message-outline__tick');
    await expect(first!.getAttribute('aria-label')).toContain('问：');
  },
};
