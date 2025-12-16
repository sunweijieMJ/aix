<template>
  <div :class="['aix-thought-chain', className]">
    <!-- 头部 -->
    <div
      v-if="collapsible"
      class="aix-thought-chain__header"
      @click="toggleExpanded"
    >
      <div class="aix-thought-chain__title">
        <Highlight class="aix-thought-chain__icon" />
        <span>思维链 ({{ steps.length }} 步)</span>
      </div>
      <ArrowDropDown
        :class="[
          'aix-thought-chain__toggle',
          { 'aix-thought-chain__toggle--expanded': isExpanded },
        ]"
      />
    </div>

    <!-- 步骤列表 -->
    <div v-show="!collapsible || isExpanded" class="aix-thought-chain__steps">
      <div
        v-for="(step, index) in steps"
        :key="index"
        :class="[
          'aix-thought-chain__step',
          `aix-thought-chain__step--${step.type}`,
        ]"
        @click="handleStepClick(step)"
      >
        <slot name="step" :step="step" :index="index">
          <!-- 步骤图标 -->
          <div class="aix-thought-chain__step-icon">
            <component :is="getStepIcon(step.type)" />
          </div>

          <!-- 步骤内容 -->
          <div class="aix-thought-chain__step-content">
            <div class="aix-thought-chain__step-type">
              {{ getStepLabel(step.type) }}
            </div>

            <!-- 思考内容 -->
            <div
              v-if="step.type === 'thought'"
              class="aix-thought-chain__step-text"
            >
              {{ step.content }}
            </div>

            <!-- 工具调用 -->
            <div
              v-else-if="step.type === 'action'"
              class="aix-thought-chain__step-action"
            >
              <div class="aix-thought-chain__step-tool">
                <Build class="aix-thought-chain__tool-icon" />
                {{ step.tool }}
              </div>
              <div v-if="step.params" class="aix-thought-chain__step-params">
                <pre>{{ JSON.stringify(step.params, null, 2) }}</pre>
              </div>
            </div>

            <!-- 观察结果 -->
            <div
              v-else-if="step.type === 'observation'"
              class="aix-thought-chain__step-text"
            >
              {{ step.content }}
            </div>
          </div>
        </slot>
      </div>

      <!-- 加载状态 -->
      <div
        v-if="loading"
        class="aix-thought-chain__step aix-thought-chain__step--loading"
      >
        <div class="aix-thought-chain__step-icon">
          <div class="aix-thought-chain__loading-spinner" />
        </div>
        <div class="aix-thought-chain__step-content">
          <div class="aix-thought-chain__step-type">思考中...</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview ThoughtChain 思维链组件
 * 可视化展示 AI Agent 的推理过程
 */

import {
  Highlight,
  ArrowDropDown,
  Message,
  FlightTakeOff,
  Eye,
  Build,
} from '@aix/icons';
import { ref, type Component } from 'vue';

/** 思维链步骤类型 */
type ThoughtStepType = 'thought' | 'action' | 'observation';

/** 思维链步骤 */
interface ThoughtStep {
  type: ThoughtStepType;
  content: string;
  tool?: string;
  params?: Record<string, unknown>;
  timestamp?: number;
}

/** ThoughtChain 组件 Props */
interface ThoughtChainProps {
  steps?: ThoughtStep[];
  loading?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

/** ThoughtChain 组件 Emits */
interface ThoughtChainEmits {
  (e: 'stepClick', step: ThoughtStep): void;
}

const props = withDefaults(defineProps<ThoughtChainProps>(), {
  steps: () => [],
  loading: false,
  collapsible: false,
  defaultExpanded: true,
});

const emit = defineEmits<ThoughtChainEmits>();

const isExpanded = ref(props.defaultExpanded);

/**
 * 切换展开/折叠
 */
const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
};

/**
 * 获取步骤图标
 */
const getStepIcon = (type: ThoughtStepType): Component => {
  const icons = {
    thought: Message,
    action: FlightTakeOff,
    observation: Eye,
  };
  return icons[type] || Message;
};

/**
 * 获取步骤标签
 */
const getStepLabel = (type: ThoughtStepType): string => {
  const labels = {
    thought: '思考',
    action: '执行',
    observation: '观察',
  };
  return labels[type] || type;
};

/**
 * 处理步骤点击
 */
const handleStepClick = (step: ThoughtStep) => {
  emit('stepClick', step);
};
</script>

<style scoped lang="scss">
.aix-thought-chain {
  background: var(--colorBgContainer, #fff);
  border: 1px solid var(--colorBorder, #d9d9d9);
  border-radius: 8px;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--colorBgLayout, #f5f5f5);
    cursor: pointer;
    user-select: none;
    transition: background 0.2s;

    &:hover {
      background: var(--colorBgTextHover, #e6e6e6);
    }
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--colorText, #000);
  }

  &__icon {
    width: 18px;
    height: 18px;
    color: var(--colorPrimary, #1677ff);
  }

  &__toggle {
    width: 16px;
    height: 16px;
    color: var(--colorTextSecondary, #666);
    transition: transform 0.2s;

    &--expanded {
      transform: rotate(180deg);
    }
  }

  &__steps {
    padding: 16px;
  }

  &__step {
    display: flex;
    gap: 12px;
    padding: 12px;
    margin-bottom: 12px;
    border-radius: 8px;
    transition: all 0.2s;

    &:last-child {
      margin-bottom: 0;
    }

    &--thought {
      background: rgba(22, 119, 255, 0.05);
      border-left: 3px solid var(--colorPrimary, #1677ff);
    }

    &--action {
      background: rgba(82, 196, 26, 0.05);
      border-left: 3px solid var(--colorSuccess, #52c41a);
    }

    &--observation {
      background: rgba(250, 173, 20, 0.05);
      border-left: 3px solid var(--colorWarning, #faad14);
    }

    &--loading {
      background: rgba(0, 0, 0, 0.02);
      border-left: 3px solid var(--colorTextTertiary, #ccc);
    }
  }

  &__step-icon {
    font-size: 20px;
    line-height: 1;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
  }

  &__step-content {
    flex: 1;
    min-width: 0;
  }

  &__step-type {
    font-size: 12px;
    font-weight: 600;
    color: var(--colorTextSecondary, #666);
    margin-bottom: 4px;
    text-transform: uppercase;
  }

  &__step-text {
    font-size: 14px;
    color: var(--colorText, #000);
    line-height: 1.6;
    word-break: break-word;
  }

  &__step-action {
    font-size: 14px;
  }

  &__step-tool {
    font-weight: 600;
    color: var(--colorSuccess, #52c41a);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__tool-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  &__step-params {
    background: var(--colorBgLayout, #f5f5f5);
    border-radius: 4px;
    padding: 8px;
    overflow-x: auto;

    pre {
      margin: 0;
      font-size: 12px;
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      color: var(--colorText, #000);
    }
  }

  &__loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--colorBorder, #d9d9d9);
    border-top-color: var(--colorPrimary, #1677ff);
    border-radius: 50%;
    animation: aix-thought-chain-spin 0.8s linear infinite;
  }
}

@keyframes aix-thought-chain-spin {
  to {
    transform: rotate(360deg);
  }
}

/*  响应式设计 */
@media (max-width: 768px) {
  .aix-thought-chain {
    &__steps {
      padding: 12px;
    }

    &__step {
      padding: 8px;
      gap: 8px;
    }

    &__step-icon {
      font-size: 16px;
    }
  }
}
</style>
