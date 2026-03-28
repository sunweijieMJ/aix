<template>
  <Transition name="aix-popper-fade">
    <div
      v-if="visible"
      ref="floatingElRef"
      class="aix-rich-text-editor__table-toolbar"
      :style="mergedStyles"
      @mousedown.prevent
    >
      <!-- 行操作 -->
      <Tooltip :content="t.addRowBefore" placement="top">
        <button
          class="aix-rich-text-editor__toolbar-btn"
          type="button"
          @click="exec('addRowBefore')"
        >
          <IconRowBefore />
        </button>
      </Tooltip>
      <Tooltip :content="t.addRowAfter" placement="top">
        <button
          class="aix-rich-text-editor__toolbar-btn"
          type="button"
          @click="exec('addRowAfter')"
        >
          <IconRowAfter />
        </button>
      </Tooltip>
      <Tooltip :content="t.deleteRow" placement="top">
        <button
          class="aix-rich-text-editor__toolbar-btn"
          type="button"
          @click="exec('deleteRow')"
        >
          <IconRowDelete />
        </button>
      </Tooltip>

      <span class="aix-rich-text-editor__toolbar-divider" />

      <!-- 列操作 -->
      <Tooltip :content="t.addColumnBefore" placement="top">
        <button
          class="aix-rich-text-editor__toolbar-btn"
          type="button"
          @click="exec('addColumnBefore')"
        >
          <IconColumnBefore />
        </button>
      </Tooltip>
      <Tooltip :content="t.addColumnAfter" placement="top">
        <button
          class="aix-rich-text-editor__toolbar-btn"
          type="button"
          @click="exec('addColumnAfter')"
        >
          <IconColumnAfter />
        </button>
      </Tooltip>
      <Tooltip :content="t.deleteColumn" placement="top">
        <button
          class="aix-rich-text-editor__toolbar-btn"
          type="button"
          @click="exec('deleteColumn')"
        >
          <IconColumnDelete />
        </button>
      </Tooltip>

      <span class="aix-rich-text-editor__toolbar-divider" />

      <!-- 表格操作 -->
      <Tooltip :content="t.mergeCells" placement="top">
        <button
          class="aix-rich-text-editor__toolbar-btn"
          type="button"
          @click="exec('mergeCells')"
        >
          <IconMergeCells />
        </button>
      </Tooltip>
      <Tooltip :content="t.splitCell" placement="top">
        <button
          class="aix-rich-text-editor__toolbar-btn"
          type="button"
          @click="exec('splitCell')"
        >
          <IconSplitCell />
        </button>
      </Tooltip>
      <Tooltip :content="t.deleteTable" placement="top">
        <button
          class="aix-rich-text-editor__toolbar-btn aix-rich-text-editor__toolbar-btn--danger"
          type="button"
          @click="exec('deleteTable')"
        >
          <IconTableDelete />
        </button>
      </Tooltip>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { Tooltip, usePopper, useZIndex } from '@aix/popper';
import type { ChainedCommands, Editor } from '@tiptap/core';
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  toRef,
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
const floatingElRef = ref<HTMLElement | null>(null);

const t = toRef(props, 't');

// 使用 usePopper 进行定位（表格上方居中）
// strategy: 'fixed' 因为 reference (table) 在 overflow-y: auto 的滚动容器内
// absolute 会导致工具栏在内容滚动时位置漂移
const { referenceRef, floatingRef, floatingStyles, update } = usePopper({
  placement: 'top',
  strategy: 'fixed',
  offset: 4,
  flip: true,
  shift: true,
});

// 桥接 floatingElRef 到 usePopper
watch(floatingElRef, (el) => {
  floatingRef.value = el;
});

// z-index 管理
const { currentZIndex, nextZIndex } = useZIndex();

const mergedStyles = computed(() => ({
  ...floatingStyles.value,
  zIndex: currentZIndex.value,
}));

/** 获取 Editor 实例 */
function getEditor(): Editor | null {
  const e = props.editor;
  if (!e) return null;
  // 兼容 Ref<Editor | null> 和 Editor
  return 'value' in e ? (e as Ref<Editor | null>).value : e;
}

/** 表格命令类型 */
type TableCommand =
  | 'addRowBefore'
  | 'addRowAfter'
  | 'deleteRow'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteColumn'
  | 'mergeCells'
  | 'splitCell'
  | 'deleteTable';

type TableChainedCommands = ChainedCommands &
  Record<TableCommand, () => TableChainedCommands>;

/** 执行表格命令 */
function exec(command: TableCommand) {
  const ed = getEditor();
  if (!ed) return;
  const chain = ed.chain().focus() as unknown as TableChainedCommands;
  chain[command]().run();
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
    referenceRef.value = null;
    return;
  }

  const tableEl = findTableElement(ed);
  if (!tableEl) {
    visible.value = false;
    referenceRef.value = null;
    return;
  }

  // 将 table 元素作为 reference，usePopper 自动计算浮动定位
  referenceRef.value = tableEl;

  if (!visible.value) {
    visible.value = true;
    nextZIndex();
  }

  nextTick(() => update());
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
