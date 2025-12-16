<template>
  <div
    :class="[
      'aix-attachments',
      className,
      { 'aix-attachments--dragging': isDragging },
    ]"
  >
    <!-- 附件列表 -->
    <div v-if="items && items.length > 0" class="aix-attachments__list">
      <div
        v-for="item in items"
        :key="item.id"
        :class="[
          'aix-attachments__item',
          `aix-attachments__item--${item.status || 'success'}`,
        ]"
      >
        <slot
          name="item"
          :item="item"
          :remove="() => handleRemove(item)"
          :preview="() => handlePreview(item)"
        >
          <!-- 文件图标 -->
          <div class="aix-attachments__icon">
            <component :is="getFileIcon(item.type)" />
          </div>

          <!-- 文件信息 -->
          <div class="aix-attachments__info">
            <div class="aix-attachments__name" :title="item.name">
              {{ item.name }}
            </div>
            <div class="aix-attachments__meta">
              <span class="aix-attachments__size">{{
                formatFileSize(item.size)
              }}</span>
              <span
                v-if="item.status === 'uploading'"
                class="aix-attachments__progress"
              >
                {{ item.progress || 0 }}%
              </span>
              <span
                v-if="item.status === 'error'"
                class="aix-attachments__error"
              >
                {{ item.error || '上传失败' }}
              </span>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="aix-attachments__actions">
            <button
              v-if="item.status === 'success' && item.url"
              class="aix-attachments__action"
              :aria-label="'预览'"
              @click="handlePreview(item)"
            >
              <Eye />
            </button>
            <button
              class="aix-attachments__action aix-attachments__action--remove"
              :aria-label="'删除'"
              @click="handleRemove(item)"
            >
              <Close />
            </button>
          </div>

          <!-- 上传进度条 -->
          <div
            v-if="item.status === 'uploading'"
            class="aix-attachments__progress-bar"
            :style="{ width: `${item.progress || 0}%` }"
          />
        </slot>
      </div>
    </div>

    <!-- 上传区域 -->
    <div
      v-if="showUploadButton && (!maxCount || items.length < maxCount)"
      class="aix-attachments__upload"
      :class="{ 'aix-attachments__upload--disabled': disabled }"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <input
        ref="fileInputRef"
        type="file"
        :accept="acceptString"
        :multiple="multiple"
        :disabled="disabled"
        class="aix-attachments__input"
        @change="handleFileChange"
      />
      <slot name="upload">
        <div class="aix-attachments__upload-content" @click="triggerUpload">
          <div class="aix-attachments__upload-icon">
            <FileUpload />
          </div>
          <div class="aix-attachments__upload-text">
            {{ draggable ? '点击上传或拖拽文件到此处' : '点击上传文件' }}
          </div>
          <div v-if="maxSize" class="aix-attachments__upload-hint">
            最大 {{ formatFileSize(maxSize) }}
          </div>
        </div>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Attachments 附件管理组件
 * 支持文件上传、预览、删除等功能
 */

import {
  Eye,
  Close,
  FileUpload,
  Photo,
  Movie,
  MusicVideo,
  Description,
  Assessment,
  Slideshow,
  Archive,
  AttachFile,
} from '@aix/icons';
import { nanoid } from 'nanoid';
import { ref, computed, type Component } from 'vue';

/** 附件项 */
interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  status?: 'uploading' | 'success' | 'error';
  progress?: number;
  error?: string;
  file?: File;
}

/** Attachments 组件 Props */
interface AttachmentsProps {
  items?: AttachmentItem[];
  accept?: string[];
  maxSize?: number;
  maxCount?: number;
  disabled?: boolean;
  showUploadButton?: boolean;
  draggable?: boolean;
  multiple?: boolean;
  className?: string;
}

/** Attachments 组件 Emits */
interface AttachmentsEmits {
  (e: 'update:items', items: AttachmentItem[]): void;
  (e: 'upload', file: File): void;
  (e: 'remove', item: AttachmentItem): void;
  (e: 'preview', item: AttachmentItem): void;
  (e: 'error', error: Error): void;
}

const props = withDefaults(defineProps<AttachmentsProps>(), {
  items: () => [],
  accept: () => [],
  maxSize: 10 * 1024 * 1024, // 10MB
  showUploadButton: true,
  draggable: true,
  multiple: true,
});

const emit = defineEmits<AttachmentsEmits>();

const fileInputRef = ref<HTMLInputElement>();
const isDragging = ref(false);

/**
 * accept 字符串
 */
const acceptString = computed(() => {
  return props.accept.join(',');
});

/**
 * 触发文件选择
 */
const triggerUpload = () => {
  if (props.disabled) return;
  fileInputRef.value?.click();
};

/**
 * 处理文件选择
 */
const handleFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const files = Array.from(input.files);
  processFiles(files);

  // 清空 input
  input.value = '';
};

/**
 * 处理拖拽进入
 */
const handleDragOver = () => {
  if (!props.draggable || props.disabled) return;
  isDragging.value = true;
};

/**
 * 处理拖拽离开
 */
const handleDragLeave = () => {
  isDragging.value = false;
};

/**
 * 处理文件拖拽放下
 */
const handleDrop = (e: DragEvent) => {
  isDragging.value = false;
  if (!props.draggable || props.disabled) return;

  const files = Array.from(e.dataTransfer?.files || []);
  processFiles(files);
};

/**
 * 处理文件列表
 */
