import type { Meta, StoryObj } from '@storybook/vue3';
import { reactive } from 'vue';
import { expect, userEvent } from 'storybook/test';
import { ChoiceBlock } from '../src';
import type { ChoiceBlockProps } from '../src';
import { choiceBlock } from '../src/utils/helpers';

/**
 * 构造一道演示单选题（每次调用新建，避免 story 间共享可变状态）。
 * @param extra 覆盖默认字段（如 mode / editable / selected）
 */
const singleQuestion = (extra: Partial<Parameters<typeof choiceBlock>[0]> = {}) =>
  choiceBlock({
    stem: '关于梵高《向日葵》下列说法正确的是（ ）',
    options: [
      { id: 'o1', label: 'A', content: '创作于巴黎时期' },
      { id: 'o2', label: 'B', content: '现藏于阿尔勒美术馆' },
      { id: 'o3', label: 'C', content: '属于点彩画派代表作' },
      { id: 'o4', label: 'D', content: '使用大量铬黄颜料' },
    ],
    answer: 'o4',
    analysis: '梵高《向日葵》系列大量使用铬黄，创作于阿尔勒时期。',
    ...extra,
  });

/** 构造一道演示多选题（multiple:true，answer / selected 为选项 id 数组）。 */
const multiQuestion = (extra: Partial<Parameters<typeof choiceBlock>[0]> = {}) =>
  choiceBlock({
    stem: '下列哪些属于印象派代表画家（多选）',
    options: [
      { id: 'm1', label: 'A', content: '克劳德·莫奈' },
      { id: 'm2', label: 'B', content: '皮埃尔·雷诺阿' },
      { id: 'm3', label: 'C', content: '萨尔瓦多·达利' },
      { id: 'm4', label: 'D', content: '埃德加·德加' },
    ],
    multiple: true,
    answer: ['m1', 'm2', 'm4'],
    analysis: '莫奈、雷诺阿、德加均为印象派代表；达利属于超现实主义。',
    ...extra,
  });

const meta: Meta<typeof ChoiceBlock> = {
  title: 'AI Chat/ChoiceBlock',
  component: ChoiceBlock,
  parameters: {
    docs: {
      description: {
        component:
          '选择题内容块渲染器（choice 块的内置渲染器，单选 / 多选统一）。复用 ResultCard 外壳，支持三态：\n\n' +
          '- **review**（默认）：只读结果卡，直出题干 / 选项 / 标准答案 / 解析；\n' +
          '- **answer**：可点击作答，点选项经 onBlockAction 上抛 `select`（单选回写 string，多选回写数组）；\n' +
          '- **editable**：卡片右上角出现编辑按钮，进入编辑表单（题干 / 选项 / 对号标记答案 / 增删 / 上下移 / 解析 / 保存退出），保存经 onBlockAction 上抛 `edit`。\n\n' +
          '单选与多选差异仅由 `multiple` 标记 + `answer/selected` 是否为数组体现，同一渲染器覆盖两种题型。',
      },
    },
  },
  render: (args) => ({
    components: { ChoiceBlock },
    setup: () => ({ args }),
    template: '<div style="width:440px"><ChoiceBlock v-bind="args" /></div>',
  }),
};
export default meta;
type Story = StoryObj<typeof ChoiceBlock>;

/** 单选 · review 只读结果卡：题干 + 4 选项 + 标准答案（D）+ 解析 + 底部操作 pill */
export const SingleReview: Story = {
  args: { block: singleQuestion() },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('单项选择题')).toBeInTheDocument();
    await expect(canvas.getByText(/标准答案/)).toHaveTextContent('D');
    // 解析区文本（用解析独有的措辞定位，避免与选项「使用大量铬黄颜料」重复匹配）
    await expect(canvas.getByText(/系列大量使用铬黄/)).toBeInTheDocument();
    await expect(canvas.getByText(/插入视频/)).toBeInTheDocument();
  },
};

/** 多选 · review 只读结果卡：标题显示「多项选择题」，标准答案多个用、连接（A、B、D） */
export const MultiReview: Story = {
  args: { block: multiQuestion() },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('多项选择题')).toBeInTheDocument();
    await expect(canvas.getByText(/标准答案/)).toHaveTextContent('A、B、D');
  },
};

/**
 * 单选 · answer 可作答：受控演示——onBlockAction 收到 select 后把 selected 写回 block，
 * 触发选项高亮（单选回写 string，互斥）。
 */
