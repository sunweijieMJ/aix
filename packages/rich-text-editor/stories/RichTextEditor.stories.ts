import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import { RichTextEditor } from '../src';

const meta: Meta<typeof RichTextEditor> = {
  title: 'Components/RichTextEditor',
  component: RichTextEditor,
  tags: ['autodocs'],
  argTypes: {
    outputFormat: {
      control: 'select',
      options: ['html', 'json', 'text'],
      description: '内容输出格式',
    },
    locale: {
      control: 'select',
      options: ['zh-CN', 'en-US'],
      description: '语言',
    },
    readonly: {
      control: 'boolean',
      description: '是否只读',
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
    },
    showToolbar: {
      control: 'boolean',
      description: '是否显示工具栏',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** 基础用法 - 仅默认功能 */
export const Default: Story = {
  render: (args) => ({
    components: { RichTextEditor },
    setup() {
      const content = ref('<p>Hello, World!</p>');
      return { args, content };
    },
    template: `
      <RichTextEditor
        v-model="content"
        v-bind="args"
        placeholder="请输入内容..."
      />
      <div style="margin-top: 16px; padding: 12px; background: #f5f5f5; border-radius: 4px;">
        <strong>Output:</strong>
        <pre style="white-space: pre-wrap; word-break: break-all;">{{ content }}</pre>
      </div>
    `,
  }),
};

/** 模拟图片上传（返回占位图 URL） */
function mockImageUpload(file: File): Promise<string> {
  return new Promise((resolve) => {
    // 用 FileReader 转 base64 作为演示
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

/** 模拟 @提及 查询 */
const mockUsers = [
  { id: 1, label: '张三' },
  { id: 2, label: '李四' },
  { id: 3, label: '王五' },
  { id: 4, label: 'Alice' },
  { id: 5, label: 'Bob' },
];

function mockQueryMentionItems(query: string) {
  if (!query) return mockUsers;
  return mockUsers.filter((u) =>
    u.label.toLowerCase().includes(query.toLowerCase()),
  );
}

/** 全部增强功能 */
export const AllFeatures: Story = {
  render: (args) => ({
    components: { RichTextEditor },
    setup() {
      const content = ref(
        '<h2>全功能演示</h2><p>这是一个启用了所有增强功能的富文本编辑器。</p><p>输入 @ 可触发提及功能。</p>',
      );
      return { args, content, mockImageUpload, mockQueryMentionItems };
    },
    template: `
      <RichTextEditor
        v-model="content"
        v-bind="args"
        :table="true"
        :task-list="true"
        :image="{ upload: mockImageUpload, allowBase64: true }"
        :video="{ allowYoutube: true }"
        :text-align="true"
        :text-color="true"
        :font-size="true"
        :font-family="true"
        :highlight="true"
        :superscript-subscript="true"
        :character-count="{ limit: 1000 }"
        :mention="{ queryItems: mockQueryMentionItems }"
        placeholder="请输入内容..."
      />
    `,
  }),
};

/** 只读模式 */
export const Readonly: Story = {
  render: () => ({
    components: { RichTextEditor },
    setup() {
      const content = ref(
        '<h3>只读内容</h3><p>这段内容是<strong>只读</strong>的，无法编辑。</p>',
      );
      return { content };
    },
    template: '<RichTextEditor v-model="content" readonly />',
  }),
};

/** 禁用状态 */
export const Disabled: Story = {
  render: () => ({
    components: { RichTextEditor },
    setup() {
      const content = ref('<p>禁用状态</p>');
      return { content };
    },
    template: '<RichTextEditor v-model="content" disabled />',
  }),
};

/** 自定义高度 */
export const CustomHeight: Story = {
  render: () => ({
    components: { RichTextEditor },
    setup() {
      const content = ref('<p>固定高度 400px</p>');
      return { content };
    },
    template:
      '<RichTextEditor v-model="content" height="400px" placeholder="固定高度编辑器" />',
  }),
};

/** 英文界面 */
export const EnglishLocale: Story = {
  render: () => ({
    components: { RichTextEditor },
    setup() {
      const content = ref('<p>English editor interface</p>');
      return { content };
    },
    template:
      '<RichTextEditor v-model="content" locale="en-US" placeholder="Start typing..." />',
  }),
};

/** 无 Toolbar */
export const NoToolbar: Story = {
  render: () => ({
    components: { RichTextEditor },
    setup() {
      const content = ref('<p>无工具栏的编辑器</p>');
      return { content };
    },
    template:
      '<RichTextEditor v-model="content" :show-toolbar="false" placeholder="无工具栏模式..." />',
  }),
};
