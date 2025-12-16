<template>
  <div
    :class="[
      'aix-action-feedback',
      { 'aix-action-feedback--disabled': disabled },
      className,
    ]"
  >
    <!-- 点赞按钮 -->
    <button
      :class="[
        'aix-action-feedback__btn',
        'aix-action-feedback__btn--like',
        { 'aix-action-feedback__btn--active': currentValue === 'like' },
      ]"
      :disabled="disabled"
      :title="currentValue === 'like' ? '取消点赞' : '点赞'"
      @click="handleClick('like')"
    >
      <slot name="like" :active="currentValue === 'like'">
        <!-- 激活状态图标 -->
        <template v-if="currentValue === 'like'">
          <span
            v-if="likeActiveIcon && typeof likeActiveIcon === 'string'"
            class="aix-action-feedback__icon"
          >
            {{ likeActiveIcon }}
          </span>
          <component
            :is="likeActiveIcon"
            v-else-if="likeActiveIcon"
            class="aix-action-feedback__icon"
          />
          <ThumbUp
            v-else
            class="aix-action-feedback__icon aix-action-feedback__icon--filled"
          />
        </template>
        <!-- 默认图标 -->
        <template v-else>
          <span
            v-if="likeIcon && typeof likeIcon === 'string'"
            class="aix-action-feedback__icon"
          >
            {{ likeIcon }}
          </span>
          <component
            :is="likeIcon"
            v-else-if="likeIcon"
            class="aix-action-feedback__icon"
          />
          <ThumbUp v-else class="aix-action-feedback__icon" />
        </template>
      </slot>
    </button>

    <!-- 踩按钮 -->
    <button
      :class="[
        'aix-action-feedback__btn',
        'aix-action-feedback__btn--dislike',
        { 'aix-action-feedback__btn--active': currentValue === 'dislike' },
      ]"
      :disabled="disabled"
      :title="currentValue === 'dislike' ? '取消踩' : '踩'"
      @click="handleClick('dislike')"
    >
      <slot name="dislike" :active="currentValue === 'dislike'">
        <!-- 激活状态图标 -->
        <template v-if="currentValue === 'dislike'">
          <span
            v-if="dislikeActiveIcon && typeof dislikeActiveIcon === 'string'"
            class="aix-action-feedback__icon"
          >
            {{ dislikeActiveIcon }}
          </span>
          <component
            :is="dislikeActiveIcon"
            v-else-if="dislikeActiveIcon"
            class="aix-action-feedback__icon"
          />
          <ThumbDown
            v-else
            class="aix-action-feedback__icon aix-action-feedback__icon--filled"
          />
        </template>
        <!-- 默认图标 -->
        <template v-else>
          <span
            v-if="dislikeIcon && typeof dislikeIcon === 'string'"
            class="aix-action-feedback__icon"
          >
            {{ dislikeIcon }}
          </span>
          <component
            :is="dislikeIcon"
            v-else-if="dislikeIcon"
            class="aix-action-feedback__icon"
          />
          <ThumbDown v-else class="aix-action-feedback__icon" />
        </template>
      </slot>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Actions.Feedback 反馈操作组件（点赞/踩）
 */
import { ThumbUp, ThumbDown } from '@aix/icons';
import { ref, watch, computed } from 'vue';
import type {
  ActionFeedbackProps,
  ActionFeedbackEmits,
  FeedbackValue,
} from './types';

const props = withDefaults(defineProps<ActionFeedbackProps>(), {
  defaultValue: 'default',
  disabled: false,
});

const emit = defineEmits<ActionFeedbackEmits>();

// 内部状态
const internalValue = ref<FeedbackValue>(props.defaultValue);

// 计算当前值（支持受控模式）
const currentValue = computed(() => {
  return props.value !== undefined ? props.value : internalValue.value;
});

// 监听外部 value 变化
watch(
  () => props.value,
  (newValue) => {
    if (newValue !== undefined) {
      internalValue.value = newValue;
    }
  },
);

/** 处理点击 */
function handleClick(type: 'like' | 'dislike') {
  if (props.disabled) return;

  // 如果已经是当前状态，则取消
  const newValue: FeedbackValue =
    currentValue.value === type ? 'default' : type;

  // 更新内部状态
  internalValue.value = newValue;

  // 触发事件
  emit('change', newValue);
  emit('update:value', newValue);
}

/** 暴露方法 */
defineExpose({
  /** 重置为默认状态 */
  reset: () => {
    internalValue.value = 'default';
    emit('change', 'default');
    emit('update:value', 'default');
  },
});
</script>

<style scoped lang="scss">
.aix-action-feedback {
  display: inline-flex;
  align-items: center;
  gap: var(--paddingXXS, 4px);

  &--disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--paddingXXS, 4px) var(--paddingXS, 8px);
    transition: all 0.2s ease;
    border: none;
    border-radius: var(--borderRadiusSM, 4px);
    background: transparent;
    color: var(--colorTextSecondary, #666);
    font-size: inherit;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--colorBgTextHover, rgba(0, 0, 0, 0.04));
    }

    &:active:not(:disabled) {
      transform: scale(0.95);
    }

    &:disabled {
      cursor: not-allowed;
    }

    /* 点赞激活状态 */
    &--like.aix-action-feedback__btn--active {
      color: var(--colorPrimary, #1890ff);
      background: var(--colorPrimaryBg, #e6f7ff);

      &:hover:not(:disabled) {
        background: var(--colorPrimaryBgHover, #bae7ff);
      }
    }

    /* 踩激活状态 */
    &--dislike.aix-action-feedback__btn--active {
      color: var(--colorError, #ff4d4f);
      background: var(--colorErrorBg, #fff2f0);

      &:hover:not(:disabled) {
        background: var(--colorErrorBgHover, #ffccc7);
      }
    }
  }

  &__icon {
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    svg {
      width: 100%;
      height: 100%;
    }
  }
}
</style>
