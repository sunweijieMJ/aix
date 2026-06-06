<template>
  <div
    :class="ns.b()"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- 标题行 -->
    <div :class="ns.e('header')">
      <span :class="ns.e('title')">{{ t.attachmentsTitle }}</span>
      <span v-if="items.length > 0" :class="ns.e('count')">({{ items.length }})</span>
      <button
        type="button"
        :class="ns.e('close')"
        :aria-label="t.attachmentsCollapse"
        :title="t.attachmentsCollapse"
        @click="emit('close')"
      >
        <Close />
      </button>
    </div>

    <!-- 拖放 / 点击上传区域 -->
    <div
      role="button"
      tabindex="0"
      :class="[ns.e('placeholder'), dragIn && 'is-drag-in']"
      @click="emit('pick')"
      @keydown.enter.prevent="emit('pick')"
      @keydown.space.prevent="emit('pick')"
    >
      <!-- 三段式（对齐 adx PlaceholderUploader）：图标 / title / description 居中竖排 -->
      <span :class="ns.e('placeholder-icon')" aria-hidden="true">
        <AttachFile />
      </span>
      <span :class="ns.e('placeholder-title')">{{ t.attachmentPlaceholder }}</span>
      <span :class="ns.e('placeholder-hint')">{{ t.attachmentPlaceholderHint }}</span>
    </div>

    <!-- 文件卡片列表 -->
    <div v-if="items.length > 0" :class="ns.e('list')">
      <AttachmentCard
        v-for="item in items"
        :key="item.id"
        :item="item"
        :removable="true"
        @remove="emit('remove', item.id)"
        @retry="emit('retry', item.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useLocale } from '@aix/hooks';
import { AttachFile, Close } from '@aix/icons';
import { locale } from '../locale';
import { useNamespace } from '../composables/useNamespace';
import AttachmentCard from './AttachmentCard.vue';
import type { PendingAttachment } from '../composables/useAttachments';

export interface AttachmentsPanelProps {
  items: PendingAttachment[];
  accept?: string;
}

export interface AttachmentsPanelEmits {
  (e: 'pick'): void;
  (e: 'drop', files: FileList | File[]): void;
  (e: 'remove', id: string): void;
  (e: 'retry', id: string): void;
  (e: 'close'): void;
}

const props = defineProps<AttachmentsPanelProps>();
const emit = defineEmits<AttachmentsPanelEmits>();
const ns = useNamespace('attachments-panel');
const { t } = useLocale(locale);

// 拖拽状态
const dragIn = ref(false);

// 三处 drag 事件均 stopPropagation，与 E3 集成时 Sender 根级 drag 监听解耦。
// 推演：面板可见时拖入面板，Sender 根收不到这些事件——但面板既已展开（有事件
// 必然可见），Sender 根的「拖入自动展开」逻辑本就无需触发，无冲突；面板未展开时
// 不存在面板内部事件。结论：三处 stopPropagation 安全且必要（E3 实现者勿删）。
const onDragEnter = (e: DragEvent) => {
  e.stopPropagation();
  dragIn.value = true;
};

const onDragLeave = (e: DragEvent) => {
  e.stopPropagation();
  // relatedTarget 仍在面板内（子元素间移动）不算离开——防闪烁
  const el = e.currentTarget as HTMLElement;
  if (!el.contains(e.relatedTarget as Node | null)) {
    dragIn.value = false;
  }
};

const onDrop = (e: DragEvent) => {
  e.stopPropagation(); // 面板消费即终结，防 Sender 根级 @drop 对同批文件重复 add
  dragIn.value = false;
  if (e.dataTransfer?.files.length) {
    emit('drop', e.dataTransfer.files);
  }
};
</script>

<style lang="scss">
.aix-attachments-panel {
  display: flex;
  flex-direction: column;
  gap: var(--aix-paddingXS);
  padding: var(--aix-paddingSM);

  &__header {
    display: flex;
    align-items: center;
    gap: var(--aix-paddingXXS);
  }

  &__title {
    flex: none;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSizeSM);
    font-weight: 500;
  }

  &__count {
    flex: none;
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
  }

  &__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--aix-controlHeightSM);
    height: var(--aix-controlHeightSM);
    margin-left: auto;
    padding: 0;
    border: none;
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorTextTertiary);
    cursor: pointer;

    svg {
      width: 14px;
      height: 14px;
    }

    &:hover {
      background-color: var(--aix-colorFillTertiary);
      color: var(--aix-colorText);
    }
  }

  // ==========================================================================
  // placeholder 三段式（对齐 adx attachments-placeholder）：
  //   虚线框 colorBorder + 内边距 paddingLG；图标 28px+ / title 14px / hint 12px。
  //   adx token 映射：padding → --aix-paddingLG；borderRadius → --aix-borderRadiusLG；
  //   colorBorder（虚线）；colorPrimary / colorPrimaryBg（drag-in）。
  // ==========================================================================
  &__placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--aix-paddingLG);
    transition:
      border-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut),
      background-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px dashed var(--aix-colorBorder);
    border-radius: var(--aix-borderRadiusLG);
    text-align: center;
    cursor: pointer;
    gap: var(--aix-paddingXXS);

    &:hover {
      border-color: var(--aix-colorPrimaryHover, var(--aix-colorPrimary));
    }

    &:focus-visible {
      outline: 2px solid var(--aix-colorPrimary);
      outline-offset: 2px;
    }

    &.is-drag-in {
      border-color: var(--aix-colorPrimary);
      background-color: var(--aix-colorPrimaryBg);

      .aix-attachments-panel__placeholder-icon,
      .aix-attachments-panel__placeholder-title {
        color: var(--aix-colorPrimary);
      }
    }
  }

  // 图标段：adx fontSizeHeading2 ≈ 28-30px，aix 无 heading token，固定 28px
  &__placeholder-icon {
    display: inline-flex;
    color: var(--aix-colorTextTertiary);
    line-height: 1;

    svg {
      width: 28px;
      height: 28px;
    }
  }

  // 主文案：14px，主文本色
  &__placeholder-title {
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight, 1.5);
  }

  // 副文案：12px，三级文本色
  &__placeholder-hint {
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
    line-height: var(--aix-lineHeight, 1.5);
  }

  &__list {
    display: flex;
    flex-wrap: wrap;

    // 右侧和顶部留出空间，防止凸出的删除按钮被裁剪
    padding: var(--aix-paddingXS) var(--aix-paddingXS) 0 0;
    gap: var(--aix-paddingXS);
  }
}
</style>
