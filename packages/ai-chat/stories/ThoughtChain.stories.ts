import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent } from 'storybook/test';
import { ThoughtChain } from '../src';
import type { ThoughtChainProps, ThoughtChainItem } from '../src';

const steps: ThoughtChainItem[] = [
  {
    key: 'input',
    icon: '🤔',
    title: '获取用户输入',
    status: 'done',
    duration: '12.59秒',
    content: '用户输入信息为：生成一道关于梵高的向日葵的单选题',
  },
  {
    key: 'think',
    icon: '🧐',
    title: '思考决策',
    status: 'done',
    duration: '12.59秒',
    content:
      '用户现在需要生成一道关于梵高的向日葵的单选题，没有上传文件，也没有提到联网或检索要求，需要生成文本内容，所以选正文创作即可。',
  },
  {
    key: 'search',
    icon: '🔍',
    title: '深度检索',
    status: 'done',
    duration: '12.59秒',
    content: '搜索梵高《向日葵》单选题',
  },
  {
    key: 'write',
    icon: '📝',
    title: '正文创作',
    status: 'active',
    duration: '12.59秒',
    content: '正在围绕考点（流派 / 主色调）组织题干与选项…',
  },
  {
    key: 'done',
    icon: '✨',
    title: '创作完成',
    status: 'active',
    duration: '01.00秒',
    content: '即将呈现',
  },
];

const meta: Meta<ThoughtChainProps> = {
  title: 'AI Chat/ThoughtChain',
  tags: ['autodocs'],
  component: ThoughtChain,
  argTypes: { items: { control: false } },
};
export default meta;
type Story = StoryObj<ThoughtChainProps>;

/** Agent 执行步骤时间线（对应设计稿「生成中流程」） */
export const Default: Story = {
  args: { items: steps },
  play: async ({ canvas }) => {
    // 5 个步骤标题均渲染
    await canvas.findByText('获取用户输入');
    await canvas.findByText('深度检索');
    // active 步骤标题带 is-active（流光渐变）
    const active = canvas.getByText('正文创作');
    await expect(active.classList.contains('is-active')).toBe(true);
  },
};

/** 折叠交互：点击步骤标题收起/展开正文 */
export const Collapsible: Story = {
  args: { items: steps.slice(0, 1) },
  play: async ({ canvas }) => {
    await canvas.findByText('用户输入信息为：生成一道关于梵高的向日葵的单选题');
    await userEvent.click(canvas.getByText('获取用户输入'));
    await expect(canvas.queryByText('用户输入信息为：生成一道关于梵高的向日葵的单选题')).toBeNull();
  },
};

// 内联 SVG 缩略图（data URI，离线可渲染，避免依赖外网图片——与 ContentBlocks/AttachmentCard 同约定）
const sunflowerThumb =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Crect width='36' height='36' fill='%23f5c518'/%3E%3Ccircle cx='18' cy='18' r='7' fill='%238a5a00'/%3E%3C/svg%3E";
const paletteThumb =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Crect width='36' height='36' fill='%234c6ef5'/%3E%3Ccircle cx='13' cy='14' r='4' fill='%23ffd43b'/%3E%3Ccircle cx='23' cy='22' r='4' fill='%23ff8787'/%3E%3C/svg%3E";

/**
 * 完整还原 Figma「生成中」状态：汇总标题蓝色流光 + 一组带 emoji 图标 / 耗时胶囊 /
 * 虚线连接的步骤，其中「深度检索」步骤携带数据驱动的检索结果卡（标题 + chip 列表，
 * 含缩略图）。「正文创作」为进行中（active）标题流光。
 */
export const GeneratingTimeline: Story = {
  args: {
    title: '生成中…',
    loading: true,
    items: [
      {
        key: 'input',
        icon: '🤔',
        title: '获取用户输入',
        status: 'done',
        duration: '00.80秒',
        content: '用户输入信息为：生成一道关于梵高《向日葵》的单选题',
      },
      {
        key: 'think',
        icon: '🧐',
        title: '思考决策',
        status: 'done',
        duration: '02.10秒',
        content:
          '用户现在需要生成一道关于梵高《向日葵》的单选题：没有上传文件，也未提出联网或检索的硬性要求，但为保证题目与解析的准确性，先做一次深度检索补充背景资料，再进入正文创作组织题干与选项。',
      },
      {
        key: 'search',
        icon: '🔍',
        title: '深度检索',
        status: 'done',
        duration: '12.59秒',
        // 重点：数据驱动检索结果卡——标题 + 3 个 chip（首个纯文本带 icon，后两个带缩略图）
        result: {
          title: '搜索 梵高《向日葵》单选题',
          chips: [
            {
              icon: '📄',
              text: '选择题：梵高《向日葵》的主打色调是 ____',
              url: 'https://example.com/q1',
            },
            {
              thumbnail: sunflowerThumb,
              text: '《向日葵》（阿尔勒系列）创作背景与画派归属',
              url: 'https://example.com/q2',
            },
            {
              thumbnail: paletteThumb,
              text: '梵高后印象派用色解析：铬黄与互补色',
              url: 'https://example.com/q3',
            },
          ],
        },
      },
      {
        key: 'write',
        icon: '📝',
        title: '正文创作',
        status: 'active',
        duration: '12.59秒',
        content: '正在围绕考点（流派 / 主色调）组织题干与选项…',
      },
      {
        key: 'done',
        icon: '✨',
        title: '创作完成',
        status: 'done',
        content: '即将呈现',
      },
    ],
  },
  play: async ({ canvas }) => {
    // 汇总标题主色流光
    const summary = canvas.getByText('生成中…');
    await expect(summary.classList.contains('is-loading')).toBe(true);
    // 检索结果卡标题 + chip 渲染
    await canvas.findByText('搜索 梵高《向日葵》单选题');
    await canvas.findByText(/主打色调/);
    // 进行中步骤标题带 is-active 流光
    const active = canvas.getByText('正文创作');
    await expect(active.classList.contains('is-active')).toBe(true);
  },
};

/** 富内容：用 item-content 作用域 slot 渲染检索结果卡片 */
export const WithSearchCards: Story = {
  render: () => ({
    components: { ThoughtChain },
    setup: () => ({
      items: [
        {
          key: 'search',
          icon: '🔍',
          title: '深度检索',
          duration: '12.59秒',
          defaultExpanded: true,
        },
      ],
    }),
    template: `
      <ThoughtChain :items="items">
        <template #item-content>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div class="result-card" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;background:var(--aix-colorFillTertiary)">
              选择题：著名画家梵高的名作《向日葵》中的主打色…
            </div>
            <div class="result-card" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;background:var(--aix-colorFillTertiary)">
              梵高的《向日葵》是 _____ 画派
            </div>
          </div>
        </template>
      </ThoughtChain>
    `,
  }),
  play: async ({ canvas }) => {
    const cards = canvas.getAllByText(/梵高/);
    await expect(cards.length).toBeGreaterThanOrEqual(1);
  },
};
