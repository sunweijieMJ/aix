<template>
  <div v-if="visible" class="aix-pdf-search-bar">
    <div class="aix-pdf-search-bar__input-wrapper">
      <Search class="aix-pdf-search-bar__icon" width="16" height="16" />
      <input
        ref="inputRef"
        v-model="inputValue"
        type="text"
        class="aix-pdf-search-bar__input"
        placeholder="搜索文档..."
        @keydown.enter="handleEnter"
        @keydown.escape="handleClose"
      />
      <button
        v-if="inputValue"
        class="aix-pdf-search-bar__clear"
        title="清除"
        @click="handleClear"
      >
        <Close width="14" height="14" />
      </button>
    </div>

    <div v-if="totalMatches > 0" class="aix-pdf-search-bar__nav">
      <span class="aix-pdf-search-bar__count">
        {{ currentIndex }} / {{ totalMatches }}
      </span>
      <button
        class="aix-pdf-search-bar__btn"
        title="上一个 (Shift+Enter)"
        :disabled="totalMatches === 0"
        @click="emit('prev')"
      >
        <ArrowDropUp width="16" height="16" />
      </button>
      <button
        class="aix-pdf-search-bar__btn"
        title="下一个 (Enter)"
        :disabled="totalMatches === 0"
        @click="emit('next')"
      >
        <ArrowDropDown width="16" height="16" />
      </button>
    </div>

    <div
      v-else-if="inputValue && !searching"
      class="aix-pdf-search-bar__no-result"
    >
      无结果
    </div>

    <div v-if="searching" class="aix-pdf-search-bar__loading">
      <div class="aix-pdf-search-bar__spinner" />
    </div>

    <button
      class="aix-pdf-search-bar__close"
      title="关闭 (Esc)"
      @click="handleClose"
    >
      <Close width="18" height="18" />
    </button>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowDropDown,
  ArrowDropUp,
  Close,
  IconSearch as Search,
} from '@aix/icons';
import { ref, watch, nextTick } from 'vue';

const props = defineProps<{
  visible: boolean;
  searching: boolean;
  totalMatches: number;
  currentIndex: number;
}>();

const emit = defineEmits<{
  (e: 'search', keyword: string): void;
  (e: 'prev'): void;
  (e: 'next'): void;
  (e: 'clear'): void;
  (e: 'close'): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const inputValue = ref('');
const lastSearchedKeyword = ref('');

function handleEnter(event: KeyboardEvent): void {
  if (event.shiftKey) {
    emit('prev');
  } else if (
    inputValue.value &&
    inputValue.value === lastSearchedKeyword.value
  ) {
    emit('next');
  } else if (inputValue.value) {
    lastSearchedKeyword.value = inputValue.value;
    emit('search', inputValue.value);
  }
}

function handleClear(): void {
  inputValue.value = '';
  lastSearchedKeyword.value = '';
  emit('clear');
  inputRef.value?.focus();
}

function handleClose(): void {
  emit('close');
}

// 打开时聚焦输入框，关闭时重置搜索状态
watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      await nextTick();
      inputRef.value?.focus();
      inputRef.value?.select();
    } else {
      lastSearchedKeyword.value = '';
    }
  },
);
</script>
