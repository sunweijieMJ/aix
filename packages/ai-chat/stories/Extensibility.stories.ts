import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { defineComponent, h, ref, markRaw } from 'vue';
import { AiChat, MarkdownRenderer, createParseChunk } from '../src';
import type { MarkdownRenderers, MarkdownRendererFn, PromptItem, RoleConfig } from '../src';

/**
 * AiChat 扩展能力示例
 *
 * 这三个 story 演示组件库最核心的三类扩展点，全部内置拟真 mock 后端，
 * 可直接在 Canvas 里点快捷问题或输入消息体验完整链路：
 *
 * 1. **接入自定义协议** —— 用 `createParseChunk` 适配非默认报文结构（自定义字段名 +
 *    reasoning 分流 + 自定义结束信号），换协议只改一个函数。
 * 2. **流式渲染的自定义块** —— 复用内置 `reasoning` 作流式载体（天然支持逐字累积），
 *    用 `blockRenderers` 覆盖其渲染器换成完全自定义的「实时推理卡」UI。
 * 3. **自定义 Markdown 渲染器** —— 用 `markdownRenderers` 覆盖 `fence` 代码块
 *    （带复制按钮）和 `table`（可横向滚动容器），token 级接管渲染。
 */

// ============ 通用 mock 流工具 ============

/** 把文本切成小块，模拟逐字流式 */
function toChunks(text: string, size = 3): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/**
 * 把一组「已序列化的 SSE data 行内容」按节奏流式推送，支持 signal 中断。
 * frames 的每一项是 `data: <这里>` 的 payload 字符串；结束补发 doneSignal 行。
 */
function streamFrames(
  frames: string[],
  signal?: AbortSignal,
  opts: { doneSignal?: string; stepMs?: number } = {},
): ReadableStream<Uint8Array> {
  const { doneSignal = '[DONE]', stepMs = 26 } = opts;
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      let i = 0;
      const finish = () => {
        try {
          c.close();
        } catch {
          /* 已关闭则忽略 */
        }
      };
      const timer = setInterval(() => {
        if (signal?.aborted) {
          clearInterval(timer);
          finish();
          return;
        }
        if (i >= frames.length) {
          c.enqueue(enc.encode(`data: ${doneSignal}\n\n`));
          clearInterval(timer);
          finish();
          return;
        }
        c.enqueue(enc.encode(`data: ${frames[i]}\n\n`));
        i += 1;
      }, stepMs);
      signal?.addEventListener('abort', () => {
        clearInterval(timer);
        finish();
      });
    },
  });
}

/** 角色样式：AI 左 / 用户右 */
const ROLES: Record<string, RoleConfig> = {
  ai: { placement: 'start', variant: 'filled' },
  user: { placement: 'end', variant: 'filled' },
};

// ════════════════════════════════════════════════════════════
// 场景 1：接入自定义协议
// ════════════════════════════════════════════════════════════

/**
 * 自定义协议：`data: {"thinking":"..."}`（思考增量）/ `data: {"text":"..."}`（正文增量），
 * 结束信号是 `data: <END>`（非默认的 [DONE]）。只需一个 createParseChunk 适配。
 */
const customParseChunk = createParseChunk({
  doneSignal: '<END>',
  // 取增量：优先正文，其次思考；都没有则本行无增量
  pickDelta: (json) => {
    const j = json as { text?: string; thinking?: string };
    return j.text ?? j.thinking ?? undefined;
  },
  // 仅 thinking（无 text）→ 归入 reasoning 折叠块；否则 text 正文块
  pickBlockType: (json) => {
    const j = json as { text?: string; thinking?: string };
    return j.thinking && !j.text ? 'reasoning' : 'text';
  },
});

const THINKING =
  '让我先理解一下这个需求：用户想换一套后端协议。关键是字段名和结束信号都变了，但解析接口不用动。';
const ANSWER_1 = [
  '换协议只需替换 `parseChunk`：',
  '',
  '1. 用 `createParseChunk` 传入 `pickDelta` 适配字段名',
  '2. 用 `pickBlockType` 把思考内容分流到 reasoning 块',
  '3. 设 `doneSignal` 匹配后端的结束信号',
  '',
  '`useChat` 的其余流程完全不变。',
].join('\n');

const FRAMES_CUSTOM = [
  ...toChunks(THINKING).map((s) => JSON.stringify({ thinking: s })),
  ...toChunks(ANSWER_1).map((s) => JSON.stringify({ text: s })),
];