const processFiles = (files: File[]) => {
  for (const file of files) {
    // 检查文件数量限制
    if (props.maxCount && props.items.length >= props.maxCount) {
      emit('error', new Error(`最多只能上传 ${props.maxCount} 个文件`));
      break;
    }

    // 检查文件类型
    if (props.accept.length > 0) {
      const isAccepted = props.accept.some((type) => {
        if (type.startsWith('.')) {
          return file.name.endsWith(type);
        }
        return file.type.match(type.replace('*', '.*'));
      });

      if (!isAccepted) {
        emit('error', new Error(`不支持的文件类型: ${file.name}`));
        continue;
      }
    }

    // 检查文件大小
    if (props.maxSize && file.size > props.maxSize) {
      emit(
        'error',
        new Error(`文件过大: ${file.name} (${formatFileSize(file.size)})`),
      );
      continue;
    }

    // 创建附件项
    const item: AttachmentItem = {
      id: nanoid(),
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'uploading',
      progress: 0,
      file,
    };

    // 添加到列表
    const newItems = [...props.items, item];
    emit('update:items', newItems);

    // 触发上传事件
    emit('upload', file);
  }
};

/**
 * 删除附件
 */
const handleRemove = (item: AttachmentItem) => {
  const newItems = props.items.filter((i) => i.id !== item.id);
  emit('update:items', newItems);
  emit('remove', item);
};

/**
 * 预览附件
 */
const handlePreview = (item: AttachmentItem) => {
  emit('preview', item);
};

/**
 * 获取文件图标
 */
const getFileIcon = (type: string): Component => {
  if (type.startsWith('image/')) return Photo;
  if (type.startsWith('video/')) return Movie;
  if (type.startsWith('audio/')) return MusicVideo;
  if (type === 'application/pdf') return Description;
  if (type.includes('word')) return Description;
  if (type.includes('excel') || type.includes('spreadsheet')) return Assessment;
  if (type.includes('powerpoint') || type.includes('presentation'))
    return Slideshow;
  if (type.includes('zip') || type.includes('rar')) return Archive;
  return AttachFile;
};

/**
 * 格式化文件大小
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

/*  暴露方法 */
defineExpose({
  triggerUpload,
});
</script>

<style scoped lang="scss">
.aix-attachments {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__item {
    display: flex;
    position: relative;
    align-items: center;
    padding: 12px;
    transition: all 0.2s;
    border: 1px solid var(--colorBorder, #d9d9d9);
    border-radius: 8px;
    background: var(--colorBgContainer, #fff);
    gap: 12px;

    &:hover {
      border-color: var(--colorPrimary, #1677ff);
      box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
    }

    &--uploading {
      opacity: 0.7;
    }

    &--error {
      border-color: var(--colorError, #ff4d4f);
      background: rgb(255 77 79 / 0.05);
    }
  }

  &__icon {
    flex-shrink: 0;
    font-size: 32px;
    line-height: 1;
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__name {
    margin-bottom: 4px;
    overflow: hidden;
    color: var(--colorText, #000);
    font-size: 14px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__meta {
    display: flex;
    color: var(--colorTextSecondary, #666);
    font-size: 12px;
    gap: 12px;
  }

  &__size,
  &__progress {
    color: var(--colorTextTertiary, #999);
  }

  &__error {
    color: var(--colorError, #ff4d4f);
  }

  &__actions {
    display: flex;
    transition: opacity 0.2s;
    opacity: 0;
    gap: 4px;

    .aix-attachments__item:hover & {
      opacity: 1;
    }
  }

  &__action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    transition: all 0.2s;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--colorTextSecondary, #666);
    cursor: pointer;

    svg {
      width: 16px;
      height: 16px;
    }

    &:hover {
      background: var(--colorBgTextHover, #f5f5f5);
      color: var(--colorPrimary, #1677ff);
    }

    &--remove:hover {
      background: rgb(255 77 79 / 0.1);
      color: var(--colorError, #ff4d4f);
    }
  }

  &__progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    transition: width 0.3s;
    background: var(--colorPrimary, #1677ff);
  }

  &__upload {
    position: relative;
    transition: all 0.2s;
    border: 2px dashed var(--colorBorder, #d9d9d9);
    border-radius: 8px;
    background: var(--colorBgContainer, #fff);

    &:hover:not(&--disabled) {
      border-color: var(--colorPrimary, #1677ff);
      background: var(--colorPrimaryBg, #e6f4ff);
    }

    &--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &--dragging &__upload {
    border-color: var(--colorPrimary, #1677ff);
    background: var(--colorPrimaryBg, #e6f4ff);
  }

  &__input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;

    &:disabled {
      cursor: not-allowed;
    }
  }

  &__upload-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    cursor: pointer;
  }

  &__upload-icon {
    margin-bottom: 12px;
    color: var(--colorTextTertiary, #999);
    font-size: 48px;

    svg {
      width: 48px;
      height: 48px;
    }
  }

  &__upload-text {
    margin-bottom: 4px;
    color: var(--colorText, #000);
    font-size: 14px;
  }

  &__upload-hint {
    color: var(--colorTextSecondary, #666);
    font-size: 12px;
  }
}

/*  响应式设计 */
@media (width <= 768px) {
  .aix-attachments {
    &__item {
      padding: 8px;
      gap: 8px;
    }

    &__icon {
      font-size: 24px;
    }

    &__upload-content {
      padding: 24px 12px;
    }

    &__upload-icon {
      font-size: 36px;

      svg {
        width: 36px;
        height: 36px;
      }
    }
  }
}
</style>
