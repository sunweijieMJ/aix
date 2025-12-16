<template>
  <div class="aix-mermaid-renderer" :style="{ height: chartHeight }">
    <div ref="mermaidRef" class="aix-mermaid-renderer__container" />
    <div v-if="error" class="aix-mermaid-renderer__error">
      <span>Mermaid 渲染错误: {{ error }}</span>
    </div>
    <div v-if="loading" class="aix-mermaid-renderer__loading">
      <div class="aix-mermaid-renderer__spinner" />
      <span>加载图表中...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import type { RendererProps } from '../../core/types';
import { parseMermaidData } from '../../utils';
import type { MermaidData } from './index';

const props = withDefaults(
  defineProps<
    RendererProps<MermaidData | string> & {
      height?: string | number;
    }
  >(),
  {
    height: 'auto',
  },
);

const mermaidRef = ref<HTMLElement>();
const loading = ref(true);
const error = ref<string>('');

const chartHeight = computed(() => {
  const h = props.height;
  return typeof h === 'number' ? `${h}px` : h;
});

// 使用工具函数解析 Mermaid 代码
const mermaidCode = computed<string>(() => parseMermaidData(props.data));

// 渲染 Mermaid 图表
async function renderMermaid() {
  if (!mermaidRef.value || !mermaidCode.value) return;

  loading.value = true;
  error.value = '';

  try {
    // 动态导入 Mermaid
    const mermaid = await import('mermaid');

    // 初始化 mermaid 配置
    mermaid.default.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'strict', // 使用严格模式防止 XSS
      fontFamily: 'inherit',
    });

    // 清空容器
    mermaidRef.value.innerHTML = '';

    // 生成唯一 ID（使用 slice 替代已废弃的 substr）
    const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;

    // 渲染图表
    const { svg } = await mermaid.default.render(id, mermaidCode.value);

    // 插入 SVG
    mermaidRef.value.innerHTML = svg;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    console.error('[MermaidRenderer] 渲染失败:', e);
  } finally {
    loading.value = false;
  }
}

// 监听代码变化
watch(
  mermaidCode,
  async () => {
    await nextTick();
    renderMermaid();
  },
  { immediate: false },
);

onMounted(() => {
  renderMermaid();
});
</script>

<style lang="scss">
.aix-mermaid-renderer {
  position: relative;
  width: 100%;
  min-height: 100px;
  overflow: hidden;
  border: 1px solid var(--aix-border, #e5e7eb);
  border-radius: var(--aix-radius-md, 8px);
  background: var(--aix-bg-container, #fff);

  &__container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 16px;

    svg {
      max-width: 100%;
      height: auto;
    }
  }

  &__error {
    display: flex;
    position: absolute;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: var(--aix-error-light, #fef2f2);
    color: var(--aix-error-dark, #991b1b);
    font-size: 14px;
    inset: 0;
  }

  &__loading {
    display: flex;
    position: absolute;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--aix-bg-container, #fff);
    color: var(--aix-text-secondary, #6b7280);
    font-size: 14px;
    inset: 0;
    gap: 12px;
  }

  &__spinner {
    width: 24px;
    height: 24px;
    animation: aix-spin 0.8s linear infinite;
    border: 3px solid var(--aix-border, #e5e7eb);
    border-radius: 50%;
    border-top-color: var(--aix-primary, #3b82f6);
  }
}
</style>
