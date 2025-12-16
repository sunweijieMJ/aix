<template>
  <div
    class="aix-slot-textarea"
    :class="{ 'aix-slot-textarea--disabled': disabled }"
  >
    <div ref="contentRef" class="aix-slot-textarea__content">
      <template v-for="(slot, index) in slotConfig" :key="index">
        <!-- 纯文本 -->
        <span v-if="slot.type === 'text'" class="aix-slot-textarea__text">
          {{ slot.value }}
        </span>

        <!-- 输入框 -->
        <input
          v-else-if="slot.type === 'input'"
          class="aix-slot-textarea__input"
          :placeholder="slot.props?.placeholder || ''"
          :maxlength="slot.props?.maxLength"
          :style="{ width: getWidth(slot.props?.width) }"
          :disabled="disabled"
          :value="slotValues[slot.key] || slot.props?.defaultValue || ''"
          @input="
            handleSlotChange(
              slot.key,
              ($event.target as HTMLInputElement).value,
            )
          "
          @keydown="handleKeyDown"
        />

        <!-- 下拉选择 -->
        <select
          v-else-if="slot.type === 'select'"
          class="aix-slot-textarea__select"
          :style="{ width: getWidth(slot.props?.width) }"
          :disabled="disabled"
          :value="slotValues[slot.key] || slot.props?.defaultValue || ''"
          @change="
            handleSlotChange(
              slot.key,
              ($event.target as HTMLSelectElement).value,
            )
          "
        >
          <option v-if="slot.props?.placeholder" value="" disabled>
            {{ slot.props.placeholder }}
          </option>
          <option
            v-for="option in normalizeOptions(slot.props?.options)"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>

        <!-- 标签 -->
        <span
          v-else-if="slot.type === 'tag'"
          class="aix-slot-textarea__tag"
          :style="slot.props?.color ? { '--tag-color': slot.props.color } : {}"
        >
          {{ slot.props?.label }}
          <button
            v-if="slot.props?.closable !== false"
            class="aix-slot-textarea__tag-close"
            @click="handleTagClose(slot.key)"
          >
            &times;
          </button>
        </span>

        <!-- 自定义渲染 -->
        <component
          :is="
            slot.render({
              value: slotValues[slot.key],
              onChange: (val: any) => handleSlotChange(slot.key, val),
            })
          "
          v-else-if="slot.type === 'custom'"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview SlotTextArea 结构化输入组件
 * @description 支持嵌入式输入框、下拉选择、标签等结构化输入元素
 */
import { ref, reactive, watch } from 'vue';
import type { SlotConfigType, SlotValues } from './types';

interface SlotTextAreaProps {
  /** Slot 配置数组 */
  slotConfig: SlotConfigType[];
  /** 禁用状态 */
  disabled?: boolean;
  /** 提交方式 */
  submitType?: 'enter' | 'shiftEnter' | 'ctrlEnter' | false;
}

interface SlotTextAreaEmits {
  (e: 'change', values: SlotValues): void;
  (e: 'submit', values: SlotValues): void;
  (e: 'tagClose', key: string): void;
}

const props = withDefaults(defineProps<SlotTextAreaProps>(), {
  disabled: false,
  submitType: 'enter',
});

const emit = defineEmits<SlotTextAreaEmits>();

const contentRef = ref<HTMLDivElement>();

// Slot 值存储
const slotValues = reactive<SlotValues>({});

// 初始化默认值
watch(
  () => props.slotConfig,
  (config) => {
    config.forEach((slot) => {
      if (
        slot.type === 'input' &&
        slot.props?.defaultValue &&
        !slotValues[slot.key]
      ) {
        slotValues[slot.key] = slot.props.defaultValue;
      } else if (
        slot.type === 'select' &&
        slot.props?.defaultValue &&
        !slotValues[slot.key]
      ) {
        slotValues[slot.key] = slot.props.defaultValue;
      } else if (
        slot.type === 'tag' &&
        slot.props?.value &&
        !slotValues[slot.key]
      ) {
        slotValues[slot.key] = slot.props.value;
      }
    });
  },
  { immediate: true },
);

/**
 * 获取宽度样式
 */
function getWidth(width?: string | number): string {
  if (!width) return 'auto';
  if (typeof width === 'number') return `${width}px`;
  return width;
}

/**
 * 规范化选项格式
 */
