<template>
  <!-- 渲染器就绪则输出 HTML，否则降级为纯文本（纯文本态也用整修后的 source，保持一致） -->
  <div v-if="html" :class="ns.b()" v-html="html" />
  <div v-else :class="ns.b()">{{ source }}</div>
</template>

<script lang="ts">
export interface MarkdownRendererProps {
  /** 待渲染的 Markdown 文本 */
  content?: string;
  /**
   * 流式渲染态：开启后对可能半截的内容做防闪烁整修（未闭合代码块补围栏、隐去末行未闭合链接），
   * 默认 false。完整文本（非流式）应保持 false 以原样渲染。
   */
  streaming?: boolean;
}
</script>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useNamespace } from '../composables/useNamespace';
import { loadMarkdownRenderer, type MarkdownRenderFn } from '../composables/useMarkdownRenderer';
import { protectStreamingMarkdown } from '../utils/markdown';

const props = withDefaults(defineProps<MarkdownRendererProps>(), {
  content: '',
  streaming: false,
});
const ns = useNamespace('markdown');
const html = ref('');
let renderer: MarkdownRenderFn | null = null;

// 实际送入渲染的源文本：流式态下做防闪烁整修，否则原样。
const source = computed(() =>
  props.streaming ? protectStreamingMarkdown(props.content) : props.content,
);

const render = () => {
  if (renderer) html.value = renderer(source.value);
};

loadMarkdownRenderer().then((fn) => {
  renderer = fn;
  render();
});

// immediate：内容在 renderer 就绪前已变化时也尝试渲染（renderer 仍为 null 时 render() 安全空转），
// 与 loadMarkdownRenderer().then(render) 配合，确保 renderer 就绪后必渲染最新 source。
watch(source, render, { immediate: true });
</script>

<style lang="scss">
.aix-markdown {
  color: var(--aix-colorText);
  font-size: var(--aix-fontSize);
  line-height: var(--aix-lineHeight);
  overflow-wrap: break-word;

  /* 首尾元素去外边距，紧贴气泡内边距 */
  > :first-child {
    margin-top: 0;
  }

  > :last-child {
    margin-bottom: 0;
  }

  p {
    margin: 0.5em 0;
  }

  ul,
  ol {
    margin: 0.5em 0;
    padding-left: 1.4em;
  }

  li {
    margin: 0.2em 0;
  }

  a {
    color: var(--aix-colorLink);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  h1,
  h2,
  h3,
  h4 {
    margin: 0.8em 0 0.4em;
    font-weight: var(--aix-fontWeightStrong);
    line-height: var(--aix-lineHeightSM);
  }

  h1 {
    font-size: var(--aix-fontSizeLG);
  }

  h2 {
    font-size: var(--aix-fontSizeMD);
  }

  h3,
  h4 {
    font-size: var(--aix-fontSize);
  }

  /* 代码块：浅灰底 + 细边，与白色气泡区分 */
  pre {
    margin: 0.6em 0;
    padding: var(--aix-paddingSM) var(--aix-padding);
    overflow-x: auto;
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadius);
    background-color: var(--aix-colorFillTertiary);
  }

  pre code {
    padding: 0;
    background: none;
    font-size: var(--aix-fontSizeSM);
  }

  /* 行内代码 */
  code {
    padding: 0.1em 0.4em;
    border-radius: var(--aix-borderRadiusSM);
    background-color: var(--aix-colorFillSecondary);
    font-family: var(--aix-fontFamilyCode);
    font-size: 0.9em;
  }

  /* 表格 */
  table {
    margin: 0.6em 0;
    border-collapse: collapse;
    font-size: var(--aix-fontSizeSM);
  }

  th,
  td {
    padding: var(--aix-paddingXXS) var(--aix-paddingSM);
    border: 1px solid var(--aix-colorBorderSecondary);
    text-align: left;
  }

  th {
    background-color: var(--aix-colorFillTertiary);
    font-weight: var(--aix-fontWeightStrong);
  }

  /* 引用 */
  blockquote {
    margin: 0.6em 0;
    padding: 0.2em 0 0.2em var(--aix-padding);
    border-left: 3px solid var(--aix-colorBorder);
    color: var(--aix-colorTextSecondary);
  }
}
</style>
