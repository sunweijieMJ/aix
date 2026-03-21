<template>
  <div
    v-show="visible"
    ref="toolbarRef"
    class="aix-rich-text-editor__table-toolbar"
    :style="toolbarStyle"
    @mousedown.prevent
  >
    <!-- 行操作 -->
    <button
      class="aix-rich-text-editor__toolbar-btn"
      :title="t.addRowBefore"
      type="button"
      @click="exec('addRowBefore')"
    >
      <IconRowBefore />
    </button>
    <button
      class="aix-rich-text-editor__toolbar-btn"
      :title="t.addRowAfter"
      type="button"
      @click="exec('addRowAfter')"
    >
      <IconRowAfter />
    </button>
    <button
      class="aix-rich-text-editor__toolbar-btn"
      :title="t.deleteRow"
      type="button"
      @click="exec('deleteRow')"
    >
      <IconRowDelete />
    </button>

    <span class="aix-rich-text-editor__toolbar-divider" />

    <!-- 列操作 -->
    <button
      class="aix-rich-text-editor__toolbar-btn"
      :title="t.addColumnBefore"
      type="button"
      @click="exec('addColumnBefore')"
    >
      <IconColumnBefore />
    </button>
    <button
      class="aix-rich-text-editor__toolbar-btn"
      :title="t.addColumnAfter"
      type="button"
      @click="exec('addColumnAfter')"
    >
      <IconColumnAfter />
    </button>
    <button
      class="aix-rich-text-editor__toolbar-btn"
      :title="t.deleteColumn"
      type="button"
      @click="exec('deleteColumn')"
    >
      <IconColumnDelete />
    </button>

    <span class="aix-rich-text-editor__toolbar-divider" />

    <!-- 表格操作 -->
    <button
      class="aix-rich-text-editor__toolbar-btn"
      :title="t.mergeCells"
      type="button"
      @click="exec('mergeCells')"
    >
      <IconMergeCells />
    </button>
    <button
      class="aix-rich-text-editor__toolbar-btn"
      :title="t.splitCell"
      type="button"
      @click="exec('splitCell')"
    >
      <IconSplitCell />
    </button>
    <button
      class="aix-rich-text-editor__toolbar-btn aix-rich-text-editor__toolbar-btn--danger"
      :title="t.deleteTable"
      type="button"
      @click="exec('deleteTable')"
    >
      <IconTableDelete />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core';
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  type Ref,
} from 'vue';
import {
  IconRowBefore,
  IconRowAfter,
  IconRowDelete,
  IconColumnBefore,
  IconColumnAfter,
  IconColumnDelete,
  IconMergeCells,
  IconSplitCell,
  IconTableDelete,
} from '../icons';
import type { RichTextEditorLocale } from '../locale/types';

const props = defineProps<{
  editor: Ref<Editor | null> | Editor | null;
  t: RichTextEditorLocale;
}>();

const visible = ref(false);
const toolbarRef = ref<HTMLElement | null>(null);
const posX = ref(0);
const posY = ref(0);

const toolbarStyle = computed(() => ({
  left: `${posX.value}px`,
  top: `${posY.value}px`,
}));

const t = computed(() => props.t);

/** 获取 Editor 实例 */
function getEditor(): Editor | null {
  const e = props.editor;
  if (!e) return null;
  // 兼容 Ref<Editor | null> 和 Editor
  return 'value' in e ? (e as Ref<Editor | null>).value : e;
}

/** 执行表格命令 */
function exec(command: string) {
  const ed = getEditor();
  if (!ed) return;
  const chain = ed.chain().focus() as unknown as Record<string, unknown>;
  if (typeof chain[command] === 'function') {
    const result = (chain[command] as () => unknown)();
    if (
      result &&
      typeof (result as Record<string, unknown>).run === 'function'
    ) {
      ((result as Record<string, unknown>).run as () => void)();
    }
  }
}

/** 查找光标所在的 table DOM 元素 */
function findTableElement(ed: Editor): HTMLTableElement | null {
  const { selection } = ed.state;
  const $pos = selection.$anchor;

  // 向上遍历节点树查找 table 节点
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'table') {
      // 获取对应的 DOM 元素
      const domNode = ed.view.nodeDOM($pos.before(depth)) as HTMLElement | null;
      if (domNode) {
        // nodeDOM 可能返回 table 或包装元素
        const table = domNode.querySelector('table') ?? domNode;
        if (table instanceof HTMLTableElement) return table;
        if (domNode instanceof HTMLTableElement) return domNode;
      }
      return null;
    }
  }
  return null;
}

/** 更新工具栏位置和可见性 */
function updateToolbar() {
  const ed = getEditor();
  if (!ed || !ed.isActive('table')) {
    visible.value = false;
    return;
  }

  const tableEl = findTableElement(ed);
  if (!tableEl) {
    visible.value = false;
    return;
  }

  // 找到编辑器容器，计算相对定位
  const editorContainer = tableEl.closest('.aix-rich-text-editor');
  if (!editorContainer) {
    visible.value = false;
    return;
  }

  const containerRect = editorContainer.getBoundingClientRect();
  const tableRect = tableEl.getBoundingClientRect();
  const toolbarEl = toolbarRef.value;
  const toolbarWidth = toolbarEl?.offsetWidth ?? 300;

  // 计算相对于编辑器容器的位置
  const relativeTop = tableRect.top - containerRect.top;
  const tableCenter = tableRect.left - containerRect.left + tableRect.width / 2;

  posX.value = Math.max(4, tableCenter - toolbarWidth / 2);
  posY.value = relativeTop - 40; // 工具栏高度约 36px + 4px 间距

  visible.value = true;
}

let editorInstance: Editor | null = null;

function onSelectionUpdate() {
  updateToolbar();
}

function onTransaction() {
  updateToolbar();
}

function bindEditor() {
  const ed = getEditor();
  if (ed === editorInstance) return;

  if (editorInstance) {
    editorInstance.off('selectionUpdate', onSelectionUpdate);
    editorInstance.off('transaction', onTransaction);
  }

  editorInstance = ed;
  if (ed) {
    ed.on('selectionUpdate', onSelectionUpdate);
    ed.on('transaction', onTransaction);
  }
}

watch(
  () => props.editor,
  () => bindEditor(),
  { deep: true },
);

onMounted(() => {
  bindEditor();
});

onBeforeUnmount(() => {
  if (editorInstance) {
    editorInstance.off('selectionUpdate', onSelectionUpdate);
    editorInstance.off('transaction', onTransaction);
  }
});
</script>
