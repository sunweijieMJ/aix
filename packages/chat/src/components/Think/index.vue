<template>
  <div
    :class="[
      'aix-think',
      `aix-think--${status}`,
      { 'aix-think--collapsed': !isExpanded },
      { 'aix-think--disabled': disabled },
      className,
      classNames?.root,
    ]"
    :style="styles?.root"
  >
    <!-- 头部 -->
    <div
      :class="['aix-think__header', classNames?.header]"
      :style="styles?.header"
      @click="collapsible ? toggleExpand() : undefined"
    >
      <!-- 图标 -->
      <span
        :class="['aix-think__icon', classNames?.icon]"
        :style="styles?.icon"
      >
        <slot name="icon">
          <template v-if="status === 'thinking'">
            <span v-if="thinkingIcon && typeof thinkingIcon === 'string'">{{
              thinkingIcon
            }}</span>
            <component :is="thinkingIcon" v-else-if="thinkingIcon" />
            <span v-else class="aix-think__icon-thinking">
              <Schedule />
            </span>
          </template>
          <template v-else-if="status === 'done'">
            <span v-if="doneIcon && typeof doneIcon === 'string'">{{
              doneIcon
            }}</span>
            <component :is="doneIcon" v-else-if="doneIcon" />
            <CheckCircle v-else />
          </template>
          <template v-else-if="status === 'error'">
            <span v-if="errorIcon && typeof errorIcon === 'string'">{{
              errorIcon
            }}</span>
            <component :is="errorIcon" v-else-if="errorIcon" />
            <CloseCircle v-else />
          </template>
          <template v-else>
            <span v-if="icon && typeof icon === 'string'">{{ icon }}</span>
            <component :is="icon" v-else-if="icon" />
            <Widgets v-else />
          </template>
        </slot>
      </span>

      <!-- 标题 -->
      <span
        :class="['aix-think__title', classNames?.title]"
        :style="styles?.title"
      >
        <slot name="title">
          {{ displayTitle }}
        </slot>
      </span>

      <!-- 时间 -->
      <span
        v-if="showTime && (startTime || endTime)"
        :class="['aix-think__time', classNames?.time]"
        :style="styles?.time"
      >
        {{ formatDuration }}
      </span>

      <!-- 折叠按钮 -->
      <button
        v-if="collapsible"
        :class="['aix-think__toggle', classNames?.toggle]"
        :style="styles?.toggle"
        type="button"
        :aria-expanded="isExpanded"
      >
        <ArrowDropDown
          :class="[
            'aix-think__toggle-icon',
            { 'aix-think__toggle-icon--expanded': isExpanded },
          ]"
        />
      </button>
    </div>

    <!-- 内容 -->
    <div
      v-show="isExpanded"
      :class="['aix-think__content', classNames?.content]"
      :style="styles?.content"
    >
      <slot>
        <div class="aix-think__text">{{ displayContent }}</div>
        <span
          v-if="status === 'thinking' && typing"
          class="aix-think__cursor"
        />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Think 组件 - AI 思考过程展示
 */
import {
  Schedule,
  CheckCircle,
  CloseCircle,
  Widgets,
  ArrowDropDown,
} from '@aix/icons';
import { ref, computed, watch, onUnmounted } from 'vue';
import type { ThinkProps, ThinkEmits } from './types';

const props = withDefaults(defineProps<ThinkProps>(), {
  status: 'thinking',
  thinkingTitle: '思考中...',
  doneTitle: '思考完成',
  errorTitle: '思考出错',
  collapsible: true,
  defaultExpanded: true,
  autoCollapseOnDone: true,
  showTime: true,
  typing: true,
  typingSpeed: 30,
  disabled: false,
});

const emit = defineEmits<ThinkEmits>();

// 展开状态
const isExpanded = ref(props.defaultExpanded);

// 打字动画状态
const displayContent = ref('');
const typingTimer = ref<ReturnType<typeof setInterval>>();

// 计算标题 - 根据状态显示不同标题
const displayTitle = computed(() => {
  // 如果设置了 title，作为向后兼容保留，但不推荐使用
  if (
    props.title &&
    !props.thinkingTitle &&
    !props.doneTitle &&
    !props.errorTitle
  ) {
    return props.title;
  }
  // 根据状态返回对应标题
  switch (props.status) {
    case 'thinking':
      return props.thinkingTitle;
    case 'done':
      return props.doneTitle;
    case 'error':
      return props.errorTitle;
    default:
      return props.thinkingTitle;
  }
});