function normalizeOptions(
  options?: Array<string | { label: string; value: string }>,
) {
  if (!options) return [];
  return options.map((opt) => {
    if (typeof opt === 'string') {
      return { label: opt, value: opt };
    }
    return opt;
  });
}

/**
 * 处理 slot 值变化
 */
function handleSlotChange(key: string, value: any) {
  slotValues[key] = value;
  emit('change', { ...slotValues });
}

/**
 * 处理标签关闭
 */
function handleTagClose(key: string) {
  delete slotValues[key];
  emit('tagClose', key);
  emit('change', { ...slotValues });
}

/**
 * 处理键盘事件
 */
function handleKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Enter') return;

  const { submitType } = props;
  if (submitType === false) return;

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

  let shouldSubmit = false;

  switch (submitType) {
    case 'enter':
      shouldSubmit = !e.shiftKey && !isCtrlOrCmd;
      break;
    case 'shiftEnter':
      shouldSubmit = e.shiftKey && !isCtrlOrCmd;
      break;
    case 'ctrlEnter':
      shouldSubmit = isCtrlOrCmd && !e.shiftKey;
      break;
  }

  if (shouldSubmit) {
    e.preventDefault();
    emit('submit', { ...slotValues });
  }
}

/**
 * 获取当前所有值
 */
function getValues(): SlotValues {
  return { ...slotValues };
}

/**
 * 重置所有值
 */
function reset() {
  Object.keys(slotValues).forEach((key) => {
    delete slotValues[key];
  });
}

/**
 * 聚焦第一个输入元素
 */
function focus() {
  const firstInput = contentRef.value?.querySelector(
    'input, select',
  ) as HTMLElement;
  firstInput?.focus();
}

defineExpose({
  getValues,
  reset,
  focus,
});
</script>

<style scoped lang="scss">
.aix-slot-textarea {
  display: flex;
  align-items: center;
  min-height: 36px;
  padding: var(--paddingXS, 8px) var(--paddingSM, 12px);
  transition: all 0.2s;
  border: 1px solid var(--colorBorder, #d9d9d9);
  border-radius: var(--borderRadius, 6px);
  background: var(--colorBgContainer, #fff);

  &:focus-within {
    border-color: var(--colorPrimary, #1677ff);
    box-shadow: 0 0 0 2px rgb(22 119 255 / 0.1);
  }

  &--disabled {
    background: var(--colorBgContainerDisabled, #f5f5f5);
    cursor: not-allowed;
  }

  &__content {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--paddingXXS, 4px);
    width: 100%;
  }

  &__text {
    color: var(--colorText, #000);
    font-size: var(--fontSize, 14px);
    white-space: nowrap;
  }

  &__input {
    min-width: 60px;
    max-width: 200px;
    padding: 2px 6px;
    transition: all 0.2s;
    border: none;
    border-radius: var(--borderRadiusXS, 4px);
    outline: none;
    background: var(--colorBgTextHover, rgb(0 0 0 / 0.04));
    color: var(--colorText, #000);
    font-size: var(--fontSize, 14px);

    &:focus {
      background: var(--colorPrimaryBg, #e6f4ff);
    }

    &::placeholder {
      color: var(--colorTextPlaceholder, #bfbfbf);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  &__select {
    min-width: 80px;
    padding: 2px 20px 2px 6px;
    transition: all 0.2s;
    border: none;
    border-radius: var(--borderRadiusXS, 4px);
    outline: none;
    background: var(--colorBgTextHover, rgb(0 0 0 / 0.04));
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 4px center;
    color: var(--colorText, #000);
    font-size: var(--fontSize, 14px);
    cursor: pointer;
    appearance: none;

    &:focus {
      background-color: var(--colorPrimaryBg, #e6f4ff);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  &__tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: var(--borderRadiusXS, 4px);
    background: var(--colorPrimaryBg, #e6f4ff);
    color: var(--tag-color, var(--colorPrimary, #1677ff));
    font-size: var(--fontSizeSM, 12px);
    white-space: nowrap;
    gap: 4px;
  }

  &__tag-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    transition: all 0.2s;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--colorTextSecondary, #666);
    font-size: 12px;
    cursor: pointer;

    &:hover {
      background: rgb(255 77 79 / 0.1);
      color: var(--colorError, #ff4d4f);
    }
  }
}
</style>
