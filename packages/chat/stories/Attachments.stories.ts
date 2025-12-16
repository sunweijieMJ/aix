import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { Attachments } from '../src/components/Attachments';
import type { AttachmentItem } from '../src/components/Attachments/types';

const meta: Meta<typeof Attachments> = {
  title: 'Chat/Attachments',
  component: Attachments,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '附件管理组件，支持文件上传、预览、删除。支持拖拽上传和文件类型/大小限制。',
      },
    },
  },
  argTypes: {
    accept: {
      control: 'object',
      description: '接受的文件类型',
    },
    maxSize: {
      control: 'number',
      description: '最大文件大小（字节）',
    },
    maxCount: {
      control: 'number',
      description: '最大文件数量',
    },
    disabled: {
      control: 'boolean',
      description: '禁用状态',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础用法
 */
export const Basic: Story = {
  render: () => ({
    components: { Attachments },
    setup() {
      const attachments = ref<AttachmentItem[]>([]);

      const handleUpload = (file: File) => {
        console.log('上传文件:', file.name);
        const item = attachments.value.find((i) => i.file === file);
        if (item) {
          let progress = 0;
          const timer = setInterval(() => {
            progress += 10;
            item.progress = progress;
            if (progress >= 100) {
              clearInterval(timer);
              item.status = 'success';
              item.url = URL.createObjectURL(file);
            }
          }, 200);
        }
      };

      const handleError = (error: Error) => {
        alert(error.message);
      };

      return { attachments, handleUpload, handleError };
    },
    template: `
      <div style="max-width: 600px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
        <h3 style="margin: 0 0 16px 0; font-size: 16px;">文件上传</h3>
        <Attachments
          v-model:items="attachments"
          @upload="handleUpload"
          @error="handleError"
        />
      </div>
    `,
  }),
};

/**
 * 文件限制
 */
export const WithRestrictions: Story = {
  render: () => ({
    components: { Attachments },
    setup() {
      const attachments = ref<AttachmentItem[]>([]);

      const handleUpload = (file: File) => {
        const item = attachments.value.find((i) => i.file === file);
        if (item) {
          setTimeout(() => {
            item.status = 'success';
            item.url = URL.createObjectURL(file);
          }, 1000);
        }
      };

      const handleError = (error: Error) => {
        alert(error.message);
      };

      return { attachments, handleUpload, handleError };
    },
    template: `
      <div style="max-width: 600px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
        <h3 style="margin: 0 0 16px 0; font-size: 16px;">文件限制示例</h3>
        <Attachments
          v-model:items="attachments"
          :accept="['image/*']"
          :max-size="2097152"
          :max-count="3"
          @upload="handleUpload"
          @error="handleError"
        />
        <div style="margin-top: 12px; font-size: 12px; color: var(--colorTextSecondary);">
          仅支持图片，最大 2MB，最多 3 个文件
        </div>
      </div>
    `,
  }),
};

/**
 * 预填充文件
 */
export const PrefilledFiles: Story = {
  render: () => ({
    components: { Attachments },
    setup() {
      const attachments = ref<AttachmentItem[]>([
        {
          id: '1',
          name: 'document.pdf',
          size: 1024 * 500,
          type: 'application/pdf',
          status: 'success',
          url: 'https://example.com/document.pdf',
        },
        {
          id: '2',
          name: 'image.png',
          size: 1024 * 200,
          type: 'image/png',
          status: 'success',
          url: 'https://example.com/image.png',
        },
        {
          id: '3',
          name: 'video.mp4',
          size: 1024 * 1024 * 5,
          type: 'video/mp4',
          status: 'uploading',
          progress: 45,
        },
      ]);

      const handlePreview = (item: AttachmentItem) => {
        alert(`预览: ${item.name}`);
      };

      return { attachments, handlePreview };
    },
    template: `
      <div style="max-width: 600px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
        <h3 style="margin: 0 0 16px 0; font-size: 16px;">已有文件</h3>
        <Attachments
          v-model:items="attachments"
          @preview="handlePreview"
        />
      </div>
    `,
  }),
};

/**
 * 交互式 Playground
 */
export const Playground: Story = {
  args: {
    accept: [],
    maxSize: 10 * 1024 * 1024,
    maxCount: undefined,
    disabled: false,
  },
  render: (args) => ({
    components: { Attachments },
    setup() {
      const attachments = ref<AttachmentItem[]>([]);

      const handleUpload = (file: File) => {
        const item = attachments.value.find((i) => i.file === file);
        if (item) {
          let progress = 0;
          const timer = setInterval(() => {
            progress += 10;
            item.progress = progress;
            if (progress >= 100) {
              clearInterval(timer);
              item.status = 'success';
              item.url = URL.createObjectURL(file);
            }
          }, 200);
        }
      };

      return { args, attachments, handleUpload };
    },
    template: `
      <div style="max-width: 600px; padding: 20px; border: 1px solid var(--colorBorder); border-radius: 8px;">
        <Attachments
          v-model:items="attachments"
          v-bind="args"
          @upload="handleUpload"
        />
      </div>
    `,
  }),
};
