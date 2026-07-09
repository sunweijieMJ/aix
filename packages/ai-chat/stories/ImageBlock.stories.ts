/**
 * ImageBlock.stories.ts
 *
 * 结构化图片块（image）演示：单图 / 多图 gallery / loading 骨架 / error 降级 + 点击缩略图
 * 打开预览 Modal 的交互。
 * 内置块组件是 Bubble 注册表实现细节、不对外导出，story 直接按路径引入（与单测一致）。
 * `ImagePreview` 同样不对外导出（仅供 ImageBlock 内部使用），本文件是它唯一的可视化演示入口——
 * 交互 story 里点击缩略图、断言弹出的预览内容，即是在验证 ImagePreview 的渲染与行为。
 */
import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, screen, userEvent, within } from 'storybook/test';
import ImageBlock from '../src/components/blocks/ImageBlock.vue';
import type { BubbleContentInfo } from '../src/types';
import { imageBlock } from '../src/utils/helpers';

const info: BubbleContentInfo = { role: 'ai', key: 'story' };

// 内联 SVG 缩略图（data URI，离线可渲染，避免依赖外网图片），四种颜色区分多图 gallery
const swatch = (color: string) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='160'%3E%3Crect width='240' height='160' fill='${color}'/%3E%3C/svg%3E`;

const IMG_A = swatch('%23f5c518');
const IMG_B = swatch('%234a90d9');
const IMG_C = swatch('%2350c878');
const IMG_D = swatch('%23e06666');

const meta: Meta<typeof ImageBlock> = {
  title: 'AI Chat/组件/图片块（image）',
  component: ImageBlock,
};
export default meta;
type Story = StoryObj<typeof ImageBlock>;

const render = (block: ReturnType<typeof imageBlock>) => () => ({
  components: { ImageBlock },
  setup: () => ({ block, info }),
  template: `<div style="max-width:420px"><ImageBlock :block="block" :info="info" /></div>`,
});

/** 单图：撑满容器宽度展示，可点击放大 */
export const Single: Story = {
  render: render(imageBlock([{ url: IMG_A, alt: '生成的插画' }])),
};

/** 多图 gallery：一次生图工具调用产出多个变体，网格缩略图展示 */
export const Gallery: Story = {
  render: render(
    imageBlock([
      { url: IMG_A, alt: '变体一' },
      { url: IMG_B, alt: '变体二' },
      { url: IMG_C, alt: '变体三' },
      { url: IMG_D, alt: '变体四' },
    ]),
  ),
};

/** loading：流式生图请求中，骨架占位不出图 */
export const Loading: Story = {
  render: render(imageBlock([], { state: 'loading' })),
};

/** error：生图失败，降级为文案（role="img" + aria-label，无障碍可读） */
export const Degraded: Story = {
  render: render(imageBlock([], { state: 'error', errorText: '生成失败，请重试' })),
};

/**
 * 交互：点击 gallery 第二张缩略图 → ImagePreview（Teleport 至 body）以对应下标打开，
 * 展示计数器、可左右切换。play 结束时特意保持 Modal 打开（不点关闭收尾）——
 * 这是本包唯一能可视化查看 ImagePreview 的地方，关闭按钮/Esc/遮罩关闭的行为已在
 * ImagePreview.test.ts 单测里覆盖，story 里再收尾关闭只会让人在 Storybook UI 里看到
 * Modal 一闪而过，看不到实际效果。
 */
export const OpenPreview: Story = {
  render: render(
    imageBlock([
      { url: IMG_A, alt: '变体一' },
      { url: IMG_B, alt: '变体二' },
      { url: IMG_C, alt: '变体三' },
    ]),
  ),
  play: async ({ canvas }) => {
    const triggers = canvas.getAllByRole('button');
    await userEvent.click(triggers[1]!);

    // 预览 Modal 已 Teleport 至 body（canvasElement 之外），须用 screen 而非 canvas 查询
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByAltText('变体二');
    await expect(within(dialog).getByText('2 / 3')).toBeInTheDocument();
  },
};
