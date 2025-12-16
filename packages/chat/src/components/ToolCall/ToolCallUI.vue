<template>
  <div
    :class="[
      'aix-tool-call',
      `aix-tool-call--${toolCall.status}`,
      className,
      { 'aix-tool-call--collapsed': collapsed },
    ]"
  >
    <!-- 头部：工具名称 + 状态 -->
    <div class="aix-tool-call__header" @click="toggleCollapse">
      <div class="aix-tool-call__title">
        <span class="aix-tool-call__icon">
          <slot
            name="icon"
            :tool-name="toolCall.name"
            :status="toolCall.status"
          >
            {{ statusIcon }}
          </slot>
        </span>
        <span class="aix-tool-call__name">{{ toolCall.name }}</span>
        <span
          :class="[
            'aix-tool-call__status',
            `aix-tool-call__status--${toolCall.status}`,
          ]"
        >
          {{ statusText }}
        </span>
      </div>
      <div v-if="collapsible" class="aix-tool-call__arrow">
        {{ collapsed ? '▶' : '▼' }}
      </div>
    </div>

    <!-- 内容：参数 + 结果 -->
    <transition name="aix-tool-call-collapse">
      <div v-show="!collapsed" class="aix-tool-call__body">
        <!-- 调用参数 -->
        <div v-if="toolCall.args" class="aix-tool-call__section">
          <div class="aix-tool-call__label">调用参数:</div>
          <slot name="args" :args="toolCall.args">
            <pre class="aix-tool-call__code">{{
              formatJSON(toolCall.args)
            }}</pre>
          </slot>
        </div>

        <!-- 加载状态 -->
        <div
          v-if="toolCall.status === 'running'"
          class="aix-tool-call__loading"
        >
          <slot name="loading">
            <span class="aix-tool-call__spinner" />
            <span class="aix-tool-call__loading-text">正在执行...</span>
          </slot>
        </div>

        <!-- 返回结果 -->
        <div
          v-if="toolCall.status === 'success' && toolCall.result !== undefined"
          class="aix-tool-call__section"
        >
          <div class="aix-tool-call__label">返回结果:</div>
          <slot name="result" :result="toolCall.result">
            <pre class="aix-tool-call__code aix-tool-call__code--result">{{
              formatJSON(toolCall.result)
            }}</pre>
          </slot>
        </div>

        <!-- 错误信息 -->
        <div
          v-if="toolCall.status === 'error' && toolCall.error"
          class="aix-tool-call__section"
        >
          <div class="aix-tool-call__label">错误信息:</div>
          <div class="aix-tool-call__error">
            <slot name="result" :error="toolCall.error">
              {{ formatError(toolCall.error) }}
            </slot>
          </div>
        </div>

        <!-- 执行时间 -->
        <div
          v-if="showExecutionTime && executionTime !== null"
          class="aix-tool-call__time"
        >
          <span class="aix-tool-call__time-icon"><Timer /></span>
          执行时间: {{ executionTime }}ms
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview ToolCallUI 组件
 * @see ./types.ts - 导出类型定义
 */
import { Timer } from '@aix/icons';
import { ref, computed } from 'vue';

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

/** ToolCallUI 组件 Props */
interface ToolCallUIProps {
  toolCall: ToolCall;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  showExecutionTime?: boolean;
  className?: string;
}

const props = withDefaults(defineProps<ToolCallUIProps>(), {
  collapsible: true,
  defaultCollapsed: false,
  showExecutionTime: true,
});

const collapsed = ref(props.defaultCollapsed);

const statusIcon = computed(() => {
  const icons = {
    pending: '⏳',
    running: '🔄',
    success: '✅',
    error: '❌',
  };
  return icons[props.toolCall.status];
});

const statusText = computed(() => {
  const map = {
    pending: '等待中',
    running: '执行中',
    success: '成功',
    error: '失败',
  };
  return map[props.toolCall.status];
});

const executionTime = computed(() => {
  if (props.toolCall.startTime && props.toolCall.endTime) {
    return props.toolCall.endTime - props.toolCall.startTime;
  }
  return null;
});

const toggleCollapse = () => {
  if (props.collapsible) {
    collapsed.value = !collapsed.value;
  }
};

const formatJSON = (data: any): string => {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
};

const formatError = (error: Error | string): string => {
  if (typeof error === 'string') {
    return error;
  }
  return error.message || String(error);
};
</script>

