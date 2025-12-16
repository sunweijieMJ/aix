<template>
  <div :class="['aix-agent-actions', className]">
    <!-- 标题 -->
    <div v-if="title" class="aix-agent-actions__title">
      <slot name="title">{{ title }}</slot>
    </div>

    <!-- 操作按钮列表 -->
    <div class="aix-agent-actions__list">
      <button
        v-for="action in actions"
        :key="action.key"
        :class="[
          'aix-agent-actions__item',
          { 'aix-agent-actions__item--disabled': action.disabled },
          { 'aix-agent-actions__item--active': action.active },
        ]"
        :disabled="action.disabled"
        @click="handleClick(action)"
      >
        <slot name="item" :action="action">
          <!-- 图标 -->
          <span v-if="action.icon" class="aix-agent-actions__icon">
            {{ action.icon }}
          </span>

          <!-- 标签 -->
          <span class="aix-agent-actions__label">{{ action.label }}</span>

          <!-- 徽标 -->
          <span v-if="action.badge" class="aix-agent-actions__badge">
            {{ action.badge }}
          </span>
        </slot>
      </button>

      <!-- 分隔符（可选） -->
      <div v-if="showDivider" class="aix-agent-actions__divider" />

      <!-- 额外操作插槽 -->
      <slot name="extra" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview AgentActions 组件 - AI 智能体操作按钮组
 *
 * 用于展示 AI 智能体的各种功能入口，如：
 * - AI指令
 * - 知识点讲解
 * - 视频解读
 * - AI陪练
 * - AI智能体
 *
 * @see ./types.ts - 导出类型定义
 */

/** 操作项 */
interface AgentAction {
  key: string;
  label: string;
  icon?: string;
  badge?: string;
  disabled?: boolean;
  active?: boolean;
  meta?: Record<string, any>;
}

/** AgentActions 组件 Props */
interface AgentActionsProps {
  title?: string;
  actions: AgentAction[];
  showDivider?: boolean;
  className?: string;
}

/** AgentActions 组件 Emits */
interface AgentActionsEmits {
  (e: 'click', action: AgentAction): void;
}

withDefaults(defineProps<AgentActionsProps>(), {
  showDivider: false,
});

const emit = defineEmits<AgentActionsEmits>();

/**
 * 点击处理
 */
const handleClick = (action: AgentAction) => {
  if (action.disabled) return;
  emit('click', action);
};
</script>

<style scoped lang="scss">
.aix-agent-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__title {
    font-family:
      'PingFang SC',
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    font-size: 16px;
    font-weight: 500;
    color: #000;
  }

  &__list {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;

    &::-webkit-scrollbar {
      height: 4px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.1);
      border-radius: 2px;
    }
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 8px 16px;
    background-color: #ffffff;
    border: 1px solid transparent;
    border-radius: 9999px;
    font-size: 14px;
    font-weight: 600;
    color: #222727;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    flex-shrink: 0;

    /* 玻璃态边框效果 */
    background-image:
      linear-gradient(#ffffff, #ffffff),
      linear-gradient(
        216deg,
        rgba(255, 255, 255, 1) 0%,
        rgba(255, 255, 255, 0.35) 50%,
        rgba(255, 255, 255, 1) 100%
      );
    background-origin: border-box;
    background-clip: padding-box, border-box;
    border: 1px solid transparent;

    &:hover:not(&--disabled) {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    &:active:not(&--disabled) {
      transform: translateY(0);
    }

    &--active {
      background-color: var(--colorPrimaryBg, #e6f4ff);
      border-color: var(--colorPrimary, #1677ff);
      color: var(--colorPrimary, #1677ff);
    }

    &--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    line-height: 1;
  }

  &__label {
    font-family:
      'PingFang SC',
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: inherit;
  }

  &__badge {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    background-color: var(--colorError, #ff4d4f);
    border-radius: 9px;
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
    line-height: 1;
  }

  &__divider {
    width: 1px;
    height: 24px;
    background-color: rgba(0, 0, 0, 0.1);
    flex-shrink: 0;
  }
}

/*  响应式设计 */
@media (max-width: 768px) {
  .aix-agent-actions {
    &__item {
      padding: 6px 12px;
      height: 32px;
    }

    &__icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }

    &__label {
      font-size: 13px;
    }
  }
}
</style>
