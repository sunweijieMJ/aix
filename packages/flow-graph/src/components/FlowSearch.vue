<template>
  <Panel v-if="open" position="top-center">
    <div class="aix-flow-search-panel">
      <div class="aix-flow-search-bar">
        <img src="../assets/icon-search.svg" width="18" height="18" alt="" />
        <input
          ref="inputRef"
          v-model="keyword"
          class="aix-flow-search-bar__input"
          :placeholder="t.searchNode"
          autocomplete="off"
          @input="onInput"
          @keydown.escape="close"
          @keydown.enter="onEnter"
        />
        <button class="aix-flow-search-bar__clear" @click="close">✕</button>
      </div>
      <ul
        v-if="suggestions.length"
        class="aix-flow-search-suggestions"
        :style="{ maxHeight: `${suggestionsMaxHeight ?? 200}px`, overflowY: 'auto' }"
      >
        <li
          v-for="node in suggestions"
          :key="node.id"
          class="aix-flow-search-suggestions__item"
          @mousedown.prevent="select(node)"
        >
          {{ node.data?.label }}
        </li>
      </ul>
    </div>
  </Panel>
</template>

<script setup lang="ts">
import { Panel, useVueFlow } from '@vue-flow/core';
import { computed, inject, nextTick, ref } from 'vue';
import zhCN from '../locale/zh-CN';
import { FlowGraphLocaleKey, type FlowNode } from '../types';

const props = defineProps<{
  nodes: FlowNode[];
  suggestionsMaxHeight?: number;
}>();

const t = inject(
  FlowGraphLocaleKey,
  computed(() => zhCN),
);

const { updateNodeData, fitView } = useVueFlow();

const open = ref(false);
const keyword = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const suggestionsVisible = ref(true);

const suggestions = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw || !suggestionsVisible.value) return [];
  return props.nodes.filter((n) => (n.data?.label ?? '').toLowerCase().includes(kw));
});

function toggle() {
  if (open.value) {
    close();
  } else {
    open.value = true;
    nextTick(() => inputRef.value?.focus());
  }
}

function close() {
  open.value = false;
  keyword.value = '';
  props.nodes.forEach((n) => {
    if (n.data?.selecting) updateNodeData(n.id, { ...n.data, selecting: false });
  });
}

function onInput() {
  suggestionsVisible.value = true;
  const kw = keyword.value.trim().toLowerCase();
  props.nodes.forEach((n) => {
    const matched = kw !== '' && (n.data?.label ?? '').toLowerCase().includes(kw);
    if (!!n.data?.selecting !== matched) updateNodeData(n.id, { ...n.data, selecting: matched });
  });
}

function onEnter() {
  if (suggestions.value.length === 1) select(suggestions.value[0]!);
}

function select(node: FlowNode) {
  props.nodes.forEach((n) => {
    const selecting = n.id === node.id;
    if (!!n.data?.selecting !== selecting) updateNodeData(n.id, { ...n.data, selecting });
  });
  keyword.value = node.data?.label ?? '';
  suggestionsVisible.value = false;
  fitView({ nodes: [node.id], duration: 300, padding: 0.5 });
}

function resetSelecting() {
  keyword.value = '';
  suggestionsVisible.value = false;
}

defineExpose({ toggle, close, resetSelecting });
</script>
