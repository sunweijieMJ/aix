/**
 * AiChatShowcase.stories.ts
 *
 * AiChat 全链路 SSE 流式演示：一条自定义协议的 SSE 流串起**所有内容块能力**——
 * reasoning 思维链 → tool_use 工具调用 → sources 引用来源 → text（Markdown 全要素：
 * 标题/表格/行内+块级 KaTeX 公式/mermaid 围栏/```chart 围栏/```html 围栏（HTML Sandbox）/
 * 引用/链接）→ chart 结构化图表块。
 *
 * 原理：AiChat 默认 `streamMode:'sse'`，request 返回 `ReadableStream<Uint8Array>`；
 * 协议层（事件边界/`data:`）由内部 `sseStream` 处理，自定义 `parseChunk` 把每个事件翻译成
 * ParsedChunk：文本增量走 `delta`+`blockType`，结构化块（sources/chart）走 `block` 一次性追加，
 * 工具调用走 `tool` 通道由 useChat 跨事件累积。
 */
import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import { AiChat, sourcesBlock, chartBlock } from '../src';
import type { UseChatOptions, ParsedChunk } from '../src';

const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/场景演示/全能力流式演示',
  component: AiChat,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof AiChat>;

// ============ 回放器：事件数组 → SSE 字节流 ============

function replaySSE(raw: string, signal?: AbortSignal, stepMs = 120): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const events = raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return new ReadableStream<Uint8Array>({
    start(c) {
      let i = 0;
      const finish = () => {
        clearInterval(timer);
        try {
          c.close();
        } catch {
          /* 已关闭则忽略 */
        }
      };
      const timer = setInterval(() => {
        if (signal?.aborted || i >= events.length) {
          finish();
          return;
        }
        c.enqueue(enc.encode(events[i] + '\n\n'));
        i += 1;
      }, stepMs);
      signal?.addEventListener('abort', finish);
    },
  });
}

// ============ 自定义协议解析：事件 → ParsedChunk ============

/**
 * 演示用扁平协议（一个事件一种能力）：
 * `{t:'reasoning'|'text', d}` 文本增量；`{t:'sources', items}` / `{t:'chart', kind, spec, opts}` 结构化块；
 * `{t:'tool', tool}` 工具增量。结构化块经 helper 生成稳定 id 后走 `block` 一次性追加。
 */
const showcaseParseChunk = (chunk: { data?: string; event?: string }): ParsedChunk => {
  const data = chunk.data;
  if (!data) return {};
  if (data === '[DONE]') return { done: true };
  let ev: {
    t: string;
    d?: string;
    items?: Parameters<typeof sourcesBlock>[0];
    kind?: Parameters<typeof chartBlock>[0];
    spec?: unknown;
    opts?: Parameters<typeof chartBlock>[2];
    tool?: ParsedChunk['tool'];
  };
  try {
    ev = JSON.parse(data);
  } catch {
    return { delta: data };
  }
  switch (ev.t) {
    case 'reasoning':
      return { delta: ev.d ?? '', blockType: 'reasoning' };
    case 'text':
      return { delta: ev.d ?? '', blockType: 'text' };
    case 'sources':
      return { block: sourcesBlock(ev.items ?? []) };
    case 'chart':
      return { block: chartBlock(ev.kind ?? 'bar', ev.spec, ev.opts) };
    case 'tool':
      return ev.tool ? { tool: ev.tool } : {};
    default:
      return {};
  }
};

// ============ 演示数据 ============

const ev = (obj: unknown) => `data: ${JSON.stringify(obj)}`;
const slice = (text: string, size = 8): string[] => {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
};

const REASONING =
  '用户想要一份梵高《向日葵》的分析报告。先拆解结构：核心结论 → 关键数据表 → 色彩公式 → ' +
  '创作流程图 → 趋势曲线 → 引用来源。检索一次资料确认年份与藏馆，再组织正文。';