const customProtocolRequest = async ({ signal }: { signal: AbortSignal }) =>
  streamFrames(FRAMES_CUSTOM, signal, { doneSignal: '<END>' });

// ════════════════════════════════════════════════════════════
// 场景 2：流式渲染的自定义块（复用 reasoning 载体 + 覆盖渲染器）
// ════════════════════════════════════════════════════════════

/**
 * 自定义「实时推理卡」：覆盖内置 reasoning 块渲染器。
 * block.text 随流式 appendDelta 累积 → 响应式自动重渲，
 * 内部用 MarkdownRenderer 做块级增量渲染（已完成块冻结、新块淡入）。
 * 这是「让自定义 UI 也能真·随流逐字累积」的正解：借 reasoning 的流式能力，套自定义外观。
 */
const LiveThinkingCard = defineComponent({
  name: 'LiveThinkingCard',
  components: { MarkdownRenderer },
  // 块渲染器统一收到的 props：block 必有、info 气泡上下文、typing 打字机态
  props: {
    block: { type: Object, required: true },
    info: { type: Object, default: undefined },
    typing: { type: Boolean, default: false },
  },
  template: `
    <div style="padding:12px 14px;border-radius:10px;background:var(--aix-colorFillTertiary);border:1px solid var(--aix-colorBorderSecondary);">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;color:var(--aix-colorTextSecondary);">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--aix-colorPrimary);"></span>
        实时推理
      </div>
      <MarkdownRenderer :content="block.text" />
    </div>
  `,
});

const THINKING_2 = [
  '收到问题，开始分析…',
  '',
  '- 第一步：定位 `appendDelta` 只支持 text / reasoning 累积',
  '- 第二步：复用 reasoning 作为流式载体',
  '- 第三步：用 blockRenderers 覆盖 reasoning 渲染器',
  '',
  '这样自定义卡片也能逐字累积了。',
].join('\n');
const ANSWER_2 = '\n\n**结论**：自定义块要真·流式，就借内置 reasoning 的流式能力 + 自定义外观。';

const FRAMES_STREAMING_BLOCK = [
  ...toChunks(THINKING_2).map((s) => JSON.stringify({ thinking: s })),
  ...toChunks(ANSWER_2).map((s) => JSON.stringify({ text: s })),
];

// 复用场景 1 的协议（thinking → reasoning），但结束信号用默认 [DONE]
const streamingBlockParseChunk = createParseChunk({
  pickDelta: (json) => {
    const j = json as { text?: string; thinking?: string };
    return j.text ?? j.thinking ?? undefined;
  },
  pickBlockType: (json) => {
    const j = json as { text?: string; thinking?: string };
    return j.thinking && !j.text ? 'reasoning' : 'text';
  },
});

const streamingBlockRequest = async ({ signal }: { signal: AbortSignal }) =>
  streamFrames(FRAMES_STREAMING_BLOCK, signal);

// ════════════════════════════════════════════════════════════
// 场景 3：自定义 Markdown 渲染器
// ════════════════════════════════════════════════════════════

/** 带复制按钮的代码块，覆盖内置 fence 渲染器 */
const CopyableCode = defineComponent({
  name: 'CopyableCode',
  props: {
    code: { type: String, default: '' },
    lang: { type: String, default: '' },
  },
  setup(props) {
    const copied = ref(false);
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(props.code);
        copied.value = true;
        setTimeout(() => (copied.value = false), 1500);
      } catch {
        /* 演示环境无剪贴板权限则忽略 */
      }
    };
    return { copied, copy };
  },
  template: `
    <div style="margin:8px 0;border-radius:8px;overflow:hidden;border:1px solid var(--aix-colorBorderSecondary);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--aix-colorFillTertiary);font-size:12px;color:var(--aix-colorTextSecondary);">
        <span>{{ lang || 'text' }}</span>
        <button
          type="button"
          @click="copy"
          style="border:none;background:transparent;cursor:pointer;color:var(--aix-colorPrimary);font-size:12px;"
        >{{ copied ? '已复制 ✓' : '复制' }}</button>
      </div>
      <pre style="margin:0;padding:12px;overflow:auto;font-size:13px;line-height:1.6;"><code>{{ code }}</code></pre>
    </div>
  `,
});

