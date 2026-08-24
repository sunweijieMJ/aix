<template>
  <div :class="rootClass" :style="rootStyle">
    <div ref="containerRef" class="aix-code-editor__content" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CSSProperties } from 'vue';
import { useEditorCore } from './composables/useEditorCore';
import type { CodeEditorProps, CodeEditorEmits, CodeEditorExpose } from './types';

import './styles/index.scss';

defineOptions({
  name: 'AixCodeEditor',
});

const props = withDefaults(defineProps<CodeEditorProps>(), {
  language: 'javascript',
  theme: 'light',
  readonly: false,
  disabled: false,
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: true,
  bracketMatching: true,
  lint: true,
  tabSize: 2,
  minHeight: '100px',
});

const emit = defineEmits<CodeEditorEmits>();

const containerRef = ref<HTMLElement | null>(null);

const {
  editorView,
  isFocused,
  getValue,
  setValue,
  focus,
  blur,
  getSelection,
  replaceSelection,
  insert,
  undo,
  redo,
  getLineCount,
  getCursorPosition,
  diagnosticCount,
} = useEditorCore(containerRef, props, emit);

const rootClass = computed(() => [
  'aix-code-editor',
  {
    // `dark` 是 @aix/theme 暗色 Token 的挂载选择器之一（`.dark, :root[data-theme=dark]`，
    // 见 docs/guide/architecture.md 的「双选择器兼容」）。它不带 `:root` 前缀，因此挂在
    // 本组件根节点上即可让子树内的 `--aix-*` 重解析为暗色值。
    //
    // 少了这一句，theme="dark" 就只有语法高亮生效（那部分是裸 hex），
    // 编辑器底色仍跟随全局主题——全局浅色时会得到「深色语法色配浅色底」。
    dark: props.theme === 'dark',
    'aix-code-editor--focused': isFocused.value,
    'aix-code-editor--disabled': props.disabled,
    'aix-code-editor--readonly': props.readonly,
  },
]);

const rootStyle = computed<CSSProperties>(() => {
  const style: CSSProperties = {};
  if (props.height) {
    style.height = props.height;
  } else {
    if (props.minHeight) style.minHeight = props.minHeight;
    if (props.maxHeight) style.maxHeight = props.maxHeight;
  }
  return style;
});

// satisfies 约束确保 expose 对象与 types.ts 导出的接口不漂移
defineExpose({
  editorView,
  isFocused,
  getValue,
  setValue,
  focus,
  blur,
  getSelection,
  replaceSelection,
  insert,
  undo,
  redo,
  getLineCount,
  getCursorPosition,
  diagnosticCount,
} satisfies CodeEditorExpose);
</script>
