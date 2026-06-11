import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, waitFor } from 'storybook/test';
import { ref, onMounted, onUnmounted } from 'vue';
import { Skeleton } from '../src';

/**
 * 通用骨架占位组件：shimmer 流光动画，供「内容已确定、资源未就绪」阶段统一占位——
 * 内置图片骨架即基于它实现；业务自定义卡片（blockRenderers / fence:<lang> 渲染器）
 * 在异步数据就绪前同样建议使用，保证全包占位动效一致。
 *
 * 标准模式（与 MermaidBlock 同款）：流式未 committed → 轻量形态；
 * committed 未就绪 → Skeleton；就绪 → 真实内容；失败 → 回落占位。
 */
const meta: Meta<typeof Skeleton> = {
  title: 'AI Chat/Skeleton',
  tags: ['autodocs'],
  component: Skeleton,
};
export default meta;
type Story = StoryObj<typeof Skeleton>;

/** 块模式：固定高度的整块占位（图片/图表等） */
export const Block: Story = {
  args: { loading: true, height: '120px' },
};

/** 行模式：N 行文本占位（末行短行），适合卡片文案区 */
export const Rows: Story = {
  args: { loading: true, rows: 4 },
};

/** 宽高比模式：按比例占位（如 2:1 的横幅图） */
export const AspectRatio: Story = {
  args: { loading: true, aspectRatio: '2 / 1' },
};

/** 加载完成切换：2 秒后 loading 置 false，骨架切换为插槽真实内容 */
export const LoadingToContent: Story = {
  render: () => ({
    components: { Skeleton },
    setup() {
      const loading = ref(true);
      let timer: ReturnType<typeof setTimeout> | null = null;
      onMounted(() => {
        timer = setTimeout(() => {
          loading.value = false;
        }, 2000);
      });
      onUnmounted(() => {
        if (timer) clearTimeout(timer);
      });
      return { loading };
    },
    template: `
      <Skeleton :loading="loading" :rows="3">
        <div style="padding:12px;border:1px solid var(--aix-colorBorderSecondary);border-radius:8px">
          <strong>数据卡片</strong>
          <p style="margin:8px 0 0">异步内容就绪后替换骨架展示。</p>
        </div>
      </Skeleton>`,
  }),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.aix-skeleton')).toBeTruthy());
    await waitFor(() => expect(canvasElement.textContent).toContain('数据卡片'), {
      timeout: 5000,
    });
  },
};
