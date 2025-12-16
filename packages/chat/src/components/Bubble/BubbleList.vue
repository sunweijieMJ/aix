<template>
  <div
    ref="listRef"
    :class="['aix-bubble-list', className]"
    @scroll="handleScroll"
  >
    <!-- 空状态 -->
    <div v-if="items.length === 0" class="aix-bubble-list__empty">
      <slot name="empty">
        <div class="aix-bubble-list__empty-default">
          <div class="aix-bubble-list__empty-icon">💬</div>
          <div class="aix-bubble-list__empty-text">暂无消息</div>
        </div>
      </slot>
    </div>

    <!-- 消息列表（带动画） -->
    <TransitionGroup
      v-else
      :name="animationName"
      tag="div"
      class="aix-bubble-list__messages"
      :css="animationEnabled"
    >
      <template v-for="(item, index) in processedItems" :key="item.id">
        <!-- 时间分隔线 -->
        <BubbleDivider
          v-if="item._showTimeDivider && item._dividerTime"
          :key="`divider-${item.id}`"
          type="time"
          :timestamp="item._dividerTime"
          :time-format="groupConfig.timeDividerFormat"
          class="aix-bubble-list__divider"
        />
        <!-- 消息气泡 -->
        <Bubble
          :role="item.role"
          :content="toStringContent(item.content)"
          :placement="item.role === 'user' ? 'end' : 'start'"
          :loading="item.status === 'loading'"
          :enable-markdown="enableMarkdown"
          :tool-calls="item.toolCalls"
          :avatar="item._hideAvatar ? false : undefined"
          :style="getAnimationStyle(index)"
          v-bind="getRoleConfig(item)"
        >
          <template #header>
            <slot name="itemHeader" :item="item" />
          </template>
          <template #footer>
            <slot name="itemFooter" :item="item" />
          </template>
          <template #actions>
            <slot name="itemActions" :item="item" />
          </template>
          <template #avatar="slotProps">
            <slot name="itemAvatar" :item="item" v-bind="slotProps" />
          </template>
          <template #toolCalls="slotProps">
            <slot name="itemToolCalls" :item="item" v-bind="slotProps" />
          </template>
        </Bubble>
      </template>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview BubbleList 组件
 * @see ./types.ts - 导出类型定义
 */
import { toStringContent } from '@aix/chat-sdk';
import type { ChatMessage } from '@aix/chat-sdk';
import {
  ref,
  watch,
  nextTick,
  onMounted,
  computed,
  toRef,
  type CSSProperties,
} from 'vue';
import BubbleDivider from './BubbleDivider.vue';
import { provideBubbleContext } from './context';
import Bubble from './index.vue';
import type {
  BubbleListProps,
  BubbleProps,
  RoleConfig,
  BubbleAnimationConfig,
  BubbleGroupConfig,
  ProcessedMessage,
} from './types';

interface BubbleListEmits {
  (e: 'scroll', event: Event): void;
}

const props = withDefaults(defineProps<BubbleListProps>(), {
  items: () => [],
  autoScroll: true,
  enableMarkdown: false,
});

const emit = defineEmits<BubbleListEmits>();

const listRef = ref<HTMLDivElement>();

/* ===== 动画配置 ===== */

/**
 * 默认动画配置
 */
const DEFAULT_ANIMATION: BubbleAnimationConfig = {
  type: 'fade',
  duration: 300,
  easing: 'ease-out',
  stagger: false,
  staggerDelay: 50,
};

/**
 * 解析动画配置
 */
const animationConfig = computed<BubbleAnimationConfig>(() => {
  if (props.animation === false || props.animation === undefined) {
    return { type: 'none' };
  }
  if (props.animation === true) {
    return DEFAULT_ANIMATION;
  }
  return { ...DEFAULT_ANIMATION, ...props.animation };
});

/**
 * 动画是否启用
 */
const animationEnabled = computed(() => animationConfig.value.type !== 'none');