<style scoped lang="scss">
.aix-tool-call {
  margin-bottom: var(--paddingSM);
  overflow: hidden;
  background: var(--colorBgContainer, #ffffff);
  border: 1px solid var(--colorBorder, #d9d9d9);
  border-radius: var(--borderRadiusLG);
  box-shadow: var(--aix-shadow-xs);
  transition: all var(--aix-transition-slow);

  &--pending {
    border-color: var(--colorWarningBorder, #ffe58f);
    background: var(--colorWarningBg, #fffbe6);
  }

  &--running {
    border-color: var(--colorInfoBorder, #91caff);
    background: var(--colorInfoBg, #e6f4ff);
    box-shadow: var(--aix-shadow-sm);
  }

  &--success {
    border-color: var(--colorSuccessBorder, #b7eb8f);
    background: var(--colorSuccessBg, #f6ffed);
  }

  &--error {
    border-color: var(--colorErrorBorder, #ffccc7);
    background: var(--colorErrorBg, #fff2f0);
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--paddingSM) var(--padding);
    cursor: pointer;
    user-select: none;
    transition: background var(--aix-transition-base);

    &:hover {
      background: var(--colorFillQuaternary, rgba(0, 0, 0, 0.02));
    }
  }

  &__title {
    display: flex;
    align-items: center;
    gap: var(--paddingXS);
    flex: 1;
  }

  &__icon {
    display: inline-flex;
    font-size: var(--fontSizeLG);
  }

  &__name {
    font-size: var(--fontSizeSM);
    font-weight: 600;
    color: var(--colorText, #000000d9);
  }

  &__status {
    padding: 2px var(--paddingXS);
    font-size: var(--fontSizeXS);
    border-radius: var(--borderRadiusSM);
    font-weight: 500;

    &--pending {
      color: var(--colorWarning, #faad14);
      background: var(--colorWarningBg, #fffbe6);
    }

    &--running {
      color: var(--colorInfo, #1677ff);
      background: var(--colorInfoBg, #e6f4ff);
      animation: statusPulse 2s ease-in-out infinite;
    }

    &--success {
      color: var(--colorSuccess, #52c41a);
      background: var(--colorSuccessBg, #f6ffed);
    }

    &--error {
      color: var(--colorError, #ff4d4f);
      background: var(--colorErrorBg, #fff2f0);
    }
  }

  &__arrow {
    margin-left: var(--paddingXS);
    font-size: var(--fontSizeXS);
    color: var(--colorTextSecondary, #00000073);
    transition: transform var(--aix-transition-slow);
  }

  &__body {
    padding: 0 var(--padding) var(--padding);
  }

  &__section {
    margin-bottom: var(--paddingSM);

    &:last-child {
      margin-bottom: 0;
    }
  }

  &__label {
    margin-bottom: var(--paddingXXS);
    font-size: var(--fontSizeSM);
    font-weight: 600;
    color: var(--colorTextSecondary, #00000073);
  }

  &__code {
    margin: 0;
    padding: var(--paddingSM);
    font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
    font-size: var(--fontSizeXS);
    line-height: 1.6;
    color: var(--colorText, #000000d9);
    background: var(--colorBgLayout, #f5f5f5);
    border-radius: var(--borderRadius);
    overflow-x: auto;

    /* 自定义滚动条 */
    &::-webkit-scrollbar {
      height: 6px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background: var(--colorFillTertiary, rgba(0, 0, 0, 0.04));
      border-radius: var(--borderRadiusXS);

      &:hover {
        background: var(--colorFillSecondary, rgba(0, 0, 0, 0.06));
      }
    }

    &--result {
      background: var(--colorSuccessBg, #f6ffed);
    }
  }

  &__loading {
    display: flex;
    align-items: center;
    gap: var(--paddingXS);
    padding: var(--paddingSM);
    background: var(--colorInfoBg, #e6f4ff);
    border-radius: var(--borderRadius);
  }

  &__spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--colorInfo, #1677ff);
    border-top-color: transparent;
    border-radius: 50%;
    animation: toolCallSpin 0.8s linear infinite;
  }

  &__loading-text {
    font-size: var(--fontSizeSM);
    color: var(--colorInfo, #1677ff);
  }

  &__error {
    padding: var(--paddingSM);
    font-size: var(--fontSizeSM);
    line-height: 1.6;
    color: var(--colorError, #ff4d4f);
    background: var(--colorErrorBg, #fff2f0);
    border-radius: var(--borderRadius);
    word-break: break-all;
  }

  &__time {
    display: flex;
    align-items: center;
    gap: var(--paddingXXS);
    margin-top: var(--paddingXS);
    padding-top: var(--paddingXS);
    font-size: var(--fontSizeXS);
    color: var(--colorTextSecondary, #00000073);
    border-top: 1px dashed var(--colorBorder, #d9d9d9);
  }

  &__time-icon {
    font-size: var(--fontSizeSM);
  }
}

/*  Collapse animation (保留 Vue transition 名称) */
.aix-tool-call-collapse-enter-active,
.aix-tool-call-collapse-leave-active {
  transition: all var(--aix-transition-slow) ease;
  overflow: hidden;
}

.aix-tool-call-collapse-enter-from,
.aix-tool-call-collapse-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.aix-tool-call-collapse-enter-to,
.aix-tool-call-collapse-leave-from {
  max-height: 1000px;
  opacity: 1;
}

/*  动画定义 */
@keyframes toolCallSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes statusPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

/*  响应式设计 */
@media (max-width: 768px) {
  .aix-tool-call {
    &__header {
      padding: var(--paddingXS) var(--paddingSM);
    }

    &__icon {
      font-size: var(--fontSizeMD);
    }

    &__name {
      font-size: var(--fontSizeXS);
    }

    &__status {
      font-size: 11px;
      padding: 2px var(--paddingXXS);
    }

    &__body {
      padding: 0 var(--paddingSM) var(--paddingSM);
    }

    &__code {
      padding: var(--paddingXS);
      font-size: 11px;
    }

    &__loading,
    &__error {
      padding: var(--paddingXS);
    }
  }
}
</style>
