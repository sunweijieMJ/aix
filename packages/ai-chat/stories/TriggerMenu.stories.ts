import { Delete, Message, People } from '@aix/icons';
import type { Meta, StoryObj } from '@storybook/vue3';
import { fn, expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { markRaw } from 'vue';
import { Sender } from '../src';
import type { TriggerItem } from '../src';

/**
 * 触发菜单（@提及 / 斜杠命令）
 *
 * 通过 `Sender` 的 `triggers` prop（opt-in）接入：按字符触发的候选菜单，覆盖
 * @提及（异步搜索 + loading 态）与 / 斜杠命令（insertText 回填 / onSelect 命令式行为）两类典型场景。
 * `triggers` 视为静态配置（setup 快照），运行时切换不生效，与 attachments/voice 约定一致。
 */
const meta: Meta<typeof Sender> = {
  title: 'AI Chat/组件/触发菜单（@提及 & 斜杠命令）',
  tags: ['autodocs'],
  component: Sender,
  args: {
    modelValue: '',
    // placeholder 由各 story 按自身配置的触发字符分别给出——共享的「试试输入 @ 或 /…」
    // 曾误导用户在仅配置 @ 的场景里输入 / 并误判为 Bug
    onSubmit: fn(),
    onCancel: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof Sender>;

// ──────────────────────────────────────────────
// 场景一：@ 提及（异步搜索），人为 300ms 延迟展示 loading 态
// ──────────────────────────────────────────────

const PEOPLE: TriggerItem[] = [
  { value: 'zhangsan', label: '张三', icon: markRaw(People), description: '前端工程师' },
  { value: 'lisi', label: '李四', icon: markRaw(People), description: '产品经理' },
  { value: 'wangwu', label: '王五', icon: markRaw(People), description: '设计师' },
];

/** 异步候选：人为延迟 300ms 模拟真实检索接口，期间 TriggerMenu 展示 loading 态 */
const searchPeople = (query: string): Promise<TriggerItem[]> =>
  new Promise((resolve) => {
    setTimeout(() => {
      const q = query.toLowerCase();
      resolve(
        q
          ? PEOPLE.filter(
              (p) => p.label.toLowerCase().includes(q) || p.value.toLowerCase().includes(q),
            )
          : PEOPLE,
      );
    }, 300);
  });

/**
 * @ 提及：items 传函数即为异步搜索，Promise 未resolve 期间菜单展示 loading 文案，
 * resolve 后渲染候选（带 icon + description）。
 * play：键入 @ → 断言 loading 态出现 → 断言候选列表最终渲染。
 */
export const AtMentionAsync: Story = {
  args: {
    triggers: [{ char: '@', items: searchPeople }],
    placeholder: '输入 @ 提及成员（本示例仅配置 @ 触发）…',
  },
  render: (args) => ({
    components: { Sender },
    setup: () => ({ args }),
    template: `
      <Sender
        v-bind="args"
        @submit="args.onSubmit"
        @cancel="args.onCancel"
        @update:modelValue="args['onUpdate:modelValue']"
      />
    `,
  }),
  play: async ({ canvas }) => {
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.type(textarea, '@');
    // 菜单已 Teleport 至 body（canvasElement 之外），须用 screen 而非 canvas 查询
    // 异步搜索期间（300ms 内）菜单展示 loading 态
    await waitFor(() => expect(screen.getByText('加载中…')).toBeInTheDocument());
    // resolve 后候选列表渲染（含 icon + description）。注意：loading 态的 listbox 已在
    // DOM，findByRole 会立即 resolve，此刻 300ms 延迟未到、候选还没渲染——候选断言必须用
    // findByText 异步等待，同步 getByText 在真实浏览器确定性失败
    const menu = await screen.findByRole('listbox', undefined, { timeout: 2000 });
    await within(menu).findByText('张三', undefined, { timeout: 2000 });
    await within(menu).findByText('前端工程师', undefined, { timeout: 2000 });
  },
};

// ──────────────────────────────────────────────
// 场景二：/ 命令双行为（insertText 回填 + onSelect 命令式副作用），行首触发
// ──────────────────────────────────────────────

const COMMANDS: TriggerItem[] = [
  {
    value: 'translate',
    label: '/翻译',
    icon: markRaw(Message),
    description: '插入翻译请求模板',
    insertText: '请翻译：',
  },
  {
    value: 'clear',
    label: '/清空',
    icon: markRaw(Delete),
    description: '命令式副作用示例（不回填文本）',
    // 纯 onSelect 项：insertText 缺省为 ''，等价「仅清除已键入的触发段」；副作用交给业务自定义
    // （此处用 alert 模拟，真实业务可替换为清空会话 / 打开弹窗等任意命令）
    onSelect: () => window.alert('「/清空」已触发（示例副作用，业务可替换为真实清空逻辑）'),
  },
];

/**
 * / 命令：`insertText` 型选中后按约定回填（不含触发字符，由 keepTrigger 统一控制前缀，
 * '/' 默认不保留）；纯 `onSelect` 型仅清除已键入的触发段并执行命令式行为。
 * '/' 默认 `position: 'start'`——仅行首触发，正文中键入不弹菜单。
 * play：正文键入 / 不弹菜单 → 行首键入 / 菜单出现两个候选 → Enter 选中 insertText 项并断言回填结果。
 */
export const SlashCommand: Story = {
  args: {
    triggers: [{ char: '/', items: COMMANDS }],
    placeholder: '在行首输入 / 唤起命令（正文中间不触发）…',
  },
  render: (args) => ({
    components: { Sender },
    setup: () => ({ args }),
    template: `
      <Sender
        v-bind="args"
        @submit="args.onSubmit"
        @cancel="args.onCancel"
        @update:modelValue="args['onUpdate:modelValue']"
      />
    `,
  }),
  play: async ({ canvas }) => {
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    // 正文中键入 '/'（前面已有非空白字符）：'/' 默认仅行首触发，菜单不弹出
    await userEvent.type(textarea, 'abc/');
    expect(screen.queryByRole('listbox')).toBeNull();
    await userEvent.clear(textarea);
    // 行首键入 '/'：菜单出现，两个候选并存
    await userEvent.type(textarea, '/');
    const menu = await screen.findByRole('listbox');
    await expect(within(menu).getByText('/翻译')).toBeInTheDocument();
    await expect(within(menu).getByText('/清空')).toBeInTheDocument();
    // Enter 选中默认高亮的第一项（insertText 型：'/翻译' → 回填 '请翻译：'，不保留触发字符）
    await userEvent.keyboard('{Enter}');
    await expect(textarea).toHaveValue('请翻译：');
    // 清空残留：play 留下的「请翻译：」会让手工在其后键入 / 不触发（行首规则），误导人工测试
    await userEvent.clear(textarea);
  },
};

// ──────────────────────────────────────────────
// 场景三：mention 提交 meta——@submit 第三参回传 meta.mentions
// ──────────────────────────────────────────────

/**
 * mention 提交 meta：选中 @ 候选后发送，`submit` 事件第三参 `meta.mentions` 携带结构化实体
 * `{ value, label, trigger }`，回传到 Storybook actions 面板（此处也做直接断言）。
 * 提交文本经 trim——末尾 mention 自带的尾随空格不会保留在提交文本里，但 `meta.mentions` 不受影响
 * （已裁决行为，与回填到输入框中的可见文本 `'@张三 '` 有一空格之差）。
 * play：键入 @ 选中张三 → 发送 → 断言 onSubmit 收到 trim 后文本与 mentions 元信息。
 */
export const MentionSubmitMeta: Story = {
  args: {
    triggers: [{ char: '@', items: PEOPLE }],
    placeholder: '输入 @ 选中候选后回车发送，观察 actions 面板的 meta…',
  },
  render: (args) => ({
    components: { Sender },
    setup: () => ({ args }),
    template: `
      <Sender
        v-bind="args"
        @submit="args.onSubmit"
        @cancel="args.onCancel"
        @update:modelValue="args['onUpdate:modelValue']"
      />
    `,
  }),
  play: async ({ canvas, args }) => {
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.type(textarea, '请帮我联系 @张');
    const menu = await screen.findByRole('listbox');
    await expect(within(menu).getByText('张三')).toBeInTheDocument();
    await userEvent.keyboard('{Enter}'); // 选中候选：回填 '@张三 '（'@' 默认保留触发字符 + 追加空格）
    await expect(textarea).toHaveValue('请帮我联系 @张三 ');
    await userEvent.keyboard('{Enter}'); // 提交
    await expect(args.onSubmit).toHaveBeenCalledWith('请帮我联系 @张三', undefined, {
      mentions: [{ value: 'zhangsan', label: '张三', trigger: '@' }],
    });
  },
};
