import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent } from 'storybook/test';
import { Thinking } from '../src';

const meta: Meta<typeof Thinking> = {
  title: 'AI Chat/组件/Thinking',
  tags: ['autodocs'],
  component: Thinking,
  args: {
    content: '正在分析问题…先拆解用户意图，再检索相关知识，最后组织回答。',
    title: '',
    expanded: false,
  },
};
export default meta;
type Story = StoryObj<typeof Thinking>;

/** 折叠态（默认）：只显示 header，body 隐藏 */
export const Collapsed: Story = {
  args: { expanded: false },
  play: async ({ canvas }) => {
    // 默认折叠，body 不存在于 DOM 中
    const body = canvas.queryByText('正在分析问题…先拆解用户意图，再检索相关知识，最后组织回答。');
    await expect(body).toBeNull();
  },
};

/** 展开态：expanded=true，body 直接可见 */
export const Expanded: Story = {
  args: { expanded: true },
  play: async ({ canvas }) => {
    const body = canvas.getByText('正在分析问题…先拆解用户意图，再检索相关知识，最后组织回答。');
    await expect(body).toBeInTheDocument();
  },
};

/**
 * 点击展开：点击 header 后 body 出现
 */
export const ToggleOnClick: Story = {
  args: { expanded: false, content: '这段思考过程包含了多步推理和知识检索。' },
  play: async ({ canvas }) => {
    // 初始折叠
    await expect(canvas.queryByText('这段思考过程包含了多步推理和知识检索。')).toBeNull();
    // 点击 header 展开
    const header = canvas.getByRole('button');
    await userEvent.click(header);
    // body 应出现，包含 content 文本
    const body = canvas.getByText('这段思考过程包含了多步推理和知识检索。');
    await expect(body).toBeInTheDocument();
  },
};

/** 自定义标题 */
export const CustomTitle: Story = {
  args: { title: '深度推理中...', expanded: true },
};

/**
 * CustomSlots：`title` / `arrow` / 默认插槽全部开放，只想换其中一处时不必接管整个折叠壳
 * （展开态、`aria-expanded`、箭头动效都还在）。三个插槽都带 `{ open }` 作用域。
 *
 * 在 `reasoning` 块里用时，改经 `#reasoning-title` / `#reasoning-arrow` / `#reasoning-body`
 * 穿透（作用域会额外增补思考耗时 `elapsed` 与 `streaming`），见 README「自定义深度思考 UI」。
 */
export const CustomSlots: Story = {
  args: { expanded: true },
  render: (args) => ({
    components: { Thinking },
    setup: () => ({ args }),
    template: `
      <Thinking v-bind="args">
        <template #title="{ open }">
          <span class="demo-thinking-title">{{ open ? '▾ 深度思考' : '▸ 深度思考（已折叠）' }}</span>
        </template>
        <template #arrow="{ open }">
          <span class="demo-thinking-arrow">{{ open ? '收起' : '展开' }}</span>
        </template>
        <ol class="demo-thinking-steps">
          <li>拆解问题</li>
          <li>检索资料</li>
          <li>归纳结论</li>
        </ol>
      </Thinking>
    `,
  }),
  play: async ({ canvas }) => {
    await canvas.findByText('▾ 深度思考');
    await expect(await canvas.findByText('收起')).toBeInTheDocument();
    // 内置 ▾ 字符箭头已被替换
    await expect(canvas.queryByText('▾', { exact: true })).not.toBeInTheDocument();
    await expect(await canvas.findByText('拆解问题')).toBeInTheDocument();
  },
};
