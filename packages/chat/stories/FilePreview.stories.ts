/**
 * @fileoverview FilePreview 组件 Stories
 * 文件预览组件
 */

import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import FilePreview from '../src/components/FilePreview/index.vue';
import { FileType, type UploadedFile } from '../src/composables/useFileUpload';

const meta: Meta<typeof FilePreview> = {
  title: 'Chat/FilePreview',
  component: FilePreview,
  tags: ['autodocs'],
  argTypes: {
    files: {
      control: 'object',
      description: '文件列表',
    },
    showRemove: {
      control: 'boolean',
      description: '是否显示删除按钮',
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          '文件预览组件，用于展示上传的文件预览，支持图片和文档等多种文件类型。',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof FilePreview>;

/**
 * 基础用法 - 图片预览
 */
export const Basic: Story = {
  args: {
    files: [
      {
        id: '1',
        name: 'photo1.jpg',
        size: 1024000,
        type: FileType.IMAGE,
        url: 'https://picsum.photos/200/200?random=1',
        status: 'success',
      },
      {
        id: '2',
        name: 'photo2.jpg',
        size: 2048000,
        type: FileType.IMAGE,
        url: 'https://picsum.photos/200/200?random=2',
        status: 'success',
      },
      {
        id: '3',
        name: 'photo3.jpg',
        size: 1536000,
        type: FileType.IMAGE,
        url: 'https://picsum.photos/200/200?random=3',
        status: 'success',
      },
    ],
    showRemove: true,
  },
};

/**
 * 混合文件类型
 */
export const MixedTypes: Story = {
  args: {
    files: [
      {
        id: '1',
        name: '产品截图.png',
        size: 1536000,
        type: FileType.IMAGE,
        url: 'https://picsum.photos/200/200?random=4',
        status: 'success',
      },
      {
        id: '2',
        name: '产品介绍.pdf',
        size: 2097152,
        type: FileType.DOCUMENT,
        url: '',
        status: 'success',
      },
      {
        id: '3',
        name: '示例图片.jpg',
        size: 1024000,
        type: FileType.IMAGE,
        url: 'https://picsum.photos/200/200?random=5',
        status: 'success',
      },
    ],
    showRemove: true,
  },
};

/**
 * 上传中状态
 */
export const Uploading: Story = {
  args: {
    files: [
      {
        id: '1',
        name: 'uploading1.jpg',
        size: 2048000,
        type: FileType.IMAGE,
        url: 'https://picsum.photos/200/200?random=6',
        status: 'uploading',
        progress: 45,
      },
      {
        id: '2',
        name: 'uploading2.jpg',
        size: 1536000,
        type: FileType.IMAGE,
        url: 'https://picsum.photos/200/200?random=7',
        status: 'uploading',
        progress: 78,
      },
      {
        id: '3',
        name: 'success.jpg',
        size: 1024000,
        type: FileType.IMAGE,
        url: 'https://picsum.photos/200/200?random=8',
        status: 'success',
      },
    ],
    showRemove: true,
  },
};

/**
 * 交互式示例
 */
export const Interactive: Story = {
  render: () => ({
    components: { FilePreview },
    setup() {
      const files = ref<UploadedFile[]>([
        {
          id: '1',
          name: '图片1.jpg',
          size: 1024000,
          type: FileType.IMAGE,
          mimeType: 'image/jpeg',
          url: 'https://picsum.photos/200/200?random=20',
          status: 'success',
          progress: 100,
        },
        {
          id: '2',
          name: '文档.pdf',
          size: 2097152,
          type: FileType.DOCUMENT,
          mimeType: 'application/pdf',
          url: '',
          status: 'success',
          progress: 100,
        },
        {
          id: '3',
          name: '图片2.jpg',
          size: 1536000,
          type: FileType.IMAGE,
          mimeType: 'image/jpeg',
          url: 'https://picsum.photos/200/200?random=21',
          status: 'success',
          progress: 100,
        },
      ]);

      const handleRemove = (id: string) => {
        files.value = files.value.filter((f) => f.id !== id);
      };

      return { files, handleRemove };
    },
    template: `
      <div>
        <div style="margin-bottom: 16px; padding: 12px; background: #f0f9ff; border: 1px solid #91d5ff; border-radius: 6px; font-size: 13px; color: #0958d9;">
          悬停在文件上显示删除按钮，点击可以删除文件
        </div>

        <FilePreview
          :files="files"
          :show-remove="true"
          @remove="handleRemove"
        />

        <div v-if="files.length === 0" style="margin-top: 16px; padding: 40px; text-align: center; background: #f5f5f5; border-radius: 8px; color: #8c8c8c;">
          所有文件已删除
        </div>
      </div>
    `,
  }),
};
