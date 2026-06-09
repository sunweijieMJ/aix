/**
 * AttachmentCard.stories.ts
 *
 * 附件卡片：输入区上传预览与气泡回显共用。覆盖两种形态（文件卡 / 图片卡）
 * 与各过程态（默认就绪 / uploading 进度 / 不确定进度 / error 重试），以及 removable 删除按钮。
 *
 * 注：上传流程依赖文件选择对话框，无法在 play 中自动化（Sender/AiChat 的附件 story
 * 因此只能断言空面板）。本文件用静态 item 直接喂各状态，补齐 AttachmentCard 自身的状态演示。
 */
import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, fn } from 'storybook/test';
import { AttachmentCard } from '../src';
import type { AttachmentCardItem } from '../src';

// 离线可渲染的缩略图占位（内联 SVG data URI，避免 story 依赖网络图片）
const imageUrl =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='68' height='68'><rect width='68' height='68' fill='%234096ff'/><text x='34' y='40' font-size='12' fill='white' text-anchor='middle'>IMG</text></svg>";

const meta: Meta<typeof AttachmentCard> = {
  title: 'AI Chat/AttachmentCard',
  component: AttachmentCard,
  args: {
    onRemove: fn(),
    onRetry: fn(),
  },
  render: (args) => ({
    components: { AttachmentCard },
    setup: () => ({ args }),
    template: `<AttachmentCard v-bind="args" @remove="args.onRemove" @retry="args.onRetry" />`,
  }),
};
export default meta;
type Story = StoryObj<typeof AttachmentCard>;

/** 文件卡（就绪）：左图标 + 右双行「后缀 · 大小」 */
export const FileDefault: Story = {
  args: {
    item: { id: 'f1', name: '季度财报.pdf', size: 2_400_000, mime: 'application/pdf' },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('季度财报.pdf')).toBeInTheDocument();
    await expect(canvas.getByText('PDF · 2.3 MB')).toBeInTheDocument();
  },
};

/** 图片卡（就绪）：68×68 正方形缩略图 + 名称悬浮条 */
export const ImageDefault: Story = {
  args: {
    item: { id: 'i1', name: '截图.png', size: 80_000, mime: 'image/png', url: imageUrl },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.aix-attachment-card--image')).toBeTruthy();
    await expect(canvasElement.querySelector('img')).toBeTruthy();
  },
};

/** 上传中（文件）：描述行替换为进度条，百分比已知 */
export const Uploading: Story = {
  args: {
    item: {
      id: 'f2',
      name: '大型数据集.zip',
      size: 50_000_000,
      mime: 'application/zip',
      status: 'uploading',
      percent: 42,
    },
  },
  play: async ({ canvasElement }) => {
    const bar = canvasElement.querySelector<HTMLElement>('.aix-attachment-card__progress-bar');
    await expect(bar).toBeTruthy();
    await expect(bar!.style.width).toBe('42%');
  },
};

/** 上传中（不确定进度）：percent 缺省 → 进度条走 indeterminate 动画 */
export const UploadingIndeterminate: Story = {
  args: {
    item: { id: 'f3', name: '处理中.bin', mime: 'application/octet-stream', status: 'uploading' },
  },
  play: async ({ canvasElement }) => {
    const bar = canvasElement.querySelector('.aix-attachment-card__progress-bar');
    await expect(bar?.classList.contains('is-indeterminate')).toBe(true);
  },
};

/** 上传中（图片）：缩略图上盖 mask 显示百分比 */
export const UploadingImage: Story = {
  args: {
    item: {
      id: 'i2',
      name: '上传中.jpg',
      mime: 'image/jpeg',
      url: imageUrl,
      status: 'uploading',
      percent: 66,
    },
  },
  play: async ({ canvasElement }) => {
    const mask = canvasElement.querySelector('.aix-attachment-card__mask-progress');
    await expect(mask?.textContent?.trim()).toBe('66%');
  },
};

/** 失败（文件）：描述行变红字错误信息，原位显示重试按钮，点击触发 retry */
export const ErrorWithRetry: Story = {
  args: {
    item: {
      id: 'f4',
      name: '损坏文件.docx',
      mime: 'application/msword',
      status: 'error',
      error: '上传失败：网络超时',
    },
  },
  play: async ({ canvas, canvasElement, args }) => {
    await expect(canvasElement.querySelector('.aix-attachment-card.is-error')).toBeTruthy();
    await expect(canvas.getByText('上传失败：网络超时')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: '重试上传' }));
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};

/** 失败（图片）：缩略图盖 mask 显示「!」标记 + 重试按钮 */
export const ErrorImage: Story = {
  args: {
    item: {
      id: 'i3',
      name: '失败.png',
      mime: 'image/png',
      url: imageUrl,
      status: 'error',
      error: new Error('文件过大'),
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelector('.aix-attachment-card__mask-error')).toBeTruthy();
    await expect(canvas.getByRole('button', { name: '重试上传' })).toBeInTheDocument();
  },
};

/** 可删除：removable=true 显示删除按钮（输入区预览场景），点击触发 remove */
export const Removable: Story = {
  args: {
    item: { id: 'f5', name: '可删除.txt', size: 1200, mime: 'text/plain' } as AttachmentCardItem,
    removable: true,
  },
  play: async ({ canvas, args }) => {
    const removeBtn = canvas.getByRole('button', { name: '删除附件' });
    await expect(removeBtn).toBeInTheDocument();
    await userEvent.click(removeBtn);
    await expect(args.onRemove).toHaveBeenCalledTimes(1);
  },
};
