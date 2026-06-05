import type { Meta, StoryObj } from '@storybook/vue3';
import { TextBlock } from '../src';
import type { TextBlockProps } from '../src';
import type { ContentBlock } from '../src/types';
import { textBlock } from '../src/utils/helpers';

// textBlock 返回 ContentBlock 联合，TextBlock 仅接受 text/reasoning，故窄化断言
const asTextBlock = (text: string) =>
  textBlock(text) as Extract<ContentBlock, { type: 'text' | 'reasoning' }>;

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

const meta: Meta<TextBlockProps> = {
  title: 'AI Chat/TextBlock',
  component: TextBlock,
  parameters: {
    docs: {
      description: {
        component:
          'text / reasoning 块的渲染器（内置注册表项）。内部委托 MarkdownRenderer 渲染富文本，' +
          '并复用 useTypewriter 支持流式逐字显示。通常经 Bubble 块注册表自动选用，无需手动放置。',
      },
    },
  },
  argTypes: {
    block: { control: false },
    typing: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<TextBlockProps>;

/** 纯文本：直接渲染一段普通文本 */
export const Default: Story = {
  args: { block: asTextBlock('你好，我是 AIX 智能助手，有什么可以帮你的？') },
  play: async ({ canvas }) => {
    await canvas.findByText(/AIX 智能助手/, undefined, { timeout: 5000 });
  },
};

/** Markdown 富文本：列表 / 表格 / 代码块 */
export const Markdown: Story = {
  args: { block: asTextBlock(MARKDOWN) },
  play: async ({ canvas }) => {
    // 显式 5s 超时：全量并发跑时首帧渲染（引擎动态 import）受 worker 竞争影响，默认 1s 偶发压线失败
    await canvas.findByText('列表项一', undefined, { timeout: 5000 });
    await canvas.findByText('支持 GFM 表格', undefined, { timeout: 5000 });
  },
};

/** 打字机：typing=true 时逐字显示，最终追平完整文本 */
export const Typing: Story = {
  args: { block: asTextBlock('这是一段用于演示打字机逐字显示效果的文本。'), typing: true },
  play: async ({ canvas }) => {
    await canvas.findByText(/打字机逐字显示效果的文本/, undefined, { timeout: 5000 });
  },
};
