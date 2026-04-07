<template>
  <div :class="rootClass" :style="rootStyle">
    <!-- Toolbar + 链接弹窗容器（为弹窗提供定位上下文） -->
    <div v-if="props.showToolbar && isReady" class="aix-rich-text-editor__toolbar-area">
      <EditorToolbar :toolbar-groups="toolbarGroups" :locale="t" />
      <LinkEditPopover
        :editor="editor"
        :visible="linkPopoverVisible"
        :t="t"
        @close="linkPopoverVisible = false"
      />
    </div>

    <!-- 编辑区域 -->
    <div class="aix-rich-text-editor__content">
      <editor-content v-if="editor" :editor="editor as Editor" />
    </div>

    <!-- 表格浮动工具栏 -->
    <TableFloatingToolbar v-if="props.table && isReady" :editor="editor" :t="t" />

    <!-- 底部状态栏（字符统计） -->
    <div v-if="props.characterCount && isReady" class="aix-rich-text-editor__footer">
      <span class="aix-rich-text-editor__count">{{ t.characters }}: {{ getCharacterCount() }}</span>
      <span class="aix-rich-text-editor__count">{{ t.words }}: {{ getWordCount() }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { Editor, EditorContent } from '@tiptap/vue-3';
import { computed, ref } from 'vue';
import type { CSSProperties, Ref } from 'vue';
import EditorToolbar from './components/EditorToolbar.vue';
import LinkEditPopover from './components/LinkEditPopover.vue';
import TableFloatingToolbar from './components/TableFloatingToolbar.vue';
import { useEditorCore } from './composables/useEditorCore';
import { useEditorToolbar } from './composables/useEditorToolbar';
import { locale as richTextLocale } from './locale';
import type { RichTextEditorProps, RichTextEditorEmits } from './types';

// 引入 Popper 组件样式（Dropdown/Popover/Tooltip 等）
import '@aix/popper/style';
import './styles/index.scss';

defineOptions({
  name: 'AixRichTextEditor',
});

const props = withDefaults(defineProps<RichTextEditorProps>(), {
  outputFormat: 'html',
  readonly: false,
  disabled: false,
  placeholder: '',
  autofocus: false,
  minHeight: '200px',
  showToolbar: true,
});

const emit = defineEmits<RichTextEditorEmits>();

// useLocale 内部通过 isRef() + if(override) 安全处理 undefined
const { t } = useLocale(richTextLocale, computed(() => props.locale) as Ref<'zh-CN' | 'en-US'>);

const {
  editor,
  isFocused,
  isReady,
  getHTML,
  getJSON,
  getText,
  setContent,
  clearContent,
  focus,
  blur,
  insertContent,
  undo,
  redo,
  getCharacterCount,
  getWordCount,
  isEmpty,
} = useEditorCore(props, emit);

const linkPopoverVisible = ref(false);

const { toolbarGroups } = useEditorToolbar(editor, props, t, {
  onLinkClick: () => {
    linkPopoverVisible.value = true;
  },
});

const rootClass = computed(() => [
  'aix-rich-text-editor',
  {
    'aix-rich-text-editor--focused': isFocused.value,
    'aix-rich-text-editor--disabled': props.disabled,
    'aix-rich-text-editor--readonly': props.readonly,
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

defineExpose({
  editor,
  getHTML,
  getJSON,
  getText,
  setContent,
  clearContent,
  focus,
  blur,
  insertContent,
  undo,
  redo,
  getCharacterCount,
  getWordCount,
  isEmpty,
});
</script>
