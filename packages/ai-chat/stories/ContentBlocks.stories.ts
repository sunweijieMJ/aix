/**
 * ContentBlocks.stories.ts
 *
 * 五个内置块渲染器合并：TextBlock / ReasoningBlock / SourcesBlock / ThoughtChainBlock / AttachmentBlock。
 * 原 4 个独立 stories 文件（TextBlock / ReasoningBlock / SourcesBlock / ThoughtChainBlock）
 * 已删除，所有 story 与 play 断言原样迁移至此。
 *
 * meta.component 选 TextBlock（最常用），其他块通过 render 函数渲染。
 * story 名加块前缀防止撞名。
 */
import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent } from 'storybook/test';
// 内置块组件是 Bubble 注册表的实现细节、不对外导出，story 直接按路径引入（与单测一致）。
import type { SourceItem, ThoughtChainItem, AttachmentItem } from '../src';
import AttachmentBlock from '../src/components/blocks/AttachmentBlock.vue';
import type { AttachmentBlockProps } from '../src/components/blocks/AttachmentBlock.vue';
import ReasoningBlock from '../src/components/blocks/ReasoningBlock.vue';
import type { ReasoningBlockProps } from '../src/components/blocks/ReasoningBlock.vue';
import SourcesBlock from '../src/components/blocks/SourcesBlock.vue';
import type { SourcesBlockProps } from '../src/components/blocks/SourcesBlock.vue';
import TextBlock from '../src/components/blocks/TextBlock.vue';
import type { TextBlockProps } from '../src/components/blocks/TextBlock.vue';
import ThoughtChainBlock from '../src/components/blocks/ThoughtChainBlock.vue';
import type { ThoughtChainBlockProps } from '../src/components/blocks/ThoughtChainBlock.vue';
import type { BubbleContentInfo, ContentBlock } from '../src/types';
import { textBlock, sourcesBlock, thoughtChainBlock, attachmentBlock } from '../src/utils/helpers';

// ──────────────────────────────────────────────
// 辅助窄化函数（各文件原有）
// ──────────────────────────────────────────────

const asTextBlock = (text: string) =>
  textBlock(text) as Extract<ContentBlock, { type: 'text' | 'reasoning' }>;

const asSourcesBlock = (items: SourceItem[]) =>
  sourcesBlock(items) as Extract<ContentBlock, { type: 'sources' }>;

const asTcBlock = (items: ThoughtChainItem[]) =>
  thoughtChainBlock(items) as Extract<ContentBlock, { type: 'thought-chain' }>;

// ──────────────────────────────────────────────
// TextBlock 共用数据
// ──────────────────────────────────────────────

const MARKDOWN = [
  '**Markdown 富文本**渲染（内置 markdown-it，未装时降级为纯文本）：',
  '',
  '- 列表项一',
  '- 列表项二',
  '',
  '| 维度 | 说明 |',
  '| --- | --- |',
  '| 代码 | 支持高亮容器 |',
  '| 表格 | 支持 GFM 表格 |',
  '',
  '```ts',
  'const greet = (name: string) => `你好，${name}`;',
  '```',
].join('\n');

// ──────────────────────────────────────────────
// ReasoningBlock 共用数据
// ──────────────────────────────────────────────

const reasoningBlock = {
  id: 'r1',
  type: 'reasoning',
  text: '先拆解用户意图，再检索相关知识，最后组织回答。',
} as Extract<ContentBlock, { type: 'reasoning' }>;

const info = (status: BubbleContentInfo['status']): BubbleContentInfo => ({
  status,
  role: 'ai',
  key: 'k',
});

// ──────────────────────────────────────────────
// SourcesBlock 共用数据
// ──────────────────────────────────────────────

