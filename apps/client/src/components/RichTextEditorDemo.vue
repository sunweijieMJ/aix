<template>
  <div class="demo-page">
    <h2>RichTextEditor 富文本编辑器</h2>
    <p class="description">
      基于 Tiptap 的富文本编辑器，支持工具栏、图片、表格、@提及等功能
    </p>

    <div class="demo-group">
      <h3>基础用法</h3>
      <RichTextEditor
        v-model="basicContent"
        placeholder="请输入内容..."
        min-height="200px"
      />
      <details class="output-preview">
        <summary>查看输出 HTML</summary>
        <pre>{{ basicContent }}</pre>
      </details>
    </div>

    <div class="demo-group">
      <h3>全功能模式</h3>
      <RichTextEditor
        v-model="fullContent"
        placeholder="试试所有功能..."
        min-height="300px"
        :table="{ resizable: true }"
        :task-list="true"
        :text-align="true"
        :text-color="true"
        :font-size="true"
        :character-count="{ limit: 5000 }"
        :highlight="true"
        :markdown="true"
        :superscript-subscript="true"
        @character-count="onCharacterCount"
      />
      <p v-if="charCount" class="char-count">
        字符数: {{ charCount.characters }} / 词数: {{ charCount.words }}
      </p>
    </div>

    <div class="demo-group">
      <h3>只读模式</h3>
      <RichTextEditor
        :model-value="readonlyContent"
        :readonly="true"
        min-height="120px"
      />
    </div>

    <div class="demo-group">
      <h3>JSON 输出格式</h3>
      <RichTextEditor
        v-model="jsonContent"
        output-format="json"
        placeholder="内容将以 JSON 格式输出..."
        min-height="200px"
      />
      <details class="output-preview">
        <summary>查看输出 JSON</summary>
        <pre>{{ JSON.stringify(jsonContent, null, 2) }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RichTextEditor } from '@aix/rich-text-editor';
import { ref } from 'vue';

const basicContent = ref('');

const fullContent = ref('');
const charCount = ref<{ characters: number; words: number } | null>(null);
const onCharacterCount = (count: { characters: number; words: number }) => {
  charCount.value = count;
};

const readonlyContent =
  '<h2>只读内容展示</h2><p>这段内容是 <strong>只读</strong> 的，无法被编辑。适用于内容预览场景。</p>';

const jsonContent = ref<string | Record<string, unknown>>('');
</script>

<style scoped>
.output-preview {
  margin-top: 1rem;
  padding: 0.75rem;
  border: 1px solid var(--aix-colorBorder, #d9d9d9);
  border-radius: var(--aix-borderRadius, 6px);
  background: var(--aix-colorBgLayout, #f5f5f5);
}

.output-preview summary {
  color: var(--aix-colorTextSecondary, #666);
  cursor: pointer;
}

.output-preview pre {
  max-height: 200px;
  margin: 0.5rem 0 0;
  overflow-x: auto;
  font-size: 0.85rem;
  word-break: break-all;
  white-space: pre-wrap;
}

.char-count {
  margin-top: 0.5rem;
  color: var(--aix-colorTextSecondary, #666);
  font-size: 0.85rem;
}
</style>
