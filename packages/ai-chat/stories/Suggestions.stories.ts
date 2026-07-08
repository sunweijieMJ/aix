import { Highlight } from '@aix/icons';
import type { Meta, StoryObj } from '@storybook/vue3';
import { userEvent } from 'storybook/test';
import { markRaw, ref } from 'vue';
import { Suggestions } from '../src';
import type { SuggestionItem } from '../src';

const meta: Meta<typeof Suggestions> = {
  title: 'AI Chat/组件/Suggestions',
  tags: ['autodocs'],
  component: Suggestions,
};
export default meta;
type Story = StoryObj<typeof Suggestions>;

const CUSTOM_ITEMS: SuggestionItem[] = [
  { text: '帮我总结这篇文档', icon: markRaw(Highlight) },
  { text: 'rate-limit-explain', label: '这个接口有限流吗？', icon: markRaw(Highlight) },
  { text: '换一种更简单的说法' },
];

/**
 * StandaloneWithSlot：脱离 `AiChat` 单独使用 `Suggestions`，自带 items（含 icon）与自定义默认插槽
 * （覆盖 chip 的默认文案渲染，加前缀符号）。适合非 AiChat 场景（如自定义会话界面）复用建议 chips 样式。
 */
export const StandaloneWithSlot: Story = {
  render: () => ({
    components: { Suggestions },
    setup() {
      const picked = ref('');
      return {
        items: CUSTOM_ITEMS,
        picked,
        onSelect: (item: SuggestionItem) => (picked.value = item.text),
      };
    },
    template: `
      <div style="padding:16px">
        <div style="margin-bottom:8px;font-size:13px;color:var(--aix-colorTextSecondary)">
          最近选择：{{ picked || '—' }}
        </div>
        <Suggestions :items="items" @select="onSelect">
          <template #default="{ item }">💡 {{ item.label ?? item.text }}</template>
        </Suggestions>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    // 自定义插槽给文案加了「💡 」前缀，testing-library 默认 exact 全等匹配会失败，须部分匹配
    await userEvent.click(canvas.getByText('这个接口有限流吗？', { exact: false }));
    await canvas.findByText(/最近选择：rate-limit-explain/);
  },
};

/**
 * Loading：脱离 AiChat 单独演示 Suggestions 的加载态骨架——追问建议异步生成期间，
 * `loading=true` 时忽略 `items`，渲染 3 个占位胶囊代替空白。
 */
export const Loading: Story = {
  render: () => ({
    components: { Suggestions },
    template: `
      <div style="padding:16px">
        <Suggestions :items="[]" loading />
      </div>
    `,
  }),
};