const sourceItems: SourceItem[] = [
  {
    title: '梵高《向日葵》- 维基百科',
    url: 'https://zh.wikipedia.org/wiki/向日葵',
    snippet:
      '《向日葵》是荷兰画家文森特·梵高于 1888—1889 年间创作的一系列静物油画，以铬黄为主色调。',
    icon: 'https://zh.wikipedia.org/favicon.ico',
  },
  {
    title: '阿尔勒时期的创作高峰',
    url: 'https://example.com/arles',
    snippet: '梵高在法国南部阿尔勒期间进入创作高峰，《向日葵》系列即诞生于此时。',
    icon: '🎨',
  },
  { title: '仅标题来源（无链接、无摘要）' },
];

// ──────────────────────────────────────────────
// ThoughtChainBlock 共用数据
// ──────────────────────────────────────────────

const tcSteps: ThoughtChainItem[] = [
  {
    key: '1',
    icon: '🤔',
    title: '获取用户输入',
    status: 'done',
    duration: '00.80秒',
    content: '生成一道关于梵高《向日葵》的单选题',
  },
  { key: '2', icon: '🔍', title: '深度检索', status: 'done', duration: '12.59秒' },
  { key: '3', icon: '📝', title: '正文创作', status: 'active' },
];

// ──────────────────────────────────────────────
// AttachmentBlock 共用数据（气泡回显：已上传完成的附件，无 status/进度）
// ──────────────────────────────────────────────

// 内联 SVG 缩略图（data URI，离线可渲染，避免依赖外网图片）
const imageThumb =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='68' height='68'%3E%3Crect width='68' height='68' fill='%23f5c518'/%3E%3Ccircle cx='34' cy='34' r='13' fill='%238a5a00'/%3E%3C/svg%3E";

const attachmentItems: AttachmentItem[] = [
  { id: 'f1', name: 'sunflowers.png', url: imageThumb, mime: 'image/png', size: 245 * 1024 },
  { id: 'f2', name: '梵高研究报告.pdf', mime: 'application/pdf', size: 1280 * 1024 },
  {
    id: 'f3',
    name: '创作年表.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 32 * 1024,
  },
];

// ──────────────────────────────────────────────
// Meta（绑定 TextBlock 为主组件，其他块以 render 函数渲染）
// ──────────────────────────────────────────────

const meta: Meta<TextBlockProps> = {
  title: 'AI Chat/ContentBlocks',
  tags: ['autodocs'],
  component: TextBlock,
  parameters: {
    docs: {
      description: {
        component:
          '五个内置块渲染器合并展示：TextBlock / ReasoningBlock / SourcesBlock / ThoughtChainBlock / AttachmentBlock。' +
          '通常经 Bubble 块注册表自动选用，无需手动放置。',
      },
    },
  },
  argTypes: {
    block: { control: false },
    typing: { control: 'boolean' },
  },
};
export default meta;

// ──────────────────────────────────────────────
// TextBlock stories（前缀 Text*）
// ──────────────────────────────────────────────

type TextStory = StoryObj<TextBlockProps>;

/** TextBlock · 纯文本：直接渲染一段普通文本 */
export const TextDefault: TextStory = {
  args: { block: asTextBlock('你好，我是 AIX 智能助手，有什么可以帮你的？') },
  play: async ({ canvas }) => {
    await canvas.findByText(/AIX 智能助手/, undefined, { timeout: 5000 });
  },
};

/** TextBlock · Markdown 富文本：列表 / 表格 / 代码块 */
export const TextMarkdown: TextStory = {
  args: { block: asTextBlock(MARKDOWN) },
  play: async ({ canvas }) => {
    // 显式 5s 超时：全量并发跑时首帧渲染（引擎动态 import）受 worker 竞争影响，默认 1s 偶发压线失败
    await canvas.findByText('列表项一', undefined, { timeout: 5000 });
    await canvas.findByText('支持 GFM 表格', undefined, { timeout: 5000 });
  },
};