/**
 * 动画名称（用于 TransitionGroup）
 */
const animationName = computed(() => {
  const type = animationConfig.value.type;
  if (type === 'none') return '';
  return `bubble-${type}`;
});

/**
 * 获取级联动画样式
 */
const getAnimationStyle = (index: number): CSSProperties => {
  if (!animationEnabled.value || !animationConfig.value.stagger) {
    return {};
  }

  const delay = (animationConfig.value.staggerDelay || 50) * index;
  return {
    '--animation-delay': `${delay}ms`,
    animationDelay: `${delay}ms`,
  } as CSSProperties;
};

/* ===== 分组配置 ===== */

/**
 * 默认分组配置
 */
const DEFAULT_GROUPING: BubbleGroupConfig = {
  enabled: false,
  strategy: 'time',
  interval: 5 * 60 * 1000, // 5 分钟
  collapseAvatar: true,
  showTimeDivider: true,
};

/**
 * 解析分组配置
 */
const groupConfig = computed<BubbleGroupConfig>(() => {
  if (props.grouping === false || props.grouping === undefined) {
    return { enabled: false };
  }
  if (props.grouping === true) {
    return { ...DEFAULT_GROUPING, enabled: true };
  }
  return { ...DEFAULT_GROUPING, ...props.grouping, enabled: true };
});

// 提供 Bubble 上下文，子组件可通过 useBubbleContext 获取配置
provideBubbleContext({
  enableMarkdown: toRef(props, 'enableMarkdown'),
  formatTime: groupConfig.value.timeDividerFormat,
});

/**
 * 判断是否应该开始新组
 */
const shouldStartNewGroup = (
  current: ChatMessage,
  previous: ChatMessage | null,
): boolean => {
  if (!previous) return true;

  const {
    strategy,
    interval,
    shouldStartNewGroup: customFn,
  } = groupConfig.value;

  switch (strategy) {
    case 'time': {
      const currentTime = current.createAt || 0;
      const previousTime = previous.createAt || 0;
      return currentTime - previousTime > (interval || 5 * 60 * 1000);
    }
    case 'role':
      return current.role !== previous.role;
    case 'custom':
      return customFn ? customFn(current, previous) : false;
    default:
      return false;
  }
};

/**
 * 处理消息列表（添加分组元数据）
 */
const processedItems = computed<ProcessedMessage[]>(() => {
  if (!groupConfig.value.enabled) {
    return props.items as ProcessedMessage[];
  }

  const result: ProcessedMessage[] = [];
  let currentGroupIndex = 0;

  props.items.forEach((item, index) => {
    const previous: ChatMessage | null =
      index > 0 ? (props.items[index - 1] ?? null) : null;
    const isNewGroup = shouldStartNewGroup(item, previous);

    if (isNewGroup) {
      currentGroupIndex++;
    }

    const processed: ProcessedMessage = {
      ...item,
      _groupIndex: currentGroupIndex,
      _showTimeDivider: isNewGroup && groupConfig.value.showTimeDivider,
      _dividerTime: isNewGroup ? item.createAt || Date.now() : undefined,
      _hideAvatar:
        !isNewGroup &&
        groupConfig.value.collapseAvatar &&
        previous?.role === item.role,
    };

    result.push(processed);
  });

  return result;
});

/**
 * 获取消息的角色配置
 * @description 支持静态配置和函数式动态配置
 */
const getRoleConfig = (item: ChatMessage): Partial<BubbleProps> => {
  const roleConfig: RoleConfig | undefined = props.roles?.[item.role];

  if (!roleConfig) {
    return {};
  }

  // 如果是函数，则调用函数获取配置
  if (typeof roleConfig === 'function') {
    return roleConfig(item);
  }

  // 否则直接返回静态配置
  return roleConfig;
};

/**
 * 滚动到底部
 */
const scrollToBottom = () => {
  if (listRef.value && props.autoScroll) {
    nextTick(() => {
      if (listRef.value) {
        listRef.value.scrollTop = listRef.value.scrollHeight;
      }
    });
  }
};

