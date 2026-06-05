import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent } from 'storybook/test';
import { defineComponent, h, ref } from 'vue';
import { Bubble } from '../src';
import type { BubbleProps } from '../src';
import type { ContentBlock, SourceItem } from '../src/types';
import { textBlock, reasoningBlock, sourcesBlock } from '../src/utils/helpers';

const meta: Meta<BubbleProps> = {
  title: 'AI Chat/Bubble',
  component: Bubble,
  args: { content: [textBlock('你好，我是 AI 助手')], placement: 'start', variant: 'filled' },
  argTypes: {
    content: { control: false },
    role: { control: 'text' },
    placement: { control: 'inline-radio', options: ['start', 'end'] },
    variant: { control: 'select', options: ['filled', 'outlined', 'borderless', 'shadow'] },
    shape: { control: 'inline-radio', options: ['round', 'corner'] },
    loading: { control: 'boolean' },
    typing: { control: 'boolean' },
    status: {
      control: 'select',
      options: ['local', 'loading', 'updating', 'success', 'error', 'abort'],
    },
  },
};
export default meta;
type Story = StoryObj<BubbleProps>;

export const Default: Story = {};
export const UserMessage: Story = {
  args: { placement: 'end', content: [textBlock('帮我写一段代码')] },
};
export const Loading: Story = { args: { loading: true } };

/** ErrorState：出错态气泡，显示错误提示与重试入口（点击 emit retry） */
export const ErrorState: Story = { args: { status: 'error', content: [] } };

/** Typing：打字机效果，模拟流式逐字输出（typing + status=updating 时生效） */
export const Typing: Story = {
  render: () => ({
    components: { Bubble },
    setup() {
      const full = '你好，我是 AI 助手，正在以打字机效果逐字输出这段流式回复内容。';
      const blocks = ref([textBlock('')]);
      let i = 0;
      const timer = setInterval(() => {
        i += 2;
        blocks.value = [textBlock(full.slice(0, i))];
        if (i >= full.length) clearInterval(timer);
      }, 60);
      return { blocks };
    },
    template: `<Bubble :content="blocks" typing status="updating" />`,
  }),
};

/** Variants：并排展示 filled / outlined / borderless / shadow 四种样式 */
export const Variants: Story = {
  render: () => ({
    components: { Bubble },
    setup: () => ({ tb: textBlock }),
    template: `
      <div style="display:flex;flex-direction:column;gap:12px">
        <Bubble :content="[tb('Filled 样式（默认）')]" variant="filled" />
        <Bubble :content="[tb('Outlined 样式')]" variant="outlined" />
        <Bubble :content="[tb('Borderless 样式')]" variant="borderless" />
        <Bubble :content="[tb('Shadow 样式')]" variant="shadow" />
      </div>
    `,
  }),
};

/** Shapes：圆角（round）与方角（corner）对比 */
export const Shapes: Story = {
  render: () => ({
    components: { Bubble },
    setup: () => ({ tb: textBlock }),
    template: `
      <div style="display:flex;flex-direction:column;gap:12px">
        <Bubble :content="[tb('Round 圆角（默认）')]" shape="round" />
        <Bubble :content="[tb('Corner 方角')]" shape="corner" />
      </div>
    `,
  }),
};

/** WithAvatar：带头像的气泡（使用 avatar slot 渲染占位图） */
export const WithAvatar: Story = {
  render: () => ({
    components: { Bubble },
    setup: () => ({ tb: textBlock }),
    template: `
      <div style="display:flex;flex-direction:column;gap:12px">
        <Bubble :content="[tb('AI 助手消息（带头像）')]" placement="start">
          <template #avatar>
            <div style="width:32px;height:32px;border-radius:50%;background:var(--aix-colorPrimary);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:bold;flex-shrink:0">
              AI
            </div>
          </template>
        </Bubble>
        <Bubble :content="[tb('用户消息（带头像）')]" placement="end">
          <template #avatar>
            <div style="width:32px;height:32px;border-radius:50%;background:var(--aix-colorSuccess);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:bold;flex-shrink:0">
              我
            </div>
          </template>
        </Bubble>
      </div>
    `,
  }),
};

/** WithHeaderFooter：带 header 和 footer slot */
export const WithHeaderFooter: Story = {
  render: () => ({
    components: { Bubble },
    setup: () => ({ tb: textBlock }),
    template: `
      <Bubble :content="[tb('这是带 header 和 footer 的气泡消息内容。')]">
        <template #header>
          <span style="font-size:12px;color:var(--aix-colorTextSecondary)">AI 助手 · 10:30</span>
        </template>
        <template #footer>
          <span style="font-size:12px;color:var(--aix-colorTextSecondary);margin-top:4px;display:block">👍 有帮助</span>
        </template>
      </Bubble>
    `,
  }),
};