/** TextBlock · 打字机：typing=true 时逐字显示，最终追平完整文本 */
export const TextTyping: TextStory = {
  args: { block: asTextBlock('这是一段用于演示打字机逐字显示效果的文本。'), typing: true },
  play: async ({ canvas }) => {
    await canvas.findByText(/打字机逐字显示效果的文本/, undefined, { timeout: 5000 });
  },
};

// ──────────────────────────────────────────────
// ReasoningBlock stories（前缀 Reasoning*）
// ──────────────────────────────────────────────

type ReasoningStory = StoryObj<ReasoningBlockProps>;

/** ReasoningBlock · 折叠（历史消息 success）：思考过程默认折叠，点击标题展开 */
export const ReasoningCollapsed: ReasoningStory = {
  render: () => ({
    components: { ReasoningBlock },
    setup: () => ({ block: reasoningBlock, blockInfo: info('success') }),
    template: `<ReasoningBlock :block="block" :info="blockInfo" />`,
  }),
  play: async ({ canvas }) => {
    // 默认折叠：内容不在 DOM
    await expect(canvas.queryByText(/先拆解用户意图/)).toBeNull();
    // 点击「思考过程」标题展开
    await userEvent.click(canvas.getByText('思考过程'));
    await canvas.findByText(/先拆解用户意图/);
  },
};

/** ReasoningBlock · 流式中（updating）：思考过程自动展开 */
export const ReasoningStreaming: ReasoningStory = {
  render: () => ({
    components: { ReasoningBlock },
    setup: () => ({ block: reasoningBlock, blockInfo: info('updating') }),
    template: `<ReasoningBlock :block="block" :info="blockInfo" />`,
  }),
  play: async ({ canvas }) => {
    await canvas.findByText(/先拆解用户意图/);
  },
};

// ──────────────────────────────────────────────
// SourcesBlock stories（前缀 Sources*）
// ──────────────────────────────────────────────

type SourcesStory = StoryObj<SourcesBlockProps>;

/** SourcesBlock · 默认：渲染三条来源（favicon 链接 / emoji 链接 / 纯标题） */
export const SourcesDefault: SourcesStory = {
  render: () => ({
    components: { SourcesBlock },
    setup: () => ({ block: asSourcesBlock(sourceItems) }),
    template: `<SourcesBlock :block="block" />`,
  }),
  play: async ({ canvas }) => {
    await canvas.findByText(/维基百科/);
    // 有 url 的来源渲染为新窗口安全链接
    const links = canvas.getAllByRole('link');
    await expect(links.length).toBe(2);
    await expect(links[0]).toHaveAttribute('target', '_blank');
    await expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
  },
};

/** SourcesBlock · 单条来源 */
export const SourcesSingle: SourcesStory = {
  render: () => ({
    components: { SourcesBlock },
    setup: () => ({
      block: asSourcesBlock([
        {
          title: 'TypeScript 官方手册',
          url: 'https://www.typescriptlang.org/docs/',
          snippet: '官方文档：类型系统、泛型、模块与编译配置。',
          icon: '📘',
        },
      ]),
    }),
    template: `<SourcesBlock :block="block" />`,
  }),
};

// ──────────────────────────────────────────────
// ThoughtChainBlock stories（前缀 ThoughtChain*）
// ──────────────────────────────────────────────

type TcStory = StoryObj<ThoughtChainBlockProps>;

/** ThoughtChainBlock · 默认：从 thought-chain 块渲染步骤时间线，active 步骤标题流光 */
export const ThoughtChainSteps: TcStory = {
  render: () => ({
    components: { ThoughtChainBlock },
    setup: () => ({ block: asTcBlock(tcSteps) }),
    template: `<ThoughtChainBlock :block="block" />`,
  }),
  play: async ({ canvas }) => {
    await canvas.findByText('获取用户输入');
    await canvas.findByText('深度检索');
    const active = canvas.getByText('正文创作');
    await expect(active.classList.contains('is-active')).toBe(true);
  },
};

