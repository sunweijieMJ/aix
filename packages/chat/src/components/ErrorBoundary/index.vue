<template>
  <div class="aix-error-boundary">
    <slot v-if="!hasError" />
    <div v-else class="aix-error-boundary__fallback">
      <slot name="fallback" :error="error" :reset="reset">
        <div class="aix-error-boundary__default">
          <div class="aix-error-boundary__icon"><Warning /></div>
          <h3 class="aix-error-boundary__title">{{ t.errorTitle }}</h3>
          <p class="aix-error-boundary__message">{{ errorMessage }}</p>
          <div class="aix-error-boundary__actions">
            <button
              v-if="showRetry"
              class="aix-error-boundary__button aix-error-boundary__button--primary"
              @click="reset"
            >
              {{ t.retry }}
            </button>
            <button
              v-if="showReload"
              class="aix-error-boundary__button aix-error-boundary__button--secondary"
              @click="reload"
            >
              {{ t.reload }}
            </button>
          </div>
          <details
            v-if="showDetails && error"
            class="aix-error-boundary__details"
          >
            <summary>{{ t.errorDetails }}</summary>
            <pre class="aix-error-boundary__stack">{{ error.stack }}</pre>
          </details>
        </div>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview ErrorBoundary - 错误边界组件
 * 捕获子组件的运行时错误,防止整个应用崩溃
 */
import { useLocale } from '@aix/hooks';
import { Warning } from '@aix/icons';
import { ref, onErrorCaptured, computed, watch } from 'vue';
import { chatLocale } from '../../locale';

interface ErrorBoundaryProps {
  /** 是否显示重试按钮 */
  showRetry?: boolean;
  /** 是否显示刷新页面按钮 */
  showReload?: boolean;
  /** 是否显示错误详情 */
  showDetails?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟(毫秒) */
  retryDelay?: number;
  /** 自定义错误消息 */
  errorMessage?: string;
  /** 错误回调 */
  onError?: (error: Error, retryCount: number) => void;
  /** 重置回调 */
  onReset?: () => void;
}

interface ErrorBoundaryEmits {
  (e: 'error', error: Error): void;
  (e: 'reset'): void;
}

const props = withDefaults(defineProps<ErrorBoundaryProps>(), {
  showRetry: true,
  showReload: false,
  showDetails: false,
  maxRetries: 3,
  retryDelay: 1000,
});

const emit = defineEmits<ErrorBoundaryEmits>();

const { t } = useLocale(chatLocale);

const hasError = ref(false);
const error = ref<Error | null>(null);
const retryCount = ref(0);

const errorMessage = computed(() => {
  if (props.errorMessage) return props.errorMessage;
  if (!error.value) return t.value.errorMessage || '发生了一个错误';
  return error.value.message || '发生了一个错误';
});

/**
 * 捕获子组件错误
 */
onErrorCaptured((err: Error, _instance, info) => {
  console.error('[ErrorBoundary] 捕获到错误:', err);
  console.error('[ErrorBoundary] 错误信息:', info);

  hasError.value = true;
  error.value = err;
  emit('error', err);

  // 调用错误回调
  props.onError?.(err, retryCount.value);

  // 阻止错误继续向上传播
  return false;
});

/**
 * 重置错误状态
 */
const reset = async () => {
  if (retryCount.value >= props.maxRetries) {
    console.warn('[ErrorBoundary] 已达到最大重试次数');
    return;
  }

  retryCount.value++;

  // 延迟后重置
  await new Promise((resolve) => setTimeout(resolve, props.retryDelay));

  hasError.value = false;
  error.value = null;
  emit('reset');
  props.onReset?.();
};

/**
 * 刷新页面
 */
const reload = () => {
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
};

/**
 * 监听错误变化,重置重试计数
 */
watch(
  () => error.value?.message,
  (newMessage, oldMessage) => {
    if (newMessage !== oldMessage) {
      retryCount.value = 0;
    }
  },
);

defineExpose({
  hasError,
  error,
  reset,
  reload,
});
</script>

<style scoped lang="scss">
.aix-error-boundary {
  width: 100%;
  height: 100%;

  &__fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 300px;
    padding: var(--aix-space-xl);
  }

  &__default {
    max-width: 500px;
    text-align: center;
  }

  &__icon {
    font-size: 64px;
    margin-bottom: var(--aix-space-lg);
    animation: errorPulse 2s ease-in-out infinite;
  }

  &__title {
    margin: 0 0 var(--aix-space-md);
    font-size: var(--fontSizeLG, 18px);
    font-weight: 600;
    color: var(--colorTextHeading, #262626);
  }

  &__message {
    margin: 0 0 var(--aix-space-lg);
    font-size: var(--fontSize, 14px);
    color: var(--colorTextSecondary, #8c8c8c);
    line-height: 1.6;
  }

  &__actions {
    display: flex;
    gap: var(--aix-space-sm);
    justify-content: center;
    margin-bottom: var(--aix-space-lg);
  }

  &__button {
    padding: 8px 24px;
    border: none;
    border-radius: var(--aix-radius-md, 6px);
    font-size: var(--fontSize, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--aix-transition-base);

    &--primary {
      background: var(--colorPrimary, #1677ff);
      color: white;

      &:hover {
        background: var(--colorPrimaryHover, #4096ff);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(22, 119, 255, 0.3);
      }
    }

    &--secondary {
      background: var(--colorBgContainer, #fff);
      border: 1px solid var(--colorBorder, #d9d9d9);
      color: var(--colorText, #262626);

      &:hover {
        border-color: var(--colorPrimary, #1677ff);
        color: var(--colorPrimary, #1677ff);
        transform: translateY(-2px);
      }
    }

    &:active {
      transform: translateY(0);
    }
  }

  &__details {
    margin-top: var(--aix-space-lg);
    text-align: left;

    summary {
      padding: var(--aix-space-sm);
      background: var(--colorBgLayout, #f5f5f5);
      border-radius: var(--aix-radius-sm, 4px);
      cursor: pointer;
      font-size: var(--fontSizeSM, 13px);
      color: var(--colorTextSecondary, #8c8c8c);

      &:hover {
        background: var(--colorBgTextHover, #e6e6e6);
      }
    }
  }

  &__stack {
    margin: var(--aix-space-sm) 0 0;
    padding: var(--aix-space-md);
    background: var(--colorBgLayout, #f5f5f5);
    border: 1px solid var(--colorBorder, #d9d9d9);
    border-radius: var(--aix-radius-sm, 4px);
    font-size: var(--fontSizeXS, 12px);
    font-family: monospace;
    color: var(--colorError, #ff4d4f);
    white-space: pre-wrap;
    overflow-x: auto;
    max-height: 300px;
  }
}

@keyframes errorPulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.8;
  }
}
</style>