/**
 * 监听消息数量变化，自动滚动
 * 优化：仅监听数组长度，避免深度监听大数组带来的性能开销
 */
watch(
  () => props.items.length,
  () => {
    scrollToBottom();
  },
  { immediate: true },
);

/**
 * 组件挂载后滚动到底部（确保 DOM 已渲染）
 */
onMounted(() => {
  scrollToBottom();
});

/**
 * 处理滚动事件
 */
const handleScroll = (e: Event) => {
  emit('scroll', e);
};

/*  暴露方法供外部调用 */
defineExpose({
  scrollToBottom,
});
</script>

<style scoped lang="scss">
.aix-bubble-list {
  display: flex;
  flex-direction: column;
  padding: var(--padding, 12px);
  overflow-y: auto;
  height: 100%;

  /* 滚动条样式 */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--colorBorder, #d9d9d9);
    border-radius: 3px;

    &:hover {
      background: var(--colorBorderSecondary, #bfbfbf);
    }
  }

  /* 消息列表容器 */
  &__messages {
    display: flex;
    flex-direction: column;
  }

  /* 分隔线样式 */
  &__divider {
    margin-block: var(--paddingSM, 12px);
  }

  /* 空状态样式 */
  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 200px;
  }

  &__empty-default {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--colorTextTertiary, #999);
  }

  &__empty-icon {
    font-size: 48px;
    margin-bottom: var(--paddingXS, 8px);
  }

  &__empty-text {
    font-size: var(--fontSize, 14px);
  }
}

/* ===== 动画样式 ===== */

/* Fade 淡入动画 */
.bubble-fade-enter-active {
  transition: opacity 0.3s ease-out;
  transition-delay: var(--animation-delay, 0ms);
}

.bubble-fade-leave-active {
  transition: opacity 0.2s ease-in;
}

.bubble-fade-enter-from,
.bubble-fade-leave-to {
  opacity: 0;
}

/* Slide 左右滑入动画 */
.bubble-slide-enter-active {
  transition: all 0.3s ease-out;
  transition-delay: var(--animation-delay, 0ms);
}

.bubble-slide-leave-active {
  transition: all 0.2s ease-in;
}

.bubble-slide-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.bubble-slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* Slide-up 向上滑入动画 */
.bubble-slide-up-enter-active {
  transition: all 0.3s ease-out;
  transition-delay: var(--animation-delay, 0ms);
}

.bubble-slide-up-leave-active {
  transition: all 0.2s ease-in;
}

.bubble-slide-up-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.bubble-slide-up-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Slide-down 向下滑入动画 */
.bubble-slide-down-enter-active {
  transition: all 0.3s ease-out;
  transition-delay: var(--animation-delay, 0ms);
}

.bubble-slide-down-leave-active {
  transition: all 0.2s ease-in;
}

.bubble-slide-down-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.bubble-slide-down-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* Scale 缩放动画 */
.bubble-scale-enter-active {
  transition: all 0.3s ease-out;
  transition-delay: var(--animation-delay, 0ms);
}

.bubble-scale-leave-active {
  transition: all 0.2s ease-in;
}

.bubble-scale-enter-from {
  opacity: 0;
  transform: scale(0.8);
}

.bubble-scale-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

/* Zoom 缩放弹入动画 */
.bubble-zoom-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  transition-delay: var(--animation-delay, 0ms);
}

.bubble-zoom-leave-active {
  transition: all 0.2s ease-in;
}

.bubble-zoom-enter-from {
  opacity: 0;
  transform: scale(0.5);
}

.bubble-zoom-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

/* Move 列表移动动画（用于列表重排） */
.bubble-fade-move,
.bubble-slide-move,
.bubble-slide-up-move,
.bubble-slide-down-move,
.bubble-scale-move,
.bubble-zoom-move {
  transition: transform 0.3s ease;
}
</style>