export const SingleAnswer: Story = {
  render: () => ({
    components: { ChoiceBlock },
    setup() {
      // reactive 包裹：回写 selected 时模板才能响应式重渲染（受控高亮）
      const block = reactive(singleQuestion({ mode: 'answer' }));
      const onBlockAction: NonNullable<ChoiceBlockProps['onBlockAction']> = (a) => {
        if (a.type === 'select') block.selected = a.patch.selected as string;
      };
      return { block, onBlockAction };
    },
    template:
      '<div style="width:440px"><ChoiceBlock :block="block" :on-block-action="onBlockAction" /></div>',
  }),
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByText('使用大量铬黄颜料'));
    const selected = canvasElement.querySelectorAll('.aix-choice__option.is-selected');
    // 单选互斥：始终只有一个高亮项
    await expect(selected.length).toBe(1);
  },
};

/**
 * 多选 · answer 可作答：受控演示——onBlockAction 收到 select 后把 selected 数组写回 block，
 * 多次点击可增删高亮项（再次点击同项取消）。
 */
export const MultiAnswer: Story = {
  render: () => ({
    components: { ChoiceBlock },
    setup() {
      const block = reactive(
        multiQuestion({ mode: 'answer', answer: undefined, analysis: undefined }),
      );
      const onBlockAction: NonNullable<ChoiceBlockProps['onBlockAction']> = (a) => {
        if (a.type === 'select') block.selected = a.patch.selected as string[];
      };
      return { block, onBlockAction };
    },
    template:
      '<div style="width:440px"><ChoiceBlock :block="block" :on-block-action="onBlockAction" /></div>',
  }),
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByText('克劳德·莫奈'));
    await userEvent.click(canvas.getByText('皮埃尔·雷诺阿'));
    // 多选可同时高亮多项
    await expect(canvasElement.querySelectorAll('.aix-choice__option.is-selected').length).toBe(2);
    // 再次点击取消
    await userEvent.click(canvas.getByText('皮埃尔·雷诺阿'));
    await expect(canvasElement.querySelectorAll('.aix-choice__option.is-selected').length).toBe(1);
  },
};

/**
 * 单选 · 可编辑：editable:true，点击右上角编辑按钮进入编辑表单
 * （题干 / 选项 / 对号标记答案 / 增删 / 上下移 / 解析 / 保存退出）。
 * 受控演示——保存（edit）后把补丁合并回 block 并退出编辑态。
 */
export const EditableSingle: Story = {
  render: () => ({
    components: { ChoiceBlock },
    setup() {
      const block = reactive(singleQuestion({ editable: true }));
      const onBlockAction: NonNullable<ChoiceBlockProps['onBlockAction']> = (a) => {
        if (a.type === 'edit') Object.assign(block, a.patch);
      };
      return { block, onBlockAction };
    },
    template:
      '<div style="width:440px"><ChoiceBlock :block="block" :on-block-action="onBlockAction" /></div>',
  }),
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByLabelText('编辑'));
    await expect(canvasElement.querySelector('.aix-choice__edit')).toBeTruthy();
    // 单选编辑：对号标记答案互斥（始终只有一个 is-checked）
    const marks = canvasElement.querySelectorAll('.aix-choice__mark');
    await userEvent.click(marks[0] as HTMLElement);
    await expect(canvasElement.querySelectorAll('.aix-choice__mark.is-checked').length).toBe(1);
  },
};

/**
 * 多选 · 可编辑：multiple:true + editable:true，编辑态对号可标记多个正确答案。
 */
export const EditableMulti: Story = {
  render: () => ({
    components: { ChoiceBlock },
    setup() {
      const block = reactive(multiQuestion({ editable: true }));
      const onBlockAction: NonNullable<ChoiceBlockProps['onBlockAction']> = (a) => {
        if (a.type === 'edit') Object.assign(block, a.patch);
      };
      return { block, onBlockAction };
    },
    template:
      '<div style="width:440px"><ChoiceBlock :block="block" :on-block-action="onBlockAction" /></div>',
  }),
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByLabelText('编辑'));
    // 多选编辑：可同时标记多个正确答案（默认 A、B、D 已标）
    await expect(canvasElement.querySelectorAll('.aix-choice__mark.is-checked').length).toBe(3);
  },
};
