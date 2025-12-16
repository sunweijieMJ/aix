<template>
  <div :class="['aix-dynamic-renderer', block.className]" :style="block.style">
    <!-- 已加载的渲染器 -->
    <component
      :is="loadedComponent"
      v-if="loadedComponent"
      :block="block"
      :data="parsedData"
      :streaming="streaming"
      :stream-status="streamStatus"
      @action="handleAction"
    />

    <!-- 加载中状态 -->
    <div v-else-if="loading" class="aix-dynamic-renderer__loading">
      <div class="aix-dynamic-renderer__spinner" />
      <span>加载渲染器中...</span>
    </div>

    <!-- 加载失败状态 -->
    <div v-else-if="error" class="aix-dynamic-renderer__error">
      <span class="aix-dynamic-renderer__error-icon">❌</span>
      <span class="aix-dynamic-renderer__error-title">渲染器加载失败</span>
      <span class="aix-dynamic-renderer__error-message">{{ error }}</span>
    </div>

    <!-- 未找到渲染器 - 降级为文本显示 -->
    <div v-else class="aix-dynamic-renderer__fallback">
      <pre>{{ block.raw }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, shallowRef, type Component } from 'vue';
import { rendererRegistry } from './RendererRegistry';
import type { ContentBlock, RendererActionEvent } from './types';

interface Props {
  /** 内容块 */
  block: ContentBlock;
  /** 流式状态 */
  streaming?: boolean;
  /** 流式状态（详细） */
  streamStatus?: 'loading' | 'done';
}

interface Emits {
  (e: 'action', payload: RendererActionEvent): void;
  (e: 'rendered'): void;
  (e: 'error', error: Error): void;
}

const props = withDefaults(defineProps<Props>(), {
  streaming: false,
});

const emit = defineEmits<Emits>();

const loadedComponent = shallowRef<Component | null>(null);
const loading = ref(false);
const error = ref<string>('');

// 解析后的数据
const parsedData = computed(() => {
  return props.block.data ?? props.block.raw;
});

/**
 * 加载渲染器
 */
async function loadRenderer() {
  const type = props.block.type;

  loading.value = true;
  error.value = '';

  try {
    // 先尝试按类型获取
    let def = rendererRegistry.getByType(type);

    // 如果没有，尝试自动检测
    if (!def) {
      def = rendererRegistry.detect(props.block.raw);
    }

    if (!def) {
      // 使用 text 作为 fallback
      def = rendererRegistry.get('text');
    }

    if (def) {
      const component = await rendererRegistry.loadComponent(def.name);
      loadedComponent.value = component || null;

      if (component) {
        emit('rendered');
      }
    } else {
      loadedComponent.value = null;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    emit('error', err instanceof Error ? err : new Error(String(err)));
    loadedComponent.value = null;
  } finally {
    loading.value = false;
  }
}

/**
 * 处理子组件事件
 */
function handleAction(payload: Omit<RendererActionEvent, 'blockId'>) {
  emit('action', {
    ...payload,
    blockId: props.block.id,
  });
}

// 监听 block 的 type 和 id 变化（只在类型或 ID 变化时重新加载渲染器）
// 注意：移除 deep: true 以避免性能问题，其他属性变化通过 props 传递自动更新
watch(
  () => [props.block.type, props.block.id] as const,
  ([newType, newId], oldValue) => {
    const [oldType, oldId] = oldValue ?? [undefined, undefined];
    // 类型或 ID 变化时重新加载渲染器
    if (newType !== oldType || newId !== oldId) {
      void loadRenderer();
    }
  },
  { immediate: true },
);
</script>

<style lang="scss">
.aix-dynamic-renderer {
  &__loading {
    display: flex;
    align-items: center;
    gap: var(--aix-space-sm, 8px);
    padding: var(--aix-space-sm, 8px);
    color: var(--aix-text-secondary, #6b7280);
    font-size: 14px;
  }

  &__spinner {
    width: 16px;
    height: 16px;
    animation: aix-spin 0.8s linear infinite;
    border: 2px solid var(--aix-border, #e5e7eb);
    border-radius: 50%;
    border-top-color: var(--aix-primary, #3b82f6);
  }

  &__error {
    padding: var(--aix-space-sm, 8px);
    color: var(--aix-error, #ef4444);
    font-size: 13px;

    &-icon {
      margin-right: 4px;
    }

    &-message {
      font-family: monospace;
      font-size: 12px;
    }
  }

  &__fallback {
    pre {
      margin: 0;
      font-size: 13px;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }
  }
}
</style>