// token 渲染器签名：({ token, renderChildren, info }) => VNode | VNode[] | string
const customMarkdownRenderers: MarkdownRenderers = {
  // 覆盖通用代码块 → 带复制按钮
  fence: (({ token }) =>
    h(CopyableCode, { code: token.content, lang: token.info.trim() })) as MarkdownRendererFn,
  // 自定义表格外观：包一层可横向滚动的容器
  table: (({ renderChildren }) =>
    h(
      'div',
      {
        style:
          'overflow-x:auto;border:1px solid var(--aix-colorBorderSecondary);border-radius:8px;',
      },
      h('table', { style: 'width:100%;border-collapse:collapse;' }, renderChildren()),
    )) as MarkdownRendererFn,
};

const MD_3 = [
  '这是一段带代码块和表格的回答，渲染已被自定义接管：',
  '',
  '```ts',
  'export const add = (a: number, b: number): number => a + b;',
  '```',
  '',
  '| 扩展点 | 方式 |',
  '| --- | --- |',
  '| 代码块 | 覆盖 fence 渲染器 |',
  '| 表格 | 覆盖 table 渲染器 |',
  '',
  '代码块右上角有「复制」按钮，表格外层可横向滚动。',
].join('\n');

const FRAMES_MD = toChunks(MD_3, 4).map((s) => JSON.stringify({ delta: s }));

// 用库默认扁平协议（flatParseChunk），仅扩展渲染层
const customMarkdownRequest = async ({ signal }: { signal: AbortSignal }) =>
  streamFrames(FRAMES_MD, signal);

// ============ Story 定义 ============

const PROMPT_1: PromptItem[] = [{ key: 'p1', label: '换一套后端协议怎么对接？' }];
const PROMPT_2: PromptItem[] = [{ key: 'p2', label: '自定义块能不能流式逐字渲染？' }];
const PROMPT_3: PromptItem[] = [{ key: 'p3', label: '给我一段带代码和表格的回答' }];

// ============ 场景 4：注入 markdown-it 插件（新增短代码语法） ============

/** markdown-it 插件：把 :tada: / :rocket: / :aix: 短代码替换为表情（演示注入新「语法」） */
const SHORTCODES: Record<string, string> = { ':tada:': '🎉', ':rocket:': '🚀', ':aix:': '⚡AIX' };
const shortcodePlugin = (md: unknown) => {
  const core = (md as { core: { ruler: { push: (n: string, f: (s: unknown) => void) => void } } })
    .core;
  core.ruler.push('aix_shortcode', (state) => {
    const tokens = (
      state as {
        tokens: Array<{ type: string; children?: Array<{ type: string; content: string }> }>;
      }
    ).tokens;
    for (const blk of tokens) {
      if (blk.type !== 'inline' || !blk.children) continue;
      for (const tok of blk.children) {
        if (tok.type === 'text') {
          tok.content = tok.content.replace(/:(?:tada|rocket|aix):/g, (s) => SHORTCODES[s] ?? s);
        }
      }
    }
  });
};

/** 用库默认扁平协议流式推送含短代码的文本 */
const shortcodeRequest = ({ signal }: { signal: AbortSignal }) =>
  Promise.resolve(
    streamFrames(
      toChunks('上线啦 :tada: 新组件 :rocket: ——由 :aix: 强力驱动').map((c) =>
        JSON.stringify({ delta: c }),
      ),
      signal,
    ),
  );