/**
 * ThoughtChainBlock · WithItemContentSlot：富内容穿透。
 * 通过命名约定插槽 `#thought-chain-item-content` 注入步骤内的检索结果卡片，
 * 由本渲染器映射到 ThoughtChain 的 `#item-content` 作用域插槽（携带 item / index）。
 */
export const ThoughtChainWithSlot: TcStory = {
  render: () => ({
    components: { ThoughtChainBlock },
    setup: () => ({
      block: asTcBlock([
        {
          key: 'search',
          icon: '🔍',
          title: '深度检索',
          duration: '12.59秒',
          defaultExpanded: true,
        },
      ]),
    }),
    template: `
      <ThoughtChainBlock :block="block">
        <template #thought-chain-item-content="{ item }">
          <div style="display:flex;flex-direction:column;gap:8px">
            <div style="padding:8px 12px;border-radius:12px;background:var(--aix-colorFillTertiary)">
              📎 命中「{{ item.title }}」：梵高《向日葵》主色调为铬黄
            </div>
            <div style="padding:8px 12px;border-radius:12px;background:var(--aix-colorFillTertiary)">
              📎 命中「{{ item.title }}」：《向日葵》系列创作于阿尔勒时期
            </div>
          </div>
        </template>
      </ThoughtChainBlock>
    `,
  }),
  play: async ({ canvas }) => {
    const cards = await canvas.findAllByText(/命中/);
    await expect(cards.length).toBeGreaterThanOrEqual(2);
  },
};

// ──────────────────────────────────────────────
// AttachmentBlock stories（前缀 Attachment*）
// ──────────────────────────────────────────────

type AttachmentStory = StoryObj<AttachmentBlockProps>;

/**
 * AttachmentBlock · 默认：气泡内回显已上传附件。
 * 图片类（mime image/* + url）渲染 68×68 缩略图，其余按文件类型显示图标 + 「后缀 · 大小」。
 * 回显态不可删除/重试（removable 默认 false，item 无 status）。
 */
export const AttachmentDefault: AttachmentStory = {
  render: () => ({
    components: { AttachmentBlock },
    setup: () => ({ block: attachmentBlock(attachmentItems) }),
    template: `<AttachmentBlock :block="block" />`,
  }),
  play: async ({ canvas }) => {
    // 文件卡：名称可见
    await canvas.findByText('梵高研究报告.pdf');
    await canvas.findByText('创作年表.docx');
    // 图片卡：以 alt=文件名 的缩略图渲染
    const thumb = await canvas.findByAltText('sunflowers.png');
    await expect(thumb).toHaveAttribute('src');
    // 回显态无删除按钮
    await expect(canvas.queryByRole('button', { name: '删除' })).toBeNull();
  },
};

/** AttachmentBlock · 单图片：仅一张图片缩略图 */
export const AttachmentImage: AttachmentStory = {
  render: () => ({
    components: { AttachmentBlock },
    setup: () => ({
      block: attachmentBlock([
        {
          id: 'img',
          name: 'starry-night.png',
          url: imageThumb,
          mime: 'image/png',
          size: 180 * 1024,
        },
      ]),
    }),
    template: `<AttachmentBlock :block="block" />`,
  }),
  play: async ({ canvas }) => {
    await canvas.findByAltText('starry-night.png');
  },
};

/** AttachmentBlock · 单文件：非图片类显示类型图标 + 「后缀 · 大小」 */
export const AttachmentFile: AttachmentStory = {
  render: () => ({
    components: { AttachmentBlock },
    setup: () => ({
      block: attachmentBlock([
        { id: 'doc', name: '需求规格说明书.pdf', mime: 'application/pdf', size: 2048 * 1024 },
      ]),
    }),
    template: `<AttachmentBlock :block="block" />`,
  }),
  play: async ({ canvas }) => {
    await canvas.findByText('需求规格说明书.pdf');
  },
};
