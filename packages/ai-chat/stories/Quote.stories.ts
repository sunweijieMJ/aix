import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import { AiChat } from '../src';
import type { ChatMessage } from '../src/types';

/** 简易流式应答：把收到的最后一条 user 消息内容回显（含拍平后的 blockquote，便于观察注入效果） */
function echoStream(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  });
}

const HISTORY: ChatMessage[] = [
  {
    id: 'ai-1',
    role: 'ai',
    status: 'success',
    content: [
      {
        id: 'b1',
        type: 'text',
        text: '快速排序的**平均时间复杂度**是 `O(n log n)`，最坏情况会退化到 O(n²)。选取随机基准可以有效规避最坏情况。',
      },
    ],
  },
];

const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/场景演示/划词引用',
  tags: ['autodocs'],
  component: AiChat,
  render: (args) => ({
    components: { AiChat },
    setup: () => ({ args }),
    template: `<div style="height: 480px"><AiChat v-bind="args" /></div>`,
  }),
  args: {
    quote: true,
    defaultMessages: HISTORY,
    request: async (ctx: { messages: ChatMessage[] }) => {
      const last = ctx.messages.at(-1)!;
      const text = last.content
        .map((b) => ('text' in b ? b.text : ''))
        .filter(Boolean)
        .join('\n\n');
      return echoStream(`收到（引用已拍平进上文）：\n\n${text}`);
    },
  },
};

export default meta;
type Story = StoryObj<typeof AiChat>;

/** PC 拖选出工具条：解释/追问/翻译/复制 */
export const PCSelection: Story = {
  play: async ({ canvasElement }) => {
    const target = await waitFor(() => {
      const el = canvasElement.querySelector('[data-aix-block-id]');
      if (!el) throw new Error('等待气泡渲染');
      return el;
    });
    // 程序化选中首个"足长"文本节点前 6 个字符并触发 selectionchange（模拟拖选收尾）。
    // 两个坑：① 不能用 target.firstChild——引擎就绪后块容器以注释节点开头、正文包在 <p> 里，
    // 对注释建 range 得到空选区；② 必须先等 Markdown 引擎就绪（<strong> 出现）再选——
    // 冷启动 runner 里若选中降级态纯文本节点，引擎就绪重渲染会把节点换掉、选区塌缩为 collapsed
    await waitFor(() => expect(target.querySelector('strong')).toBeInTheDocument(), {
      timeout: 5000,
    });
    const textNode = await waitFor(() => {
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if ((node.textContent ?? '').trim().length >= 6) return node;
      }
      throw new Error('等待正文文本节点渲染');
    });
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 6);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    // 完整按压序列：L1 以 pointerdown 建立 pressTarget 按压上下文，仅发 pointerup 会被忽略
    target.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', isPrimary: true }),
    );
    target.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', isPrimary: true }),
    );
    document.dispatchEvent(new Event('selectionchange'));
    // 冷启动 runner 下 L1 防抖读取 + 渲染可超过 waitFor 默认 1s，显式放宽
    await waitFor(() => expect(document.querySelector('.aix-quote-toolbar')).toBeInTheDocument(), {
      timeout: 5000,
    });
    // 点「解释」→ chip 出现
    await userEvent.click(document.querySelector<HTMLButtonElement>('.aix-quote-toolbar button')!);
    await waitFor(
      () => expect(canvasElement.querySelector('.aix-quote-chip')).toBeInTheDocument(),
      { timeout: 3000 },
    );
  },
};

/** PC 操作栏整条引用 → chip → 发送 → user 消息内 QuoteBlock 展示 */
export const WholeMessageQuote: Story = {
  play: async ({ canvas, canvasElement }) => {
    const quoteBtn = await canvas.findByRole('button', { name: '引用' });
    // virtua 滚动期间会给虚拟列表容器挂 pointer-events: none（防 hover 抖动），而 AiChat 挂载后
    // 会自动滚到底——按钮此时虽已在 DOM 里却不可交互，userEvent 会直接抛
    // 「element has pointer-events: none」。等滚动停歇（pointer-events 复位）再点。
    await waitFor(() => expect(getComputedStyle(quoteBtn).pointerEvents).not.toBe('none'));
    await userEvent.click(quoteBtn);
    await waitFor(() => expect(canvasElement.querySelector('.aix-quote-chip')).toBeInTheDocument());
    await userEvent.type(canvas.getByRole('textbox'), '请再展开讲讲{enter}');
    await waitFor(() =>
      expect(canvasElement.querySelector('.aix-quote-block')).toBeInTheDocument(),
    );
  },
};

