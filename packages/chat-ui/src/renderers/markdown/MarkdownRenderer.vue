<template>
  <div
    class="aix-markdown-renderer"
    :class="{ 'aix-markdown-renderer--streaming': streaming }"
    v-html="renderedHtml"
  />
</template>

<script setup lang="ts">
import { marked, type MarkedOptions } from 'marked';
import { computed } from 'vue';
import type { RendererProps } from '../../core/types';
import { sanitizeHtml, parseMarkdownData } from '../../utils';
import type { MarkdownData } from './index';

const props = defineProps<RendererProps<MarkdownData | string>>();

/** marked 解析配置（局部配置，不影响全局） */
const markedOptions: MarkedOptions = {
  breaks: true,
  gfm: true,
};

const renderedHtml = computed(() => {
  const { content, isPreParsed } = parseMarkdownData(props.data);
  const html = isPreParsed
    ? content
    : (marked.parse(content, markedOptions) as string);
  return sanitizeHtml(html);
});
</script>

<style lang="scss">
.aix-markdown-renderer {
  color: var(--aix-text-primary, #1f2937);
  font-size: var(--aix-font-size, 14px);
  line-height: var(--aix-line-height, 1.6);
  overflow-wrap: break-word;

  // 标题
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin-top: 1em;
    margin-bottom: 0.5em;
    color: var(--aix-text-heading, #111827);
    font-weight: 600;
    line-height: 1.25;

    &:first-child {
      margin-top: 0;
    }
  }

  h1 {
    font-size: 1.75em;
  }

  h2 {
    font-size: 1.5em;
  }

  h3 {
    font-size: 1.25em;
  }

  h4 {
    font-size: 1.1em;
  }

  // 段落
  p {
    margin: 0 0 1em;

    &:last-child {
      margin-bottom: 0;
    }
  }

  // 列表
  ul,
  ol {
    margin: 0 0 1em;
    padding-left: 2em;
  }

  li {
    margin-bottom: 0.25em;

    > p {
      margin-bottom: 0.5em;
    }
  }

  // 代码
  code {
    padding: 0.2em 0.4em;
    border-radius: var(--aix-radius-sm, 4px);
    background-color: var(--aix-code-bg, rgb(0 0 0 / 0.06));
    font-family: SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 85%;
  }

  // 代码块
  pre {
    margin: 0 0 1em;
    padding: var(--aix-space-3, 12px);
    overflow: auto;
    border-radius: var(--aix-radius-md, 8px);
    background-color: var(--aix-code-bg, rgb(0 0 0 / 0.06));
    font-size: 85%;
    line-height: 1.45;

    code {
      display: block;
      padding: 0;
      background-color: transparent;
      font-size: 100%;
    }
  }

  // 引用
  blockquote {
    margin: 0 0 1em;
    padding: 0 1em;
    border-left: 0.25em solid var(--aix-border, #e5e7eb);
    color: var(--aix-text-secondary, #6b7280);

    > :first-child {
      margin-top: 0;
    }

    > :last-child {
      margin-bottom: 0;
    }
  }

  // 表格
  table {
    width: 100%;
    margin: 0 0 1em;
    border-collapse: collapse;

    th,
    td {
      padding: 8px 12px;
      border: 1px solid var(--aix-border, #e5e7eb);
    }

    th {
      background-color: var(--aix-bg-subtle, #f9fafb);
      font-weight: 600;
    }

    tr:nth-child(2n) {
      background-color: var(--aix-bg-subtle, #f9fafb);
    }
  }

  // 链接
  a {
    color: var(--aix-link, #3b82f6);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  // 分割线
  hr {
    height: 0.25em;
    margin: 1.5em 0;
    border: 0;
    background-color: var(--aix-border, #e5e7eb);
  }

  // 图片
  img {
    max-width: 100%;
    border-radius: var(--aix-radius-sm, 4px);
  }

  // 任务列表
  input[type='checkbox'] {
    margin-right: 0.5em;
  }

  // 流式渲染光标
  &--streaming::after {
    content: '▋';
    display: inline-block;
    margin-left: 2px;
    animation: aix-blink 1s step-end infinite;
    color: var(--aix-primary, #3b82f6);
  }
}
</style>
