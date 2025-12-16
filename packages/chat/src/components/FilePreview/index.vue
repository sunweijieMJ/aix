<template>
  <div class="aix-file-preview">
    <div v-for="file in files" :key="file.id" class="aix-file-preview__item">
      <!-- 图片预览 -->
      <div v-if="file.type === FileType.IMAGE" class="aix-file-preview__image">
        <img :src="file.url" :alt="file.name" />
        <div
          v-if="file.status === 'uploading'"
          class="aix-file-preview__progress"
        >
          <div
            class="aix-file-preview__progress-bar"
            :style="{ width: `${file.progress}%` }"
          />
        </div>
        <button
          v-if="showRemove"
          class="aix-file-preview__remove"
          @click="emit('remove', file.id)"
        >
          ✕
        </button>
      </div>

      <!-- 文件预览 -->
      <div v-else class="aix-file-preview__file">
        <div class="aix-file-preview__file-icon">📄</div>
        <div class="aix-file-preview__file-info">
          <div class="aix-file-preview__file-name">{{ file.name }}</div>
          <div class="aix-file-preview__file-size">
            {{ formatFileSize(file.size) }}
          </div>
        </div>
        <button
          v-if="showRemove"
          class="aix-file-preview__remove"
          @click="emit('remove', file.id)"
        >
          ✕
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview FilePreview - 文件预览组件
 */
import { FileType, type UploadedFile } from '../../composables/useFileUpload';

interface FilePreviewProps {
  /** 文件列表 */
  files: UploadedFile[];
  /** 是否显示删除按钮 */
  showRemove?: boolean;
}

interface FilePreviewEmits {
  (e: 'remove', id: string): void;
}

withDefaults(defineProps<FilePreviewProps>(), {
  showRemove: true,
});

const emit = defineEmits<FilePreviewEmits>();

/**
 * 格式化文件大小
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};
</script>

<style scoped lang="scss">
.aix-file-preview {
  display: flex;
  flex-wrap: wrap;
  gap: var(--aix-space-sm, 8px);

  &__item {
    position: relative;
  }

  &__image {
    position: relative;
    width: 100px;
    height: 100px;
    overflow: hidden;
    border: 1px solid var(--colorBorder, #d9d9d9);
    border-radius: var(--aix-radius-md, 8px);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__file {
    display: flex;
    align-items: center;
    gap: var(--aix-space-sm, 8px);
    padding: var(--aix-space-sm, 8px);
    border: 1px solid var(--colorBorder, #d9d9d9);
    border-radius: var(--aix-radius-md, 8px);
    background: var(--colorBgContainer, #fff);
  }

  &__file-icon {
    font-size: 24px;
  }

  &__file-info {
    flex: 1;
    min-width: 0;
  }

  &__file-name {
    overflow: hidden;
    color: var(--colorText, #262626);
    font-size: var(--fontSizeSM, 13px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__file-size {
    color: var(--colorTextSecondary, #8c8c8c);
    font-size: var(--fontSizeXS, 12px);
  }

  &__progress {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 4px;
    background: rgb(0 0 0 / 0.1);
  }

  &__progress-bar {
    height: 100%;
    transition: width 0.3s;
    background: var(--colorPrimary, #1677ff);
  }

  &__remove {
    display: flex;
    position: absolute;
    top: 4px;
    right: 4px;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    transition: opacity 0.2s;
    border: none;
    border-radius: 50%;
    opacity: 0;
    background: rgb(0 0 0 / 0.6);
    color: white;
    font-size: 12px;
    cursor: pointer;

    &:hover {
      background: rgb(0 0 0 / 0.8);
    }
  }

  &__item:hover &__remove {
    opacity: 1;
  }
}
</style>
