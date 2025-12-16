<template>
  <div class="aix-multimodal-content">
    <template v-for="(item, index) in contentArray" :key="index">
      <!-- 文本内容 -->
      <div v-if="item.type === 'text'" class="aix-multimodal-content__text">
        <BubbleMarkdown
          v-if="enableMarkdown"
          :content="item.text"
          :message-render="messageRender"
        />
        <span v-else>{{ item.text }}</span>
      </div>

      <!-- 图片内容 -->
      <div
        v-else-if="item.type === 'image_url'"
        class="aix-multimodal-content__image"
      >
        <img
          :src="item.image_url.url"
          :alt="`Image ${index + 1}`"
          class="aix-multimodal-content__image-element"
          loading="lazy"
          @error="handleImageError"
        />
      </div>

      <!-- 文件内容 -->
      <div
        v-else-if="item.type === 'file'"
        class="aix-multimodal-content__file"
      >
        <FilePreview
          :files="[
            {
              id: String(index),
              url: item.file.url,
              name: item.file.name,
              size: item.file.size || 0,
              mimeType: item.file.mimeType || 'application/octet-stream',
              type: item.file.mimeType?.startsWith('image/')
                ? FileType.IMAGE
                : FileType.DOCUMENT,
              status: 'success',
              progress: 100,
            },
          ]"
          :show-remove="false"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ContentType } from '@aix/chat-sdk';
import { computed } from 'vue';
import type { VNode } from 'vue';
import { FileType } from '../../composables/useFileUpload';
import FilePreview from '../FilePreview/index.vue';
import BubbleMarkdown from './BubbleMarkdown.vue';

interface MultiModalContentProps {
  content: ContentType[];
  enableMarkdown?: boolean;
  messageRender?: (content: string) => VNode | string;
}

const props = withDefaults(defineProps<MultiModalContentProps>(), {
  enableMarkdown: false,
});

const contentArray = computed(() => props.content);

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  img.src =
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNHB4IiBmaWxsPSIjOTk5Ij5JbWFnZSBMb2FkIEZhaWxlZDwvdGV4dD48L3N2Zz4=';
};
</script>

<style scoped lang="scss">
.aix-multimodal-content {
  display: flex;
  flex-direction: column;
  gap: var(--aix-space-sm);

  &__text {
    line-height: var(--lineHeight, 1.6);
  }

  &__image {
    max-width: 100%;
    overflow: hidden;
    border-radius: var(--borderRadius, 8px);
  }

  &__image-element {
    display: block;
    max-width: 100%;
    height: auto;
    transition: transform 0.3s;
    border-radius: var(--borderRadius, 8px);
    cursor: pointer;

    &:hover {
      transform: scale(1.02);
    }
  }

  &__file {
    padding: var(--paddingXS, 8px);
    border: 1px solid var(--colorBorder, #d9d9d9);
    border-radius: var(--borderRadius, 8px);
    background: var(--colorBgContainer, #fff);
  }
}
</style>