// 格式化持续时间
const formatDuration = computed(() => {
  if (!props.startTime) return '';

  const end = props.endTime || Date.now();
  const duration = end - props.startTime;

  if (duration < 1000) {
    return `${duration}ms`;
  }
  if (duration < 60000) {
    return `${(duration / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
});

// 打字动画
function startTyping(content: string) {
  if (!props.typing || !content) {
    displayContent.value = content;
    return;
  }

  // 清除之前的定时器
  if (typingTimer.value) {
    clearInterval(typingTimer.value);
  }

  let index = displayContent.value.length;

  // 如果新内容以当前内容开头，继续打字
  if (content.startsWith(displayContent.value)) {
    // 继续从当前位置打字
  } else {
    // 重新开始
    displayContent.value = '';
    index = 0;
  }

  typingTimer.value = setInterval(() => {
    if (index < content.length) {
      displayContent.value = content.slice(0, index + 1);
      index++;
    } else {
      clearInterval(typingTimer.value);
      typingTimer.value = undefined;
      emit('typingComplete');
    }
  }, props.typingSpeed);
}

// 监听内容变化
watch(
  () => props.content,
  (newContent) => {
    if (newContent) {
      startTyping(newContent);
    }
  },
  { immediate: true },
);

// 监听状态变化
watch(
  () => props.status,
  (newStatus, oldStatus) => {
    if (newStatus === 'done' || newStatus === 'error') {
      // 状态变为完成或错误时，直接显示全部内容
      if (typingTimer.value) {
        clearInterval(typingTimer.value);
        typingTimer.value = undefined;
      }
      if (props.content) {
        displayContent.value = props.content;
      }
      // 完成后自动收起
      if (
        newStatus === 'done' &&
        oldStatus === 'thinking' &&
        props.autoCollapseOnDone
      ) {
        // 延迟一小段时间再收起，让用户看到完成状态
        setTimeout(() => {
          isExpanded.value = false;
          emit('toggle', false);
        }, 500);
      }
    }
  },
);

// 切换展开/折叠
function toggleExpand() {
  if (props.disabled) return;
  isExpanded.value = !isExpanded.value;
  emit('toggle', isExpanded.value);
}

// 清理
onUnmounted(() => {
  if (typingTimer.value) {
    clearInterval(typingTimer.value);
  }
});

/** 暴露方法 */
defineExpose({
  expand: () => {
    isExpanded.value = true;
    emit('toggle', true);
  },
  collapse: () => {
    isExpanded.value = false;
    emit('toggle', false);
  },
  isExpanded,
});
</script>

<style scoped lang="scss">
.aix-think {
  border: 1px solid var(--colorBorderSecondary, #f0f0f0);
  border-radius: var(--borderRadius, 8px);
  background: var(--colorBgLayout, #fafafa);
  overflow: hidden;
  transition: all 0.3s ease;

  &--disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  &--thinking {
    border-color: var(--colorPrimaryBorder, #91caff);
    background: var(--colorPrimaryBg, #e6f4ff);

    .aix-think__icon {
      color: var(--colorPrimary, #1890ff);
    }

    .aix-think__icon-thinking {
      animation: aix-think-spin 2s linear infinite;
    }
  }

  &--done {
    border-color: var(--colorSuccessBorder, #b7eb8f);
    background: var(--colorSuccessBg, #f6ffed);

    .aix-think__icon {
      color: var(--colorSuccess, #52c41a);
    }
  }

  &--error {
    border-color: var(--colorErrorBorder, #ffccc7);
    background: var(--colorErrorBg, #fff2f0);

    .aix-think__icon {
      color: var(--colorError, #ff4d4f);
    }
  }

  &__header {
    display: flex;
    align-items: center;
    gap: var(--paddingXS, 8px);
    padding: var(--paddingSM, 12px);
    cursor: pointer;
    user-select: none;

    &:hover {
      background: rgba(0, 0, 0, 0.02);
    }
  }

  &__icon {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    svg {
      width: 100%;
      height: 100%;
    }
  }

  &__title {
    flex: 1;
    font-size: var(--fontSizeSM, 14px);
    font-weight: 500;
    color: var(--colorText, #333);
  }

  &__time {
    font-size: var(--fontSizeXS, 12px);
    color: var(--colorTextTertiary, #999);
  }

  &__toggle {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  &__toggle-icon {
    width: 14px;
    height: 14px;
    color: var(--colorTextSecondary, #666);
    transition: transform 0.2s ease;

    &--expanded {
      transform: rotate(180deg);
    }
  }

  &__content {
    padding: 0 var(--paddingSM, 12px) var(--paddingSM, 12px);
  }

  &__text {
    font-size: var(--fontSizeSM, 14px);
    color: var(--colorTextSecondary, #666);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  &__cursor {
    display: inline-block;
    width: 2px;
    height: 1em;
    background: var(--colorPrimary, #1890ff);
    margin-left: 2px;
    animation: aix-think-blink 0.7s step-end infinite;
  }
}

@keyframes aix-think-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes aix-think-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
</style>