/**
 * MultiBlock：验证多段 content blocks 有序渲染（reasoning → text → text）。
 *
 * reasoning 块由内置 ReasoningBlock 渲染为可折叠的 Thinking 面板：
 * 非流式态（status='success' 历史消息）默认折叠，仅显示「思考过程」标题；
 * text 块照常平铺 Markdown 渲染。
 * play 断言：① reasoning 默认折叠（内容不在 DOM）→ 点击标题展开后内容出现；
 * ② 两段 text 内容始终可见，验证有序多 block 渲染链路。
 */
export const MultiBlock: Story = {
  args: {
    role: 'ai',
    status: 'success',
    typing: false,
    content: [
      reasoningBlock('让我先分析一下这个问题…'),
      textBlock('## 回答\n\n这是**正文**，支持 markdown。'),
      textBlock('补充：还有第二段正文。'),
    ],
  },
  play: async ({ canvas }) => {
    // text block 始终可见（Markdown 渲染后的标题与第二段正文）；
    // 显式 5s 超时：全量并发跑时首帧渲染（引擎动态 import）受 worker 竞争影响，默认 1s 偶发压线失败
    await canvas.findByText('回答', undefined, { timeout: 5000 });
    await canvas.findByText(/补充：还有第二段正文/, undefined, { timeout: 5000 });
    // reasoning 默认折叠：内容不在 DOM，仅显示「思考过程」折叠标题
    await expect(canvas.queryByText('让我先分析一下这个问题…')).toBeNull();
    const thinkingHeader = canvas.getByText('思考过程');
    // 点击展开后 reasoning 内容出现
    await userEvent.click(thinkingHeader);
    await canvas.findByText('让我先分析一下这个问题…', undefined, { timeout: 5000 });
  },
};

// ——— Story 2：CustomBlockRenderer ———

/**
 * 简易 sources 渲染器，演示 blockRenderers 注册表机制。
 * 接收 block（ContentBlock 联合类型）+ info，用类型守卫收窄后渲染 items 列表。
 */
const SourcesDemo = defineComponent({
  name: 'SourcesDemo',
  props: {
    block: {
      type: Object as () => ContentBlock,
      required: true,
    },
  },
  setup(props) {
    return () => {
      if (props.block.type !== 'sources') return null;
      const items = props.block.items as SourceItem[];
      return h(
        'ul',
        { style: 'margin:4px 0;padding-left:16px;font-size:13px;' },
        items.map((item, idx) =>
          h('li', { key: idx, style: 'margin:2px 0;' }, [
            h('strong', item.title),
            item.url
              ? h('span', { style: 'margin-left:6px;color:#666;font-size:12px;' }, item.url)
              : null,
          ]),
        ),
      );
    };
  },
});

/**
 * CustomBlockRenderer：验证 blockRenderers 注册表扩展机制。
 *
 * content 包含 text + sources 两个 block。sources 类型默认无内置渲染器（安全跳过，开发期 console.warn 提示）；
 * 本 story 通过 blockRenderers.sources 注入 SourcesDemo 组件，演示「加个注册器即接入」。
 * play 用 findByText 断言 sources 项（'Vue 3 文档'、'MDN'）均被渲染出来。
 *
 * 注意：blockRenderers 现已支持从 AiChat / BubbleList 顶层透传（见 AiChat 的 blockRenderers prop
 * 与 provideAiChatConfig），业务方无需逐个 role 配置；本 story 在 Bubble 层直接演示注册机制。
 * 仍待后续：包内提供开箱即用的内置 Sources 组件。
 */
/**
 * Editable：用户气泡内联编辑。editable=true 时，hover 气泡后出现「编辑」按钮；
 * 点击后切换为可编辑输入框，确认后 emit edit 事件。
 * play 断言：初始无编辑输入框 → 点击编辑按钮 → 输入框出现。
 */
export const Editable: Story = {
  args: {
    content: [textBlock('可编辑的用户消息')],
    role: 'user',
    editable: true,
  },
  play: async ({ canvas }) => {
    // 初始：编辑输入框不在 DOM 中
    await expect(canvas.queryByRole('textbox')).toBeNull();
    // 点击「编辑」按钮
    const editBtn = await canvas.findByRole('button', { name: '编辑' });
    await userEvent.click(editBtn);
    // 点击后，内联编辑输入框出现
    await canvas.findByRole('textbox');
  },
};

export const CustomBlockRenderer: Story = {
  render: () => ({
    components: { Bubble },
    setup() {
      const content = [
        textBlock('根据检索到的资料：'),
        sourcesBlock([
          { title: 'Vue 3 文档', url: 'https://vuejs.org', snippet: '渐进式框架' },
          { title: 'MDN', url: 'https://developer.mozilla.org' },
        ]),
      ];
      const blockRenderers = { sources: SourcesDemo };
      return { content, blockRenderers };
    },
    template: `<Bubble :content="content" :blockRenderers="blockRenderers" role="ai" status="success" :typing="false" />`,
  }),
  play: async ({ canvas }) => {
    await canvas.findByText('Vue 3 文档');
    await canvas.findByText('MDN');
  },
};
