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
        :video="true"
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

/**
 * 配置驱动上传 - 零回调接入
 *
 * 通过 server + headers + responsePath 配置，无需手写 fetch 逻辑。
 * 组件内部自动封装 FormData 上传和响应解析。
 *
 * > 注意：此 Story 使用模拟接口，实际使用时替换为真实 API 地址。
 * > responsePath 默认 'data.url'，需根据后端响应结构调整。
 */
export const ServerUpload: Story = {
  render: (args) => ({
    components: { RichTextEditor },
    setup() {
      const content = ref(
        '<h2>配置驱动上传</h2><p>图片和视频上传通过 server 配置接入，无需手写 upload 回调。</p>',
      );

      const imageConfig = {
        server: '/api/upload/image',
        headers: () => ({ Authorization: 'Bearer demo-token' }),
        responsePath: 'data.url',
        maxSize: 10 * 1024 * 1024,
        beforeUpload: (file: File) => {
          console.log('[beforeUpload] 文件名:', file.name, '大小:', file.size);
          return true;
        },
        onSuccess: (url: string) => {
          console.log('[onSuccess] 上传成功:', url);
        },
        onError: (error: { type: string; message: string }) => {
          console.error('[onError]', error.type, error.message);
        },
      };

      const videoConfig = {
        server: '/api/upload/video',
        headers: () => ({ Authorization: 'Bearer demo-token' }),
        responsePath: 'data.url',
        timeout: 60000,
      };

      return { args, content, imageConfig, videoConfig };
    },
    template: `
      <RichTextEditor
        v-model="content"
        v-bind="args"
        :image="imageConfig"
        :video="videoConfig"
        placeholder="配置驱动上传演示..."
      />
      <div style="margin-top: 12px; padding: 8px; background: #fffbe6; border-radius: 4px; font-size: 13px;">
        提示：此演示使用模拟 API 地址，上传会失败。实际使用时请替换为真实接口。
      </div>
    `,
  }),
};

/**
 * 配置驱动 @提及 - 服务端查询
 *
 * 通过 server + transformResponse 配置，从后端 API 获取提及候选列表。
 */
export const ServerMention: Story = {
  render: (args) => ({
    components: { RichTextEditor },
    setup() {
      const content = ref(
        '<p>输入 @ 触发提及，数据来源于 server 配置的 API 接口。</p>',
      );

      const mentionConfig = {
        server: '/api/users/search',
        queryParamName: 'keyword',
        responsePath: 'data.list',
        headers: () => ({ Authorization: 'Bearer demo-token' }),
        transformResponse: (
          items: Array<{ userId: number; nickname: string }>,
        ) => items.map((i) => ({ id: i.userId, label: i.nickname })),
        onError: (error: { type: string; message: string }) => {
          console.error('[Mention onError]', error.type, error.message);
        },
      };

      return { args, content, mentionConfig };
    },
    template: `
      <RichTextEditor
        v-model="content"
        v-bind="args"
        :mention="mentionConfig"
        placeholder="输入 @ 触发服务端提及查询..."
      />
      <div style="margin-top: 12px; padding: 8px; background: #fffbe6; border-radius: 4px; font-size: 13px;">
        提示：此演示使用模拟 API 地址，查询会失败。实际使用时请替换为真实接口。
      </div>
    `,
  }),
};

/**
 * beforeUpload 钩子演示
 *
 * 展示上传前拦截：文件重命名、返回 false 阻止上传。
 */
export const BeforeUploadHook: Story = {
  render: (args) => ({
    components: { RichTextEditor },
    setup() {
      const content = ref('<p>上传图片前会经过 beforeUpload 钩子处理。</p>');

      const imageConfig = {
        upload: mockImageUpload,
        allowBase64: true,
        maxSize: 2 * 1024 * 1024,
        beforeUpload: (file: File) => {
          // 只允许 png 和 jpg
          if (!['image/png', 'image/jpeg'].includes(file.type)) {
            alert('仅支持 PNG 和 JPG 格式');
            return false;
          }
          console.log('[beforeUpload] 通过校验:', file.name);
          return file;
        },
        onSuccess: (url: string) => {
          console.log('[onSuccess] 图片已插入');
        },
        onError: (error: { type: string; message: string }) => {
          alert(`上传失败: ${error.message}`);
        },
      };

      return { args, content, imageConfig };
    },
    template: `
      <RichTextEditor
        v-model="content"
        v-bind="args"
        :image="imageConfig"
        placeholder="上传图片会经过 beforeUpload 钩子..."
      />
    `,
  }),
};

/**
 * customPicker 模式 - 自定义资源选择器
 *
 * 通过 customPicker 回调完全替代原生文件选择和上传流程。
 * 适用于接入资源库弹窗、图床选择器等自定义 UI 场景。
 */
export const CustomPicker: Story = {
  render: (args) => ({
    components: { RichTextEditor },
    setup() {
      const content = ref(
        '<h2>自定义资源选择器</h2><p>点击图片/视频按钮会调用 customPicker，由业务方完全控制选择流程。</p>',
      );

      const imageConfig = {
        customPicker: async () => {
          // 模拟：弹出自定义资源库弹窗，用户选择后返回 URL
          const url = window.prompt(
            '模拟资源库弹窗 - 输入图片 URL（留空取消）',
            'https://picsum.photos/400/300',
          );
          return url || null;
        },
      };

      const videoConfig = {
        customPicker: async () => {
          const url = window.prompt(
            '模拟资源库弹窗 - 输入视频 URL（留空取消）',
          );
          return url || null;
        },
      };

      return { args, content, imageConfig, videoConfig };
    },
    template: `
      <RichTextEditor
        v-model="content"
        v-bind="args"
        :image="imageConfig"
        :video="videoConfig"
        placeholder="customPicker 模式演示..."
      />
      <div style="margin-top: 12px; padding: 8px; background: #f0f5ff; border-radius: 4px; font-size: 13px;">
        提示：此演示使用 window.prompt 模拟资源库弹窗。实际使用时替换为业务方的资源选择组件。
      </div>
    `,
  }),
};
