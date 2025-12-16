<template>
  <div
    :class="[
      'aix-bubble-editable',
      { 'aix-bubble-editable--editing': isEditing },
      className,
    ]"
  >
    <!-- 编辑模式 -->
    <div v-if="isEditing" class="aix-bubble-editable__editor">
      <textarea
        ref="textareaRef"
        v-model="editContent"
        class="aix-bubble-editable__textarea"
        :maxlength="config.maxLength"
        :placeholder="placeholder"
        @keydown="handleKeydown"
      />

      <!-- 字数统计 -->
      <div v-if="config.showCount" class="aix-bubble-editable__count">
        {{ editContent.length
        }}{{ config.maxLength ? `/${config.maxLength}` : '' }}
      </div>

      <!-- 操作按钮 -->
      <div class="aix-bubble-editable__actions">
        <button
          class="aix-bubble-editable__btn aix-bubble-editable__btn--cancel"
          @click="handleCancel"
        >
          {{ config.cancelText || '取消' }}
        </button>
        <button
          class="aix-bubble-editable__btn aix-bubble-editable__btn--confirm"
          :disabled="!editContent.trim()"
          @click="handleConfirm"
        >
          {{ config.confirmText || '确认' }}
        </button>
      </div>
    </div>

    <!-- 查看模式 -->
    <div v-else class="aix-bubble-editable__view" @dblclick="handleDoubleClick">
      <slot />

      <!-- 编辑按钮 -->
      <button
        v-if="showEditButton"
        class="aix-bubble-editable__edit-btn"
        :title="config.tooltip || '编辑'"
        @click="startEdit"
      >
        <span v-if="config.icon && typeof config.icon === 'string'">{{
          config.icon
        }}</span>
        <component :is="config.icon" v-else-if="config.icon" />
        <Edit v-else />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview BubbleEditable 可编辑气泡组件
 */
import { Edit } from '@aix/icons';
import { ref, computed, nextTick, watch } from 'vue';
import type { BubbleEditableConfig } from './types';

interface Props {
  /** 当前内容 */
  content: string;
  /** 编辑配置 */
  editable?: boolean | BubbleEditableConfig;
  /** 占位符 */
  placeholder?: string;
  /** 自定义类名 */
  className?: string;
}

interface Emits {
  (e: 'editStart'): void;
  (e: 'editEnd', newContent: string): void;
  (e: 'editCancel'): void;
  (e: 'update:content', content: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请输入内容...',
});

const emit = defineEmits<Emits>();

// 解析配置
const config = computed<BubbleEditableConfig>(() => {
  if (typeof props.editable === 'boolean') {
    return { enabled: props.editable };
  }
  return props.editable || { enabled: false };
});

// 是否启用编辑
const isEditEnabled = computed(() => {
  return config.value.enabled !== false && props.editable;
});

// 是否显示编辑按钮
const showEditButton = computed(() => isEditEnabled.value);

// 编辑状态
const isEditing = ref(false);
const editContent = ref('');
const textareaRef = ref<HTMLTextAreaElement>();

// 监听内容变化
watch(editContent, (newContent) => {
  if (isEditing.value) {
    emit('update:content', newContent);
  }
});

/** 开始编辑 */
function startEdit() {
  if (!isEditEnabled.value) return;

  editContent.value = props.content;
  isEditing.value = true;
  emit('editStart');

  // 自动聚焦
  if (config.value.autoFocus !== false) {
    nextTick(() => {
      textareaRef.value?.focus();
      // 光标移到末尾
      const len = editContent.value.length;
      textareaRef.value?.setSelectionRange(len, len);
    });
  }
}

/** 确认编辑 */
function handleConfirm() {
  const trimmed = editContent.value.trim();
  if (!trimmed) return;

  isEditing.value = false;
  emit('editEnd', trimmed);
}

/** 取消编辑 */
function handleCancel() {
  isEditing.value = false;
  editContent.value = props.content;
  emit('editCancel');
}

/** 双击编辑 */
function handleDoubleClick() {
  if (isEditEnabled.value) {
    startEdit();
  }
}

/** 键盘事件 */
function handleKeydown(e: KeyboardEvent) {
  // Ctrl/Cmd + Enter 确认
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    handleConfirm();
  }
  // Escape 取消
  if (e.key === 'Escape') {
    e.preventDefault();
    handleCancel();
  }
}

/** 暴露方法 */
defineExpose({
  startEdit,
  confirmEdit: handleConfirm,
  cancelEdit: handleCancel,
  isEditing,
});
</script>

<style scoped lang="scss">
.aix-bubble-editable {
  position: relative;

  &__view {
    position: relative;
  }

  &__edit-btn {
    position: absolute;
    top: -8px;
    right: -8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid var(--colorBorder, #d9d9d9);
    border-radius: 50%;
    background: var(--colorBgContainer, #fff);
    color: var(--colorTextSecondary, #666);
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

    svg {
      width: 12px;
      height: 12px;
    }

    &:hover {
      border-color: var(--colorPrimary, #1890ff);
      color: var(--colorPrimary, #1890ff);
      transform: scale(1.1);
    }
  }

  &__view:hover &__edit-btn {
    opacity: 1;
  }

  &__editor {
    display: flex;
    flex-direction: column;
    gap: var(--paddingXS, 8px);
  }

  &__textarea {
    width: 100%;
    min-height: 80px;
    padding: var(--paddingSM, 12px);
    border: 1px solid var(--colorPrimary, #1890ff);
    border-radius: var(--borderRadius, 8px);
    background: var(--colorBgContainer, #fff);
    color: var(--colorText, #333);
    font-family: inherit;
    font-size: inherit;
    line-height: 1.5;
    resize: vertical;
    outline: none;
    transition: border-color 0.2s ease;

    &:focus {
      border-color: var(--colorPrimaryActive, #0958d9);
      box-shadow: 0 0 0 2px var(--colorPrimaryBg, rgba(24, 144, 255, 0.2));
    }

    &::placeholder {
      color: var(--colorTextTertiary, #999);
    }
  }

  &__count {
    text-align: right;
    font-size: var(--fontSizeXS, 12px);
    color: var(--colorTextTertiary, #999);
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--paddingXS, 8px);
  }

  &__btn {
    padding: var(--paddingXXS, 4px) var(--paddingSM, 12px);
    border-radius: var(--borderRadiusSM, 4px);
    font-size: var(--fontSizeSM, 14px);
    cursor: pointer;
    transition: all 0.2s ease;

    &--cancel {
      border: 1px solid var(--colorBorder, #d9d9d9);
      background: var(--colorBgContainer, #fff);
      color: var(--colorTextSecondary, #666);

      &:hover {
        border-color: var(--colorTextSecondary, #666);
      }
    }

    &--confirm {
      border: none;
      background: var(--colorPrimary, #1890ff);
      color: #fff;

      &:hover:not(:disabled) {
        background: var(--colorPrimaryHover, #40a9ff);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
}
</style>
