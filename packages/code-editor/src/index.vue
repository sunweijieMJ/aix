<template>
  <div :class="rootClass" :style="rootStyle">
    <div ref="containerRef" class="aix-code-editor__content" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CSSProperties } from 'vue';
import { useEditorCore } from './composables/useEditorCore';
import type {
  CodeEditorProps,
  CodeEditorEmits,
  CodeEditorExpose,
} from './types';

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
} = useEditorCore(containerRef, props, emit);

const rootClass = computed(() => [
  'aix-code-editor',
  {
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

defineExpose<CodeEditorExpose>({
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
});
</script>
