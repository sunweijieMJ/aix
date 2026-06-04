import type { Meta, StoryObj } from '@storybook/vue3';
import { expect } from 'storybook/test';
import { SourcesBlock } from '../src';
import type { SourcesBlockProps, SourceItem } from '../src';
import type { ContentBlock } from '../src/types';
import { sourcesBlock } from '../src/utils/helpers';

// sourcesBlock 返回 ContentBlock 联合，窄化为 sources 以匹配 block prop
const asSourcesBlock = (items: SourceItem[]) =>
  sourcesBlock(items) as Extract<ContentBlock, { type: 'sources' }>;

const items: SourceItem[] = [
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

const meta: Meta<SourcesBlockProps> = {
  title: 'AI Chat/SourcesBlock',
  component: SourcesBlock,
  parameters: {
    docs: {
      description: {
        component:
          '引用来源块（`sources`）的内置渲染器（注册表项）：把来源列表渲染为带序号的卡片——' +
          '序号 + favicon（icon 为图片地址时）/ emoji 图标 + 标题（有 `url` 时为新窗口安全链接）+ 两行摘要。' +
          '常用于 RAG / 搜索增强场景。通常经 Bubble 块注册表自动选用。',
      },
    },
  },
  argTypes: {
    block: { control: false },
    info: { control: false },
    typing: { control: false },
  },
};
export default meta;
type Story = StoryObj<SourcesBlockProps>;

/** 默认：渲染三条来源（favicon 链接 / emoji 链接 / 纯标题） */
export const Default: Story = {
  args: { block: asSourcesBlock(items) },
  play: async ({ canvas }) => {
    await canvas.findByText(/维基百科/);
    // 有 url 的来源渲染为新窗口安全链接
    const links = canvas.getAllByRole('link');
    await expect(links.length).toBe(2);
    await expect(links[0]).toHaveAttribute('target', '_blank');
    await expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
  },
};

/** 单条来源 */
export const Single: Story = {
  args: {
    block: asSourcesBlock([
      {
        title: 'TypeScript 官方手册',
        url: 'https://www.typescriptlang.org/docs/',
        snippet: '官方文档：类型系统、泛型、模块与编译配置。',
        icon: '📘',
      },
    ]),
  },
};