/**
 * 移动端长按完整链路：单指长按 → QuoteSheet 浮出 → 点选「解释」→ chip 出现且 sheet 收起。
 * `quote.longPressDelay` 缩短为 300ms 仅为缩短演示等待时间，链路与默认 500ms 完全一致（配置真实生效）。
 *
 * 注：仓库 .storybook/main.ts 未注册 @storybook/addon-viewport（仅 addon-links/addon-docs/addon-vitest），
 * 故不加 `parameters.viewport`。建议在浏览器开发者工具切到设备模拟（移动视口）下查看/回放本 story，
 * 触摸手势本身与视口尺寸无关，不影响 play 函数的断言有效性。
 */
export const MobileLongPress: Story = {
  args: {
    quote: { longPressDelay: 300 },
  },
  play: async ({ canvasElement }) => {
    const target = await waitFor(() => {
      const el = canvasElement.querySelector<HTMLElement>('[data-aix-block-id]');
      if (!el) throw new Error('等待气泡渲染');
      return el;
    });

    // 与 PCSelection 同一条前置：必须先等 Markdown 引擎就绪（<strong> 出现）再长按。
    // 引擎就绪那次重渲染才让 useTextSelection 的 root（BubbleList 滚动容器）落定并完成
    // touchstart/touchmove/touchend 装配；在此之前派发 touchstart 无人接听，长按计时器
    // 根本不会起，QuoteSheet 永远不出现。
    await waitFor(() => expect(target.querySelector('strong')).toBeInTheDocument(), {
      timeout: 5000,
    });

    // 模拟单指长按：优先用真实 TouchEvent/Touch 构造（Chromium 内核浏览器支持），
    // 不支持时降级为普通 Event + 手动挂 touches 属性（与 useTextSelection 单测同法），
    // useTextSelection 只读取 e.touches[0].clientX/clientY，两条路径对其而言等价。
    const dispatchTouch = (type: string, clientX = 20, clientY = 20) => {
      if (typeof TouchEvent !== 'undefined' && typeof Touch !== 'undefined') {
        const touch = new Touch({ identifier: 0, target, clientX, clientY });
        target.dispatchEvent(
          new TouchEvent(type, { bubbles: true, cancelable: true, touches: [touch] }),
        );
      } else {
        const e = new Event(type, { bubbles: true, cancelable: true }) as Event & {
          touches: { clientX: number; clientY: number }[];
        };
        Object.defineProperty(e, 'touches', { value: [{ clientX, clientY }] });
        target.dispatchEvent(e);
      }
    };

    // 单指按下 → 等 300ms 长按计时 → QuoteSheet 浮出（Teleport 到 body，不在 canvasElement 内）。
    //
    // 按下动作放进 waitFor 里重试，而不是「按一次 + 等结果」：useTextSelection 的触摸监听装在
    // quoteRoot（= BubbleList 滚动容器）上，而 quoteRoot 是个读 `bubbleListRef.scrollElement()`
    // 的 computed——气泡出现那一刻它可能还没落定，此时派发的 touchstart 无人接听，长按计时器
    // 根本不会起。装配完成没有任何 DOM 可观测信号，且同一个页面连跑多个 story 时（本文件 4 个）
    // 落定更慢，故改为「按不动就再按」——长按本身幂等，重复派发只是重置那 300ms 计时器。
    // interval 必须大于 longPressDelay，否则每次轮询都把计时器重置掉、永远等不到 sheet。
    await waitFor(
      () => {
        dispatchTouch('touchstart');
        expect(document.querySelector('.aix-quote-sheet')).toBeInTheDocument();
      },
      { timeout: 8000, interval: 500 },
    );

    // 点 sheet 里的「解释」→ chip 出现在 Sender header，菜单关闭
    await userEvent.click(screen.getByRole('menuitem', { name: '解释' }));
    await waitFor(() => {
      expect(canvasElement.querySelector('.aix-quote-chip')).toBeInTheDocument();
      expect(document.querySelector('.aix-quote-sheet')).not.toBeInTheDocument();
    });
  },
};

/** 显式关闭划词（quote=false）的对照 */
export const Disabled: Story = {
  args: { quote: false },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: '引用' })).not.toBeInTheDocument();
  },
};