const MARKDOWN = `## 梵高《向日葵》分析报告

**核心结论**：该系列创作于阿尔勒时期，是后印象派的巅峰之作。

### 关键数据

| 版本 | 年份 | 藏馆 |
| --- | --- | --- |
| 第四版 | 1888 | 伦敦国家美术馆 |
| 第五版 | 1889 | 阿姆斯特丹梵高博物馆 |

### 色彩公式

饱和度近似 $S = \\frac{max - min}{max}$，整体明度：

$$L = 0.299R + 0.587G + 0.114B$$

### 创作流程

\`\`\`mermaid
graph LR
  A[构思] --> B[起稿] --> C[铺色] --> D[完成]
\`\`\`

### 产量趋势（围栏图表）

\`\`\`chart
{"xAxis":{"type":"category","data":["1887","1888","1889"]},"yAxis":{"type":"value"},"series":[{"type":"line","data":[2,7,4],"smooth":true}]}
\`\`\`

### 互动卡片（HTML Sandbox）

\`\`\`html
<div style="padding:12px;border:1px solid #ddd;border-radius:8px;font-family:sans-serif;">
  <p style="margin:0 0 8px;">向日葵系列共存世 7 幅，点击查看藏馆彩蛋：</p>
  <button onclick="this.textContent='阿姆斯特丹梵高博物馆 🌻'">查看藏馆</button>
</div>
\`\`\`

> 「我想用向日葵装饰我的画室。」——梵高

参考 [梵高博物馆](https://www.vangoghmuseum.nl)。`;

const SOURCES = [
  {
    title: '梵高《向日葵》- 维基百科',
    url: 'https://zh.wikipedia.org/wiki/向日葵',
    snippet: '《向日葵》是荷兰画家文森特·梵高于 1888—1889 年间创作的一系列静物油画。',
    icon: '🌻',
  },
  { title: '阿尔勒时期的创作高峰', url: 'https://www.vangoghmuseum.nl' },
];

const CHART_SPEC = {
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [
    {
      type: 'pie',
      radius: '60%',
      data: [
        { value: 4, name: '第四版' },
        { value: 3, name: '第五版' },
        { value: 5, name: '习作' },
      ],
    },
  ],
};

/** 全能力流式序列：reasoning → tool_use（含参数流式与结果）→ sources → text(Markdown) → chart 结构化块 */
const SHOWCASE_SSE = [
  ...slice(REASONING, 14).map((d) => ev({ t: 'reasoning', d })),
  // tool_use：input-streaming → 参数增量 → input-available → output-available
  ev({ t: 'tool', tool: { index: 0, toolCallId: 'call_1', toolName: 'search_web' } }),
  ev({ t: 'tool', tool: { index: 0, argsTextDelta: '{"query":"梵高 向日葵 年份 藏馆"}' } }),
  ev({ t: 'tool', tool: { index: 0, argsDone: true } }),
  ev({ t: 'tool', tool: { index: 0, output: { hits: 2, top: '维基百科' } } }),
  ev({ t: 'sources', items: SOURCES }),
  ...slice(MARKDOWN, 10).map((d) => ev({ t: 'text', d })),
  ev({ t: 'chart', kind: 'pie', spec: CHART_SPEC, opts: { title: '各版本产量占比' } }),
  '[DONE]',
].join('\n\n');

// ============ Story ============

/**
 * 发送任意消息触发回放：一条 SSE 流依次流式呈现思维链、工具调用、引用来源、
 * Markdown 全要素正文（含 KaTeX / mermaid / ```chart 围栏 / ```html 围栏 HTML Sandbox）、
 * 以及结构化图表块。回放节奏可调（ms/chunk）。
 */
export const AllCapabilities: Story = {
  render: () => ({
    components: { AiChat },
    setup() {
      const stepMs = ref(80);
      const request: UseChatOptions['request'] = ({ signal }) =>
        Promise.resolve(replaySSE(SHOWCASE_SSE, signal, stepMs.value));
      return { request, showcaseParseChunk, stepMs };
    },
    template: `
      <div style="display:flex;flex-direction:column;height:100vh;background:var(--aix-colorBgLayout);">
        <div style="flex:none;padding:8px 16px;font-size:13px;color:var(--aix-colorTextSecondary);border-bottom:1px solid var(--aix-colorBorderSecondary);">
          全能力流式演示：发送任意消息，观察 reasoning → tool_use → sources → Markdown（KaTeX/mermaid/chart/html Sandbox 围栏）→ 结构化图表块 依次流式呈现。
          回放间隔 <input v-model.number="stepMs" type="number" min="0" step="20" style="width:72px;" /> ms/chunk
        </div>
        <div style="flex:1;min-height:0;">
          <AiChat
            :request="request"
            :parse-chunk="showcaseParseChunk"
            :typing="true"
            allow-html
            welcome-title="全能力流式演示"
            welcome-description="发送任意消息，一条 SSE 流串起思维链 / 工具调用 / 引用 / Markdown 全要素 / HTML Sandbox / 图表"
            placeholder="随便输入点什么，触发全能力回放…"
          />
        </div>
      </div>
    `,
  }),
};
