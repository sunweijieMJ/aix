<template>
  <div
    :class="[
      'aix-tool-call-list',
      className,
      { 'aix-tool-call-list--timeline': showTimeline },
    ]"
  >
    <!-- 标题 -->
    <div v-if="toolCalls.length > 0" class="aix-tool-call-list__header">
      <span class="aix-tool-call-list__title"><Build /> 函数调用</span>
      <span class="aix-tool-call-list__count">{{ toolCalls.length }} 个</span>
    </div>

    <!-- 工具调用列表 -->
    <div class="aix-tool-call-list__items">
      <div
        v-for="(toolCall, index) in toolCalls"
        :key="toolCall.id"
        class="aix-tool-call-list__item"
      >
        <!-- 时间线装饰 -->
        <div v-if="showTimeline" class="aix-tool-call-list__timeline">
          <div
            :class="[
              'aix-tool-call-list__timeline-dot',
              `aix-tool-call-list__timeline-dot--${toolCall.status}`,
            ]"
          />
          <div
            v-if="index < toolCalls.length - 1"
            class="aix-tool-call-list__timeline-line"
          />
        </div>

        <!-- Tool Call UI -->
        <div class="aix-tool-call-list__content">
          <ToolCallUI
            :tool-call="toolCall"
            :collapsible="collapsible"
            :default-collapsed="defaultCollapsed"
            @click="handleClick(toolCall)"
          >
            <!-- 透传插槽 -->
            <template v-for="(_, name) in $slots" #[name]="slotProps">
              <slot :name="name" v-bind="slotProps || {}" />
            </template>
          </ToolCallUI>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="toolCalls.length === 0" class="aix-tool-call-list__empty">
      <slot name="empty">
        <div class="aix-tool-call-list__empty-icon"><Build /></div>
        <div class="aix-tool-call-list__empty-text">暂无函数调用</div>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview ToolCallList 组件
 * @see ./types.ts - 导出类型定义
 */
import { Build } from '@aix/icons';
import ToolCallUI from './ToolCallUI.vue';

/** Tool Call 状态 */
type ToolCallStatus = 'pending' | 'running' | 'success' | 'error';

/** Tool Call 数据结构 */
interface ToolCall {
  id: string;
  name: string;
  status: ToolCallStatus;
  args: Record<string, any>;
  result?: any;
  error?: Error | string;
  startTime?: number;
  endTime?: number;
  metadata?: Record<string, any>;
}

/** ToolCallList 组件 Props */
interface ToolCallListProps {
  toolCalls: ToolCall[];
  showTimeline?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
}

/** ToolCallList 组件 Emits */
interface ToolCallListEmits {
  (e: 'click', toolCall: ToolCall): void;
}

withDefaults(defineProps<ToolCallListProps>(), {
  showTimeline: true,
  collapsible: true,
  defaultCollapsed: false,
});

const emit = defineEmits<ToolCallListEmits>();

const handleClick = (toolCall: ToolCall) => {
  emit('click', toolCall);
};
</script>

<style scoped lang="scss">
.aix-tool-call-list {
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--colorBorder, #d9d9d9);
  }

  &__title {
    font-size: 15px;
    font-weight: 600;
    color: var(--colorText, #000000d9);
  }

  &__count {
    padding: 2px 8px;
    font-size: 12px;
    color: var(--colorTextSecondary, #00000073);
    background: var(--colorFillTertiary, #0000000a);
    border-radius: 12px;
  }

  &__items {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  &__item {
    position: relative;
    display: flex;
    gap: 12px;
  }

  &__timeline {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 8px;
  }

  &__timeline-dot {
    position: relative;
    z-index: 1;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--colorBorder, #d9d9d9);
    background: var(--colorBgContainer, #ffffff);
    flex-shrink: 0;

    &--pending {
      border-color: var(--colorWarning, #faad14);
      background: var(--colorWarningBg, #fffbe6);
    }

    &--running {
      border-color: var(--colorInfo, #1677ff);
      background: var(--colorInfoBg, #e6f4ff);
      animation: aix-tool-call-pulse 1.5s ease-in-out infinite;
    }

    &--success {
      border-color: var(--colorSuccess, #52c41a);
      background: var(--colorSuccessBg, #f6ffed);
    }

    &--error {
      border-color: var(--colorError, #ff4d4f);
      background: var(--colorErrorBg, #fff2f0);
    }
  }

  &__timeline-line {
    width: 2px;
    flex: 1;
    min-height: 30px;
    background: var(--colorBorder, #d9d9d9);
  }

  &__content {
    flex: 1;
    min-width: 0;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
  }

  &__empty-icon {
    font-size: 48px;
    opacity: 0.5;
    margin-bottom: 12px;
  }

  &__empty-text {
    font-size: 14px;
    color: var(--colorTextSecondary, #00000073);
  }

  /*  不显示时间线时的样式 */
  &:not(&--timeline) {
    .aix-tool-call-list__content {
      width: 100%;
    }
  }
}

/*  Timeline dot pulse animation */
@keyframes aix-tool-call-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.7;
  }
}
</style>
