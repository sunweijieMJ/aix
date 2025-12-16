<template>
  <div
    class="aix-latex-renderer"
    :class="{ 'aix-latex-renderer--block': displayMode }"
  >
    <div ref="containerRef" class="aix-latex-renderer__content" />
    <div v-if="error" class="aix-latex-renderer__error">
      <span>LaTeX 渲染错误: {{ error }}</span>
      <pre class="aix-latex-renderer__source">{{ expression }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { RendererProps } from '../../core/types';
import { parseLatexData } from '../../utils';
import type { LatexData } from './index';

const props = defineProps<RendererProps<LatexData | string>>();

const containerRef = ref<HTMLElement>();
const error = ref<string>('');

// 使用工具函数解析 LaTeX 数据
const latexData = computed(() => parseLatexData(props.data));

const expression = computed(() => latexData.value.expression);
const displayMode = computed(() => latexData.value.displayMode);

// 渲染 LaTeX
async function render() {
  if (!containerRef.value || !expression.value) return;

  error.value = '';

  try {
    // 动态导入 KaTeX
    const katex = await import('katex');

    // 尝试导入 CSS (某些打包器可能不支持)
    try {
      await import('katex/dist/katex.min.css');
    } catch {
      // CSS 导入失败时，检查是否已经有 KaTeX 样式
      if (!document.querySelector('link[href*="katex"]')) {
        console.warn('[LatexRenderer] KaTeX CSS 未加载，公式样式可能不正确');
      }
    }

    katex.default.render(expression.value, containerRef.value, {
      displayMode: displayMode.value,
      throwOnError: false,
      errorColor: '#ef4444',
      trust: false,
      strict: false,
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    console.error('[LatexRenderer] 渲染失败:', e);

    // 降级显示原始内容
    if (containerRef.value) {
      containerRef.value.textContent = expression.value;
    }
  }
}

// 监听内容变化
watch([expression, displayMode], () => render(), { immediate: false });

onMounted(() => {
  render();
});
</script>

<style lang="scss">
.aix-latex-renderer {
  display: inline;

  &--block {
    display: block;
    margin: 1em 0;
    overflow-x: auto;
    text-align: center;
  }

  &__content {
    display: inline;

    .aix-latex-renderer--block & {
      display: block;
    }
  }

  &__error {
    padding: 8px 12px;
    border: 1px solid var(--aix-error, #ef4444);
    border-radius: var(--aix-radius-sm, 4px);
    background: var(--aix-error-light, #fef2f2);
    color: var(--aix-error-dark, #991b1b);
    font-size: 13px;
  }

  &__source {
    margin-top: 8px;
    padding: 8px;
    overflow-x: auto;
    border-radius: var(--aix-radius-sm, 4px);
    background: var(--aix-bg-subtle, #f9fafb);
    font-family: monospace;
    font-size: 12px;
  }
}
</style>
