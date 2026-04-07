<template>
  <Transition name="aix-popper-fade">
    <div
      v-if="visible"
      ref="popoverRef"
      class="aix-rich-text-editor__link-popover"
      :style="{ zIndex: currentZIndex }"
    >
      <input
        ref="inputRef"
        v-model="url"
        :placeholder="t.linkUrl"
        class="aix-rich-text-editor__link-input"
        @keydown.enter="confirmLink"
        @keydown.escape="$emit('close')"
      />
      <div class="aix-rich-text-editor__link-actions">
        <button
          class="aix-rich-text-editor__link-action-btn aix-rich-text-editor__link-action-btn--primary"
          type="button"
          @click="confirmLink"
        >
          {{ t.confirm }}
        </button>
        <button
          v-if="hasLink"
          class="aix-rich-text-editor__link-action-btn aix-rich-text-editor__link-action-btn--danger"
          type="button"
          @click="removeLink"
        >
          {{ t.linkRemove }}
        </button>
        <button class="aix-rich-text-editor__link-action-btn" type="button" @click="$emit('close')">
          {{ t.cancel }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useClickOutside, useZIndex } from '@aix/popper';
import type { Editor } from '@tiptap/core';
import { ref, computed, watch, nextTick } from 'vue';
import type { RichTextEditorLocale } from '../locale/types';

const props = defineProps<{
  editor: Editor | null;
  visible: boolean;
  t: RichTextEditorLocale;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const url = ref('');
const hasLink = ref(false);
const popoverRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);

// z-index 管理
const { currentZIndex, nextZIndex } = useZIndex();

watch(
  () => props.visible,
  (val) => {
    if (val && props.editor) {
      const attrs = props.editor.getAttributes('link');
      url.value = attrs.href ?? '';
      hasLink.value = props.editor.isActive('link');
      nextZIndex();
      // 打开后自动聚焦输入框
      nextTick(() => inputRef.value?.focus());
    }
  },
);

function confirmLink() {
  if (!props.editor) return;
  const trimmed = url.value.trim();
  if (!trimmed) {
    // 清空 URL 时移除已有链接
    if (hasLink.value) {
      props.editor.chain().focus().unsetLink().run();
    }
  } else if (!/^\s*(javascript|data|vbscript):/i.test(trimmed)) {
    props.editor.chain().focus().setLink({ href: trimmed }).run();
  }
  emit('close');
}

function removeLink() {
  if (!props.editor) return;
  props.editor.chain().focus().unsetLink().run();
  emit('close');
}

// 点击外部关闭
// 排除工具栏区域：防止点击链接按钮时 pointerdown(close) → click(reopen) 导致闪烁
useClickOutside({
  excludeRefs: computed(() => {
    const refs: (HTMLElement | null | undefined)[] = [popoverRef.value];
    const toolbarArea = popoverRef.value?.closest('.aix-rich-text-editor__toolbar-area');
    if (toolbarArea instanceof HTMLElement) {
      refs.push(toolbarArea);
    }
    return refs;
  }),
  handler: () => emit('close'),
  enabled: () => props.visible,
});
</script>
