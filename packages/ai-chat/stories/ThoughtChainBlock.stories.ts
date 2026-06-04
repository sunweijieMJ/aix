import type { Meta, StoryObj } from '@storybook/vue3';
import { expect } from 'storybook/test';
import { ThoughtChainBlock } from '../src';
import type { ThoughtChainBlockProps, ThoughtChainItem } from '../src';
import type { ContentBlock } from '../src/types';
import { thoughtChainBlock } from '../src/utils/helpers';

// thoughtChainBlock 返回 ContentBlock 联合，窄化为 thought-chain 以匹配 block prop
const asTcBlock = (items: ThoughtChainItem[]) =>
  thoughtChainBlock(items) as Extract<ContentBlock, { type: 'thought-chain' }>;

const steps: ThoughtChainItem[] = [
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

const meta: Meta<ThoughtChainBlockProps> = {
  title: 'AI Chat/ThoughtChainBlock',
  component: ThoughtChainBlock,
  parameters: {
    docs: {
      description: {
        component:
          'thought-chain 块的渲染器（内置注册表项），把块数据渲染为 ThoughtChain 步骤时间线。' +
          '通常经 Bubble 块注册表自动选用。需要在步骤内嵌富内容（如检索卡片）时，' +
          '在上层（AiChat/BubbleList/Bubble）按命名约定提供 `#thought-chain-item-content` 作用域插槽，' +
          '本渲染器会将其映射到 ThoughtChain 内部的 `#item-content`。',
      },
    },
  },
  argTypes: {
    block: { control: false },
    info: { control: false },
    typing: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<ThoughtChainBlockProps>;

/** 默认：从 thought-chain 块渲染步骤时间线，active 步骤标题流光 */
export const Default: Story = {
  args: { block: asTcBlock(steps) },
  play: async ({ canvas }) => {
    await canvas.findByText('获取用户输入');
    await canvas.findByText('深度检索');
    const active = canvas.getByText('正文创作');
    await expect(active.classList.contains('is-active')).toBe(true);
  },
};

/**
 * WithItemContentSlot：富内容穿透。
 * 通过命名约定插槽 `#thought-chain-item-content` 注入步骤内的检索结果卡片，
 * 由本渲染器映射到 ThoughtChain 的 `#item-content` 作用域插槽（携带 item / index）。
 */
export const WithItemContentSlot: Story = {
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
