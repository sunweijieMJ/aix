<template>
  <div
    class="aix-code-renderer"
    :class="{ 'aix-code-renderer--streaming': streaming }"
    :data-state="streamState"
  >
    <!-- 头部 -->
    <div v-if="language || showCopy" class="aix-code-renderer__header">
      <span class="aix-code-renderer__language">{{ language || 'text' }}</span>
      <div class="aix-code-renderer__actions">
        <span
          v-if="streamState === 'loading'"
          class="aix-code-renderer__status"
        >
          加载中...
        </span>
        <button
          v-if="showCopy"
          class="aix-code-renderer__copy"
          :title="copied ? '已复制' : '复制代码'"
          :disabled="streamState === 'loading'"
          @click="handleCopy"
        >
          {{ copied ? '✓' : '📋' }}
        </button>
      </div>
    </div>

    <!-- 代码内容 -->
    <div class="aix-code-renderer__content">
      <pre :class="['aix-code-renderer__pre', `language-${language}`]"><code
        ref="codeRef"
        :class="['aix-code-renderer__code', `language-${language}`]"
        :data-state="streamState"
        v-html="highlightedCode"
      /></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, shallowRef } from 'vue';
import type { RendererProps } from '../../core/types';
import { parseCodeData } from '../../utils';
import type { CodeData } from './index';

const props = withDefaults(
  defineProps<
    RendererProps<CodeData | string> & {
      showCopy?: boolean;
      showLineNumbers?: boolean;
      /** 是否启用语法高亮（需要安装 highlight.js） */
      enableHighlight?: boolean;
      /** 是否正在流式输出 */
      streaming?: boolean;
    }
  >(),
  {
    showCopy: true,
    showLineNumbers: false,
    enableHighlight: true,
    streaming: false,
  },
);

const emit = defineEmits<{
  (e: 'action', payload: { action: string; data?: unknown }): void;
}>();

const codeRef = ref<HTMLElement>();
const copied = ref(false);
const highlightedCode = ref('');

// highlight.js 实例（异步加载）
type HLJSApi = typeof import('highlight.js').default;
const hljs = shallowRef<HLJSApi | null>(null);
const hljsLoading = ref(false);
const hljsError = ref(false);

// 使用工具函数解析代码数据
const codeContent = computed(() => parseCodeData(props.data));

const language = computed(() => codeContent.value.language);

/**
 * 流式状态
 * - 'loading': 代码块正在流式输入中
 * - 'done': 代码块已完成
 */
const streamState = computed<'loading' | 'done'>(() => {
  // 如果明确标记为流式中
  if (props.streaming) {
    return 'loading';
  }

  // 检查原始内容是否是完整的代码块
  const rawData = props.data;
  if (typeof rawData === 'string') {
    // 完整的代码块格式：```lang\n...\n```
    const isComplete = /^```\w*\n[\s\S]*\n```$/.test(rawData.trim());
    return isComplete ? 'done' : 'loading';
  }

  // 非字符串格式，默认完成
  return 'done';
});

// 简单的转义处理（不依赖高亮库）
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 异步加载 highlight.js
async function loadHighlightJS(): Promise<HLJSApi | null> {
  if (hljs.value) return hljs.value;
  if (hljsLoading.value) return null;
  if (hljsError.value) return null;

  hljsLoading.value = true;
  try {
    const module = await import('highlight.js');
    // 动态导入 highlight.js 主题样式
    await import('highlight.js/styles/github-dark.css');
    hljs.value = module.default;
    return hljs.value;
  } catch {
    // highlight.js 未安装，使用降级方案
    console.warn(
      '[CodeRenderer] highlight.js 未安装，代码将不会高亮显示。安装方法: pnpm add highlight.js',
    );
    hljsError.value = true;
    return null;
  } finally {
    hljsLoading.value = false;
  }
}

// 更新高亮代码
async function updateHighlight() {
  const code = codeContent.value.code;
  const lang = codeContent.value.language;

  // 如果禁用高亮或加载失败，使用简单转义
  if (!props.enableHighlight || hljsError.value) {
    highlightedCode.value = escapeHtml(code);
    return;
  }

  // 尝试加载 highlight.js
  const hljsInstance = await loadHighlightJS();

  if (hljsInstance) {
    try {
      // 检查语言是否支持
      if (lang && lang !== 'text' && hljsInstance.getLanguage(lang)) {
        const result = hljsInstance.highlight(code, { language: lang });
        highlightedCode.value = result.value;
      } else {
        // 自动检测语言
        const result = hljsInstance.highlightAuto(code);
        highlightedCode.value = result.value;
      }
    } catch {
      // 高亮失败，降级到简单转义
      highlightedCode.value = escapeHtml(code);
    }
  } else {
    // highlight.js 未加载，使用简单转义
    highlightedCode.value = escapeHtml(code);
  }
}

// 复制代码
async function handleCopy() {
  try {
    await navigator.clipboard.writeText(codeContent.value.code);
    copied.value = true;
    emit('action', { action: 'copy', data: { code: codeContent.value.code } });
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('复制失败:', err);
  }
}

// 监听内容变化
watch(() => codeContent.value.code, updateHighlight, { immediate: true });

onMounted(() => {
  updateHighlight();
});
</script>

<style lang="scss">
.aix-code-renderer {
  overflow: hidden;
  border-radius: var(--aix-radius-md, 8px);
  background: var(--aix-code-bg, #1e1e1e);
  font-family: SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--aix-code-border, #404040);
    background: var(--aix-code-header-bg, #2d2d2d);
  }

  &__language {
    color: var(--aix-code-text, #9ca3af);
    font-size: 12px;
    text-transform: uppercase;
  }

  &__actions {
    display: flex;
    gap: 8px;
  }

  &__copy {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    transition: all 0.2s;
    border: none;
    border-radius: var(--aix-radius-sm, 4px);
    background: transparent;
    color: var(--aix-code-text, #9ca3af);
    cursor: pointer;

    &:hover {
      background: var(--aix-code-hover-bg, #404040);
      color: var(--aix-code-text-hover, #fff);
    }
  }

  &__content {
    overflow: auto;
  }

  &__pre {
    margin: 0;
    padding: 12px 16px;
    overflow-x: auto;
  }

  &__code {
    display: block;
    color: var(--aix-code-text, #d4d4d4);
    font-size: 13px;
    line-height: 1.5;
    white-space: pre;
  }

  // 流式渲染光标
  &--streaming &__code::after {
    content: '▋';
    animation: aix-blink 1s step-end infinite;
    color: var(--aix-primary, #3b82f6);
  }
}
</style>