const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/扩展能力',
  component: AiChat,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'AiChat 三类核心扩展点的可运行示例：自定义协议（parseChunk）、流式渲染的自定义块' +
          '（blockRenderers 覆盖 reasoning）、自定义 Markdown 渲染器（markdownRenderers）。' +
          '每个 story 都内置拟真 mock 后端，点快捷问题即可在 Canvas 真实对话。',
      },
    },
  },
  // 居中卡片外壳，AiChat 占满主体
  render: (args) => ({
    components: { AiChat },
    setup: () => ({ args }),
    template: `
      <div style="display:flex;justify-content:center;box-sizing:border-box;min-height:100vh;padding:24px;background:var(--aix-colorBgLayout);">
        <div style="display:flex;flex-direction:column;width:100%;max-width:720px;height:600px;overflow:hidden;border:1px solid var(--aix-colorBorderSecondary);border-radius:14px;background:var(--aix-colorBgContainer);box-shadow:var(--aix-shadowMD);">
          <AiChat v-bind="args" />
        </div>
      </div>
    `,
  }),
  args: {
    roles: ROLES,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** 场景 1：接入自定义协议（自定义字段名 + reasoning 分流 + 自定义结束信号） */
export const CustomProtocol: Story = {
  name: '1. 接入自定义协议',
  args: {
    request: customProtocolRequest,
    parseChunk: customParseChunk,
    welcomeTitle: '自定义协议示例',
    welcomeDescription: '后端用 {thinking}/{text} 字段 + <END> 结束信号，仅靠 parseChunk 适配',
    placeholder: '输入消息…',
    prompts: PROMPT_1,
  },
  parameters: {
    docs: {
      description: {
        story:
          '后端协议非默认扁平结构：思考走 `thinking` 字段、正文走 `text` 字段、结束信号是 `<END>`。' +
          '通过 `createParseChunk({ doneSignal, pickDelta, pickBlockType })` 一个函数适配，' +
          '思考内容自动分流进 reasoning 折叠块。',
      },
    },
  },
};

/** 场景 2：流式渲染的自定义块（覆盖 reasoning 渲染器为实时推理卡） */
export const StreamingCustomBlock: Story = {
  name: '2. 流式渲染的自定义块',
  args: {
    request: streamingBlockRequest,
    parseChunk: streamingBlockParseChunk,
    blockRenderers: { reasoning: markRaw(LiveThinkingCard) },
    welcomeTitle: '流式自定义块示例',
    welcomeDescription: '复用 reasoning 作流式载体，blockRenderers 覆盖渲染器换成实时推理卡',
    placeholder: '输入消息…',
    prompts: PROMPT_2,
  },
  parameters: {
    docs: {
      description: {
        story:
          '自定义 `type` 的块无法靠 parseChunk 逐字累积（`appendDelta` 只支持 text/reasoning）。' +
          '正解：复用内置 `reasoning` 作流式载体，用 `blockRenderers` 覆盖其渲染器换成完全自定义的' +
          '「实时推理卡」——既真·随流累积、又类型安全。卡片内 `MarkdownRenderer` 做块级增量渲染。',
      },
    },
  },
};

/** 场景 3：自定义 Markdown 渲染器（fence 带复制按钮 + table 可滚动） */
export const CustomMarkdownRenderer: Story = {
  name: '3. 自定义 Markdown 渲染器',
  args: {
    request: customMarkdownRequest,
    markdownRenderers: customMarkdownRenderers,
    welcomeTitle: '自定义渲染器示例',
    welcomeDescription: '用 markdownRenderers 覆盖 fence（带复制按钮）与 table（可横向滚动）',
    placeholder: '输入消息…',
    prompts: PROMPT_3,
  },
  parameters: {
    docs: {
      description: {
        story:
          '用库默认扁平协议，仅扩展渲染层：`markdownRenderers` 覆盖 `fence` 代码块（右上角复制按钮）' +
          '和 `table`（外层可横向滚动容器）。优先级高于内置渲染器，未覆盖的 token 仍走内置。',
      },
    },
  },
};

/** 场景 4：注入 markdown-it 插件（新增 :shortcode: 语法） */
export const MarkdownItPlugins: Story = {
  name: '4. 注入 markdown-it 插件',
  args: {
    request: shortcodeRequest,
    mdPlugins: [shortcodePlugin],
    welcomeTitle: '注入 markdown-it 插件示例',
    welcomeDescription: '用 mdPlugins 注入插件，新增 :tada: / :rocket: / :aix: 短代码语法',
    placeholder: '输入消息…',
    prompts: [{ key: '1', label: '展示一下短代码' }],
  },
  parameters: {
    docs: {
      description: {
        story:
          'token 级 `markdownRenderers` 只能改已有 token 的渲染、无法新增语法。`mdPlugins` 注入原始' +
          ' markdown-it 插件，可加**新 tokenization**——此处一个 core 规则把 `:tada:`/`:rocket:`/`:aix:`' +
          ' 短代码替换为表情。多个气泡按「插件数组引用」共享同一引擎，不重复装配。',
      },
    },
  },
  play: async ({ canvas }) => {
    const ta = canvas.getByRole('textbox');
    await userEvent.click(ta);
    await userEvent.type(ta, '展示');
    await userEvent.keyboard('{Enter}');
    // 插件把 :aix: 替换为 ⚡AIX（新语法生效）
    await waitFor(() => expect(canvas.getByText(/⚡AIX/)).toBeTruthy(), { timeout: 5000 });
  },
};
